import { useState, useEffect, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { patientsApi } from '../../patients/api/patientsApi';
import { doctorsApi } from '../../doctors/api/doctorsApi';
import { wardsApi } from '../../wards/api/wardsApi';
import type { AdmissionCreate, Patient, Doctor, Ward } from '../../types';

interface AdmissionFormProps {
  onSubmit: (data: AdmissionCreate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  initialPatientId?: number;
}

export default function AdmissionForm({ onSubmit, onCancel, loading = false, initialPatientId }: AdmissionFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);

  const [form, setForm] = useState<AdmissionCreate>({
    patient_id: initialPatientId ?? 0,
    doctor_id: 0,
    ward_id: undefined,
    diagnosis: '',
    bed_number: '',
    expected_discharge: '',
    notes: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([patientsApi.list(), doctorsApi.list(), wardsApi.list()]).then(([p, d, w]) => {
      setPatients(p.filter(x => x.is_active));
      setDoctors(d.filter(x => x.is_active));
      setWards(w);
    });
  }, []);

  const set = (field: keyof AdmissionCreate, value: string | number | undefined) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.patient_id) { setSubmitError('Patient is required.'); return; }
    if (!form.doctor_id) { setSubmitError('Doctor is required.'); return; }
    try {
      await onSubmit({ ...form, ward_id: form.ward_id || undefined });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create admission.';
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>
            Patient <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <select value={form.patient_id || ''} onChange={e => set('patient_id', Number(e.target.value))} required>
            <option value="">Select patient</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>
            Doctor <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <select value={form.doctor_id || ''} onChange={e => set('doctor_id', Number(e.target.value))} required>
            <option value="">Select doctor</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{d.name}{d.specialization ? ` (${d.specialization})` : ''}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Ward</label>
          <select value={form.ward_id ?? ''} onChange={e => set('ward_id', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">No ward assigned</option>
            {wards.map(w => <option key={w.id} value={w.id}>{w.name} ({w.ward_type}) — {w.available_beds} beds</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Bed Number</label>
          <input type="text" value={form.bed_number ?? ''} onChange={e => set('bed_number', e.target.value)} placeholder="e.g. B-12" />
        </div>
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Diagnosis</label>
        <input type="text" value={form.diagnosis ?? ''} onChange={e => set('diagnosis', e.target.value)} placeholder="Primary diagnosis" />
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Expected Discharge</label>
        <input type="date" value={form.expected_discharge ?? ''} onChange={e => set('expected_discharge', e.target.value)} />
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Notes</label>
        <textarea rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder="Additional notes" style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Admitting…' : 'Admit Patient'}
        </button>
      </div>
    </form>
  );
}
