import asyncio
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import (
    Claim, Document, ExtractedField, ValidationResult, AuditLog, FraudAlert,
    ClaimStatus, DocumentType, OCRStatus, ValidationStatus,
    User, UserRole
)
from views.schemas import (
    ClaimStatusResponse, ClaimListItem, ClaimDataResponse,
    DocumentResponse, ExtractedFieldResponse, ValidationResponse,
    UploadResponse, CorrectionRequest, FieldCorrection, FraudAlertResponse,
    ClaimReviewRequest
)
from services.pipeline import process_claim
from services.validation_service import validate_claim
from config import settings
from security import get_current_active_user, require_role
from repositories.claim_repository import ClaimRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    doc_types: list[str] = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    """Upload one or more documents to create a new claim."""
    if len(files) != len(doc_types):
        raise HTTPException(400, "Number of files and doc_types must match")

    # Validate doc types
    valid_types = {e.value for e in DocumentType}
    for dt in doc_types:
        if dt not in valid_types:
            raise HTTPException(400, f"Invalid doc_type: {dt}. Must be one of: {valid_types}")

    # Create claim
    claim = ClaimRepository.create_claim(db)

    # Save each document
    docs_created = 0
    for file, doc_type in zip(files, doc_types):
        # Generate unique filename
        ext = os.path.splitext(file.filename or "doc")[1]
        unique_name = f"{claim.id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

        # Write file to disk
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        doc = ClaimRepository.create_document(
            db=db,
            claim_id=claim.id,
            doc_type=doc_type,
            file_path=file_path,
            original_filename=file.filename or "unknown",
            mime_type=file.content_type
        )
        docs_created += 1

    # Audit log
    ClaimRepository.create_audit_log(
        db, claim.id, "UPLOAD", {"files": [f.filename for f in files], "doc_types": doc_types}
    )
    db.commit()

    # Trigger async processing pipeline
    background_tasks.add_task(process_claim, claim.id, SessionLocal)

    return UploadResponse(
        claim_id=claim.id,
        message="Documents uploaded successfully. Processing started.",
        documents_uploaded=docs_created,
    )


