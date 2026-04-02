from services.ocr_service import _pdf_to_images, run_ocr
from main import app
import os
import sys
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from PIL import Image
import fitz  # PyMuPDF

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))


client = TestClient(app)

# Helper to create a dummy PDF


def create_dummy_pdf(path):
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 50), "Test PDF Content", fontsize=20)
    doc.save(path)
    doc.close()


@pytest.fixture
def test_pdf_path(tmp_path):
    pdf_path = tmp_path / "test.pdf"
    create_dummy_pdf(str(pdf_path))
    return str(pdf_path)


@pytest.fixture
def mock_kimi_api():
    from unittest.mock import AsyncMock
    with patch("service.ocr_service.httpx.AsyncClient") as mock_client:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "Extracted Text Content"}}]
        }

        mock_client_instance = MagicMock()
        # Mock post() as an awaitable
        mock_client_instance.post = AsyncMock(return_value=mock_resp)
        mock_client_instance.__aenter__ = AsyncMock(
            return_value=mock_client_instance)
        mock_client_instance.__aexit__ = AsyncMock(return_value=None)

        mock_client.return_value = mock_client_instance
        yield mock_client


def test_pdf_to_images_conversion(test_pdf_path):
    """Test that PyMuPDF correctly converts PDF to PIL images."""
    images = _pdf_to_images(test_pdf_path)
    assert len(images) == 1
    assert isinstance(images[0], Image.Image)
    assert images[0].width > 0
    assert images[0].height > 0


@patch("service.ocr_service.settings")
@pytest.mark.asyncio
async def test_run_ocr_with_pdf(mock_settings, test_pdf_path, mock_kimi_api):
    """Test the full run_ocr function with a PDF file."""
    mock_settings.KIMI_API_KEY = "test_key"
    mock_settings.KIMI_API_URL = "http://test-url"
    mock_settings.KIMI_MODEL_NAME = "test-model"

    text = await run_ocr(test_pdf_path, "application/pdf")
    print(f"DEBUG: run_ocr output: {text}")

    # Needs to match the mocked return value
    assert "Extracted Text Content" in text, f"Expected 'Extracted Text Content' but got: {text}"


def test_upload_pdf_endpoint(test_pdf_path):
    """Test the API endpoint for uploading a PDF."""
    with open(test_pdf_path, "rb") as f:
        response = client.post(
            "/claims/upload",
            files={"files": ("test.pdf", f, "application/pdf")},
            data={"doc_types": "discharge_summary"}
        )

    assert response.status_code == 200
    data = response.json()
    assert "claim_id" in data
    assert data["message"] == "Documents uploaded successfully. Processing started."


def test_invalid_doc_type(test_pdf_path):
    """Test uploading with an invalid document type."""
    with open(test_pdf_path, "rb") as f:
        response = client.post(
            "/claims/upload",
            files={"files": ("test.pdf", f, "application/pdf")},
            data={"doc_types": "invalid_type"}
        )

    assert response.status_code == 400
