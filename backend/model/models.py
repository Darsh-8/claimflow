import enum
import json
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime,
    ForeignKey, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from db.database import Base


class ClaimStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    EXTRACTED = "EXTRACTED"
    VALIDATED = "VALIDATED"
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    INFO_REQUESTED = "INFO_REQUESTED"


class UserRole(str, enum.Enum):
    HOSPITAL = "HOSPITAL"
    INSURER = "INSURER"


class DocumentType(str, enum.Enum):
    DISCHARGE_SUMMARY = "discharge_summary"
    BILL = "bill"
    LAB_REPORT = "lab_report"
    PRESCRIPTION = "prescription"
    PRE_AUTH = "pre_auth"


class OCRStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ValidationStatus(str, enum.Enum):
    COMPLETE = "COMPLETE"
    INCOMPLETE = "INCOMPLETE"
    ERROR = "ERROR"


def utcnow() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(timezone.utc)


class User(Base):
    """Database model representing a system user (Hospital or Insurer)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False)


class PasswordResetToken(Base):
    """Database model representing a password reset token for a user."""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User")


class Claim(Base):
    """Database model representing an insurance claim and its high-level status."""
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(SAEnum(ClaimStatus),
                    default=ClaimStatus.PENDING, nullable=False)
    patient_name = Column(String(255), nullable=True)
    policy_number = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow,
                        onupdate=utcnow, nullable=False)
    insurer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    fraud_risk_score = Column(Integer, nullable=True)
    fraud_flags = Column(JSON, nullable=True)

    reviewer_decision = Column(String(50), nullable=True)
    reviewer_comments = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    documents = relationship(
        "Document", back_populates="claim", cascade="all, delete-orphan")
    extracted_fields = relationship(
        "ExtractedField", back_populates="claim", cascade="all, delete-orphan")
    validation_results = relationship(
        "ValidationResult", back_populates="claim", cascade="all, delete-orphan")
    audit_logs = relationship(
        "AuditLog", back_populates="claim", cascade="all, delete-orphan")
    fraud_alerts = relationship(
        "FraudAlert", back_populates="claim", cascade="all, delete-orphan")
    document_summaries = relationship(
        "DocumentSummary", back_populates="claim", cascade="all, delete-orphan")


class Document(Base):
    """Database model representing an uploaded file related to a claim."""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    doc_type = Column(SAEnum(DocumentType), nullable=False)
    file_path = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=True)
    ocr_status = Column(SAEnum(OCRStatus),
                        default=OCRStatus.PENDING, nullable=False)
    raw_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    claim = relationship("Claim", back_populates="documents")


class ExtractedField(Base):
    """Database model representing a single structured data point extracted via OCR."""
    __tablename__ = "extracted_fields"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    # Patient, Policy, Hospital, Clinical, Financial, Documents
    field_category = Column(String(100), nullable=False)
    field_name = Column(String(100), nullable=False)
    field_value = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)
    # SQLite doesn't have native bool
    is_manually_corrected = Column(Integer, default=0)

    claim = relationship("Claim", back_populates="extracted_fields")


class ValidationResult(Base):
    """Database model storing the output of the automated medical validation engine."""
    __tablename__ = "validation_results"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    status = Column(SAEnum(ValidationStatus), nullable=False)
    missing_docs = Column(JSON, nullable=True)
    warnings = Column(JSON, nullable=True)
    errors = Column(JSON, nullable=True)
    overall_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    claim = relationship("Claim", back_populates="validation_results")


class AuditLog(Base):
    """Database model recording an immutable history of actions taken on a claim."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=utcnow, nullable=False)

    claim = relationship("Claim", back_populates="audit_logs")


class FraudAlert(Base):
    """Database model storing triggered fraud rules for Insurer review."""
    __tablename__ = "fraud_alerts"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    rule_triggered = Column(String(255), nullable=False)
    risk_score = Column(Integer, nullable=False)
    details = Column(JSON, nullable=True)
    reviewed = Column(Integer, default=0)
    reviewer_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    claim = relationship("Claim", back_populates="fraud_alerts")


class PatientProfile(Base):
    """Tracks unique patients across multiple claims (Network Analysis)."""
    __tablename__ = "patient_profiles"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    patient_name = Column(String(255), nullable=True)
    total_claims = Column(Integer, default=0)
    total_amount_claimed = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow,
                        onupdate=utcnow, nullable=False)


class HospitalProfile(Base):
    """Tracks unique hospitals across multiple claims (Network Analysis)."""
    __tablename__ = "hospital_profiles"

    id = Column(Integer, primary_key=True, index=True)
    hospital_name = Column(String(255), unique=True,
                           index=True, nullable=False)
    total_claims = Column(Integer, default=0)
    average_claim_amount = Column(Float, default=0.0)
    is_flagged = Column(Integer, default=0)
    is_ayush_registered = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class DoctorProfile(Base):
    """Tracks unique treating doctors (Network Analysis)."""
    __tablename__ = "doctor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    doctor_name = Column(String(255), unique=True, index=True, nullable=False)
    total_claims = Column(Integer, default=0)
    high_value_claims = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class DocumentSummary(Base):
    """AI-generated summary of all documents associated with a claim."""
    __tablename__ = "document_summaries"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    summary_text = Column(Text, nullable=False)
    key_findings = Column(JSON, nullable=True)
    document_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    claim = relationship("Claim", back_populates="document_summaries")
