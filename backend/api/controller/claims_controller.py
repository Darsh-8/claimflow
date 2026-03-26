import os
import uuid
import json
import logging
from typing import Optional

from fastapi import HTTPException, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session

from db.database import SessionLocal
from model.models import (
    Claim, Document, ExtractedField, ValidationResult, AuditLog, FraudAlert,
    DocumentSummary, ClaimStatus, DocumentType, OCRStatus, ValidationStatus,
    User, UserRole, utcnow
)
from dto.schemas import (
    ClaimStatusResponse, ClaimListItem, ClaimDataResponse,
    DocumentResponse, ExtractedFieldResponse, ValidationResponse,
    UploadResponse, CorrectionRequest, FieldCorrection, FraudAlertResponse,
    ClaimReviewRequest, DocumentSummaryResponse, ClaimAnalyticsResponse, MonthlyStat,
    FraudBucket, DocTypeStat, RecentClaimStat, RejectionReason,
    PatientHistoryClaim, PatientHistoryResponse,
    RoleAnalyticsResponse, ClinicalTrend, HospitalTrend,
    ComprehendICD10Entity, ComprehendICD10Response,
    PolicyLinkRequest,
)
from service.pipeline import run_extraction_pipeline
from service.validation_service import validate_claim
from service.comprehend_medical_service import run_comprehend_medical, get_top_icd10_codes
from config.config import settings
from dao.claim_repository import ClaimRepository

logger = logging.getLogger(__name__)


