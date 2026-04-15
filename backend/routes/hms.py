"""HMS (Hospital Management System) REST endpoints.

Single router file covering: patients, doctors, wards, admissions,
appointments, and invoices/billing.
"""

from typing import Optional, List
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from config.database import get_db
from utils.security import require_role
from models.models import User, UserRole, Claim
from models.hms_models import Patient, Doctor, Ward, Admission, Appointment, Invoice
from dao.hms_repository import (
    PatientRepository, DoctorRepository, WardRepository,
    AdmissionRepository, AppointmentRepository, InvoiceRepository,
)
from schemas.hms_schemas import (
    PatientCreate, PatientUpdate, PatientResponse,
    DoctorCreate, DoctorUpdate, DoctorResponse,
    WardCreate, WardUpdate, WardResponse,
    AdmissionCreate, AdmissionResponse, DischargeRequest,
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    InvoiceCreate, InvoiceResponse, PaymentRequest,
)


router = APIRouter(prefix="/hms", tags=["hms"])


# ---------------------------------------------------------------------------
# Status normalization helpers
# ---------------------------------------------------------------------------

def _norm_status_in(s: Optional[str]) -> Optional[str]:
    """Frontend uses lowercase status filters; DB stores uppercase."""
    if not s:
        return None
    upper = s.upper()
    if upper == "PARTIAL":
        return "PARTIALLY_PAID"
    return upper


def _norm_status_out(s: Optional[str]) -> Optional[str]:
    """Convert DB status back to lowercase form the frontend expects."""
    if not s:
        return s
    if s == "PARTIALLY_PAID":
        return "partial"
    return s.lower()


# ---------------------------------------------------------------------------
# Patients
# ---------------------------------------------------------------------------

