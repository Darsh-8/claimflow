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

    # Only set patient_name from OCR if one wasn't already provided (e.g. from HMS patient tab).
    # This preserves the authoritative HMS name so the patient override step can look it up correctly.
    if patient.get("name") and not claim.patient_name:
        claim.patient_name = patient["name"]

    if policy.get("policy_number"): claim.policy_number = policy["policy_number"]

    claim.status = ClaimStatus.EXTRACTED
    db.commit()
    return extraction_result



def _apply_hms_patient_override(db: Session, claim: Claim) -> bool:
    """
    If the claim's patient_name matches an HMS patient record, overwrite
    all extracted patient fields with authoritative HMS data, and also
    inject clinical/financial data from the patient's most recent admission
    and invoice.

    Fields injected with is_manually_corrected=True and confidence=1.0 to
    signal they are verified ground-truth values (shown as ✅ in the UI).

    Returns True if override was applied.
    """
    if not claim.patient_name:
        return False

    try:
        from models.hms_models import Patient as HMSPatient, Admission, Doctor, Ward, Invoice
    except ImportError:
        logger.warning("HMS models not available — skipping patient override.")
        return False

    # Case-insensitive exact name match
    hms_patient = (
        db.query(HMSPatient)
        .filter(HMSPatient.name.ilike(claim.patient_name.strip()))
        .filter(HMSPatient.is_active == True)
        .first()
    )

    if not hms_patient:
        logger.info(f"No HMS patient matched name '{claim.patient_name}' for claim {claim.id}.")
        return False

    logger.info(
        f"HMS patient override: claim {claim.id} → patient_id={hms_patient.id} "
        f"name='{hms_patient.name}'"
    )

    # Always set authoritative name on the claim itself
    claim.patient_name = hms_patient.name

    # -- 1. Demographic fields from Patient --
    patient_fields = [
        ("patient", "patient.name",              str(hms_patient.name)),
        ("patient", "patient.age",               str(hms_patient.age)              if hms_patient.age               else None),
        ("patient", "patient.gender",            hms_patient.gender                 if hms_patient.gender            else None),
        ("patient", "patient.blood_group",       hms_patient.blood_group            if hms_patient.blood_group       else None),
        ("patient", "patient.phone",             hms_patient.phone                  if hms_patient.phone             else None),
        ("patient", "patient.email",             hms_patient.email                  if hms_patient.email             else None),
        ("patient", "patient.address",           hms_patient.address                if hms_patient.address           else None),
        ("patient", "patient.emergency_contact", hms_patient.emergency_contact      if hms_patient.emergency_contact else None),
        ("clinical", "clinical.known_allergies", hms_patient.allergies              if hms_patient.allergies         else None),
        ("clinical", "clinical.medical_history", hms_patient.medical_history        if hms_patient.medical_history   else None),
    ]

    # -- 2. Most recent admission (prefer active, fall back to latest) --
    active_admission = (
        db.query(Admission)
        .filter(Admission.patient_id == hms_patient.id, Admission.status == "admitted")
        .order_by(Admission.created_at.desc())
        .first()
    )
    latest_admission = active_admission or (
        db.query(Admission)
        .filter(Admission.patient_id == hms_patient.id)
        .order_by(Admission.created_at.desc())
        .first()
    )

    admission_fields = []
    if latest_admission:
        # Doctor info
        doctor = db.query(Doctor).filter(Doctor.id == latest_admission.doctor_id).first() if latest_admission.doctor_id else None
        # Ward info
        ward = db.query(Ward).filter(Ward.id == latest_admission.ward_id).first() if latest_admission.ward_id else None

        admission_fields = [
            ("clinical",  "clinical.diagnosis",         latest_admission.diagnosis   if latest_admission.diagnosis   else None),
            ("clinical",  "clinical.doctor_name",       doctor.name                  if doctor                       else None),
            ("clinical",  "clinical.doctor_specialization", doctor.specialization    if doctor and doctor.specialization else None),
            ("hospital",  "hospital.doctor_name",       doctor.name                  if doctor                       else None),
            ("hospital",  "hospital.ward",              ward.name                    if ward                         else None),
            ("hospital",  "hospital.ward_type",         ward.ward_type               if ward                         else None),
            ("hospital",  "hospital.bed_number",        latest_admission.bed_number  if latest_admission.bed_number  else None),
            ("financial", "financial.admission_date",
                latest_admission.admission_date.strftime("%Y-%m-%d") if latest_admission.admission_date else None),
            ("financial", "financial.discharge_date",
                (latest_admission.actual_discharge or latest_admission.expected_discharge or None)),
        ]
        # Format discharge date properly
        for i, (cat, name, val) in enumerate(admission_fields):
            if name == "financial.discharge_date" and val and not isinstance(val, str):
                admission_fields[i] = (cat, name, val.strftime("%Y-%m-%d"))

        # Also set claim-level policy_number from admission diagnosis notes if not already set
        if latest_admission.notes and not claim.policy_number:
            import re
            pol_match = re.search(r'[A-Z]{2,4}[\-/]?\d{6,12}', latest_admission.notes)
            if pol_match:
                claim.policy_number = pol_match.group(0)

    # -- 3. Most recent invoice for this patient --
    latest_invoice = (
        db.query(Invoice)
        .filter(Invoice.patient_id == hms_patient.id)
        .order_by(Invoice.created_at.desc())
        .first()
    )

    invoice_fields = []
    if latest_invoice:
        invoice_fields = [
            ("financial", "financial.total_bill_amount", f"{latest_invoice.total:.2f}"              if latest_invoice.total    else None),
            ("financial", "financial.bill_amount",       f"{latest_invoice.total:.2f}"              if latest_invoice.total    else None),
            ("financial", "financial.paid_amount",       f"{latest_invoice.paid_amount:.2f}"        if latest_invoice.paid_amount else None),
            ("financial", "financial.outstanding_amount",f"{(latest_invoice.total - latest_invoice.paid_amount):.2f}" if latest_invoice.total else None),
            ("financial", "financial.invoice_number",    latest_invoice.invoice_number              if latest_invoice.invoice_number else None),
        ]

    mismatches = []
    
    # -- 4. Upsert all fields --
    all_fields = patient_fields + admission_fields + invoice_fields
    for category, field_name, value in all_fields:
        if value is None:
            continue

        existing = (
            db.query(ExtractedField)
            .filter(
                ExtractedField.claim_id == claim.id,
                ExtractedField.field_category == category,
                ExtractedField.field_name == field_name,
            )
            .first()
        )
        if existing:
            # Record mismatch if OCR value differs from HMS ground truth
            # We specifically care about demographic mismatch for fraud alerting
            if category == "patient" and existing.field_value:
                ocr_val = str(existing.field_value).strip().lower()
                hms_val = str(value).strip().lower()
                if ocr_val and ocr_val != hms_val:
                    mismatches.append({
                        "field": field_name,
                        "document": existing.field_value,
                        "hms": value
                    })

            existing.field_value = value
            existing.confidence = 1.0
            existing.is_manually_corrected = True
        else:
            db.add(ExtractedField(
                claim_id=claim.id,
                field_category=category,
                field_name=field_name,
                field_value=value,
                confidence=1.0,
                is_manually_corrected=True,
            ))

    if mismatches:
        db.add(ExtractedField(
            claim_id=claim.id,
            field_category="fraud",
            field_name="hms_demographic_mismatch",
            field_value=json.dumps(mismatches),
            confidence=1.0,
            is_manually_corrected=True,
        ))

    db.commit()
    return True



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

            # Override extracted patient fields with authoritative HMS data
            # This ensures OCR errors (e.g. wrong patient name in document) are corrected
            try:
                overridden = _apply_hms_patient_override(db, claim)
                if overridden:
                    logger.info(f"HMS patient data applied to claim {claim_id}.")
                    # Rebuild extraction_result from the now-corrected DB fields so that
                    # the summary and subsequent steps use HMS ground-truth data, not OCR text.
                    corrected_fields = db.query(ExtractedField).filter(
                        ExtractedField.claim_id == claim_id
                    ).all()
                    rebuilt = {"fields": {}}
                    for f in corrected_fields:
                        if f.field_name.startswith("comprehend_icd10_"):
                            continue
                        cat = f.field_category
                        # field_name is like "patient.name" → key is "name"
                        key = f.field_name.split(".", 1)[-1] if "." in f.field_name else f.field_name
                        rebuilt["fields"].setdefault(cat, {})[key] = f.field_value
                    extraction_result = rebuilt
            except Exception as e:
                logger.warning(f"HMS patient override failed (non-fatal): {e}")

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
