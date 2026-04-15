from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from models.hms_models import Patient, Doctor, Ward, Admission, Appointment, Invoice
from schemas.hms_schemas import (
    PatientCreate, PatientUpdate,
    DoctorCreate, DoctorUpdate,
    WardCreate, WardUpdate,
    AdmissionCreate, AdmissionUpdate, DischargeRequest,
    AppointmentCreate, AppointmentUpdate,
    InvoiceCreate, InvoiceUpdate, PaymentRequest,
)


# ---------------------------------------------------------------------------
# PatientRepository
# ---------------------------------------------------------------------------

class PatientRepository:
    """DAO for HMS Patient entity — all DB access for patients goes through here."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(self, skip: int = 0, limit: int = 50, search: str = "") -> List[Patient]:
        query = self.db.query(Patient).filter(Patient.is_active == True)
        if search:
            like = f"%{search}%"
            query = query.filter(
                (Patient.name.ilike(like)) | (Patient.phone.ilike(like))
            )
        return query.order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()

    def get_by_id(self, patient_id: int) -> Optional[Patient]:
        return self.db.query(Patient).filter(Patient.id == patient_id).first()

    def create(self, data: PatientCreate) -> Patient:
        patient = Patient(**data.model_dump())
        self.db.add(patient)
        self.db.commit()
        self.db.refresh(patient)
        return patient

    def update(self, patient_id: int, data: PatientUpdate) -> Optional[Patient]:
        patient = self.get_by_id(patient_id)
        if not patient:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(patient, field, value)
        self.db.commit()
        self.db.refresh(patient)
        return patient

    def deactivate(self, patient_id: int) -> bool:
        patient = self.get_by_id(patient_id)
        if not patient:
            return False
        patient.is_active = False
        self.db.commit()
        return True


# ---------------------------------------------------------------------------
# DoctorRepository
# ---------------------------------------------------------------------------

class DoctorRepository:
    """DAO for HMS Doctor entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(self, skip: int = 0, limit: int = 50, search: str = "") -> List[Doctor]:
        query = self.db.query(Doctor)
        if search:
            like = f"%{search}%"
            query = query.filter(
                (Doctor.name.ilike(like)) | (Doctor.department.ilike(like))
            )
        return query.order_by(Doctor.created_at.desc()).offset(skip).limit(limit).all()

    def get_active_only(self, skip: int = 0, limit: int = 50) -> List[Doctor]:
        return (
            self.db.query(Doctor)
            .filter(Doctor.is_active == True)
            .order_by(Doctor.name)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_id(self, doctor_id: int) -> Optional[Doctor]:
        return self.db.query(Doctor).filter(Doctor.id == doctor_id).first()

    def create(self, data: DoctorCreate) -> Doctor:
        doctor = Doctor(**data.model_dump())
        self.db.add(doctor)
        self.db.commit()
        self.db.refresh(doctor)
        return doctor

    def update(self, doctor_id: int, data: DoctorUpdate) -> Optional[Doctor]:
        doctor = self.get_by_id(doctor_id)
        if not doctor:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(doctor, field, value)
        self.db.commit()
        self.db.refresh(doctor)
        return doctor

    def deactivate(self, doctor_id: int) -> bool:
        doctor = self.get_by_id(doctor_id)
        if not doctor:
            return False
        doctor.is_active = False
        self.db.commit()
        return True


# ---------------------------------------------------------------------------
# WardRepository
# ---------------------------------------------------------------------------

class WardRepository:
    """DAO for HMS Ward entity — including bed count management."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(self, skip: int = 0, limit: int = 50, search: str = "") -> List[Ward]:
        query = self.db.query(Ward)
        if search:
            like = f"%{search}%"
            query = query.filter(Ward.name.ilike(like))
        return query.order_by(Ward.name).offset(skip).limit(limit).all()

    def get_by_id(self, ward_id: int) -> Optional[Ward]:
        return self.db.query(Ward).filter(Ward.id == ward_id).first()

    def create(self, data: WardCreate) -> Ward:
        ward = Ward(**data.model_dump())
        self.db.add(ward)
        self.db.commit()
        self.db.refresh(ward)
        return ward

    def update(self, ward_id: int, data: WardUpdate) -> Optional[Ward]:
        ward = self.get_by_id(ward_id)
        if not ward:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(ward, field, value)
        self.db.commit()
        self.db.refresh(ward)
        return ward

    def deactivate(self, ward_id: int) -> bool:
        """Wards don't have is_active; deletion is handled by the caller."""
        ward = self.get_by_id(ward_id)
        if not ward:
            return False
        self.db.delete(ward)
        self.db.commit()
        return True

    def update_bed_count(self, ward_id: int, delta: int) -> None:
        """Adjust available_beds by delta (+1 on discharge, -1 on admission). Clamps to [0, total_beds]."""
        ward = self.get_by_id(ward_id)
        if ward is None:
            return
        new_count = ward.available_beds + delta
        ward.available_beds = max(0, min(new_count, ward.total_beds))
        self.db.commit()


# ---------------------------------------------------------------------------
# AdmissionRepository
# ---------------------------------------------------------------------------

class AdmissionRepository:
    """DAO for HMS Admission entity — also manages ward bed counts on create/discharge."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(
        self,
        skip: int = 0,
        limit: int = 50,
        status_filter: Optional[str] = None,
        patient_id: Optional[int] = None,
    ) -> List[Admission]:
        query = self.db.query(Admission)
        if status_filter:
            query = query.filter(Admission.status == status_filter)
        if patient_id:
            query = query.filter(Admission.patient_id == patient_id)
        return query.order_by(Admission.created_at.desc()).offset(skip).limit(limit).all()

    def get_by_id(self, admission_id: int) -> Optional[Admission]:
        return self.db.query(Admission).filter(Admission.id == admission_id).first()

    def create(self, data: AdmissionCreate) -> Admission:
        payload = data.model_dump()
        # Remove None admission_date so the column default (utcnow) fires
        if payload.get("admission_date") is None:
            payload.pop("admission_date", None)
        admission = Admission(**payload)
        self.db.add(admission)
        self.db.commit()
        self.db.refresh(admission)

        # Decrement available beds when a ward is assigned
        if admission.ward_id:
            ward_repo = WardRepository(self.db)
            ward_repo.update_bed_count(admission.ward_id, -1)

        return admission

    def discharge(self, admission_id: int, data: DischargeRequest) -> Optional[Admission]:
        admission = self.get_by_id(admission_id)
        if not admission:
            return None
        admission.actual_discharge = data.actual_discharge
        admission.status = "DISCHARGED"
        if data.notes:
            admission.notes = data.notes
        self.db.commit()
        self.db.refresh(admission)

        # Restore available beds when patient is discharged
        if admission.ward_id:
            ward_repo = WardRepository(self.db)
            ward_repo.update_bed_count(admission.ward_id, +1)

        return admission


# ---------------------------------------------------------------------------
# AppointmentRepository
# ---------------------------------------------------------------------------

class AppointmentRepository:
    """DAO for HMS Appointment entity."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(
        self,
        skip: int = 0,
        limit: int = 50,
        doctor_id: Optional[int] = None,
        patient_id: Optional[int] = None,
        date_filter: Optional[str] = None,   # YYYY-MM-DD string
        status: Optional[str] = None,
    ) -> List[Appointment]:
        query = self.db.query(Appointment)
        if doctor_id:
            query = query.filter(Appointment.doctor_id == doctor_id)
        if patient_id:
            query = query.filter(Appointment.patient_id == patient_id)
        if status:
            query = query.filter(Appointment.status == status)
        if date_filter:
            try:
                day = datetime.strptime(date_filter, "%Y-%m-%d")
                day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
                query = query.filter(
                    Appointment.appointment_date >= day_start,
                    Appointment.appointment_date <= day_end,
                )
            except ValueError:
                pass  # Invalid date string — skip filter
        return query.order_by(Appointment.appointment_date).offset(skip).limit(limit).all()

    def get_by_id(self, appointment_id: int) -> Optional[Appointment]:
        return self.db.query(Appointment).filter(Appointment.id == appointment_id).first()

    def create(self, data: AppointmentCreate) -> Appointment:
        appointment = Appointment(**data.model_dump())
        self.db.add(appointment)
        self.db.commit()
        self.db.refresh(appointment)
        return appointment

    def update_status(self, appointment_id: int, data: AppointmentUpdate) -> Optional[Appointment]:
        appointment = self.get_by_id(appointment_id)
        if not appointment:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(appointment, field, value)
        self.db.commit()
        self.db.refresh(appointment)
        return appointment