@router.get("/patients", response_model=List[PatientResponse])
def list_patients(
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return PatientRepository(db).get_all(skip=skip, limit=limit, search=search)


@router.get("/patients/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    p = PatientRepository(db).get_by_id(patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


@router.post("/patients", response_model=PatientResponse, status_code=201)
def create_patient(
    body: PatientCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return PatientRepository(db).create(body)


@router.put("/patients/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    updated = PatientRepository(db).update(patient_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Patient not found")
    return updated


@router.delete("/patients/{patient_id}", status_code=204)
def deactivate_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    if not PatientRepository(db).deactivate(patient_id):
        raise HTTPException(status_code=404, detail="Patient not found")


@router.get("/patients/{patient_id}/journey")
def get_patient_journey(
    patient_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    """Full patient journey: admissions, appointments, invoices, and linked claims."""
    patient = PatientRepository(db).get_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    admissions = AdmissionRepository(db).get_all(patient_id=patient_id, limit=200)
    appointments = AppointmentRepository(db).get_all(patient_id=patient_id, limit=200)
    invoices = InvoiceRepository(db).get_all(patient_id=patient_id, limit=200)

    # Enrich admissions with doctor / ward names
    admission_list = []
    for a in admissions:
        doc = db.query(Doctor).filter(Doctor.id == a.doctor_id).first()
        ward = db.query(Ward).filter(Ward.id == a.ward_id).first() if a.ward_id else None
        admission_list.append({
            "id": a.id,
            "admission_date": a.admission_date,
            "expected_discharge": a.expected_discharge,
            "actual_discharge": a.actual_discharge,
            "diagnosis": a.diagnosis,
            "bed_number": a.bed_number,
            "status": _norm_status_out(a.status),
            "notes": a.notes,
            "doctor_name": doc.name if doc else None,
            "doctor_specialization": doc.specialization if doc else None,
            "ward_name": ward.name if ward else None,
            "ward_type": ward.ward_type if ward else None,
            "claim_id": a.claim_id,
            "created_at": a.created_at,
        })

    # Enrich appointments with doctor name
    appointment_list = []
    for ap in appointments:
        doc = db.query(Doctor).filter(Doctor.id == ap.doctor_id).first()
        appointment_list.append({
            "id": ap.id,
            "appointment_date": ap.appointment_date,
            "appointment_type": ap.appointment_type,
            "status": _norm_status_out(ap.status),
            "reason": ap.reason,
            "notes": ap.notes,
            "doctor_name": doc.name if doc else None,
            "doctor_specialization": doc.specialization if doc else None,
            "created_at": ap.created_at,
        })

    # Invoice summary
    invoice_list = []
    for inv in invoices:
        invoice_list.append({
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "invoice_date": inv.invoice_date,
            "total": inv.total,
            "paid_amount": inv.paid_amount,
            "status": _norm_status_out(inv.status),
            "admission_id": inv.admission_id,
            "claim_id": inv.claim_id,
        })

    # Claims linked by patient name (case-insensitive match)
    claims_raw = db.query(Claim).filter(
        Claim.patient_name.ilike(patient.name)
    ).order_by(Claim.created_at.desc()).limit(50).all()
    claim_list = []
    for c in claims_raw:
        from models.models import Document
        docs = db.query(Document).filter(Document.claim_id == c.id).all()
        claim_list.append({
            "id": c.id,
            "status": c.status,
            "patient_name": c.patient_name,
            "policy_number": c.policy_number,
            "fraud_risk_score": c.fraud_risk_score,
            "reviewer_decision": c.reviewer_decision,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "documents": [
                {
                    "id": d.id,
                    "doc_type": d.doc_type,
                    "original_filename": d.original_filename,
                    "mime_type": d.mime_type,
                    "ocr_status": d.ocr_status,
                }
                for d in docs
            ],
        })

    return {
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "blood_group": patient.blood_group,
            "phone": patient.phone,
            "email": patient.email,
            "address": patient.address,
            "emergency_contact": patient.emergency_contact,
            "allergies": patient.allergies,
            "medical_history": patient.medical_history,
            "is_active": patient.is_active,
            "created_at": patient.created_at,
        },
        "admissions": admission_list,
        "appointments": appointment_list,
        "invoices": invoice_list,
        "claims": claim_list,
    }


# ---------------------------------------------------------------------------
# Doctors
# ---------------------------------------------------------------------------

@router.get("/doctors", response_model=List[DoctorResponse])
def list_doctors(
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return DoctorRepository(db).get_all(skip=skip, limit=limit, search=search)


@router.get("/doctors/{doctor_id}", response_model=DoctorResponse)
def get_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    d = DoctorRepository(db).get_by_id(doctor_id)
    if not d:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return d


@router.post("/doctors", response_model=DoctorResponse, status_code=201)
def create_doctor(
    body: DoctorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return DoctorRepository(db).create(body)


@router.put("/doctors/{doctor_id}", response_model=DoctorResponse)
def update_doctor(
    doctor_id: int,
    body: DoctorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    updated = DoctorRepository(db).update(doctor_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return updated


@router.delete("/doctors/{doctor_id}", status_code=204)
def deactivate_doctor(
    doctor_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    if not DoctorRepository(db).deactivate(doctor_id):
        raise HTTPException(status_code=404, detail="Doctor not found")


# ---------------------------------------------------------------------------
# Wards
# ---------------------------------------------------------------------------

@router.get("/wards", response_model=List[WardResponse])
def list_wards(
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return WardRepository(db).get_all(skip=skip, limit=limit, search=search)


@router.get("/wards/{ward_id}", response_model=WardResponse)
def get_ward(
    ward_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    w = WardRepository(db).get_by_id(ward_id)
    if not w:
        raise HTTPException(status_code=404, detail="Ward not found")
    return w


@router.post("/wards", response_model=WardResponse, status_code=201)
def create_ward(
    body: WardCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    return WardRepository(db).create(body)


@router.put("/wards/{ward_id}", response_model=WardResponse)
def update_ward(
    ward_id: int,
    body: WardUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    updated = WardRepository(db).update(ward_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Ward not found")
    return updated


@router.delete("/wards/{ward_id}", status_code=204)
def delete_ward(
    ward_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    if not WardRepository(db).deactivate(ward_id):
        raise HTTPException(status_code=404, detail="Ward not found")


# ---------------------------------------------------------------------------
# Admissions
# ---------------------------------------------------------------------------

def _admission_to_response(a: Admission, db: Session) -> dict:
    """Augment Admission with patient_name + doctor_name."""
    patient = db.query(Patient).filter(Patient.id == a.patient_id).first()
    doctor = db.query(Doctor).filter(Doctor.id == a.doctor_id).first()
    return {
        "id": a.id,
        "patient_id": a.patient_id,
        "doctor_id": a.doctor_id,
        "ward_id": a.ward_id,
        "claim_id": a.claim_id,
        "admission_date": a.admission_date,
        "expected_discharge": a.expected_discharge,
        "actual_discharge": a.actual_discharge,
        "diagnosis": a.diagnosis,
        "bed_number": a.bed_number,
        "status": _norm_status_out(a.status),
        "notes": a.notes,
        "created_at": a.created_at,
        "patient_name": patient.name if patient else None,
        "doctor_name": doctor.name if doctor else None,
    }


@router.get("/admissions", response_model=List[AdmissionResponse])
def list_admissions(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = Query(None),
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    rows = AdmissionRepository(db).get_all(
        skip=skip, limit=limit,
        status_filter=_norm_status_in(status),
        patient_id=patient_id,
    )
    return [_admission_to_response(a, db) for a in rows]


@router.get("/admissions/{admission_id}", response_model=AdmissionResponse)
def get_admission(
    admission_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    a = AdmissionRepository(db).get_by_id(admission_id)
    if not a:
        raise HTTPException(status_code=404, detail="Admission not found")
    return _admission_to_response(a, db)


@router.post("/admissions", response_model=AdmissionResponse, status_code=201)
def create_admission(
    body: AdmissionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    a = AdmissionRepository(db).create(body)
    return _admission_to_response(a, db)


@router.post("/admissions/{admission_id}/discharge", response_model=AdmissionResponse)
def discharge_admission(
    admission_id: int,
    body: DischargeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    a = AdmissionRepository(db).discharge(admission_id, body)
    if not a:
        raise HTTPException(status_code=404, detail="Admission not found")
    return _admission_to_response(a, db)


# ---------------------------------------------------------------------------
# Appointments
# ---------------------------------------------------------------------------

def _appointment_to_response(ap: Appointment, db: Session) -> dict:
    patient = db.query(Patient).filter(Patient.id == ap.patient_id).first()
    doctor = db.query(Doctor).filter(Doctor.id == ap.doctor_id).first()
    return {
        "id": ap.id,
        "patient_id": ap.patient_id,
        "doctor_id": ap.doctor_id,
        "appointment_date": ap.appointment_date,
        "appointment_type": ap.appointment_type,
        "status": _norm_status_out(ap.status),
        "reason": ap.reason,
        "notes": ap.notes,
        "created_at": ap.created_at,
        "patient_name": patient.name if patient else None,
        "doctor_name": doctor.name if doctor else None,
    }


@router.get("/appointments", response_model=List[AppointmentResponse])
def list_appointments(
    skip: int = 0,
    limit: int = 100,
    doctor_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    date: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    rows = AppointmentRepository(db).get_all(
        skip=skip, limit=limit,
        doctor_id=doctor_id,
        patient_id=patient_id,
        date_filter=date,
        status=_norm_status_in(status),
    )
    return [_appointment_to_response(a, db) for a in rows]


@router.get("/appointments/{appointment_id}", response_model=AppointmentResponse)
def get_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    ap = AppointmentRepository(db).get_by_id(appointment_id)
    if not ap:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appointment_to_response(ap, db)


@router.post("/appointments", response_model=AppointmentResponse, status_code=201)
def create_appointment(
    body: AppointmentCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    ap = AppointmentRepository(db).create(body)
    return _appointment_to_response(ap, db)


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentResponse)
def cancel_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    repo = AppointmentRepository(db)
    ap = repo.update_status(appointment_id, AppointmentUpdate(status="CANCELLED"))
    if not ap:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appointment_to_response(ap, db)


@router.post("/appointments/{appointment_id}/complete", response_model=AppointmentResponse)
def complete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    repo = AppointmentRepository(db)
    ap = repo.update_status(appointment_id, AppointmentUpdate(status="COMPLETED"))
    if not ap:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appointment_to_response(ap, db)


# ---------------------------------------------------------------------------
# Invoices / Billing
# ---------------------------------------------------------------------------

def _invoice_to_response(inv: Invoice, db: Session) -> dict:
    patient = db.query(Patient).filter(Patient.id == inv.patient_id).first()
    return {
        "id": inv.id,
        "patient_id": inv.patient_id,
        "admission_id": inv.admission_id,
        "claim_id": inv.claim_id,
        "invoice_number": inv.invoice_number,
        "invoice_date": inv.invoice_date,
        "due_date": inv.due_date,
        "line_items": inv.line_items,
        "subtotal": inv.subtotal,
        "discount": inv.discount,
        "tax_rate": inv.tax_rate,
        "tax_amount": inv.tax_amount,
        "total": inv.total,
        "paid_amount": inv.paid_amount,
        "status": _norm_status_out(inv.status),
        "payment_date": inv.payment_date,
        "payment_method": inv.payment_method,
        "notes": inv.notes,
        "created_at": inv.created_at,
        "patient_name": patient.name if patient else None,
    }


@router.get("/invoices", response_model=List[InvoiceResponse])
def list_invoices(
    skip: int = 0,
    limit: int = 100,
    patient_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    rows = InvoiceRepository(db).get_all(
        skip=skip, limit=limit,
        patient_id=patient_id,
        status=_norm_status_in(status),
    )
    return [_invoice_to_response(i, db) for i in rows]


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    inv = InvoiceRepository(db).get_by_id(invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_to_response(inv, db)


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
def create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    inv = InvoiceRepository(db).create(body)
    return _invoice_to_response(inv, db)


@router.post("/invoices/{invoice_id}/payment", response_model=InvoiceResponse)
def record_invoice_payment(
    invoice_id: int,
    body: PaymentRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    inv = InvoiceRepository(db).record_payment(invoice_id, body)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_to_response(inv, db)


# ---------------------------------------------------------------------------
# HMS Analytics
# ---------------------------------------------------------------------------

@router.get("/analytics")
def get_hms_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_role([UserRole.HOSPITAL])),
):
    """Aggregate HMS stats: patients, doctors, wards, admissions, appointments, billing."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # ── Patients ──────────────────────────────────────────────────────────────
    total_patients = db.query(Patient).count()
    active_patients = db.query(Patient).filter(Patient.is_active == True).count()
    new_this_month = db.query(Patient).filter(Patient.created_at >= month_start).count()

    # ── Doctors ───────────────────────────────────────────────────────────────
    total_doctors = db.query(Doctor).count()
    active_doctors = db.query(Doctor).filter(Doctor.is_active == True).count()

    # ── Wards / Bed occupancy ─────────────────────────────────────────────────
    wards = db.query(Ward).all()
    total_beds = sum(w.total_beds for w in wards)
    available_beds = sum(w.available_beds for w in wards)
    occupied_beds = total_beds - available_beds
    ward_breakdown = []
    for w in wards:
        occ = round((w.total_beds - w.available_beds) / w.total_beds * 100, 1) if w.total_beds > 0 else 0.0
        ward_breakdown.append({
            "id": w.id,
            "name": w.name,
            "ward_type": w.ward_type,
            "total_beds": w.total_beds,
            "available_beds": w.available_beds,
            "occupied_beds": w.total_beds - w.available_beds,
            "occupancy_rate": occ,
        })

    # ── Admissions ────────────────────────────────────────────────────────────
    total_admissions = db.query(Admission).count()
    currently_admitted = db.query(Admission).filter(Admission.status == "ADMITTED").count()
    discharged_this_month = db.query(Admission).filter(
        Admission.status == "DISCHARGED",
        Admission.actual_discharge >= month_start,
    ).count()

    # Monthly admission & discharge trends (last 6 months)
    monthly_trends = []
    for i in range(5, -1, -1):
        ref = now - timedelta(days=i * 30)
        year, month = ref.year, ref.month
        m_start = datetime(year, month, 1, tzinfo=timezone.utc)
        m_end = datetime(year + (month // 12), (month % 12) + 1, 1, tzinfo=timezone.utc)
        adm_count = db.query(Admission).filter(
            Admission.created_at >= m_start,
            Admission.created_at < m_end,
        ).count()
        dis_count = db.query(Admission).filter(
            Admission.status == "DISCHARGED",
            Admission.actual_discharge >= m_start,
            Admission.actual_discharge < m_end,
        ).count()
        monthly_trends.append({
            "month": m_start.strftime("%b %Y"),
            "admissions": adm_count,
            "discharges": dis_count,
        })

    # ── Appointments ──────────────────────────────────────────────────────────
    total_appointments = db.query(Appointment).count()
    today_appointments = db.query(Appointment).filter(
        Appointment.appointment_date >= today_start,
        Appointment.appointment_date < today_end,
    ).count()
    appt_by_status = {
        "scheduled": db.query(Appointment).filter(Appointment.status == "SCHEDULED").count(),
        "completed": db.query(Appointment).filter(Appointment.status == "COMPLETED").count(),
        "cancelled": db.query(Appointment).filter(Appointment.status == "CANCELLED").count(),
        "no_show": db.query(Appointment).filter(Appointment.status == "NO_SHOW").count(),
    }
    appt_by_type = {
        "OPD": db.query(Appointment).filter(Appointment.appointment_type == "OPD").count(),
        "FOLLOW_UP": db.query(Appointment).filter(Appointment.appointment_type == "FOLLOW_UP").count(),
        "EMERGENCY": db.query(Appointment).filter(Appointment.appointment_type == "EMERGENCY").count(),
    }

    # ── Billing ───────────────────────────────────────────────────────────────
    invoices = db.query(Invoice).all()
    total_billed = sum(i.total for i in invoices)
    total_collected = sum(i.paid_amount for i in invoices)
    billing_stats = {
        "total_invoices": len(invoices),
        "total_billed": round(total_billed, 2),
        "total_collected": round(total_collected, 2),
        "pending_amount": round(total_billed - total_collected, 2),
        "paid_count": sum(1 for i in invoices if i.status == "PAID"),
        "pending_count": sum(1 for i in invoices if i.status == "PENDING"),
        "partial_count": sum(1 for i in invoices if i.status == "PARTIALLY_PAID"),
    }

    # ── Top diagnoses ─────────────────────────────────────────────────────────
    diag_counts: dict[str, int] = defaultdict(int)
    for (diag,) in db.query(Admission.diagnosis).filter(Admission.diagnosis != None).all():
        if diag and diag.strip():
            diag_counts[diag.strip()] += 1
    top_diagnoses = sorted(
        [{"diagnosis": k, "count": v} for k, v in diag_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    return {
        "patients": {
            "total": total_patients,
            "active": active_patients,
            "inactive": total_patients - active_patients,
            "new_this_month": new_this_month,
        },
        "doctors": {
            "total": total_doctors,
            "active": active_doctors,
        },
        "wards": {
            "total": len(wards),
            "total_beds": total_beds,
            "available_beds": available_beds,
            "occupied_beds": occupied_beds,
            "occupancy_rate": round(occupied_beds / total_beds * 100, 1) if total_beds > 0 else 0.0,
            "breakdown": ward_breakdown,
        },
        "admissions": {
            "total": total_admissions,
            "currently_admitted": currently_admitted,
            "discharged_this_month": discharged_this_month,
            "monthly_trends": monthly_trends,
        },
        "appointments": {
            "total": total_appointments,
            "today": today_appointments,
            "by_status": appt_by_status,
            "by_type": appt_by_type,
        },
        "billing": billing_stats,
        "top_diagnoses": top_diagnoses,
    }
