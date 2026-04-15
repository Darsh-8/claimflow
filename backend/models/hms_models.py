from sqlalchemy import (
    Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey, JSON
)
from sqlalchemy.orm import relationship

from config.database import Base
from models.models import utcnow


class Patient(Base):
    """HMS Patient record — stores demographic and medical summary data."""
    __tablename__ = "hms_patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(20), nullable=True)
    blood_group = Column(String(10), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    emergency_contact = Column(String(100), nullable=True)
    allergies = Column(Text, nullable=True)
    medical_history = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    admissions = relationship("Admission", back_populates="patient")
    appointments = relationship("Appointment", back_populates="patient")
    invoices = relationship("Invoice", back_populates="patient")


class Doctor(Base):
    """HMS Doctor record — stores professional and scheduling details."""
    __tablename__ = "hms_doctors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    specialization = Column(String(100), nullable=True)
    qualification = Column(String(200), nullable=True)
    registration_number = Column(String(50), unique=True, nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    available_days = Column(String(100), nullable=True)  # e.g. "Mon,Tue,Wed"
    consultation_fee = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    admissions = relationship("Admission", back_populates="doctor")
    appointments = relationship("Appointment", back_populates="doctor")


class Ward(Base):
    """HMS Ward record — tracks bed availability per ward."""
    __tablename__ = "hms_wards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    ward_type = Column(String(20), nullable=False)  # GENERAL, ICU, PRIVATE, SEMI_PRIVATE
    total_beds = Column(Integer, default=0, nullable=False)
    available_beds = Column(Integer, default=0, nullable=False)
    floor = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)

    admissions = relationship("Admission", back_populates="ward")


class Admission(Base):
    """HMS Admission record — links a patient to a doctor, ward, and optional claim."""
    __tablename__ = "hms_admissions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("hms_patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("hms_doctors.id"), nullable=False)
    ward_id = Column(Integer, ForeignKey("hms_wards.id"), nullable=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    admission_date = Column(DateTime, default=utcnow, nullable=False)
    expected_discharge = Column(DateTime, nullable=True)
    actual_discharge = Column(DateTime, nullable=True)
    diagnosis = Column(Text, nullable=True)
    bed_number = Column(String(20), nullable=True)
    status = Column(String(20), default="ADMITTED", nullable=False)  # ADMITTED, DISCHARGED
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="admissions")
    doctor = relationship("Doctor", back_populates="admissions")
    ward = relationship("Ward", back_populates="admissions")
    invoices = relationship("Invoice", back_populates="admission")


class Appointment(Base):
    """HMS Appointment record — OPD and follow-up scheduling."""
    __tablename__ = "hms_appointments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("hms_patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("hms_doctors.id"), nullable=False)
    appointment_date = Column(DateTime, nullable=False)
    appointment_type = Column(String(20), default="OPD", nullable=False)  # OPD, FOLLOW_UP, EMERGENCY
    status = Column(String(20), default="SCHEDULED", nullable=False)  # SCHEDULED, COMPLETED, CANCELLED, NO_SHOW
    reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")


class Invoice(Base):
    """HMS Invoice record — billing with line items, tax, and payment tracking."""
    __tablename__ = "hms_invoices"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("hms_patients.id"), nullable=False)
    admission_id = Column(Integer, ForeignKey("hms_admissions.id"), nullable=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=True)
    invoice_number = Column(String(50), unique=True, nullable=False)  # auto-generate: INV-{id:05d}
    invoice_date = Column(DateTime, default=utcnow, nullable=False)
    due_date = Column(DateTime, nullable=True)
    line_items = Column(JSON, nullable=True)  # list of {description, quantity, unit_price, total}
    subtotal = Column(Float, default=0.0, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    tax_rate = Column(Float, default=18.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)
    total = Column(Float, default=0.0, nullable=False)
    paid_amount = Column(Float, default=0.0, nullable=False)
    status = Column(String(20), default="PENDING", nullable=False)  # PENDING, PAID, PARTIALLY_PAID, CANCELLED
    payment_date = Column(DateTime, nullable=True)
    payment_method = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="invoices")
    admission = relationship("Admission", back_populates="invoices")
