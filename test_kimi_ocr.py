"""
Strict test: Kimi K2.5 on Amazon Bedrock via boto3 with IAM credentials.
Tests both text and image OCR on download.jpg and original.jpg
"""
import os
import boto3
import json
import base64
import io
from PIL import Image

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "YOUR_ACCESS_KEY")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "YOUR_SECRET_KEY")
MODEL_ID   = "moonshotai.kimi-k2.5"

IMAGE_PATHS = [
    r"D:\Code\Claimflow\download.jpg",
    r"D:\Code\Claimflow\original.jpg",
]

def img_to_b64_jpeg(path: str) -> str:
    img = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def try_region(region: str):
    """Return a working bedrock client or None."""
    bedrock = boto3.client(
        service_name="bedrock-runtime",
        region_name=region,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
    )
    body = json.dumps({"messages": [{"role": "user", "content": "hi"}]})
    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        result = json.loads(resp["body"].read())
        print(f"[OK] Kimi reachable in region {region}.")
        return bedrock
    except Exception as e:
        print(f"[FAIL] {region}: {type(e).__name__}: {str(e)[:120]}")
        return None


def ocr_image(bedrock, image_path: str) -> str:
    print(f"\n=== OCR: {image_path} ===")
    b64 = img_to_b64_jpeg(image_path)
    data_uri = f"data:image/jpeg;base64,{b64}"

    # Attempt 1: image_url in content (like OpenAI Vision)
    body_vision = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": "Extract ALL text from this medical document. Return verbatim text only."}
                ]
            }
        ]
    })

    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body_vision,
        )
        result = json.loads(resp["body"].read())
        if "choices" in result:
            text = result["choices"][0]["message"]["content"]
            print("[Vision OK] Extracted text:")
            print(text[:600])
            return text
        else:
            print("[Vision] Unexpected response:", json.dumps(result, indent=2)[:300])
    except Exception as e:
        print(f"[Vision FAIL] {type(e).__name__}: {str(e)[:200]}")

    # Attempt 2: base64 in a simple text prompt (some models accept base64 inline)
    body_inline = json.dumps({
        "messages": [
            {
                "role": "user",
                "content": f"Here is a base64-encoded JPEG medical document. Extract all text from it.\n\n{b64[:200]}..."
            }
        ]
    })
    try:
        resp = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body_inline,
        )
        result = json.loads(resp["body"].read())
        if "choices" in result:
            text = result["choices"][0]["message"]["content"]
            print("[Inline OK]:", text[:300])
            return text
    except Exception as e:
        print(f"[Inline FAIL] {type(e).__name__}: {str(e)[:200]}")

    return "[OCR FAILED]"


if __name__ == "__main__":
    print("---- Finding working region ----")
    client = None
    for region in ["us-west-2", "us-east-1", "ap-south-1", "eu-west-1"]:
        client = try_region(region)
        if client:
            break

    if not client:
        print("\n[ERROR] Could not reach moonshotai.kimi-k2.5 in any region with provided credentials.")
        print("Possible reasons: model not enabled on this account, region restriction, or invalid credentials.")
    else:
        for path in IMAGE_PATHS:
            ocr_image(client, path)
