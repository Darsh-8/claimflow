// HMS Domain Interfaces

export interface Patient {
  id: number;
  name: string;
  age?: number;
  gender?: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact?: string;
  allergies?: string;
  medical_history?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientCreate {
  name: string;
  age?: number;
  gender?: string;
  blood_group?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact?: string;
  allergies?: string;
  medical_history?: string;
}

export interface Doctor {
  id: number;
  name: string;
  specialization?: string;
  qualification?: string;
  registration_number?: string;
  phone?: string;
  email?: string;
  department?: string;
  available_days?: string;
  consultation_fee?: number;
  is_active: boolean;
  created_at: string;
}

export interface DoctorCreate {
  name: string;
  specialization?: string;
  qualification?: string;
  registration_number?: string;
  phone?: string;
  email?: string;
  department?: string;
  available_days?: string;
  consultation_fee?: number;
}

export interface Ward {
  id: number;
  name: string;
  ward_type: string;
  total_beds: number;
  available_beds: number;
  floor?: string;
  description?: string;
}

export interface WardCreate {
  name: string;
  ward_type: string;
  total_beds: number;
  available_beds: number;
  floor?: string;
  description?: string;
}

export interface Admission {
  id: number;
  patient_id: number;
  doctor_id: number;
  ward_id?: number;
  claim_id?: number;
  admission_date: string;
  expected_discharge?: string;
  actual_discharge?: string;
  diagnosis?: string;
  bed_number?: string;
  status: string;
  notes?: string;
  created_at: string;
  patient_name?: string;
  doctor_name?: string;
}

export interface AdmissionCreate {
  patient_id: number;
  doctor_id: number;
  ward_id?: number;
  diagnosis?: string;
  bed_number?: string;
  expected_discharge?: string;
  notes?: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  appointment_type: string;
  status: string;
  reason?: string;
  notes?: string;
  created_at: string;
  patient_name?: string;
  doctor_name?: string;
}

export interface AppointmentCreate {
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  appointment_type?: string;
  reason?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id: number;
  patient_id: number;
  admission_id?: number;
  claim_id?: number;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  line_items?: LineItem[];
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  status: string;
  payment_date?: string;
  payment_method?: string;
  notes?: string;
  created_at: string;
  patient_name?: string;
}

export interface InvoiceCreate {
  patient_id: number;
  admission_id?: number;
  claim_id?: number;
  line_items?: LineItem[];
  subtotal: number;
  discount?: number;
  tax_rate?: number;
  notes?: string;
}

// ── Patient Journey ──────────────────────────────────────────────────────────

export interface JourneyAdmission {
  id: number;
  admission_date: string;
  expected_discharge?: string;
  actual_discharge?: string;
  diagnosis?: string;
  bed_number?: string;
  status: string;
  notes?: string;
  doctor_name?: string;
  doctor_specialization?: string;
  ward_name?: string;
  ward_type?: string;
  claim_id?: number;
  created_at: string;
}

export interface JourneyAppointment {
  id: number;
  appointment_date: string;
  appointment_type: string;
  status: string;
  reason?: string;
  notes?: string;
  doctor_name?: string;
  doctor_specialization?: string;
  created_at: string;
}

export interface JourneyInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total: number;
  paid_amount: number;
  status: string;
  admission_id?: number;
  claim_id?: number;
}

export interface JourneyClaimDocument {
  id: number;
  doc_type: string;
  original_filename: string;
  mime_type?: string;
  ocr_status: string;
}

export interface JourneyClaim {
  id: number;
  status: string;
  patient_name?: string;
  policy_number?: string;
  fraud_risk_score?: number;
  reviewer_decision?: string;
  created_at: string;
  updated_at: string;
  documents: JourneyClaimDocument[];
}

export interface PatientJourney {
  patient: Patient;
  admissions: JourneyAdmission[];
  appointments: JourneyAppointment[];
  invoices: JourneyInvoice[];
  claims: JourneyClaim[];
}
