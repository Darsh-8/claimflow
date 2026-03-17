"""
Unit tests for the document summary service.
Tests the fallback summary builder and mocked LLM path.
"""

from service.summary_service import generate_document_summary, _build_fallback_summary
import json
import os
import sys
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))


# --- Fallback builder tests ---

def test_fallback_summary_with_full_fields():
    """Test multi-paragraph summary from complete extraction data."""
    extracted = {
        "fields": {
            "patient": {"name": "Rajesh Kumar", "age": "45", "gender": "Male", "weight": "78 Kg"},
            "clinical": {"diagnosis": "Acute Appendicitis", "procedure": "Laparoscopic Appendectomy", "blood_pressure": "120/80"},
            "hospital": {"name": "City General Hospital", "treating_doctor": "Dr. Anand", "address": "123 Main St, Delhi"},
            "financial": {"admission_date": "01/03/2026", "discharge_date": "05/03/2026", "total_bill_amount": "1,50,000"},
            "policy": {"policy_number": "POL-98765"},
        }
    }
    result = _build_fallback_summary(extracted)

    assert "summary_text" in result
    assert isinstance(result["summary_text"], str)
    assert "\n\n" in result["summary_text"]  # Multi-paragraph
    assert "Rajesh Kumar" in result["summary_text"]
    assert "City General Hospital" in result["summary_text"]
    assert "Acute Appendicitis" in result["summary_text"]
    assert "1,50,000" in result["summary_text"]
    assert "POL-98765" in result["summary_text"]
    assert result["key_findings"] == []  # No bullet points anymore


def test_fallback_summary_with_medications():
    """Test that medications are included in the clinical paragraph."""
    extracted = {
        "fields": {
            "patient": {"name": "Test Patient"},
            "clinical": {"medication_1": "Tab. ASPIRIN 75mg", "medication_2": "Cap. OMEZ 20mg"},
        }
    }
    result = _build_fallback_summary(extracted)

    assert "ASPIRIN" in result["summary_text"]
    assert "OMEZ" in result["summary_text"]
    assert "medications were prescribed" in result["summary_text"]


def test_fallback_summary_with_partial_fields():
    """Test fallback summary with only patient name."""
    extracted = {"fields": {"patient": {"name": "Test Patient"}}}
    result = _build_fallback_summary(extracted)

    assert "Test Patient" in result["summary_text"]
    assert "\n\n" in result["summary_text"]  # Still multi-paragraph


def test_fallback_summary_with_empty_fields():
    """Test fallback when no fields are available."""
    result = _build_fallback_summary({})

    assert "could not be processed" in result["summary_text"]
    assert result["key_findings"] == []


def test_fallback_summary_with_no_fields_key():
    """Test fallback when dict has no 'fields' key."""
    result = _build_fallback_summary({"confidences": {}})

    assert "summary_text" in result
    # Falls through to building overview with unknown patient
    assert len(result["summary_text"]) > 10


# --- LLM-based summary tests (mocked) ---

@pytest.mark.asyncio
async def test_generate_summary_empty_text():
    """Test that empty raw texts use fallback."""
    result = await generate_document_summary(
        raw_texts=[],
        extracted_fields={"fields": {"patient": {"name": "Test"}}},
    )
    assert "Test" in result["summary_text"]


@pytest.mark.asyncio
async def test_generate_summary_ocr_error_only():
    """Test that OCR error texts are filtered, fallback is used."""
    result = await generate_document_summary(
        raw_texts=["[OCR ERROR] Failed to read"],
        extracted_fields={"fields": {"patient": {"name": "Error Patient"}}},
    )
    assert "Error Patient" in result["summary_text"]
