from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UpdatePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# --- Claim Schemas ---


class ClaimCreate(BaseModel):
    """No body fields needed — documents come via multipart form."""
    pass


class ClaimStatusResponse(BaseModel):
    id: int
    status: str
    patient_name: Optional[str] = None
    policy_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    ocr_completed: int = 0
    fraud_risk_score: Optional[int] = None
    fraud_flags: Optional[list[str]] = None
    reviewer_decision: Optional[str] = None
    reviewer_comments: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ClaimListItem(BaseModel):
    id: int
    status: str
    patient_name: Optional[str] = None
    policy_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    fraud_risk_score: Optional[int] = None
    reviewer_decision: Optional[str] = None

    class Config:
        from_attributes = True


class ClaimReviewRequest(BaseModel):
    decision: str
    comments: Optional[str] = None

# --- Document Schemas ---


class DocumentResponse(BaseModel):
    id: int
    doc_type: str
    original_filename: str
    mime_type: Optional[str] = None
    ocr_status: str
    raw_text: Optional[str] = None

    class Config:
        from_attributes = True


# --- Extracted Field Schemas ---

class ExtractedFieldResponse(BaseModel):
    id: int
    field_category: str
    field_name: str
    field_value: Optional[str] = None
    confidence: Optional[float] = None
    is_manually_corrected: bool = False

    class Config:
        from_attributes = True


class FieldCorrection(BaseModel):
    field_id: int
    new_value: str


class CorrectionRequest(BaseModel):
    corrections: list[FieldCorrection]


# --- Validation Schemas ---

class ValidationResponse(BaseModel):
    id: int
    status: str
    missing_docs: Optional[list[str]] = None
    warnings: Optional[list[str]] = None
    errors: Optional[list[str]] = None
    overall_confidence: Optional[float] = None
    created_at: datetime
    irdai_checklist: Optional[dict] = None   # field_key -> bool (present/not)
    # icd10/pcs -> {valid, code, message}
    code_validation: Optional[dict] = None

    class Config:
        from_attributes = True


# --- Fraud Alerts ---

class FraudAlertResponse(BaseModel):
    id: int
    rule_triggered: str
    risk_score: int
    details: Optional[dict] = None
    reviewed: bool = False
    reviewer_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Document Summary ---

class DocumentSummaryResponse(BaseModel):
    """Response schema for AI-generated document summaries."""
    id: int
    summary_text: str
    key_findings: Optional[list[str]] = None
    document_count: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Claim Data (full detail) ---


class ClaimDataResponse(BaseModel):
    claim: ClaimStatusResponse
    documents: list[DocumentResponse] = []
    extracted_fields: list[ExtractedFieldResponse] = []
    fraud_alerts: list[FraudAlertResponse] = []
    validation: Optional[ValidationResponse] = None
    summary: Optional[DocumentSummaryResponse] = None

    class Config:
        from_attributes = True


# --- Upload Response ---

class UploadResponse(BaseModel):
    claim_id: int
    message: str
    documents_uploaded: int
