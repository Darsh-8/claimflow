import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Loader2, UserX, ClipboardList, Calendar,
  Receipt, FileText, Plus, X, Eye, Download, ExternalLink,
  AlertTriangle, CheckCircle, Clock, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { patientsApi } from '../api/patientsApi';
import { admissionsApi } from '../../admissions/api/admissionsApi';
import { appointmentsApi } from '../../appointments/api/appointmentsApi';
import { billingApi } from '../../billing/api/billingApi';
import PatientForm from '../components/PatientForm';
import AdmissionForm from '../../admissions/components/AdmissionForm';
import AppointmentForm from '../../appointments/components/AppointmentForm';
import InvoiceForm from '../../billing/components/InvoiceForm';
import type {
  PatientCreate, PatientJourney, JourneyAdmission,
  JourneyAppointment, JourneyInvoice, JourneyClaim, JourneyClaimDocument, AdmissionCreate, AppointmentCreate, InvoiceCreate,
} from '../../types';

type Tab = 'overview' | 'admissions' | 'appointments' | 'billing' | 'claims';

// ── Status badge helpers ──────────────────────────────────────────────────────
const ADMISSION_STATUS: Record<string, { bg: string; color: string }> = {
  admitted: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  discharged: { bg: 'var(--success-bg)', color: 'var(--success)' },
};
const APPT_STATUS: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  completed: { bg: 'var(--success-bg)', color: 'var(--success)' },
  cancelled: { bg: 'var(--error-bg)', color: 'var(--error)' },
  no_show: { bg: '#fef3c7', color: '#d97706' },
};
const INVOICE_STATUS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#d97706' },
  paid: { bg: 'var(--success-bg)', color: 'var(--success)' },
  partial: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  cancelled: { bg: 'var(--error-bg)', color: 'var(--error)' },
};
const CLAIM_STATUS: Record<string, { bg: string; color: string }> = {
  approved: { bg: 'var(--success-bg)', color: 'var(--success)' },
  rejected: { bg: 'var(--error-bg)', color: 'var(--error)' },
  processing: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  validated: { bg: '#f3e8ff', color: '#7c3aed' },
  complete: { bg: 'var(--success-bg)', color: 'var(--success)' },
};
const statusBadge = (map: Record<string, { bg: string; color: string }>, s: string) => {
  const c = map[s?.toLowerCase()] ?? { bg: 'var(--border)', color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: c.bg, color: c.color, textTransform: 'capitalize' }}>
      {s?.replace(/_/g, ' ')}
    </span>
  );
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '0.88rem', color: value != null ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value ?? '—'}</div>
    </div>
  );
}