@router.get("", response_model=list[ClaimListItem])
def list_claims(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all claims with pagination."""
    claims = ClaimRepository.get_claims_list(db, skip, limit)
    result = []
    for c in claims:
        doc_count = ClaimRepository.get_document_count(db, c.id)
        result.append(ClaimListItem(
            id=c.id,
            status=c.status.value if isinstance(c.status, ClaimStatus) else c.status,
            patient_name=c.patient_name,
            policy_number=c.policy_number,
            created_at=c.created_at,
            updated_at=c.updated_at,
            document_count=doc_count,
        ))
    return result


@router.get("/{claim_id}/status", response_model=ClaimStatusResponse)
def get_claim_status(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Get the processing status of a claim."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    doc_count = ClaimRepository.get_document_count(db, claim_id)
    ocr_done = ClaimRepository.get_completed_ocr_count(db, claim_id)

    return ClaimStatusResponse(
        id=claim.id,
        status=claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status,
        patient_name=claim.patient_name,
        policy_number=claim.policy_number,
        created_at=claim.created_at,
        updated_at=claim.updated_at,
        document_count=doc_count,
        ocr_completed=ocr_done,
    )


@router.get("/{claim_id}/data", response_model=ClaimDataResponse)
def get_claim_data(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Get all structured data for a claim (documents, fields, validation, alerts)."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    documents = ClaimRepository.get_claim_documents(db, claim_id)
    fields = ClaimRepository.get_extracted_fields(db, claim_id)
    validation = ClaimRepository.get_latest_validation(db, claim_id)
    alerts = ClaimRepository.get_fraud_alerts(db, claim_id)

    doc_count = len(documents)
    ocr_done = sum(1 for d in documents if d.ocr_status == OCRStatus.COMPLETED)

    claim_resp = ClaimStatusResponse(
        id=claim.id,
        status=claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status,
        patient_name=claim.patient_name,
        policy_number=claim.policy_number,
        created_at=claim.created_at,
        updated_at=claim.updated_at,
        document_count=doc_count,
        ocr_completed=ocr_done,
        fraud_risk_score=claim.fraud_risk_score,
        fraud_flags=claim.fraud_flags,
        reviewer_decision=claim.reviewer_decision,
        reviewer_comments=claim.reviewer_comments,
        reviewed_at=claim.reviewed_at,
    )

    doc_responses = [
        DocumentResponse(
            id=d.id,
            doc_type=d.doc_type.value if isinstance(d.doc_type, DocumentType) else d.doc_type,
            original_filename=d.original_filename,
            mime_type=d.mime_type,
            ocr_status=d.ocr_status.value if isinstance(d.ocr_status, OCRStatus) else d.ocr_status,
            raw_text=d.raw_text,
        )
        for d in documents
    ]

    field_responses = [
        ExtractedFieldResponse(
            id=f.id,
            field_category=f.field_category,
            field_name=f.field_name,
            field_value=f.field_value,
            confidence=f.confidence,
            is_manually_corrected=bool(f.is_manually_corrected),
        )
        for f in fields
    ]

    alert_responses = [
        FraudAlertResponse(
            id=a.id,
            rule_triggered=a.rule_triggered,
            risk_score=a.risk_score,
            details=a.details,
            reviewed=bool(a.reviewed),
            reviewer_notes=a.reviewer_notes,
            created_at=a.created_at,
        )
        for a in alerts
    ]

    val_resp = None
    if validation:
        val_resp = ValidationResponse(
            id=validation.id,
            status=validation.status.value if isinstance(validation.status, ValidationStatus) else validation.status,
            missing_docs=validation.missing_docs,
            warnings=validation.warnings,
            errors=validation.errors,
            overall_confidence=validation.overall_confidence,
            created_at=validation.created_at,
        )

    return ClaimDataResponse(
        claim=claim_resp,
        documents=doc_responses,
        extracted_fields=field_responses,
        fraud_alerts=alert_responses,
        validation=val_resp,
    )


@router.post("/{claim_id}/validate", response_model=ValidationResponse)
async def run_validation(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role([UserRole.HOSPITAL, UserRole.INSURER]))):
    """Manually trigger the validation pipeline for a claim."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    # validate_claim is now async (NLM API lookup)
    val_result = await validate_claim(db, claim_id)

    # Clear previous
    ClaimRepository.clear_validation_results(db, claim_id)

    vr = ClaimRepository.save_validation_result(
        db=db,
        claim_id=claim_id,
        status=val_result["status"],
        missing_docs=val_result["missing_docs"],
        warnings=val_result["warnings"],
        errors=val_result["errors"],
        overall_confidence=val_result["overall_confidence"],
    )

    # Update claim status
    ClaimRepository.update_claim_status(db, claim, ClaimStatus.VALIDATED)
    db.commit()
    db.refresh(vr)

    # Audit log (store full result including IRDAI checklist)
    ClaimRepository.create_audit_log(db, claim_id, "VALIDATE", val_result)
    db.commit()

    return ValidationResponse(
        id=vr.id,
        status=vr.status.value if isinstance(vr.status, ValidationStatus) else vr.status,
        missing_docs=vr.missing_docs,
        warnings=vr.warnings,
        errors=vr.errors,
        overall_confidence=vr.overall_confidence,
        created_at=vr.created_at,
        irdai_checklist=val_result.get("irdai_checklist", {}),
        code_validation=val_result.get("code_validation", {}),
    )


@router.put("/{claim_id}/correct")
def submit_corrections(
    claim_id: int,
    req: CorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    """Submit manual corrections for extracted fields."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    corrected = []
    for corr in req.corrections:
        field = ClaimRepository.get_extracted_field_by_id(db, claim_id, corr.field_id)
        if not field:
            continue
        old_value = field.field_value
        field.field_value = corr.new_value
        field.is_manually_corrected = 1
        field.confidence = 1.0  # Manual correction = full confidence
        corrected.append({
            "field_id": corr.field_id,
            "field_name": field.field_name,
            "old_value": old_value,
            "new_value": corr.new_value,
        })

    # Audit log
    ClaimRepository.create_audit_log(db, claim_id, "CORRECT", {"corrections": corrected})
    db.commit()

    return {"message": f"Applied {len(corrected)} corrections", "corrections": corrected}


@router.post("/{claim_id}/upload-additional", response_model=dict)
async def upload_additional_document(
    claim_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    """Upload an additional/missing document to an existing claim."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    valid_types = {e.value for e in DocumentType}
    if doc_type not in valid_types:
        raise HTTPException(400, f"Invalid doc_type: {doc_type}")

    ext = os.path.splitext(file.filename or "doc")[1]
    unique_name = f"{claim_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = ClaimRepository.create_document(
        db=db,
        claim_id=claim_id,
        doc_type=doc_type,
        file_path=file_path,
        original_filename=file.filename or "unknown",
        mime_type=file.content_type
    )

    ClaimRepository.create_audit_log(
        db, claim_id, "UPLOAD_ADDITIONAL", {"filename": file.filename, "doc_type": doc_type}
    )
    db.commit()

    # Re-run pipeline
    background_tasks.add_task(process_claim, claim_id, SessionLocal)

    return {"message": f"Additional document uploaded. Re-processing claim {claim_id}.", "document_id": doc.id}


@router.post("/{claim_id}/review", response_model=ClaimStatusResponse)
async def review_claim(
    claim_id: int,
    review_req: ClaimReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.INSURER])),
):
    """Submit an insurer review decision for a claim."""
    claim = ClaimRepository.get_claim_by_id(db, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")

    decision = review_req.decision.upper()
    valid_decisions = ["APPROVED", "REJECTED", "INFO_REQUESTED"]
    if decision not in valid_decisions:
        raise HTTPException(400, f"Invalid decision. Must be one of {valid_decisions}")

    claim.reviewer_decision = decision
    claim.reviewer_comments = review_req.comments
    
    from models import utcnow
    claim.reviewed_at = utcnow()

    # Update overall status if applicable
    if decision == "APPROVED":
        ClaimRepository.update_claim_status(db, claim, ClaimStatus.APPROVED)
    elif decision == "REJECTED":
        ClaimRepository.update_claim_status(db, claim, ClaimStatus.REJECTED)

    ClaimRepository.create_audit_log(db, claim.id, "REVIEW_SUBMITTED", {"decision": decision, "comments": review_req.comments})
    db.commit()
    db.refresh(claim)

    return ClaimStatusResponse(
        id=claim.id,
        status=claim.status,
        patient_name=claim.patient_name,
        policy_number=claim.policy_number,
        created_at=claim.created_at,
        updated_at=claim.updated_at,
        document_count=len(claim.documents),
        ocr_completed=sum(1 for d in claim.documents if d.ocr_status == OCRStatus.COMPLETED),
        fraud_risk_score=claim.fraud_risk_score,
        fraud_flags=claim.fraud_flags,
        reviewer_decision=claim.reviewer_decision,
        reviewer_comments=claim.reviewer_comments,
        reviewed_at=claim.reviewed_at
    )