class ClaimsController:
    """Controller handles business logic for claims following MVC and Early Return patterns."""

    @staticmethod
    async def upload_documents(
        background_tasks: BackgroundTasks,
        files: list[UploadFile],
        doc_types: list[str],
        insurer_id: Optional[int],
        db: Session,
        current_user: User
    ) -> UploadResponse:

        # Early return
        if len(files) != len(doc_types):
            raise HTTPException(
                400, "Number of files and doc_types must match")

        valid_types = {e.value for e in DocumentType}
        for dt in doc_types:
            if dt not in valid_types:
                raise HTTPException(
                    400, f"Invalid doc_type: {dt}. Must be one of: {valid_types}")

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
                db=db,
                claim_id=claim.id,
                doc_type=doc_type,
                file_path=file_path,
                original_filename=file.filename or "unknown",
                mime_type=file.content_type
            )
            docs_created += 1

        ClaimRepository.create_audit_log(
            db, claim.id, "UPLOAD", {
                "files": [f.filename for f in files], "doc_types": doc_types}
        )
        db.commit()

        background_tasks.add_task(run_extraction_pipeline, claim.id, SessionLocal)

        return UploadResponse(
            claim_id=claim.id,
            message="Documents uploaded successfully. Processing started.",
            documents_uploaded=docs_created,
        )

    @staticmethod
    def link_policy(
        claim_id: int,
        payload: PolicyLinkRequest,
        background_tasks: BackgroundTasks,
        db: Session,
        current_user: User
    ) -> ClaimStatusResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")
        if claim.created_by != current_user.id:
            raise HTTPException(403, "Not authorized to modify this claim")
            
        claim.insurer_id = payload.insurer_id
        claim.policy_number = payload.policy_number
        
        from model.models import ExtractedField

        def _upsert_field(cat: str, name: str, val: str):
            if not val:
                return
            existing = db.query(ExtractedField).filter(
                ExtractedField.claim_id == claim_id,
                ExtractedField.field_category == cat,
                ExtractedField.field_name == name
            ).first()
            if existing:
                existing.field_value = val
                existing.is_manually_corrected = True
            else:
                db.add(ExtractedField(
                    claim_id=claim_id,
                    field_category=cat,
                    field_name=name,
                    field_value=val,
                    confidence=1.0,
                    is_manually_corrected=True
                ))

        _upsert_field("policy", "policy.policy_number", payload.policy_number)
        
        if payload.diagnosis:
            _upsert_field("clinical", "clinical.diagnosis", payload.diagnosis)
        if payload.icd_code:
            _upsert_field("clinical", "clinical.icd_code", payload.icd_code)
        if payload.bill_amount:
            _upsert_field("financial", "financial.bill_amount", payload.bill_amount)
            
        db.commit()
            
        from service.pipeline import run_validation_pipeline
        background_tasks.add_task(run_validation_pipeline, claim.id, SessionLocal)
        
        return ClaimsController.get_claim_status(claim_id, db, current_user)

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
                id=c.id,
                status=c.status.value if isinstance(
                    c.status, ClaimStatus) else c.status,
                patient_name=c.patient_name,
                policy_number=c.policy_number,
                created_at=c.created_at,
                updated_at=c.updated_at,
                document_count=doc_count,
                fraud_risk_score=c.fraud_risk_score,
                reviewer_comments=c.reviewer_comments,
                reviewer_decision=c.reviewer_decision,
                reviewed_at=c.reviewed_at,
            ))
        return result

    @staticmethod
    def get_claim_status(claim_id: int, db: Session, current_user: User) -> ClaimStatusResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)

        # Early return
        if not claim:
            raise HTTPException(404, "Claim not found")

        doc_count = ClaimRepository.get_document_count(db, claim_id)
        ocr_done = ClaimRepository.get_completed_ocr_count(db, claim_id)

        return ClaimStatusResponse(
            id=claim.id,
            status=claim.status.value if isinstance(
                claim.status, ClaimStatus) else claim.status,
            patient_name=claim.patient_name,
            policy_number=claim.policy_number,
            created_at=claim.created_at,
            updated_at=claim.updated_at,
            document_count=doc_count,
            ocr_completed=ocr_done,
        )

    @staticmethod
    def get_claim_data(claim_id: int, db: Session, current_user: User) -> ClaimDataResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)

        # Early return
        if not claim:
            raise HTTPException(404, "Claim not found")

        documents = ClaimRepository.get_claim_documents(db, claim_id)
        fields = ClaimRepository.get_extracted_fields(db, claim_id)
        validation = ClaimRepository.get_latest_validation(db, claim_id)
        alerts = ClaimRepository.get_fraud_alerts(db, claim_id)

        doc_count = len(documents)
        ocr_done = sum(1 for d in documents if d.ocr_status ==
                       OCRStatus.COMPLETED)

        claim_resp = ClaimStatusResponse(
            id=claim.id,
            status=claim.status.value if isinstance(
                claim.status, ClaimStatus) else claim.status,
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
                doc_type=d.doc_type.value if isinstance(
                    d.doc_type, DocumentType) else d.doc_type,
                original_filename=d.original_filename,
                mime_type=d.mime_type,
                ocr_status=d.ocr_status.value if isinstance(
                    d.ocr_status, OCRStatus) else d.ocr_status,
                raw_text=d.raw_text,
            ) for d in documents
        ]

        field_responses = [
            ExtractedFieldResponse(
                id=f.id,
                field_category=f.field_category,
                field_name=f.field_name,
                field_value=f.field_value,
                confidence=f.confidence,
                is_manually_corrected=bool(f.is_manually_corrected),
            ) for f in fields
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
            ) for a in alerts
        ]

        val_resp = None
        if validation:
            val_resp = ValidationResponse(
                id=validation.id,
                status=validation.status.value if isinstance(
                    validation.status, ValidationStatus) else validation.status,
                missing_docs=validation.missing_docs,
                warnings=validation.warnings,
                errors=validation.errors,
                overall_confidence=validation.overall_confidence,
                created_at=validation.created_at,
            )

        summary = ClaimRepository.get_latest_summary(db, claim_id)
        summary_resp = None
        if summary:
            summary_resp = DocumentSummaryResponse(
                id=summary.id,
                summary_text=summary.summary_text,
                key_findings=summary.key_findings,
                document_count=summary.document_count,
                created_at=summary.created_at,
            )

        return ClaimDataResponse(
            claim=claim_resp,
            documents=doc_responses,
            extracted_fields=field_responses,
            fraud_alerts=alert_responses,
            validation=val_resp,
            summary=summary_resp,
        )

    @staticmethod
    def get_claim_summary(claim_id: int, db: Session, current_user: User) -> DocumentSummaryResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        summary = ClaimRepository.get_latest_summary(db, claim_id)
        if not summary:
            raise HTTPException(404, "No summary available for this claim yet")

        return DocumentSummaryResponse(
            id=summary.id,
            summary_text=summary.summary_text,
            key_findings=summary.key_findings,
            document_count=summary.document_count,
            created_at=summary.created_at,
        )

    @staticmethod
    async def run_validation(claim_id: int, db: Session, current_user: User) -> ValidationResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        val_result = await validate_claim(db, claim_id)
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

        ClaimRepository.update_claim_status(db, claim, ClaimStatus.VALIDATED)
        db.commit()
        db.refresh(vr)

        ClaimRepository.create_audit_log(db, claim_id, "VALIDATE", val_result)
        db.commit()

        return ValidationResponse(
            id=vr.id,
            status=vr.status.value if isinstance(
                vr.status, ValidationStatus) else vr.status,
            missing_docs=vr.missing_docs,
            warnings=vr.warnings,
            errors=vr.errors,
            overall_confidence=vr.overall_confidence,
            created_at=vr.created_at,
            irdai_checklist=val_result.get("irdai_checklist", {}),
            code_validation=val_result.get("code_validation", {}),
        )

    @staticmethod
    def submit_corrections(claim_id: int, req: CorrectionRequest, db: Session, current_user: User) -> dict:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        corrected = []
        for corr in req.corrections:
            field = ClaimRepository.get_extracted_field_by_id(
                db, claim_id, corr.field_id)
            if not field:
                continue
            old_value = field.field_value
            field.field_value = corr.new_value
            field.is_manually_corrected = 1
            field.confidence = 1.0
            corrected.append({
                "field_id": corr.field_id,
                "field_name": field.field_name,
                "old_value": old_value,
                "new_value": corr.new_value,
            })

        ClaimRepository.create_audit_log(db, claim_id, "CORRECT", {
                                         "corrections": corrected})
        db.commit()

        return {"message": f"Applied {len(corrected)} corrections", "corrections": corrected}

    @staticmethod
    async def upload_additional_document(claim_id: int, background_tasks: BackgroundTasks, file: UploadFile, doc_type: str, db: Session, current_user: User) -> dict:
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
            db, claim_id, "UPLOAD_ADDITIONAL", {
                "filename": file.filename, "doc_type": doc_type}
        )

        # Reset statuses if claim was waiting for Info
        status_val = claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status
        if status_val == ClaimStatus.INFO_REQUESTED.value:
            claim.status = ClaimStatus.PROCESSING
            claim.reviewer_decision = None
            claim.reviewer_comments = None
            claim.reviewed_at = None

        db.commit()

        background_tasks.add_task(process_claim, claim_id, SessionLocal)

        return {"message": f"Additional document uploaded. Re-processing claim {claim_id}.", "document_id": doc.id}

    @staticmethod
    async def download_document(claim_id: int, doc_id: int, db: Session, current_user: User):
        from fastapi.responses import FileResponse
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        doc = db.query(Document).filter(Document.id == doc_id, Document.claim_id == claim_id).first()
        if not doc:
            raise HTTPException(404, "Document not found")

        if not os.path.exists(doc.file_path):
            raise HTTPException(404, "File not found on disk")
        
        return FileResponse(
            path=doc.file_path, 
            filename=doc.original_filename, 
            media_type=doc.mime_type or "application/octet-stream"
        )

    @staticmethod
    async def review_claim(claim_id: int, review_req: ClaimReviewRequest, db: Session, current_user: User) -> ClaimStatusResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        decision = review_req.decision.upper()
        valid_decisions = ["APPROVED", "REJECTED", "INFO_REQUESTED"]
        if decision not in valid_decisions:
            raise HTTPException(
                400, f"Invalid decision. Must be one of {valid_decisions}")

        claim.reviewer_decision = decision
        claim.reviewer_comments = review_req.comments
        claim.reviewed_at = utcnow()

        if decision == "APPROVED":
            ClaimRepository.update_claim_status(
                db, claim, ClaimStatus.APPROVED)
        elif decision == "REJECTED":
            ClaimRepository.update_claim_status(
                db, claim, ClaimStatus.REJECTED)

        ClaimRepository.create_audit_log(db, claim.id, "REVIEW_SUBMITTED", {
                                         "decision": decision, "comments": review_req.comments})
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
            ocr_completed=sum(
                1 for d in claim.documents if d.ocr_status == OCRStatus.COMPLETED),
            fraud_risk_score=claim.fraud_risk_score,
            fraud_flags=claim.fraud_flags,
            reviewer_decision=claim.reviewer_decision,
            reviewer_comments=claim.reviewer_comments,
            reviewed_at=claim.reviewed_at
        )

    @staticmethod
    def get_patient_history(claim_id: int, db: Session, current_user: User) -> PatientHistoryResponse:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        # Only use policy number — patient name is not a unique identifier
        if not claim.policy_number:
            raise HTTPException(404, "No policy number available to look up history")

        all_claims = db.query(Claim).filter(
            Claim.policy_number == claim.policy_number,
            Claim.id != claim_id
        ).order_by(Claim.created_at.desc()).all()

        history_claims = []
        for c in all_claims:
            # Extract diagnosis, total_amount, hospital from extracted fields
            diagnosis = None
            total_amount = None
            hospital_name = None
            for field in c.extracted_fields:
                fn = field.field_name.lower()
                if 'diagnosis' in fn or 'condition' in fn or 'disease' in fn:
                    if not diagnosis:
                        diagnosis = field.field_value
                if 'total' in fn and 'amount' in fn:
                    if not total_amount:
                        total_amount = field.field_value
                if 'hospital' in fn and 'name' in fn:
                    if not hospital_name:
                        hospital_name = field.field_value

            status_val = c.status.value if isinstance(c.status, ClaimStatus) else c.status
            history_claims.append(PatientHistoryClaim(
                claim_id=c.id,
                status=status_val,
                diagnosis=diagnosis,
                total_amount=total_amount,
                hospital_name=hospital_name,
                fraud_risk_score=c.fraud_risk_score,
                created_at=c.created_at.isoformat(),
                reviewer_decision=c.reviewer_decision,
            ))

        return PatientHistoryResponse(
            patient_name=claim.patient_name or claim.policy_number,
            total_past_claims=len(history_claims),
            claims=history_claims,
        )


    @staticmethod
    def get_analytics(db: Session, current_user: User) -> ClaimAnalyticsResponse:
        claims = ClaimRepository.get_all_claims(db)
        # Filter by ownership
        if current_user.role == UserRole.HOSPITAL:
            claims = [c for c in claims if c.created_by == current_user.id]
        elif current_user.role == UserRole.INSURER:
            claims = [c for c in claims if c.insurer_id == current_user.id]
        total_claims = len(claims)
        processing = 0
        approved = 0
        rejected = 0
        info_requested = 0
        processing_times = []
        fraud_scores = []
        rejection_comments: list[str] = []
        
        monthly_data = {}

        for claim in claims:
            # Monthly grouping based on created_at
            month_key = claim.created_at.strftime("%b %Y")
            if month_key not in monthly_data:
                monthly_data[month_key] = {"total": 0, "approved": 0, "rejected": 0, "sort_val": claim.created_at.strftime("%Y%m")}
            
            monthly_data[month_key]["total"] += 1

            status = claim.status.value if isinstance(claim.status, ClaimStatus) else claim.status
            if status in ["PENDING", "PROCESSING", "EXTRACTED", "VALIDATED"]:
                processing += 1
            elif status == "APPROVED":
                approved += 1
                monthly_data[month_key]["approved"] += 1
                if claim.reviewed_at:
                    time_diff = claim.reviewed_at - claim.created_at
                    processing_times.append(time_diff.total_seconds() / 3600.0)
            elif status == "REJECTED":
                rejected += 1
                monthly_data[month_key]["rejected"] += 1
                if claim.reviewer_comments:
                    rejection_comments.append(claim.reviewer_comments.strip())
            elif status == "INFO_REQUESTED":
                info_requested += 1

            # Fraud risk
            if claim.fraud_risk_score is not None:
                fraud_scores.append(claim.fraud_risk_score)

        success_rate = (approved / total_claims * 100) if total_claims > 0 else 0
        avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0
        avg_fraud = sum(fraud_scores) / len(fraud_scores) if fraud_scores else 0

        # Sort monthly stats chronologically
        sorted_months = sorted(monthly_data.items(), key=lambda x: x[1]["sort_val"])
        monthly_stats = [
            MonthlyStat(month=month, total=data["total"], approved=data["approved"], rejected=data["rejected"])
            for month, data in sorted_months
        ][-6:]

        # Fraud risk distribution buckets
        buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        for score in fraud_scores:
            if score <= 20:
                buckets["0-20"] += 1
            elif score <= 40:
                buckets["21-40"] += 1
            elif score <= 60:
                buckets["41-60"] += 1
            elif score <= 80:
                buckets["61-80"] += 1
            else:
                buckets["81-100"] += 1
        fraud_risk_distribution = [FraudBucket(label=k, count=v) for k, v in buckets.items()]

        # Document type breakdown
        doc_type_counts: dict[str, int] = {}
        for claim in claims:
            for doc in claim.documents:
                dt = doc.doc_type or "unknown"
                doc_type_counts[dt] = doc_type_counts.get(dt, 0) + 1
        doc_type_breakdown = [
            DocTypeStat(doc_type=dt, count=ct)
            for dt, ct in sorted(doc_type_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        # Recent claims (last 5)
        sorted_claims = sorted(claims, key=lambda c: c.created_at, reverse=True)[:5]
        recent_claims = [
            RecentClaimStat(
                id=c.id,
                patient_name=c.patient_name,
                status=c.status.value if isinstance(c.status, ClaimStatus) else c.status,
                fraud_risk_score=c.fraud_risk_score,
                created_at=c.created_at.isoformat()
            )
            for c in sorted_claims
        ]

        # Top rejection reasons (group similar comments)
        reason_counts: dict[str, int] = {}
        for comment in rejection_comments:
            short = comment[:80]
            reason_counts[short] = reason_counts.get(short, 0) + 1
        top_rejection_reasons = [
            RejectionReason(reason=r, count=c)
            for r, c in sorted(reason_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        return ClaimAnalyticsResponse(
            total_claims=total_claims,
            processing=processing,
            approved=approved,
            rejected=rejected,
            info_requested=info_requested,
            success_rate=round(success_rate, 1),
            avg_processing_time_hours=round(avg_processing_time, 1),
            avg_fraud_risk_score=round(avg_fraud, 1),
            monthly_stats=monthly_stats,
            fraud_risk_distribution=fraud_risk_distribution,
            doc_type_breakdown=doc_type_breakdown,
            recent_claims=recent_claims,
            top_rejection_reasons=top_rejection_reasons
        )

    @staticmethod
    def get_role_analytics(db: Session, current_user: User) -> RoleAnalyticsResponse:
        claims = ClaimRepository.get_all_claims(db)
        
        # Filter by ownership
        if current_user.role == UserRole.HOSPITAL:
            claims = [c for c in claims if c.created_by == current_user.id]
        elif current_user.role == UserRole.INSURER:
            claims = [c for c in claims if c.insurer_id == current_user.id]

        total_revenue_claimed = 0.0
        total_revenue_approved = 0.0
        total_fraud_savings = 0.0
        
        diagnoses_counts: dict[str, int] = {}
        hospitals_counts: dict[str, int] = {}

        for claim in claims:
            diagnosis = None
            amount = 0.0
            hospital = claim.patient_name  # Fallback if no extracted field exists
            
            for ef in claim.extracted_fields:
                if not ef.field_value:
                    continue

                name = ef.field_name.lower()
                if "diagnosis" in name:
                    diagnosis = ef.field_value
                elif "amount" in name and ("total" in name or "bill" in name):
                    try:
                        clean_amt = ef.field_value.replace(",", "").replace("$", "").replace("₹", "").strip()
                        amount = float(clean_amt)
                    except (ValueError, TypeError):
                        pass
                elif "hospital" in name and "name" in name:
                    hospital = ef.field_value

            total_revenue_claimed += amount

            status_val = claim.status.value if hasattr(claim.status, "value") else str(claim.status)
            if status_val == "APPROVED":
                total_revenue_approved += amount

            if current_user.role == UserRole.INSURER:
                if status_val == "REJECTED" and claim.fraud_risk_score and claim.fraud_risk_score > 50:
                    total_fraud_savings += amount
                if hospital:
                    hospitals_counts[hospital] = hospitals_counts.get(hospital, 0) + 1

            if diagnosis:
                norm_diag = diagnosis.strip().title()
                if norm_diag:
                    diagnoses_counts[norm_diag] = diagnoses_counts.get(norm_diag, 0) + 1

        top_diagnoses = [
            ClinicalTrend(label=k, count=v)
            for k, v in sorted(diagnoses_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        top_hospitals = None
        if current_user.role == UserRole.INSURER:
            top_hospitals = [
                HospitalTrend(hospital_name=k, count=v)
                for k, v in sorted(hospitals_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            ]

        role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

        return RoleAnalyticsResponse(
            role=role_str,
            total_revenue_claimed=total_revenue_claimed,
            total_revenue_approved=total_revenue_approved,
            total_fraud_savings=total_fraud_savings if current_user.role == UserRole.INSURER else None,
            top_diagnoses=top_diagnoses,
            top_hospitals=top_hospitals
        )

    # -----------------------------------------------------------------------
    # Comprehend Medical ICD-10 endpoint
    # -----------------------------------------------------------------------

    @staticmethod
    async def get_comprehend_icd10(claim_id: int, db: Session, current_user: User) -> ComprehendICD10Response:
        claim = ClaimRepository.get_claim_by_id(db, claim_id)
        if not claim:
            raise HTTPException(404, "Claim not found")

        # --- Try to serve from cached ExtractedField rows first ---
        comp_fields = db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim_id,
            ExtractedField.field_category == "clinical",
            ExtractedField.field_name.like("comprehend_icd10_%"),
        ).all()

        entity_fields = [
            f for f in comp_fields if f.field_name != "comprehend_icd10_codes"
        ]

        if entity_fields:
            entities: list[ComprehendICD10Entity] = []
            for ef in entity_fields:
                if not ef.field_value:
                    continue
                try:
                    raw = json.loads(ef.field_value)
                    entities.append(ComprehendICD10Entity(
                        icd10_code=raw.get("icd10_code", ""),
                        description=raw.get("description"),
                        score=raw.get("score", 0.0),
                        icd10_score=raw.get("icd10_score", 0.0),
                        text=raw.get("text", ""),
                        traits=raw.get("traits", []),
                        alternatives=raw.get("alternatives", []),
                    ))
                except Exception:
                    continue

            top_codes = get_top_icd10_codes(
                [e.model_dump() for e in entities]
            )
            return ComprehendICD10Response(
                claim_id=claim_id,
                entities_detected=len(entities),
                top_icd10_codes=top_codes,
                entities=entities,
                source="cached",
            )

        # --- No cached data — run Comprehend Medical fresh ---
        # Build the same focused clinical text the pipeline uses:
        # diagnosis / condition / procedure extracted by the LLM, NOT raw OCR.
        CLINICAL_KEYS = ("diagnosis", "secondary_diagnosis", "condition", "symptoms",
                         "procedure", "treatment", "operation")
        clinical_fields = db.query(ExtractedField).filter(
            ExtractedField.claim_id == claim_id,
            ExtractedField.field_category == "clinical",
        ).all()

        clinical_parts: list[str] = []
        # Priority fields first
        field_map = {f.field_name.split(".")[-1]: f.field_value for f in clinical_fields
                     if f.field_value and f.field_value.strip().lower() not in ("none", "null", "n/a", "")}
        for key in CLINICAL_KEYS:
            val = field_map.get(key) or field_map.get(f"clinical.{key}")
            if val:
                clinical_parts.append(val.strip())
        # Remaining clinical fields as fallback
        if not clinical_parts:
            clinical_parts = [v for v in field_map.values() if v and v.strip()]

        comprehend_input = ". ".join(clinical_parts)
        if not comprehend_input.strip():
            raise HTTPException(422, "No clinical fields extracted yet. Please wait for claim processing to complete.")

        raw_entities = await run_comprehend_medical(comprehend_input)

        if not raw_entities:
            return ComprehendICD10Response(
                claim_id=claim_id,
                entities_detected=0,
                top_icd10_codes=[],
                entities=[],
                source="aws_comprehend_medical",
            )

        # Persist for future calls
        for idx, entity in enumerate(raw_entities[:10]):
            ef = ExtractedField(
                claim_id=claim_id,
                field_category="clinical",
                field_name=f"comprehend_icd10_{idx + 1}",
                field_value=json.dumps(entity),
                confidence=entity.get("score"),
            )
            db.add(ef)

        top_codes = get_top_icd10_codes(raw_entities)
        if top_codes:
            db.add(ExtractedField(
                claim_id=claim_id,
                field_category="clinical",
                field_name="comprehend_icd10_codes",
                field_value=", ".join(top_codes),
                confidence=None,
            ))
        db.commit()

        entities = [
            ComprehendICD10Entity(
                icd10_code=e.get("icd10_code", ""),
                description=e.get("description"),
                score=e.get("score", 0.0),
                icd10_score=e.get("icd10_score", 0.0),
                text=e.get("text", ""),
                traits=e.get("traits", []),
                alternatives=e.get("alternatives", []),
            )
            for e in raw_entities
        ]

        return ComprehendICD10Response(
            claim_id=claim_id,
            entities_detected=len(entities),
            top_icd10_codes=top_codes,
            entities=entities,
            source="aws_comprehend_medical",
        )
