import json
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
from service.comprehend_medical_service import run_comprehend_medical, get_top_icd10_codes
from api.websocket_manager import manager

logger = logging.getLogger(__name__)


async def run_extraction_pipeline(claim_id: int, db_session_factory):
    """
    Phase 1 pipeline: OCR → Extraction → Comprehend → Summary.
    Stops at EXTRACTED status pending user insurer selection.
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
                field_val = fd["field_value"]
                # Override the extracted hospital name with the actual account name
                # that created this claim. The LLM might extract "Apollo Hospitals"
                # but the user account might be "Demo_hospital".
                if fd["field_category"] == "hospital" and fd["field_name"] == "hospital.name":
                    if claim.created_by:
                        from model.models import User
                        creator = db.query(User).filter(User.id == claim.created_by).first()
                        if creator and creator.username:
                            field_val = creator.username

                ef = ExtractedField(
                    claim_id=claim_id,
                    field_category=fd["field_category"],
                    field_name=fd["field_name"],
                    field_value=field_val,
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
            await manager.send_personal_message({
                "type": "CLAIM_STATUS",
                "message": f"Document data extracted for claim #{claim_id}",
                "claim_id": claim_id,
                "status": "EXTRACTED"
            }, str(claim.created_by))
        except Exception as e:
            logger.exception(f"Extraction failed for claim {claim_id}: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()
            return

        # --- Step 2.5: AWS Comprehend Medical ICD-10 Enrichment ---
        try:
            logger.info(f"Running Comprehend Medical for claim {claim_id}...")

            # Build a focused clinical text from the LLM-extracted fields.
            # ICD-10 codes are inferred from disease/diagnosis names — NOT from
            # raw OCR text. We pass the clinical fields as a short, clean sentence.
            clinical = extraction_result.get("fields", {}).get("clinical", {})
            clinical_parts: list[str] = []
            for key in ("diagnosis", "secondary_diagnosis", "condition", "symptoms",
                        "procedure", "treatment", "operation"):
                val = clinical.get(key)
                if val and str(val).strip() and str(val).strip().lower() not in ("none", "null", "n/a", ""):
                    clinical_parts.append(str(val).strip())

            if not clinical_parts:
                # Fallback: pull any clinical.* field values that look like text
                for k, v in clinical.items():
                    if v and str(v).strip() and str(v).strip().lower() not in ("none", "null", "n/a", ""):
                        clinical_parts.append(str(v).strip())

            comprehend_input = ". ".join(clinical_parts) if clinical_parts else ""
            logger.info(f"Comprehend Medical input for claim {claim_id}: '{comprehend_input[:200]}'")

            comprehend_entities = await run_comprehend_medical(comprehend_input)

            if comprehend_entities:
                # Persist each detected ICD-10 entity as an ExtractedField
                # Delete old comprehend fields first
                db.query(ExtractedField).filter(
                    ExtractedField.claim_id == claim_id,
                    ExtractedField.field_category == "clinical",
                    ExtractedField.field_name.like("comprehend_icd10_%"),
                ).delete(synchronize_session=False)

                for idx, entity in enumerate(comprehend_entities[:10]):  # cap at 10
                    ef = ExtractedField(
                        claim_id=claim_id,
                        field_category="clinical",
                        field_name=f"comprehend_icd10_{idx + 1}",
                        field_value=json.dumps(entity),
                        confidence=entity.get("score"),
                    )
                    db.add(ef)

                # Also store a compact code list for quick access
                top_codes = get_top_icd10_codes(comprehend_entities)
                if top_codes:
                    ef_codes = ExtractedField(
                        claim_id=claim_id,
                        field_category="clinical",
                        field_name="comprehend_icd10_codes",
                        field_value=", ".join(top_codes),
                        confidence=None,
                    )
                    db.add(ef_codes)

                db.commit()
                logger.info(
                    f"Comprehend Medical saved {len(comprehend_entities)} entities for claim {claim_id}."
                )

                await manager.send_personal_message({
                    "type": "COMPREHEND_COMPLETED",
                    "message": f"AWS ICD-10 analysis complete for claim #{claim_id}",
                    "claim_id": claim_id,
                    "icd10_codes_detected": get_top_icd10_codes(comprehend_entities),
                }, str(claim.created_by))
            else:
                logger.info(f"Comprehend Medical returned no entities for claim {claim_id}.")

        except Exception as e:
            logger.exception(f"Comprehend Medical enrichment failed for claim {claim_id}: {e}")
            # Non-blocking — claim processing continues regardless

        # --- Step 3: Generate Document Summary ---
        try:
            logger.info(f"Generating document summary for claim {claim_id}...")
            summary_result = await generate_document_summary(
                raw_texts=all_raw_text,
                extracted_fields=extraction_result,
            )

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

        logger.info(f"Extraction pipeline completed for claim {claim_id}. Awaiting policy link.")

    except Exception as e:
        logger.exception(f"Extraction pipeline error for claim {claim_id}: {e}")
        try:
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim:
                claim.status = ClaimStatus.ERROR
                db.commit()
                # Use manager to notify creator even if outside request context
                import asyncio
                asyncio.create_task(manager.send_personal_message({
                    "type": "ERROR",
                    "message": f"Extraction failed for claim #{claim_id}",
                    "claim_id": claim_id
                }, str(claim.created_by)))
        except Exception as fail_e:
            logger.error(f"Failed to update error status for claim {claim_id}: {fail_e}")
    finally:
        db.close()


async def run_validation_pipeline(claim_id: int, SessionLocal):
    """
    Background task: Phase 2 of claim processing.
    Runs Validation and Fraud scoring after the user has submitted
    the missing Insurer and Policy number.
    """
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            logger.error(f"Claim {claim_id} not found for validation.")
            return

        claim.status = ClaimStatus.PROCESSING
        db.commit()

        # --- Step 1: Run validation ---
        try:
            val_result = await validate_claim(db, claim_id)

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
            await manager.send_personal_message({
                "type": "CLAIM_STATUS",
                "message": f"Validation rules complete for claim #{claim_id}",
                "claim_id": claim_id,
                "status": "VALIDATED"
            }, str(claim.created_by))
        except Exception as e:
            logger.exception(f"Validation failed for claim {claim_id}: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()

        # --- Step 2: Run Fraud Risk Scoring ---
        try:
            logger.info(f"Running fraud detection for claim {claim_id}...")
            evaluate_claim_fraud_risk(db, claim_id)
            
            # Re-fetch claim for risk score
            claim_after_fraud = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim_after_fraud:
                await manager.send_personal_message({
                    "type": "FRAUD_COMPLETED",
                    "message": f"Fraud analysis complete for claim #{claim_id}",
                    "claim_id": claim_id,
                    "risk_score": claim_after_fraud.fraud_risk_score
                }, str(claim_after_fraud.created_by))
                
                # If high risk and insurer is assigned, notify the insurer too
                if claim_after_fraud.fraud_risk_score > 70 and claim_after_fraud.insurer_id:
                    await manager.send_personal_message({
                        "type": "HIGH_FRAUD_RISK",
                        "message": f"High fraud risk ({claim_after_fraud.fraud_risk_score} pts) detected on claim #{claim_id}",
                        "claim_id": claim_id
                    }, str(claim_after_fraud.insurer_id))
                    
        except Exception as e:
            logger.exception(f"Fraud scoring failed for claim {claim_id}: {e}")

        logger.info(f"Validation pipeline completed for claim {claim_id}.")

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