// ── Document Preview Modal ────────────────────────────────────────────────────
function DocPreviewModal({ doc, claimId, onClose }: { doc: JourneyClaimDocument; claimId: number; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url = '';
    patientsApi.getDocumentBlob(claimId, doc.id)
      .then(u => { url = u; setBlobUrl(u); })
      .catch(() => toast.error('Failed to load document preview.'))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [claimId, doc.id]);

  const isPdf = doc.mime_type?.includes('pdf') || doc.original_filename.toLowerCase().endsWith('.pdf');
  const isImage = doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|tiff|bmp)$/i.test(doc.original_filename);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', flexDirection: 'column', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{doc.original_filename}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{doc.doc_type.replace(/_/g, ' ')}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {blobUrl && (
              <a href={blobUrl} download={doc.original_filename} className="btn btn-secondary" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Download size={13} /> Download
              </a>
            )}
            <button className="btn btn-secondary" onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <X size={14} /> Close
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', padding: '16px' }}>
          {loading && <Loader2 size={32} style={{ color: '#fff', animation: 'spin 0.7s linear infinite' }} />}
          {!loading && blobUrl && isPdf && (
            <iframe src={blobUrl} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '4px' }} title={doc.original_filename} />
          )}
          {!loading && blobUrl && isImage && (
            <img src={blobUrl} alt={doc.original_filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }} />
          )}
          {!loading && !blobUrl && (
            <div style={{ color: '#94a3b8', textAlign: 'center' }}>
              <FileText size={40} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Preview not available for this file type.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const patientId = Number(id);

  const [journey, setJourney] = useState<PatientJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Modals
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAdmitForm, setShowAdmitForm] = useState(false);
  const [savingAdmit, setSavingAdmit] = useState(false);
  const [showApptForm, setShowApptForm] = useState(false);
  const [savingAppt, setSavingAppt] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ doc: JourneyClaimDocument; claimId: number } | null>(null);

  const loadJourney = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await patientsApi.getJourney(patientId);
      setJourney(data);
    } catch {
      setError('Failed to load patient data.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { loadJourney(); }, [loadJourney]);

  const handleUpdate = async (data: PatientCreate) => {
    setSavingEdit(true);
    try {
      await patientsApi.update(patientId, data);
      setEditing(false);
      toast.success('Patient record updated.');
      loadJourney();
    } catch {
      toast.error('Failed to update patient.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this patient record?')) return;
    try {
      await patientsApi.deactivate(patientId);
      toast.success('Patient deactivated.');
      loadJourney();
    } catch {
      toast.error('Failed to deactivate.');
    }
  };

  const handleAdmit = async (data: AdmissionCreate) => {
    setSavingAdmit(true);
    try {
      await admissionsApi.create(data);
      setShowAdmitForm(false);
      toast.success('Patient admitted successfully.');
      loadJourney();
    } catch {
      toast.error('Failed to admit patient.');
    } finally {
      setSavingAdmit(false);
    }
  };

  const handleDischarge = async (admissionId: number) => {
    if (!confirm('Mark this patient as discharged?')) return;
    try {
      await admissionsApi.discharge(admissionId);
      toast.success('Patient discharged.');
      loadJourney();
    } catch {
      toast.error('Failed to discharge.');
    }
  };

  const handleBookAppt = async (data: AppointmentCreate) => {
    setSavingAppt(true);
    try {
      await appointmentsApi.create(data);
      setShowApptForm(false);
      toast.success('Appointment booked.');
      loadJourney();
    } catch {
      toast.error('Failed to book appointment.');
    } finally {
      setSavingAppt(false);
    }
  };

  const handleCreateInvoice = async (data: InvoiceCreate) => {
    setSavingInvoice(true);
    try {
      await billingApi.create(data);
      setShowInvoiceForm(false);
      toast.success('Invoice created.');
      loadJourney();
    } catch {
      toast.error('Failed to create invoice.');
    } finally {
      setSavingInvoice(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px', color: 'var(--text-muted)' }}>
      <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (error || !journey) return (
    <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
      <UserX size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
      <p style={{ margin: 0 }}>{error || 'Patient not found.'}</p>
    </div>
  );

  const { patient, admissions, appointments, invoices, claims } = journey;
  const activeAdmission = admissions.find(a => a.status === 'admitted');
  const totalBilled = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid_amount, 0);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'admissions', label: 'Admissions', count: admissions.length },
    { key: 'appointments', label: 'Appointments', count: appointments.length },
    { key: 'billing', label: 'Billing', count: invoices.length },
    { key: 'claims', label: 'Claims & Docs', count: claims.length },
  ];

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate('/hms/patients')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', marginBottom: '20px', padding: 0 }}>
        <ArrowLeft size={15} /> Back to Patients
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: patient.is_active ? 'var(--accent-blue)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.3rem', flexShrink: 0 }}>
            {patient.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{patient.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: patient.is_active ? 'var(--success-bg)' : 'var(--error-bg)', color: patient.is_active ? 'var(--success)' : 'var(--error)' }}>
                {patient.is_active ? 'Active' : 'Inactive'}
              </span>
              {activeAdmission && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: 'var(--accent-light)', color: 'var(--accent-blue)' }}>
                  Currently Admitted
                </span>
              )}
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Registered {new Date(patient.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {patient.is_active && !activeAdmission && (
            <button className="btn btn-primary" onClick={() => { setShowAdmitForm(true); setActiveTab('admissions'); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <ClipboardList size={14} /> Admit
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => { setShowApptForm(true); setActiveTab('appointments'); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <Calendar size={14} /> Book Appt
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/upload?patient=${encodeURIComponent(patient.name)}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <FileText size={14} /> New Claim
          </button>
          {patient.is_active && (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              <Edit2 size={14} /> Edit
            </button>
          )}
          {patient.is_active && (
            <button className="btn btn-secondary" onClick={handleDeactivate}
              style={{ color: 'var(--error)', borderColor: 'var(--error)', fontSize: '0.85rem' }}>
              Deactivate
            </button>
          )}
        </div>
      </div>

      {/* Quick stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Admissions', value: admissions.length, icon: <ClipboardList size={16} />, color: '#8B5CF6' },
          { label: 'Appointments', value: appointments.length, icon: <Calendar size={16} />, color: '#10B981' },
          { label: 'Total Billed', value: `₹${totalBilled.toLocaleString('en-IN')}`, icon: <Receipt size={16} />, color: '#F97316' },
          { label: 'Claims', value: claims.length, icon: <FileText size={16} />, color: '#3B82F6' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${stat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color, flexShrink: 0 }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ border: 'none', borderRadius: '5px', padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', background: activeTab === tab.key ? 'var(--accent-blue)' : 'transparent', color: activeTab === tab.key ? '#fff' : 'var(--text-muted)', transition: 'all 150ms', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span style={{ background: activeTab === tab.key ? 'rgba(255,255,255,0.25)' : 'var(--border)', color: activeTab === tab.key ? '#fff' : 'var(--text-muted)', borderRadius: '100px', padding: '0 5px', fontSize: '0.68rem', fontWeight: 700 }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div className="card">
            <h2 style={{ margin: '0 0 18px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Personal Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '18px' }}>
              <Field label="Age" value={patient.age ? `${patient.age} years` : undefined} />
              <Field label="Gender" value={patient.gender} />
              <Field label="Blood Group" value={patient.blood_group} />
              <Field label="Phone" value={patient.phone} />
              <Field label="Email" value={patient.email} />
              <Field label="Emergency Contact" value={patient.emergency_contact} />
            </div>
            {patient.address && <div style={{ marginTop: '16px' }}><Field label="Address" value={patient.address} /></div>}
          </div>
          <div className="card">
            <h2 style={{ margin: '0 0 18px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>Medical Information</h2>
            <div style={{ display: 'grid', gap: '16px' }}>
              <Field label="Known Allergies" value={patient.allergies} />
              <Field label="Medical History" value={patient.medical_history} />
            </div>
          </div>
          {activeAdmission && (
            <div className="card" style={{ border: '1px solid rgba(59,130,246,0.3)', background: 'linear-gradient(135deg, var(--bg-card), rgba(59,130,246,0.04))' }}>
              <h2 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <ClipboardList size={15} /> Current Admission
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px' }}>
                <Field label="Doctor" value={activeAdmission.doctor_name} />
                <Field label="Ward" value={activeAdmission.ward_name ? `${activeAdmission.ward_name} (${activeAdmission.ward_type})` : undefined} />
                <Field label="Bed" value={activeAdmission.bed_number} />
                <Field label="Diagnosis" value={activeAdmission.diagnosis} />
                <Field label="Admitted" value={new Date(activeAdmission.admission_date).toLocaleDateString()} />
                <Field label="Expected Discharge" value={activeAdmission.expected_discharge ? new Date(activeAdmission.expected_discharge).toLocaleDateString() : undefined} />
              </div>
              <div style={{ marginTop: '14px' }}>
                <button className="btn btn-secondary" onClick={() => handleDischarge(activeAdmission.id)} style={{ fontSize: '0.82rem' }}>
                  Discharge Patient
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Admissions Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'admissions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            {patient.is_active && !activeAdmission && (
              <button className="btn btn-primary" onClick={() => setShowAdmitForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Admit Patient
              </button>
            )}
          </div>
          {admissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <ClipboardList size={36} style={{ marginBottom: '10px', opacity: 0.35 }} />
              <p style={{ margin: 0 }}>No admissions on record.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {admissions.map((a: JourneyAdmission) => (
                <div key={a.id} className="card" style={{ padding: '16px 20px', borderLeft: `4px solid ${a.status === 'admitted' ? 'var(--accent-blue)' : 'var(--success)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {statusBadge(ADMISSION_STATUS, a.status)}
                        {a.diagnosis && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.diagnosis}</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Doctor</span><br />{a.doctor_name ?? '—'}</span>
                        <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Ward</span><br />{a.ward_name ?? '—'}{a.ward_type ? ` (${a.ward_type})` : ''}</span>
                        <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Bed</span><br />{a.bed_number ?? '—'}</span>
                        <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Admitted</span><br />{new Date(a.admission_date).toLocaleDateString()}</span>
                        {a.actual_discharge && <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Discharged</span><br />{new Date(a.actual_discharge).toLocaleDateString()}</span>}
                        {!a.actual_discharge && a.expected_discharge && <span><span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Expected Discharge</span><br />{new Date(a.expected_discharge).toLocaleDateString()}</span>}
                      </div>
                      {a.notes && <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{a.notes}</div>}
                    </div>
                    {a.status === 'admitted' && (
                      <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px', flexShrink: 0 }} onClick={() => handleDischarge(a.id)}>
                        Discharge
                      </button>
                    )}
                  </div>
                  {a.claim_id && (
                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                      <button onClick={() => navigate(`/claims/${a.claim_id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}>
                        <ExternalLink size={11} /> View linked claim #{a.claim_id}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Appointments Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'appointments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
            <button className="btn btn-primary" onClick={() => setShowApptForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> Book Appointment
            </button>
          </div>
          {appointments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <Calendar size={36} style={{ marginBottom: '10px', opacity: 0.35 }} />
              <p style={{ margin: 0 }}>No appointments yet.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
                    {['Date & Time', 'Type', 'Doctor', 'Reason', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((ap: JourneyAppointment) => (
                    <tr key={ap.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {new Date(ap.appointment_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{ap.appointment_type}</td>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {ap.doctor_name ?? '—'}
                        {ap.doctor_specialization && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ap.doctor_specialization}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ap.reason ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>{statusBadge(APPT_STATUS, ap.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Billing Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Total: <strong>₹{totalBilled.toLocaleString('en-IN')}</strong> · Paid: <strong style={{ color: 'var(--success)' }}>₹{totalPaid.toLocaleString('en-IN')}</strong> · Due: <strong style={{ color: 'var(--error)' }}>₹{(totalBilled - totalPaid).toLocaleString('en-IN')}</strong>
            </div>
            <button className="btn btn-primary" onClick={() => setShowInvoiceForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> New Invoice
            </button>
          </div>
          {invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <Receipt size={36} style={{ marginBottom: '10px', opacity: 0.35 }} />
              <p style={{ margin: 0 }}>No invoices yet.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
                    {['Invoice #', 'Date', 'Total', 'Paid', 'Balance', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv: JourneyInvoice) => {
                    const balance = inv.total - inv.paid_amount;
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem', fontWeight: 600 }}>₹{inv.total.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: 'var(--success)' }}>₹{inv.paid_amount.toLocaleString('en-IN')}</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.875rem', color: balance > 0 ? 'var(--error)' : 'var(--success)' }}>
                          {balance > 0 ? `₹${balance.toLocaleString('en-IN')}` : 'Settled'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{statusBadge(INVOICE_STATUS, inv.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Claims & Documents Tab ───────────────────────────────────────────── */}
      {activeTab === 'claims' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Claims matched by patient name. Upload new documents to create a claim.
            </p>
            <button className="btn btn-primary" onClick={() => navigate(`/upload?patient=${encodeURIComponent(patient.name)}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> New Claim
            </button>
          </div>
          {claims.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
              <FileText size={36} style={{ marginBottom: '10px', opacity: 0.35 }} />
              <p style={{ margin: 0, marginBottom: '12px' }}>No claims linked to this patient yet.</p>
              <button className="btn btn-primary" onClick={() => navigate(`/upload?patient=${encodeURIComponent(patient.name)}`)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Open Claim Module
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {claims.map((claim: JourneyClaim) => {
                const sc = CLAIM_STATUS[claim.status?.toLowerCase()] ?? { bg: 'var(--border)', color: 'var(--text-muted)' };
                return (
                  <div key={claim.id} className="card">
                    {/* Claim header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent-blue)', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                            #{String(claim.id).padStart(5, '0')}
                          </span>
                          {statusBadge(CLAIM_STATUS, claim.status)}
                          {claim.reviewer_decision && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: claim.reviewer_decision === 'approved' ? 'var(--success-bg)' : 'var(--error-bg)', color: claim.reviewer_decision === 'approved' ? 'var(--success)' : 'var(--error)', textTransform: 'capitalize' }}>
                              {claim.reviewer_decision === 'approved' ? <CheckCircle size={10} style={{ marginRight: '3px' }} /> : <AlertTriangle size={10} style={{ marginRight: '3px' }} />}
                              {claim.reviewer_decision}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {claim.policy_number && <span><Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Policy: {claim.policy_number}</span>}
                          {claim.fraud_risk_score != null && (
                            <span style={{ color: claim.fraud_risk_score > 60 ? 'var(--error)' : claim.fraud_risk_score > 30 ? '#d97706' : 'var(--success)' }}>
                              <Shield size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                              Risk: {claim.fraud_risk_score}/100
                            </span>
                          )}
                          <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/claims/${claim.id}`)} className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <ExternalLink size={12} /> Open Claim
                      </button>
                    </div>

                    {/* Documents */}
                    {claim.documents.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          Documents ({claim.documents.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {claim.documents.map((doc: JourneyClaimDocument) => (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-page)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                              <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_filename}</span>
                              <span style={{ fontSize: '0.65rem', background: 'var(--border)', color: 'var(--text-muted)', padding: '1px 5px', borderRadius: '4px', textTransform: 'capitalize' }}>
                                {doc.doc_type.replace(/_/g, ' ')}
                              </span>
                              <button
                                onClick={() => setPreviewDoc({ doc, claimId: claim.id })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', padding: '1px', flexShrink: 0 }}
                                title="Preview"
                              >
                                <Eye size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>Edit Patient</h2>
            <PatientForm initial={patient} onSubmit={handleUpdate} onCancel={() => setEditing(false)} loading={savingEdit} />
          </div>
        </div>
      )}

      {showAdmitForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>Admit {patient.name}</h2>
            <AdmissionForm initialPatientId={patientId} onSubmit={handleAdmit} onCancel={() => setShowAdmitForm(false)} loading={savingAdmit} />
          </div>
        </div>
      )}

      {showApptForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>Book Appointment for {patient.name}</h2>
            <AppointmentForm initialPatientId={patientId} onSubmit={handleBookAppt} onCancel={() => setShowApptForm(false)} loading={savingAppt} />
          </div>
        </div>
      )}

      {showInvoiceForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700 }}>New Invoice for {patient.name}</h2>
            <InvoiceForm initialPatientId={patientId} onSubmit={handleCreateInvoice} onCancel={() => setShowInvoiceForm(false)} loading={savingInvoice} />
          </div>
        </div>
      )}

      {previewDoc && (
        <DocPreviewModal doc={previewDoc.doc} claimId={previewDoc.claimId} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