# ---------------------------------------------------------------------------
# InvoiceRepository
# ---------------------------------------------------------------------------

class InvoiceRepository:
    """DAO for HMS Invoice entity — including auto-numbered invoice generation and payment recording."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_all(
        self,
        skip: int = 0,
        limit: int = 50,
        patient_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> List[Invoice]:
        query = self.db.query(Invoice)
        if patient_id:
            query = query.filter(Invoice.patient_id == patient_id)
        if status:
            query = query.filter(Invoice.status == status)
        return query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()

    def get_by_id(self, invoice_id: int) -> Optional[Invoice]:
        return self.db.query(Invoice).filter(Invoice.id == invoice_id).first()

    def create(self, data: InvoiceCreate) -> Invoice:
        payload = data.model_dump()
        # Temporary placeholder — real number assigned after we know the PK
        payload["invoice_number"] = "INV-PENDING"
        invoice = Invoice(**payload)
        self.db.add(invoice)
        self.db.flush()  # Gets the auto-assigned id without committing

        # Now we have the id — generate the human-readable invoice number
        invoice.invoice_number = f"INV-{invoice.id:05d}"
        self.db.commit()
        self.db.refresh(invoice)
        return invoice

    def record_payment(self, invoice_id: int, data: PaymentRequest) -> Optional[Invoice]:
        invoice = self.get_by_id(invoice_id)
        if not invoice:
            return None

        invoice.paid_amount = invoice.paid_amount + data.paid_amount
        invoice.payment_method = data.payment_method
        invoice.payment_date = data.payment_date or datetime.now(timezone.utc)

        # Determine new status
        if invoice.paid_amount >= invoice.total:
            invoice.status = "PAID"
        elif invoice.paid_amount > 0:
            invoice.status = "PARTIALLY_PAID"

        self.db.commit()
        self.db.refresh(invoice)
        return invoice
