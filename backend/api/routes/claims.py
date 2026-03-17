from fastapi import APIRouter, Depends, File, Form, UploadFile, BackgroundTasks
from sqlalchemy.orm import Session

from db.database import get_db
from model.models import User, UserRole
from dto.schemas import (
    ClaimStatusResponse, ClaimListItem, ClaimDataResponse,
    ValidationResponse, UploadResponse, CorrectionRequest,
    ClaimReviewRequest, DocumentSummaryResponse
)
from utils.security import get_current_active_user, require_role
from api.controller.claims_controller import ClaimsController

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    doc_types: list[str] = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return await ClaimsController.upload_documents(background_tasks, files, doc_types, db, current_user)


@router.get("", response_model=list[ClaimListItem])
def list_claims(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    return ClaimsController.list_claims(skip, limit, db, current_user)


@router.get("/{claim_id}/status", response_model=ClaimStatusResponse)
def get_claim_status(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return ClaimsController.get_claim_status(claim_id, db, current_user)


@router.get("/{claim_id}/data", response_model=ClaimDataResponse)
def get_claim_data(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return ClaimsController.get_claim_data(claim_id, db, current_user)


@router.get("/{claim_id}/summary", response_model=DocumentSummaryResponse)
def get_claim_summary(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    return ClaimsController.get_claim_summary(claim_id, db, current_user)


@router.post("/{claim_id}/validate", response_model=ValidationResponse)
async def run_validation(claim_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role([UserRole.HOSPITAL, UserRole.INSURER]))):
    return await ClaimsController.run_validation(claim_id, db, current_user)


@router.put("/{claim_id}/correct")
def submit_corrections(
    claim_id: int,
    req: CorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return ClaimsController.submit_corrections(claim_id, req, db, current_user)


@router.post("/{claim_id}/upload-additional", response_model=dict)
async def upload_additional_document(
    claim_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return await ClaimsController.upload_additional_document(claim_id, background_tasks, file, doc_type, db, current_user)


@router.post("/{claim_id}/review", response_model=ClaimStatusResponse)
async def review_claim(
    claim_id: int,
    review_req: ClaimReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.INSURER])),
):
    return await ClaimsController.review_claim(claim_id, review_req, db, current_user)
