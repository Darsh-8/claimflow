"""
Unit tests for service/comprehend_medical_service.py

Uses unittest.mock to avoid real AWS calls.
"""

import asyncio
import unittest
from unittest.mock import MagicMock, patch

from services.comprehend_medical_service import (
    run_comprehend_medical,
    get_top_icd10_codes,
    _infer_icd10_cm_sync,
    _truncate_for_comprehend,
)

# ---------------------------------------------------------------------------
# Sample response fixture
# ---------------------------------------------------------------------------

SAMPLE_RESPONSE = {
    "Entities": [
        {
            "Text": "pneumonia",
            "Score": 0.99,
            "BeginOffset": 5,
            "EndOffset": 14,
            "Traits": [],
            "Attributes": [],
            "ICD10CMConcepts": [
                {"Code": "J18.9", "Description": "Pneumonia, unspecified organism", "Score": 0.97},
                {"Code": "J18.0", "Description": "Bronchopneumonia, unspecified organism", "Score": 0.50},
            ],
        },
        {
            "Text": "no fever",
            "Score": 0.88,
            "BeginOffset": 20,
            "EndOffset": 28,
            "Traits": [{"Name": "NEGATION"}],
            "Attributes": [],
            "ICD10CMConcepts": [
                {"Code": "R50.9", "Description": "Fever, unspecified", "Score": 0.85},
            ],
        },
    ]
}


class TestComprehendSync(unittest.TestCase):

    def _mock_client(self):
        client = MagicMock()
        client.infer_icd10_cm.return_value = SAMPLE_RESPONSE
        return client

    @patch("service.comprehend_medical_service._build_client")
    def test_happy_path(self, mock_build):
        """Should return two entities with correct fields."""
        mock_build.return_value = self._mock_client()
        results = _infer_icd10_cm_sync("Patient has pneumonia and no fever.")

        self.assertEqual(len(results), 2)
        # First entity (highest score)
        self.assertEqual(results[0]["icd10_code"], "J18.9")
        self.assertAlmostEqual(results[0]["score"], 0.99, places=3)
        self.assertEqual(results[0]["traits"], [])
        self.assertEqual(len(results[0]["alternatives"]), 1)
        self.assertEqual(results[0]["alternatives"][0]["code"], "J18.0")

        # Second entity — negated fever
        self.assertIn("NEGATION", results[1]["traits"])
        self.assertEqual(results[1]["icd10_code"], "R50.9")

    @patch("service.comprehend_medical_service._build_client")
    def test_empty_text_skips_call(self, mock_build):
        """Empty input should return [] without calling AWS."""
        results = _infer_icd10_cm_sync("")
        mock_build.assert_not_called()
        self.assertEqual(results, [])

    @patch("service.comprehend_medical_service._build_client")
    def test_aws_client_error(self, mock_build):
        """ClientError should be caught and return empty list."""
        from botocore.exceptions import ClientError
        client = MagicMock()
        client.infer_icd10_cm.side_effect = ClientError(
            {"Error": {"Code": "ValidationException", "Message": "bad input"}},
            "InferICD10CM",
        )
        mock_build.return_value = client
        results = _infer_icd10_cm_sync("Patient with pneumonia.")
        self.assertEqual(results, [])

    @patch("service.comprehend_medical_service._build_client")
    def test_no_icd10_concepts_skipped(self, mock_build):
        """Entities without ICD10CMConcepts should be silently skipped."""
        client = MagicMock()
        client.infer_icd10_cm.return_value = {
            "Entities": [
                {
                    "Text": "unknown",
                    "Score": 0.7,
                    "BeginOffset": 0,
                    "EndOffset": 7,
                    "Traits": [],
                    "Attributes": [],
                    "ICD10CMConcepts": [],  # empty
                }
            ]
        }
        mock_build.return_value = client
        results = _infer_icd10_cm_sync("unknown condition")
        self.assertEqual(results, [])


class TestTruncate(unittest.TestCase):
    def test_no_truncation_when_within_limit(self):
        text = "hello" * 100
        self.assertEqual(_truncate_for_comprehend(text), text)

    def test_truncation_applied(self):
        text = "a" * 25_000  # 25 KB > 20 KB limit
        result = _truncate_for_comprehend(text)
        self.assertLessEqual(len(result.encode("utf-8")), 20_000)


class TestGetTopCodes(unittest.TestCase):
    def test_excludes_negated(self):
        entities = [
            {"icd10_code": "J18.9", "traits": []},
            {"icd10_code": "R50.9", "traits": ["NEGATION"]},
            {"icd10_code": "I10", "traits": []},
        ]
        codes = get_top_icd10_codes(entities)
        self.assertIn("J18.9", codes)
        self.assertNotIn("R50.9", codes)
        self.assertIn("I10", codes)

    def test_deduplication(self):
        entities = [
            {"icd10_code": "J18.9", "traits": []},
            {"icd10_code": "J18.9", "traits": []},
        ]
        codes = get_top_icd10_codes(entities)
        self.assertEqual(codes.count("J18.9"), 1)


class TestAsyncRun(unittest.IsolatedAsyncioTestCase):
    @patch("service.comprehend_medical_service._build_client")
    async def test_async_wrapper(self, mock_build):
        """Async wrapper should return the same results as the sync call."""
        client = MagicMock()
        client.infer_icd10_cm.return_value = SAMPLE_RESPONSE
        mock_build.return_value = client

        results = await run_comprehend_medical("Patient has pneumonia.")
        self.assertGreater(len(results), 0)
        self.assertEqual(results[0]["icd10_code"], "J18.9")

    async def test_async_empty_text(self):
        """Empty text should return [] without calling AWS."""
        results = await run_comprehend_medical("")
        self.assertEqual(results, [])


if __name__ == "__main__":
    unittest.main()
