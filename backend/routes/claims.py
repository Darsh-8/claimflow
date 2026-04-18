from fastapi import APIRouter, Depends, File, Form, UploadFile, BackgroundTasks
from typing import Optional
from sqlalchemy.orm import Session

from config.database import get_db
from models.models import User, UserRole, Claim
from schemas.schemas import (
    ClaimStatusResponse, ClaimListItem, ClaimDataResponse,
    ValidationResponse, UploadResponse, CorrectionRequest,
    ClaimReviewRequest, DocumentSummaryResponse, ClaimAnalyticsResponse,
    PatientHistoryResponse, RoleAnalyticsResponse, ComprehendICD10Response,
    PolicyLinkRequest, ICD10SuggestRequest, ICD10SuggestResponse, ICD10SuggestItem
)
from utils.security import get_current_active_user, require_role
from middleware.dependencies import get_claim_or_404
from services.claim_service import ClaimService
from services.analytics_service import AnalyticsService

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    doc_types: list[str] = Form(...),
    insurer_id: Optional[int] = Form(None),
    patient_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return await ClaimService.upload_documents(background_tasks, files, doc_types, insurer_id, db, current_user, patient_name=patient_name)

@router.get("", response_model=list[ClaimListItem])
def list_claims(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return ClaimService.list_claims(skip, limit, db, current_user)

@router.get("/dashboard/analytics", response_model=ClaimAnalyticsResponse)
def get_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return AnalyticsService.get_analytics(db, current_user)

@router.get("/dashboard/role-analytics", response_model=RoleAnalyticsResponse)
def get_role_analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return AnalyticsService.get_role_analytics(db, current_user)

# -------- ICD-10 SUGGESTION (no claim ID needed) -------- #

@router.post("/suggest-icd10", response_model=ICD10SuggestResponse)
def suggest_icd10(
    body: ICD10SuggestRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Return ICD-10 code suggestions for a freeform text string (e.g. a manually typed diagnosis)."""
    from services.comprehend_medical_service import get_suggestions_for_text
    raw = get_suggestions_for_text(body.text, max_codes=5)
    return ICD10SuggestResponse(
        suggestions=[ICD10SuggestItem(**s) for s in raw]
    )


# -------- DEPENDENCY INJECTED ROUTES BELOW -------- #

@router.post("/{claim_id}/link-policy", response_model=ClaimStatusResponse)
def link_policy(
    payload: PolicyLinkRequest,
    background_tasks: BackgroundTasks,
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return ClaimService.link_policy(claim, payload, background_tasks, db, current_user)


@router.get("/{claim_id}/status", response_model=ClaimStatusResponse)
def get_claim_status(claim: Claim = Depends(get_claim_or_404), db: Session = Depends(get_db)):
    return ClaimService.get_claim_status(claim, db)


@router.get("/{claim_id}/data", response_model=ClaimDataResponse)
def get_claim_data(claim: Claim = Depends(get_claim_or_404), db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return ClaimService.get_claim_data(claim, db, current_user)


@router.get("/{claim_id}/summary", response_model=DocumentSummaryResponse)
def get_claim_summary(claim: Claim = Depends(get_claim_or_404), db: Session = Depends(get_db)):
    return ClaimService.get_claim_summary(claim, db)


@router.post("/{claim_id}/validate", response_model=ValidationResponse)
async def run_validation(
    claim: Claim = Depends(get_claim_or_404), 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role([UserRole.HOSPITAL, UserRole.INSURER]))
):
    return await ClaimService.run_validation(claim, db)


@router.put("/{claim_id}/correct")
async def submit_corrections(
    req: CorrectionRequest,
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return await ClaimService.submit_corrections(claim, req, db)


@router.post("/{claim_id}/upload-additional", response_model=dict)
async def upload_additional_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return await ClaimService.upload_additional_document(claim, background_tasks, file, doc_type, db)


@router.post("/{claim_id}/review", response_model=ClaimStatusResponse)
async def review_claim(
    review_req: ClaimReviewRequest,
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.INSURER])),
):
    return await ClaimService.review_claim(claim, review_req, db)


@router.get("/{claim_id}/documents/{doc_id}/download")
async def download_document(
    doc_id: int,
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.INSURER, UserRole.HOSPITAL])),
):
    return await ClaimService.download_document(claim, doc_id, db)


@router.get("/{claim_id}/patient-history", response_model=PatientHistoryResponse)
def get_patient_history(
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
):
    return ClaimService.get_patient_history(claim, db)


@router.get("/{claim_id}/comprehend", response_model=ComprehendICD10Response)
async def get_comprehend_icd10(
    claim: Claim = Depends(get_claim_or_404),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL, UserRole.INSURER])),
):
    return await ClaimService.get_comprehend_icd10(claim, db)
