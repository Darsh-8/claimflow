import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import type { Patient, PatientCreate } from '../../types';

interface PatientFormProps {
  initial?: Patient;
  onSubmit: (data: PatientCreate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

export default function PatientForm({ initial, onSubmit, onCancel, loading = false }: PatientFormProps) {
  const [form, setForm] = useState<PatientCreate>({
    name: initial?.name ?? '',
    age: initial?.age,
    gender: initial?.gender ?? '',
    blood_group: initial?.blood_group ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    emergency_contact: initial?.emergency_contact ?? '',
    allergies: initial?.allergies ?? '',
    medical_history: initial?.medical_history ?? '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (field: keyof PatientCreate, value: string | number | undefined) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.name.trim()) { setSubmitError('Patient name is required.'); return; }
    try {
      await onSubmit({ ...form, age: form.age || undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save patient.';
      setSubmitError(msg);
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
        <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Patient full name" required />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Age</label>
          <input type="number" min={0} max={150} value={form.age ?? ''} onChange={e => set('age', e.target.value ? Number(e.target.value) : undefined)} placeholder="Years" />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Gender</label>
          <select value={form.gender ?? ''} onChange={e => set('gender', e.target.value)}>
            <option value="">Select</option>
            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Blood Group</label>
          <select value={form.blood_group ?? ''} onChange={e => set('blood_group', e.target.value)}>
            <option value="">Select</option>
            {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Phone</label>
          <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Email</label>
          <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="patient@example.com" />
        </div>
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Address</label>
        <input type="text" value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="Full address" />
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Emergency Contact</label>
        <input type="text" value={form.emergency_contact ?? ''} onChange={e => set('emergency_contact', e.target.value)} placeholder="Name — Phone" />
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Known Allergies</label>
        <input type="text" value={form.allergies ?? ''} onChange={e => set('allergies', e.target.value)} placeholder="e.g. Penicillin, Sulfa" />
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Medical History</label>
        <textarea rows={3} value={form.medical_history ?? ''} onChange={e => set('medical_history', e.target.value)} placeholder="Past conditions, surgeries, chronic illnesses…" style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Saving…' : initial ? 'Save Changes' : 'Register Patient'}
        </button>
      </div>
    </form>
  );
}
