from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, model_validator


# ---------------------------------------------------------------------------
# Patient Schemas
# ---------------------------------------------------------------------------

class PatientCreate(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Doctor Schemas
# ---------------------------------------------------------------------------

class DoctorCreate(BaseModel):
    name: str
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    registration_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    available_days: Optional[str] = None
    consultation_fee: Optional[float] = None


class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    registration_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    available_days: Optional[str] = None
    consultation_fee: Optional[float] = None


class DoctorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    registration_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    available_days: Optional[str] = None
    consultation_fee: Optional[float] = None
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Ward Schemas
# ---------------------------------------------------------------------------

class WardCreate(BaseModel):
    name: str
    ward_type: str
    total_beds: int = 0
    available_beds: int = 0
    floor: Optional[str] = None
    description: Optional[str] = None


class WardUpdate(BaseModel):
    name: Optional[str] = None
    ward_type: Optional[str] = None
    total_beds: Optional[int] = None
    available_beds: Optional[int] = None
    floor: Optional[str] = None
    description: Optional[str] = None


class WardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    ward_type: str
    total_beds: int
    available_beds: int
    floor: Optional[str] = None
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# Admission Schemas
# ---------------------------------------------------------------------------

class AdmissionCreate(BaseModel):
    patient_id: int
    doctor_id: int
    ward_id: Optional[int] = None
    claim_id: Optional[int] = None
    admission_date: Optional[datetime] = None
    expected_discharge: Optional[datetime] = None
    diagnosis: Optional[str] = None
    bed_number: Optional[str] = None
    notes: Optional[str] = None


class AdmissionUpdate(BaseModel):
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    ward_id: Optional[int] = None
    claim_id: Optional[int] = None
    admission_date: Optional[datetime] = None
    expected_discharge: Optional[datetime] = None
    diagnosis: Optional[str] = None
    bed_number: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class DischargeRequest(BaseModel):
    actual_discharge: datetime
    notes: Optional[str] = None


class AdmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    doctor_id: int
    ward_id: Optional[int] = None
    claim_id: Optional[int] = None
    admission_date: datetime
    expected_discharge: Optional[datetime] = None
    actual_discharge: Optional[datetime] = None
    diagnosis: Optional[str] = None
    bed_number: Optional[str] = None
    status: str
    notes: Optional[str] = None
    created_at: datetime
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Appointment Schemas
# ---------------------------------------------------------------------------

class AppointmentCreate(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_date: datetime
    appointment_type: str = "OPD"
    reason: Optional[str] = None


class AppointmentUpdate(BaseModel):
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    appointment_date: Optional[datetime] = None
    appointment_type: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class AppointmentStatusUpdate(BaseModel):
    status: str


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    doctor_id: int
    appointment_date: datetime
    appointment_type: str
    status: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    patient_name: Optional[str] = None
    doctor_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Invoice Schemas
# ---------------------------------------------------------------------------

class InvoiceCreate(BaseModel):
    patient_id: int
    admission_id: Optional[int] = None
    claim_id: Optional[int] = None
    due_date: Optional[datetime] = None
    line_items: Optional[list[dict[str, Any]]] = None
    subtotal: float
    discount: float = 0.0
    tax_rate: float = 18.0
    notes: Optional[str] = None

    # Computed fields populated by validator
    tax_amount: float = 0.0
    total: float = 0.0

    @model_validator(mode="after")
    def compute_totals(self) -> "InvoiceCreate":
        taxable_base = max(self.subtotal - self.discount, 0.0)
        self.tax_amount = round(taxable_base * self.tax_rate / 100, 2)
        self.total = round(taxable_base + self.tax_amount, 2)
        return self


class InvoiceUpdate(BaseModel):
    patient_id: Optional[int] = None
    admission_id: Optional[int] = None
    claim_id: Optional[int] = None
    due_date: Optional[datetime] = None
    line_items: Optional[list[dict[str, Any]]] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    tax_rate: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class PaymentRequest(BaseModel):
    paid_amount: float
    payment_method: str
    payment_date: Optional[datetime] = None


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    admission_id: Optional[int] = None
    claim_id: Optional[int] = None
    invoice_number: str
    invoice_date: datetime
    due_date: Optional[datetime] = None
    line_items: Optional[list[dict[str, Any]]] = None
    subtotal: float
    discount: float
    tax_rate: float
    tax_amount: float
    total: float
    paid_amount: float
    status: str
    payment_date: Optional[datetime] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    patient_name: Optional[str] = None
