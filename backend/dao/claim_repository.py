from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from model.models import (
    Claim, Document, ExtractedField, ValidationResult, AuditLog, FraudAlert,
    DocumentSummary, ClaimStatus, DocumentType, OCRStatus, ValidationStatus
)


class ClaimRepository:
    """ORM Repository for coordinating Claim-related database interactions."""

    @staticmethod
    def create_claim(db: Session) -> Claim:
        """Create a new empty claim with PENDING status."""
        claim = Claim(status=ClaimStatus.PENDING)
        db.add(claim)
        db.commit()
        db.refresh(claim)
        return claim

    @staticmethod
    def create_document(
        db: Session, claim_id: int, doc_type: str, file_path: str, original_filename: str, mime_type: str
    ) -> Document:
        """Create a new document associated with a claim."""
        doc = Document(
            claim_id=claim_id,
            doc_type=DocumentType(doc_type),
            file_path=file_path,
            original_filename=original_filename,
            mime_type=mime_type,
            ocr_status=OCRStatus.PENDING,
        )
        db.add(doc)
        # Commit happens in the caller or via a batch commit
        return doc

    @staticmethod
    def create_audit_log(db: Session, claim_id: int, action: str, details: Dict[str, Any]) -> AuditLog:
        """Create an audit log entry for a specific claim."""
        audit = AuditLog(claim_id=claim_id, action=action, details=details)
        db.add(audit)
        return audit

    @staticmethod
    def get_claims_list(db: Session, skip: int = 0, limit: int = 50) -> List[Claim]:
        """Get a paginated list of all claims."""
        return db.query(Claim).order_by(Claim.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def get_claim_by_id(db: Session, claim_id: int) -> Optional[Claim]:
        """Fetch a specific claim by ID."""
        return db.query(Claim).filter(Claim.id == claim_id).first()

    @staticmethod
    def get_document_count(db: Session, claim_id: int) -> int:
        """Get the total number of documents uploaded for a claim."""
        return db.query(Document).filter(Document.claim_id == claim_id).count()

    @staticmethod
    def get_completed_ocr_count(db: Session, claim_id: int) -> int:
        """Get the count of documents that have finished OCR processing."""
        return db.query(Document).filter(
            Document.claim_id == claim_id,
            Document.ocr_status == OCRStatus.COMPLETED,
        ).count()

    @staticmethod
    def get_claim_documents(db: Session, claim_id: int) -> List[Document]:
        """Fetch all documents associated with a claim."""
        return db.query(Document).filter(Document.claim_id == claim_id).all()

    @staticmethod
    def get_extracted_fields(db: Session, claim_id: int) -> List[ExtractedField]:
        """Fetch all extracted fields associated with a claim."""
        return db.query(ExtractedField).filter(ExtractedField.claim_id == claim_id).all()

    @staticmethod
    def get_latest_validation(db: Session, claim_id: int) -> Optional[ValidationResult]:
        """Fetch the most recent validation result for a claim."""
        return db.query(ValidationResult).filter(
            ValidationResult.claim_id == claim_id
        ).order_by(ValidationResult.created_at.desc()).first()

    @staticmethod
    def get_fraud_alerts(db: Session, claim_id: int) -> List[FraudAlert]:
        """Fetch all fraud alerts associated with a claim."""
        return db.query(FraudAlert).filter(FraudAlert.claim_id == claim_id).all()

    @staticmethod
    def clear_validation_results(db: Session, claim_id: int) -> None:
        """Delete all previous validation results for a claim (used before re-running validation)."""
        db.query(ValidationResult).filter(
            ValidationResult.claim_id == claim_id).delete()

    @staticmethod
    def save_validation_result(
        db: Session, claim_id: int, status: str, missing_docs: List[str], warnings: List[str], errors: List[str], overall_confidence: float
    ) -> ValidationResult:
        """Save a new validation result to the database."""
        vr = ValidationResult(
            claim_id=claim_id,
            status=ValidationStatus(status),
            missing_docs=missing_docs,
            warnings=warnings,
            errors=errors,
            overall_confidence=overall_confidence,
        )
        db.add(vr)
        return vr

    @staticmethod
    def get_extracted_field_by_id(db: Session, claim_id: int, field_id: int) -> Optional[ExtractedField]:
        """Fetch a specific extracted field linked to a claim."""
        return db.query(ExtractedField).filter(
            ExtractedField.id == field_id,
            ExtractedField.claim_id == claim_id,
        ).first()

    @staticmethod
    def update_claim_status(db: Session, claim: Claim, new_status: ClaimStatus) -> None:
        """Update the status enum of a claim."""
        claim.status = new_status

    @staticmethod
    def get_latest_summary(db: Session, claim_id: int) -> Optional[DocumentSummary]:
        """Fetch the most recent document summary for a claim."""
        return db.query(DocumentSummary).filter(
            DocumentSummary.claim_id == claim_id
        ).order_by(DocumentSummary.created_at.desc()).first()

    @staticmethod
    def save_summary(
        db: Session, claim_id: int, summary_text: str,
        key_findings: list, document_count: int
    ) -> DocumentSummary:
        """Save a new AI-generated document summary."""
        ds = DocumentSummary(
            claim_id=claim_id,
            summary_text=summary_text,
            key_findings=key_findings,
            document_count=document_count,
        )
        db.add(ds)
        return ds
