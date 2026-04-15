import base64
import io
import json
import logging
from pathlib import Path

import boto3
import fitz  # PyMuPDF
from PIL import Image

from config.config import settings

logger = logging.getLogger(__name__)

BEDROCK_MODEL_ID = "moonshotai.kimi-k2.5"
BEDROCK_REGION = settings.AWS_REGION or "us-west-2"

# Plain-text MIME types that can be read directly without OCR
TEXT_MIME_TYPES = {
    "text/plain", "text/csv", "text/html", "text/xml",
    "application/json", "application/xml", "application/csv",
}
TEXT_EXTENSIONS = {".txt", ".csv", ".json", ".xml", ".log", ".tsv", ".text"}


# ── AWS Bedrock client ────────────────────────────────────────────────────────

def _get_bedrock_client():
    """Return a boto3 bedrock-runtime client. Returns None if credentials are absent."""
    if not (settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY):
        return None
    try:
        return boto3.client(
            service_name="bedrock-runtime",
            region_name=BEDROCK_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
    except Exception as e:
        logger.warning(f"Could not create Bedrock client: {e}")
        return None


# ── Image helpers ─────────────────────────────────────────────────────────────

def _image_to_base64(img: Image.Image, fmt: str = "JPEG") -> str:
    """Convert a PIL image to a base64-encoded JPEG string."""
    buf = io.BytesIO()
    img = img.convert("RGB")
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _image_to_bytes(img: Image.Image, fmt: str = "JPEG") -> bytes:
    """Convert a PIL image to raw bytes."""
    buf = io.BytesIO()
    img = img.convert("RGB")
    img.save(buf, format=fmt)
    return buf.getvalue()


# ── PDF helpers ───────────────────────────────────────────────────────────────

def _pdf_to_text(file_path: str) -> str:
    """Extract raw text directly from a PDF bypassing OCR/APIs."""
    text_parts = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text_parts.append(page.get_text())
        doc.close()
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        return f"[OCR ERROR] Failed to extract text from PDF: {e}"
    return "\n\n--- PAGE BREAK ---\n\n".join(text_parts)


def _pdf_to_images(file_path: str) -> list:
    """Convert each PDF page to a PIL image at 200 DPI."""
    images = []
    try:
        doc = fitz.open(file_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
        doc.close()
    except Exception as e:
        logger.error(f"Failed to convert PDF to images: {e}")
    return images


# ── OCR backends ──────────────────────────────────────────────────────────────

def _kimi_bedrock_ocr(b64_jpeg: str) -> str | None:
    """
    OCR a single image using Kimi K2.5 on Amazon Bedrock via boto3.
    Returns None if credentials are not configured or the call fails.
    """
    client = _get_bedrock_client()
    if client is None:
        logger.debug("Bedrock OCR skipped: no AWS credentials configured.")
        return None

    data_uri = f"data:image/jpeg;base64,{b64_jpeg}"
    body = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {
                        "type": "text",
                        "text": (
                            "You are a medical document OCR engine. "
                            "Extract ALL text visible in this image exactly as it appears. "
                            "Preserve labels, values, and table structure. "
                            "Return verbatim text only — no commentary."
                        ),
                    },
                ],
            }
        ]
    })

    try:
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        result = json.loads(response["body"].read())
        if "choices" in result:
            return result["choices"][0]["message"]["content"]
        return json.dumps(result)
    except Exception as e:
        logger.warning(f"Bedrock OCR failed: {e}")
        return None


def _gemini_vision_ocr(img_bytes: bytes) -> str | None:
    """
    OCR a single image using Google Gemini Flash (free tier).
    Returns None if GOOGLE_API_KEY is not configured or the call fails.
    """
    if not settings.GOOGLE_API_KEY:
        logger.debug("Gemini OCR skipped: GOOGLE_API_KEY not configured.")
        return None

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                (
                    "You are a medical document OCR engine. "
                    "Extract ALL text visible in this image exactly as it appears. "
                    "Preserve labels, values, and table structure. "
                    "Return verbatim text only — no commentary."
                ),
            ],
        )
        text = response.text
        if text and text.strip():
            logger.info(f"Gemini OCR returned {len(text)} characters.")
            return text
        return None
    except Exception as e:
        logger.warning(f"Gemini OCR failed: {e}")
        return None


def _ocr_single_image(img: Image.Image) -> str:
    """
    Try available OCR backends for one PIL image.
    Order: Bedrock → Google Gemini → error string.
    """
    b64 = _image_to_base64(img)
    img_bytes = _image_to_bytes(img)

    # 1. AWS Bedrock (Kimi K2.5)
    result = _kimi_bedrock_ocr(b64)
    if result:
        return result

    # 2. Google Gemini Flash
    result = _gemini_vision_ocr(img_bytes)
    if result:
        return result

    # 3. No backend available
    msg = (
        "[OCR ERROR] No vision OCR backend is configured. "
        "Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (for Bedrock) "
        "or GOOGLE_API_KEY (for Gemini) in your .env file."
    )
    logger.error(msg)
    return msg


# ── Main OCR entry point ──────────────────────────────────────────────────────

async def run_ocr(file_path: str, mime_type: str | None) -> str:
    """
    Main OCR entry point. Handles:
    - Plain-text files (.txt, .csv, etc.): read directly, no API needed.
    - PDFs with embedded text: extract via PyMuPDF, no API needed.
    - Scanned PDFs / images: vision OCR via Bedrock or Gemini.
    """
    path = Path(file_path)
    extension = path.suffix.lower()

    # ── 1. Plain-text files: read directly ────────────────────────────────────
    is_text_mime = mime_type and any(mime_type.startswith(t) for t in TEXT_MIME_TYPES)
    is_text_ext = extension in TEXT_EXTENSIONS

    if is_text_mime or is_text_ext:
        logger.info(f"Reading plain-text file directly: {path.name}")
        try:
            return path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Failed to read text file: {e}")
            return f"[OCR ERROR] Could not read text file: {e}"

    # ── 2. PDF files ──────────────────────────────────────────────────────────
    if (mime_type and "pdf" in mime_type) or extension == ".pdf":
        logger.info(f"Extracting text from PDF: {path.name}")
        raw = _pdf_to_text(file_path)

        # If the PDF has an embedded text layer, use it directly (no API cost)
        if raw.strip() and not raw.startswith("[OCR ERROR]"):
            char_count = len(raw.strip())
            logger.info(f"PDF text layer: {char_count} chars extracted.")
            if char_count > 50:  # meaningful content
                return raw

        logger.info("PDF has no/minimal embedded text — converting to images for vision OCR.")
        images = _pdf_to_images(file_path)
        if not images:
            return "[OCR ERROR] Could not render PDF pages as images."

        parts: list[str] = []
        for i, img in enumerate(images):
            logger.info(f"OCR page {i + 1}/{len(images)} of {path.name}...")
            parts.append(_ocr_single_image(img))
        return "\n\n--- PAGE BREAK ---\n\n".join(parts)

    # ── 3. Image files (PNG, JPG, TIFF, BMP, WEBP) ───────────────────────────
    try:
        img = Image.open(file_path)
        logger.info(f"OCR image file: {path.name} ({img.size[0]}x{img.size[1]})")
        return _ocr_single_image(img)
    except Exception as e:
        logger.error(f"Cannot open image file {path.name}: {e}")
        return f"[OCR ERROR] Cannot open image file: {e}"
