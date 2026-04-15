import json
import logging
from sqlalchemy.orm import Session

from models.models import (
    Claim, Document, ExtractedField, ValidationResult, DocumentSummary,
    ClaimStatus, OCRStatus, ValidationStatus, User
)
from services.ocr_service import run_ocr
from services.extraction_service import extract_fields, flatten_fields
from services.validation_service import validate_claim
from services.fraud_service import evaluate_claim_fraud_risk
from services.summary_service import generate_document_summary
from services.comprehend_medical_service import run_comprehend_medical, get_top_icd10_codes
from utils.websocket_manager import manager

logger = logging.getLogger(__name__)


async def _run_ocr_step(db: Session, documents: list[Document]) -> list[str]:
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
    return all_raw_text


async def _run_extraction_step(db: Session, claim: Claim, all_raw_text: list[str]) -> dict:
    combined_text = "\n\n---\n\n".join(all_raw_text)
    extraction_result = await extract_fields(combined_text)
    field_dicts = flatten_fields(extraction_result)

    db.query(ExtractedField).filter(ExtractedField.claim_id == claim.id).delete()

    creator = db.query(User).filter(User.id == claim.created_by).first() if claim.created_by else None

    for fd in field_dicts:
        field_val = fd["field_value"]
        if fd["field_category"] == "hospital" and fd["field_name"] == "hospital.name" and creator and creator.username:
            field_val = creator.username

        db.add(ExtractedField(
            claim_id=claim.id, field_category=fd["field_category"],
            field_name=fd["field_name"], field_value=field_val, confidence=fd["confidence"]
        ))

    fields_data = extraction_result.get("fields", {})
    patient = fields_data.get("patient", {})
    policy = fields_data.get("policy", {})
    if patient.get("name"): claim.patient_name = patient["name"]
    if policy.get("policy_number"): claim.policy_number = policy["policy_number"]

    claim.status = ClaimStatus.EXTRACTED
    db.commit()
    return extraction_result


async def _run_comprehend_step(db: Session, claim: Claim, extraction_result: dict):
    logger.info(f"Running Comprehend Medical for claim {claim.id}...")
    clinical = extraction_result.get("fields", {}).get("clinical", {})
    clinical_parts = []
    
    for key in ("diagnosis", "secondary_diagnosis", "condition", "symptoms", "procedure", "treatment", "operation"):
        val = clinical.get(key)
        if val and str(val).strip() and str(val).strip().lower() not in ("none", "null", "n/a", ""):
            clinical_parts.append(str(val).strip())

    if not clinical_parts:
        for k, v in clinical.items():
            if v and str(v).strip() and str(v).strip().lower() not in ("none", "null", "n/a", ""):
                clinical_parts.append(str(v).strip())

    comprehend_input = ". ".join(clinical_parts) if clinical_parts else ""
    if not comprehend_input:
        return

    comprehend_entities = await run_comprehend_medical(comprehend_input)
    if comprehend_entities:
        db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim.id, ExtractedField.field_category == "clinical",
            ExtractedField.field_name.like("comprehend_icd10_%")
        ).delete(synchronize_session=False)

        for idx, entity in enumerate(comprehend_entities[:10]):
            db.add(ExtractedField(
                claim_id=claim.id, field_category="clinical", field_name=f"comprehend_icd10_{idx + 1}",
                field_value=json.dumps(entity), confidence=entity.get("score")
            ))

        top_codes = get_top_icd10_codes(comprehend_entities)
        if top_codes:
            db.add(ExtractedField(
                claim_id=claim.id, field_category="clinical", field_name="comprehend_icd10_codes",
                field_value=", ".join(top_codes), confidence=None
            ))

        db.commit()
        await manager.send_personal_message({
            "type": "COMPREHEND_COMPLETED", "message": f"AWS ICD-10 analysis complete for claim #{claim.id}",
            "claim_id": claim.id, "icd10_codes_detected": top_codes,
        }, str(claim.created_by))


