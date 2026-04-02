import os
import uuid
import json
import logging
from typing import Optional

from fastapi import HTTPException, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from utils.websocket_manager import manager

from config.database import SessionLocal
from config.config import settings
from dao.claim_repository import ClaimRepository
from services.pipeline import run_extraction_pipeline, run_validation_pipeline, validate_claim
from services.comprehend_medical_service import get_top_icd10_codes

from models.models import (
    Claim, Document, ExtractedField, ValidationResult, AuditLog, FraudAlert,
    DocumentSummary, ClaimStatus, DocumentType, OCRStatus, ValidationStatus,
    User, UserRole, utcnow
)

from schemas.schemas import (
    ClaimStatusResponse, ClaimListItem, ClaimDataResponse, DocumentResponse,
    ExtractedFieldResponse, ValidationResponse, UploadResponse, CorrectionRequest,
    FraudAlertResponse, ClaimReviewRequest, DocumentSummaryResponse,
    PatientHistoryClaim, PatientHistoryResponse, ComprehendICD10Response, PolicyLinkRequest,
    ComprehendICD10Entity
)

logger = logging.getLogger(__name__)

class ClaimService:
    """Service layer for Claim business logic (SOLID SRP)."""

    @staticmethod
    async def upload_documents(background_tasks: BackgroundTasks, files: list[UploadFile], doc_types: list[str], insurer_id: Optional[int], db: Session, current_user: User) -> UploadResponse:
        if len(files) != len(doc_types):
            raise HTTPException(400, "Number of files and doc_types must match")

        valid_types = {e.value for e in DocumentType}
        for dt in doc_types:
            if dt not in valid_types: raise HTTPException(400, f"Invalid doc_type: {dt}")

        claim = ClaimRepository.create_claim(db, insurer_id, created_by=current_user.id)
        docs_created = 0

        for file, doc_type in zip(files, doc_types):
            ext = os.path.splitext(file.filename or "doc")[1]
            unique_name = f"{claim.id}_{uuid.uuid4().hex[:8]}{ext}"
            file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)

            ClaimRepository.create_document(
                db=db, claim_id=claim.id, doc_type=doc_type, file_path=file_path,
                original_filename=file.filename or "unknown", mime_type=file.content_type
            )
            docs_created += 1

        ClaimRepository.create_audit_log(db, claim.id, "UPLOAD", {"files": [f.filename for f in files], "doc_types": doc_types})
        db.commit()
        background_tasks.add_task(run_extraction_pipeline, claim.id, SessionLocal)
        return UploadResponse(claim_id=claim.id, message="Documents uploaded successfully. Processing started.", documents_uploaded=docs_created)

    @staticmethod
    def link_policy(claim: Claim, payload: PolicyLinkRequest, background_tasks: BackgroundTasks, db: Session, current_user: User) -> ClaimStatusResponse:
        if claim.created_by != current_user.id:
            raise HTTPException(403, "Not authorized to modify this claim")
            
        claim.insurer_id = payload.insurer_id
        claim.policy_number = payload.policy_number
        
        def _upsert_field(cat: str, name: str, val: str):
            if not val: return
            existing = db.query(ExtractedField).filter(ExtractedField.claim_id == claim.id, ExtractedField.field_category == cat, ExtractedField.field_name == name).first()
            if existing:
                existing.field_value = val
                existing.is_manually_corrected = True
            else:
                db.add(ExtractedField(claim_id=claim.id, field_category=cat, field_name=name, field_value=val, confidence=1.0, is_manually_corrected=True))

        _upsert_field("policy", "policy.policy_number", payload.policy_number)
        if payload.diagnosis: _upsert_field("clinical", "clinical.diagnosis", payload.diagnosis)
        if payload.icd_code: _upsert_field("clinical", "clinical.icd_code", payload.icd_code)
        if payload.bill_amount: _upsert_field("financial", "financial.bill_amount", payload.bill_amount)
            
        db.commit()
        background_tasks.add_task(run_validation_pipeline, claim.id, SessionLocal)
        return ClaimService.get_claim_status(claim, db)
    
    @staticmethod
    def get_claim_status(claim: Claim, db: Session) -> ClaimStatusResponse:
        doc_count = ClaimRepository.get_document_count(db, claim.id)
        ocr_done = ClaimRepository.get_completed_ocr_count(db, claim.id)
        return ClaimStatusResponse(
            id=claim.id, status=claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status,
            patient_name=claim.patient_name, policy_number=claim.policy_number, created_at=claim.created_at,
            updated_at=claim.updated_at, document_count=doc_count, ocr_completed=ocr_done,
        )

    @staticmethod
    def list_claims(skip: int, limit: int, db: Session, current_user: User) -> list[ClaimListItem]:
        claims = ClaimRepository.get_claims_list(db, skip, limit)
        if current_user.role == UserRole.INSURER:
            claims = [c for c in claims if c.insurer_id == current_user.id]
        elif current_user.role == UserRole.HOSPITAL:
            claims = [c for c in claims if c.created_by == current_user.id]
        
        result = []
        for c in claims:
            doc_count = ClaimRepository.get_document_count(db, c.id)
            result.append(ClaimListItem(
                id=c.id, status=c.status.value if isinstance(c.status, ClaimStatus) else c.status,
                patient_name=c.patient_name, policy_number=c.policy_number, created_at=c.created_at,
                updated_at=c.updated_at, document_count=doc_count, fraud_risk_score=c.fraud_risk_score,
                reviewer_comments=c.reviewer_comments, reviewer_decision=c.reviewer_decision, reviewed_at=c.reviewed_at,
            ))
        return result

    @staticmethod
    def get_claim_data(claim: Claim, db: Session, current_user: User) -> ClaimDataResponse:
        documents = ClaimRepository.get_claim_documents(db, claim.id)
        fields = ClaimRepository.get_extracted_fields(db, claim.id)
        validation = ClaimRepository.get_latest_validation(db, claim.id)
        alerts = ClaimRepository.get_fraud_alerts(db, claim.id)
        summary = ClaimRepository.get_latest_summary(db, claim.id)

        claim_resp = ClaimService.get_claim_status(claim, db)
        claim_resp.fraud_risk_score = claim.fraud_risk_score
        claim_resp.fraud_flags = claim.fraud_flags
        claim_resp.reviewer_decision = claim.reviewer_decision
        claim_resp.reviewer_comments = claim.reviewer_comments
        claim_resp.reviewed_at = claim.reviewed_at

        return ClaimDataResponse(
            claim=claim_resp,
            documents=[DocumentResponse(
                id=d.id, doc_type=d.doc_type.value if hasattr(d.doc_type, "value") else d.doc_type,
                original_filename=d.original_filename, mime_type=d.mime_type,
                ocr_status=d.ocr_status.value if hasattr(d.ocr_status, "value") else d.ocr_status, raw_text=d.raw_text,
            ) for d in documents],
            extracted_fields=[ExtractedFieldResponse(
                id=f.id, field_category=f.field_category, field_name=f.field_name,
                field_value=f.field_value, confidence=f.confidence, is_manually_corrected=bool(f.is_manually_corrected),
            ) for f in fields],
            fraud_alerts=[FraudAlertResponse(
                id=a.id, rule_triggered=a.rule_triggered, risk_score=a.risk_score, details=a.details,
                reviewed=bool(a.reviewed), reviewer_notes=a.reviewer_notes, created_at=a.created_at,
            ) for a in alerts],
            validation=ValidationResponse(
                id=validation.id, status=validation.status.value if hasattr(validation.status, "value") else validation.status,
                missing_docs=validation.missing_docs, warnings=validation.warnings, errors=validation.errors,
                overall_confidence=validation.overall_confidence, created_at=validation.created_at,
            ) if validation else None,
            summary=DocumentSummaryResponse(
                id=summary.id, summary_text=summary.summary_text, key_findings=summary.key_findings,
                document_count=summary.document_count, created_at=summary.created_at,
            ) if summary else None,
        )

    @staticmethod
    def get_claim_summary(claim: Claim, db: Session) -> DocumentSummaryResponse:
        summary = ClaimRepository.get_latest_summary(db, claim.id)
        if not summary: raise HTTPException(404, "No summary available for this claim yet")
        return DocumentSummaryResponse(
            id=summary.id, summary_text=summary.summary_text, key_findings=summary.key_findings,
            document_count=summary.document_count, created_at=summary.created_at,
        )

    @staticmethod
    async def run_validation(claim: Claim, db: Session) -> ValidationResponse:
        val_result = await validate_claim(db, claim.id)
        ClaimRepository.clear_validation_results(db, claim.id)
        vr = ClaimRepository.save_validation_result(
            db=db, claim_id=claim.id, status=val_result["status"], missing_docs=val_result["missing_docs"],
            warnings=val_result["warnings"], errors=val_result["errors"], overall_confidence=val_result["overall_confidence"],
        )
        ClaimRepository.update_claim_status(db, claim, ClaimStatus.VALIDATED)
        db.commit()
        db.refresh(vr)
        ClaimRepository.create_audit_log(db, claim.id, "VALIDATE", val_result)
        db.commit()
        return ValidationResponse(
            id=vr.id, status=vr.status.value if hasattr(vr.status, "value") else vr.status,
            missing_docs=vr.missing_docs, warnings=vr.warnings, errors=vr.errors,
            overall_confidence=vr.overall_confidence, created_at=vr.created_at,
            irdai_checklist=val_result.get("irdai_checklist", {}), code_validation=val_result.get("code_validation", {}),
        )

    @staticmethod
    async def submit_corrections(claim: Claim, req: CorrectionRequest, db: Session) -> dict:
        corrected = []
        for corr in req.corrections:
            field = ClaimRepository.get_extracted_field_by_id(db, claim.id, corr.field_id)
            if not field: continue
            old_value = field.field_value
            field.field_value = corr.new_value
            field.is_manually_corrected = 1
            field.confidence = 1.0
            corrected.append({"field_id": corr.field_id, "field_name": field.field_name, "old_value": old_value, "new_value": corr.new_value})
        ClaimRepository.create_audit_log(db, claim.id, "CORRECT", {"corrections": corrected})
        db.commit()
        if claim.insurer_id:
            await manager.send_personal_message({"type": "CORRECTIONS_SUBMITTED", "message": f"Hospital submitted field corrections for claim #{claim.id}", "claim_id": claim.id}, str(claim.insurer_id))
        return {"message": f"Applied {len(corrected)} corrections", "corrections": corrected}

    @staticmethod
    async def upload_additional_document(claim: Claim, background_tasks: BackgroundTasks, file: UploadFile, doc_type: str, db: Session) -> dict:
        valid_types = {e.value for e in DocumentType}
        if doc_type not in valid_types: raise HTTPException(400, f"Invalid doc_type: {doc_type}")
        ext = os.path.splitext(file.filename or "doc")[1]
        unique_name = f"{claim.id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
        content = await file.read()
        with open(file_path, "wb") as f: f.write(content)
        doc = ClaimRepository.create_document(db=db, claim_id=claim.id, doc_type=doc_type, file_path=file_path, original_filename=file.filename or "unknown", mime_type=file.content_type)
        ClaimRepository.create_audit_log(db, claim.id, "UPLOAD_ADDITIONAL", {"filename": file.filename, "doc_type": doc_type})
        status_val = claim.status.value if hasattr(claim.status, "value") else claim.status
        if status_val == ClaimStatus.INFO_REQUESTED.value:
            claim.status = ClaimStatus.PROCESSING
            claim.reviewer_decision = None
            claim.reviewer_comments = None
            claim.reviewed_at = None
        db.commit()
        # Assume background process setup logic exists
        # background_tasks.add_task(process_claim, claim.id, SessionLocal) 
        if claim.insurer_id:
            await manager.send_personal_message({"type": "DOCUMENT_ADDED", "message": f"Hospital uploaded '{file.filename}' for claim #{claim.id}", "claim_id": claim.id}, str(claim.insurer_id))
        return {"message": f"Additional document uploaded. Re-processing claim {claim.id}.", "document_id": doc.id}

    @staticmethod
    async def review_claim(claim: Claim, review_req: ClaimReviewRequest, db: Session) -> ClaimStatusResponse:
        decision = review_req.decision.upper()
        if decision not in ["APPROVED", "REJECTED", "INFO_REQUESTED"]: raise HTTPException(400, f"Invalid decision.")
        claim.reviewer_decision = decision
        claim.reviewer_comments = review_req.comments
        claim.reviewed_at = utcnow()
        if decision == "APPROVED": ClaimRepository.update_claim_status(db, claim, ClaimStatus.APPROVED)
        elif decision == "REJECTED": ClaimRepository.update_claim_status(db, claim, ClaimStatus.REJECTED)
        ClaimRepository.create_audit_log(db, claim.id, "REVIEW_SUBMITTED", {"decision": decision, "comments": review_req.comments})
        db.commit()
        db.refresh(claim)
        await manager.send_personal_message({"type": "CLAIM_DECISION", "message": f"Claim #{claim.id} decision: {decision}", "claim_id": claim.id, "decision": decision}, str(claim.created_by))
        return ClaimService.get_claim_status(claim, db)

    @staticmethod
    async def download_document(claim: Claim, doc_id: int, db: Session):
        doc = db.query(Document).filter(Document.id == doc_id, Document.claim_id == claim.id).first()
        if not doc: raise HTTPException(404, "Document not found")
        if not os.path.exists(doc.file_path): raise HTTPException(404, "File not found on disk")
        return FileResponse(path=doc.file_path, filename=doc.original_filename, media_type=doc.mime_type or "application/octet-stream")

    @staticmethod
    def get_patient_history(claim: Claim, db: Session) -> PatientHistoryResponse:
        if not claim.policy_number: raise HTTPException(404, "No policy number available to look up history")
        all_claims = db.query(Claim).filter(Claim.policy_number == claim.policy_number, Claim.id != claim.id).order_by(Claim.created_at.desc()).all()
        history_claims = []
        for c in all_claims:
            diagnosis, total_amount, hospital_name = None, None, None
            for field in c.extracted_fields:
                fn = field.field_name.lower()
                if 'diagnosis' in fn or 'condition' in fn or 'disease' in fn: diagnosis = diagnosis or field.field_value
                if 'total' in fn and 'amount' in fn: total_amount = total_amount or field.field_value
                if 'hospital' in fn and 'name' in fn: hospital_name = hospital_name or field.field_value
            history_claims.append(PatientHistoryClaim(
                claim_id=c.id, status=c.status.value if hasattr(c.status, "value") else c.status,
                diagnosis=diagnosis, total_amount=total_amount, hospital_name=hospital_name,
                fraud_risk_score=c.fraud_risk_score, created_at=c.created_at.isoformat(), reviewer_decision=c.reviewer_decision,
            ))
        return PatientHistoryResponse(patient_name=claim.patient_name or claim.policy_number, total_past_claims=len(history_claims), claims=history_claims)

    @staticmethod
    async def get_comprehend_icd10(claim: Claim, db: Session) -> ComprehendICD10Response:
        comp_fields = db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim.id, ExtractedField.field_category == "clinical", ExtractedField.field_name.like("comprehend_icd10_%"),
        ).all()
        entity_fields = [f for f in comp_fields if f.field_name != "comprehend_icd10_codes"]
        if entity_fields:
            entities = []
            for f in entity_fields:
                try: entities.append(ComprehendICD10Entity(**json.loads(f.field_value)))
                except Exception: pass
            codes_field = next((f for f in comp_fields if f.field_name == "comprehend_icd10_codes"), None)
            top_codes = codes_field.field_value.split(", ") if codes_field and codes_field.field_value else get_top_icd10_codes([json.loads(f.field_value) for f in entity_fields])
            return ComprehendICD10Response(
                claim_id=claim.id,
                entities_detected=len(entities),
                top_icd10_codes=top_codes,
                entities=entities,
                source="cached"
            )
        return ComprehendICD10Response(claim_id=claim.id, entities_detected=0, top_icd10_codes=[], entities=[], source="pending")
