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


def _get_bedrock_client():
    """Return a boto3 bedrock-runtime client using the configured IAM credentials."""
    kwargs = dict(service_name="bedrock-runtime", region_name=BEDROCK_REGION)
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
    return boto3.client(**kwargs)


def _image_to_base64(img: Image.Image, fmt: str = "JPEG") -> str:
    """Convert a PIL image to a base64-encoded JPEG string."""
    buf = io.BytesIO()
    img = img.convert("RGB")
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


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


def _kimi_vision_ocr(b64_jpeg: str) -> str:
    """
    OCR a single image using Kimi K2.5 on Amazon Bedrock via boto3.
    Kimi accepts OpenAI-style image_url content with data-URI encoding.
    """
    client = _get_bedrock_client()
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
        # Unexpected format — return dumped JSON for debugging
        return json.dumps(result)
    except Exception as e:
        logger.error(f"Kimi Bedrock OCR error: {e}")
        return f"[OCR ERROR] {e}"


async def run_ocr(file_path: str, mime_type: str | None) -> str:
    """
    Main OCR entry point.
    - PDFs: extract embedded text directly via PyMuPDF (fast, no API cost).
    - Images: send to Kimi K2.5 on Amazon Bedrock for vision OCR.
    """
    if mime_type and "pdf" in mime_type:
        logger.info("Extracting text directly from PDF via PyMuPDF.")
        raw = _pdf_to_text(file_path)
        # If the PDF has embedded text, return it. Otherwise fall through to image OCR.
        if raw.strip() and not raw.startswith("[OCR ERROR]"):
            return raw
        logger.info(
            "PDF had no embedded text — converting to images for vision OCR.")
        images = _pdf_to_images(file_path)
    else:
        # Regular image file
        try:
            images = [Image.open(file_path)]
        except Exception as e:
            logger.error(f"Cannot open image file: {e}")
            return f"[OCR ERROR] Cannot open image: {e}"

    if not images:
        return "[OCR ERROR] Could not read the document file."

    all_text_parts: list[str] = []
    for i, img in enumerate(images):
        logger.info(
            f"Sending page {i+1}/{len(images)} to Kimi K2.5 on Bedrock for vision OCR.")
        b64 = _image_to_base64(img)
        text = _kimi_vision_ocr(b64)
        logger.info(f"Page {i+1} OCR returned {len(text)} characters.")
        all_text_parts.append(text)

    return "\n\n--- PAGE BREAK ---\n\n".join(all_text_parts)
