import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { DoctorCreate } from '../../types';

interface DoctorFormProps {
  initial?: Partial<DoctorCreate>;
  onSubmit: (data: DoctorCreate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const DEFAULT_DEPARTMENTS = [
  'Emergency Department',
  'General Medicine / Internal Medicine',
  'General Surgery',
  'Cardiology',
  'Cardiothoracic Surgery',
  'Neurology',
  'Neurosurgery',
  'Orthopedics',
  'Oncology',
  'Radiation Oncology',
  'Pediatrics',
  'Neonatology',
  'Gynecology & Obstetrics',
  'Urology',
  'Nephrology',
  'Gastroenterology',
  'Pulmonology / Respiratory Medicine',
  'Endocrinology',
  'Rheumatology',
  'Dermatology',
  'Ophthalmology',
  'ENT (Ear, Nose & Throat)',
  'Psychiatry & Mental Health',
  'Radiology & Imaging',
  'Pathology & Lab Medicine',
  'Anesthesiology',
  'Dentistry',
  'Physiotherapy & Rehabilitation',
  'Dietetics & Nutrition',
  'Other',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function DoctorForm({ initial = {}, onSubmit, onCancel, loading = false }: DoctorFormProps) {
  const [form, setForm] = useState<DoctorCreate>({
    name: initial.name ?? '',
    specialization: initial.specialization ?? '',
    qualification: initial.qualification ?? '',
    registration_number: initial.registration_number ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    department: initial.department ?? '',
    available_days: initial.available_days ?? '',
    consultation_fee: initial.consultation_fee,
  });
  const [customDept, setCustomDept] = useState(
    initial.department && !DEFAULT_DEPARTMENTS.includes(initial.department) ? initial.department : ''
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (field: keyof DoctorCreate, value: string | number | undefined) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleDeptChange = (val: string) => {
    if (val === 'Other') {
      set('department', customDept || 'Other');
    } else {
      set('department', val);
    }
  };

  const deptSelectValue = DEFAULT_DEPARTMENTS.includes(form.department ?? '')
    ? (form.department ?? '')
    : form.department ? 'Other' : '';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim()) { setSubmitError('Doctor name is required.'); return; }
    try {
      await onSubmit(form);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save doctor.');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {submitError && (
        <div className="validation-item validation-error">
          <span style={{ fontSize: '0.875rem' }}>{submitError}</span>
        </div>
      )}

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>
          Full Name <span style={{ color: 'var(--error)' }}>*</span>
        </label>
        <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dr. John Doe" required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Department</label>
          <select value={deptSelectValue} onChange={e => handleDeptChange(e.target.value)}>
            <option value="">Select department</option>
            {DEFAULT_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Specialization</label>
          <input type="text" value={form.specialization ?? ''} onChange={e => set('specialization', e.target.value)} placeholder="e.g. Interventional Cardiology" />
        </div>
      </div>

      {deptSelectValue === 'Other' && (
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Custom Department Name</label>
          <input
            type="text"
            value={customDept}
            onChange={e => { setCustomDept(e.target.value); set('department', e.target.value); }}
            placeholder="Enter department name"
          />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Qualification</label>
          <input type="text" value={form.qualification ?? ''} onChange={e => set('qualification', e.target.value)} placeholder="MBBS, MD, DM…" />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Registration No.</label>
          <input type="text" value={form.registration_number ?? ''} onChange={e => set('registration_number', e.target.value)} placeholder="MCI-12345" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Phone</label>
          <input type="text" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+91 9876543210" />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Email</label>
          <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="doctor@hospital.com" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Consultation Fee (₹)</label>
          <input
            type="number" min={0}
            value={form.consultation_fee ?? ''}
            onChange={e => set('consultation_fee', e.target.value ? Number(e.target.value) : undefined)}
            placeholder="500"
          />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Available Days</label>
          <select value={form.available_days ?? ''} onChange={e => set('available_days', e.target.value)}>
            <option value="">Select pattern</option>
            <option value="Mon-Fri">Mon–Fri</option>
            <option value="Mon-Sat">Mon–Sat</option>
            <option value="All Days">All Days</option>
            {DAYS.map(d => <option key={d} value={d}>{d} only</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Saving…' : 'Save Doctor'}
        </button>
      </div>
    </form>
  );
}