async def _run_summary_step(db: Session, claim_id: int, all_raw_text: list[str], extraction_result: dict):
    summary_result = await generate_document_summary(raw_texts=all_raw_text, extracted_fields=extraction_result)
    db.query(DocumentSummary).filter(DocumentSummary.claim_id == claim_id).delete()
    db.add(DocumentSummary(
        claim_id=claim_id, summary_text=summary_result["summary_text"],
        key_findings=summary_result.get("key_findings", []), document_count=len(all_raw_text)
    ))
    db.commit()


async def run_extraction_pipeline(claim_id: int, db_session_factory):
    db: Session = db_session_factory()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim: return
        claim.status = ClaimStatus.PROCESSING
        db.commit()

        documents = db.query(Document).filter(Document.claim_id == claim_id).all()
        all_raw_text = await _run_ocr_step(db, documents)

        try:
            extraction_result = await _run_extraction_step(db, claim, all_raw_text)
            await manager.send_personal_message({
                "type": "CLAIM_STATUS", "message": f"Document data extracted for claim #{claim_id}",
                "claim_id": claim_id, "status": "EXTRACTED"
            }, str(claim.created_by))
        except Exception as e:
            logger.exception(f"Extraction failed: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()
            return

        try: await _run_comprehend_step(db, claim, extraction_result)
        except Exception as e: logger.exception(f"Comprehend failed: {e}")

        try: await _run_summary_step(db, claim_id, all_raw_text, extraction_result)
        except Exception as e: logger.exception(f"Summary failed: {e}")

    except Exception as e:
        logger.exception(f"Pipeline error: {e}")
        try:
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim:
                claim.status = ClaimStatus.ERROR
                db.commit()
                import asyncio
                asyncio.create_task(manager.send_personal_message({
                    "type": "ERROR", "message": f"Extraction failed for claim #{claim_id}", "claim_id": claim_id
                }, str(claim.created_by)))
        except Exception: pass
    finally:
        db.close()


async def run_validation_pipeline(claim_id: int, SessionLocal):
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim: return
        claim.status = ClaimStatus.PROCESSING
        db.commit()

        try:
            val_result = await validate_claim(db, claim_id)
            db.query(ValidationResult).filter(ValidationResult.claim_id == claim_id).delete()
            db.add(ValidationResult(
                claim_id=claim_id, status=ValidationStatus(val_result["status"]), missing_docs=val_result["missing_docs"],
                warnings=val_result["warnings"], errors=val_result["errors"], overall_confidence=val_result["overall_confidence"],
            ))
            claim.status = ClaimStatus.VALIDATED
            db.commit()
            await manager.send_personal_message({
                "type": "CLAIM_STATUS", "message": f"Validation rules complete for claim #{claim_id}",
                "claim_id": claim_id, "status": "VALIDATED"
            }, str(claim.created_by))
        except Exception as e:
            logger.exception(f"Validation failed: {e}")
            claim.status = ClaimStatus.ERROR
            db.commit()

        try:
            evaluate_claim_fraud_risk(db, claim_id)
            claim_after_fraud = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim_after_fraud:
                await manager.send_personal_message({
                    "type": "FRAUD_COMPLETED", "message": f"Fraud analysis complete for claim #{claim_id}",
                    "claim_id": claim_id, "risk_score": claim_after_fraud.fraud_risk_score
                }, str(claim_after_fraud.created_by))
                if claim_after_fraud.fraud_risk_score > 70 and claim_after_fraud.insurer_id:
                    await manager.send_personal_message({
                        "type": "HIGH_FRAUD_RISK", "message": f"High fraud risk ({claim_after_fraud.fraud_risk_score} pts) detected on claim #{claim_id}",
                        "claim_id": claim_id
                    }, str(claim_after_fraud.insurer_id))
        except Exception as e: logger.exception(f"Fraud scoring failed: {e}")

    except Exception as e:
        logger.exception(f"Pipeline error: {e}")
        try:
            claim = db.query(Claim).filter(Claim.id == claim_id).first()
            if claim:
                claim.status = ClaimStatus.ERROR
                db.commit()
        except: pass
    finally:
        db.close()
