import logging

from sqlalchemy.orm import Session

from model.models import (
    Claim, Document, ExtractedField, ValidationResult, DocumentSummary,
    ClaimStatus, OCRStatus, ValidationStatus
)
from service.ocr_service import run_ocr
from service.extraction_service import extract_fields, flatten_fields
from service.validation_service import validate_claim
from service.fraud_service import evaluate_claim_fraud_risk
from service.summary_service import generate_document_summary

logger = logging.getLogger(__name__)


async def process_claim(claim_id: int, db_session_factory):
    """
    Full async pipeline: OCR → Extraction → Validation → Fraud Scoring → Summary.
    Runs as a background task.
    """
    db: Session = db_session_factory()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            logger.error(f"Claim {claim_id} not found")
            return

        # Update status to PROCESSING
        claim.status = ClaimStatus.PROCESSING
        db.commit()

        documents = db.query(Document).filter(
            Document.claim_id == claim_id).all()

        # --- Step 1: OCR each document ---
        all_raw_text = []
        for doc in documents:
            doc.ocr_status = OCRStatus.PROCESSING
            db.commit()

            try:
                raw_text = await run_ocr(doc.file_path, doc.mime_type)
                doc.raw_text = raw_text
                doc.ocr_status = OCRStatus.COMPLETED
                all_raw_text.append(raw_text)
            except Exception as e:
                logger.exception(f"OCR failed for doc {doc.id}: {e}")
                doc.raw_text = f"[OCR ERROR] {str(e)}"
                doc.ocr_status = OCRStatus.FAILED
            db.commit()

        # --- Step 2: Extract structured fields ---
        combined_text = "\n\n---\n\n".join(all_raw_text)
        extraction_result = {}

        try:
            extraction_result = await extract_fields(combined_text)
            field_dicts = flatten_fields(extraction_result)

            # Clear previous extracted fields
            db.query(ExtractedField).filter(
                ExtractedField.claim_id == claim_id).delete()

            for fd in field_dicts:
                ef = ExtractedField(
                    claim_id=claim_id,
                    field_category=fd["field_category"],
                    field_name=fd["field_name"],
                    field_value=fd["field_value"],
                    confidence=fd["confidence"],
                )
                db.add(ef)

            # Try to populate claim-level patient_name and policy_number
            fields_data = extraction_result.get("fields", {})
            patient = fields_data.get("patient", {})
            policy = fields_data.get("policy", {})
            if patient.get("name"):
                claim.patient_name = patient["name"]
            if policy.get("policy_number"):
                claim.policy_number = policy["policy_number"]

            claim.status = ClaimStatus.EXTRACTED
            db.commit()
        except Exception as e:
            logger.exception(f"Extraction failed for claim {claim_id}: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()
            return

        # --- Step 3: Run validation ---
        try:
            val_result = await validate_claim(db, claim_id)

            # Clear previous validation
            db.query(ValidationResult).filter(
                ValidationResult.claim_id == claim_id).delete()

            vr = ValidationResult(
                claim_id=claim_id,
                status=ValidationStatus(val_result["status"]),
                missing_docs=val_result["missing_docs"],
                warnings=val_result["warnings"],
                errors=val_result["errors"],
                overall_confidence=val_result["overall_confidence"],
            )
            db.add(vr)

            claim.status = ClaimStatus.VALIDATED
            db.commit()
        except Exception as e:
            logger.exception(f"Validation failed for claim {claim_id}: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()

        # --- Step 4: Run Fraud Risk Scoring ---
        try:
            logger.info(f"Running fraud detection for claim {claim_id}...")
            evaluate_claim_fraud_risk(db, claim_id)
        except Exception as e:
            logger.exception(f"Fraud scoring failed for claim {claim_id}: {e}")
            # Non-blocking error for overall claim process

        # --- Step 5: Generate Document Summary ---
        try:
            logger.info(f"Generating document summary for claim {claim_id}...")
            summary_result = await generate_document_summary(
                raw_texts=all_raw_text,
                extracted_fields=extraction_result,
            )

            # Clear previous summaries
            db.query(DocumentSummary).filter(
                DocumentSummary.claim_id == claim_id
            ).delete()

            ds = DocumentSummary(
                claim_id=claim_id,
                summary_text=summary_result["summary_text"],
                key_findings=summary_result.get("key_findings", []),
                document_count=len(all_raw_text),
            )
            db.add(ds)
            db.commit()
            logger.info(f"Document summary saved for claim {claim_id}.")
        except Exception as e:
            logger.exception(
                f"Summary generation failed for claim {claim_id}: {e}")
            # Non-blocking — summary failure does not affect claim status

        logger.info(f"Pipeline completed for claim {claim_id}.")

    except Exception as e:
        logger.exception(f"Pipeline error for claim {claim_id}: {e}")
        try:
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim:
                claim.status = ClaimStatus.ERROR
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
