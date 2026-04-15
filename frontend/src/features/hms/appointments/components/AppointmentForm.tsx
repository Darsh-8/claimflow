import { useState, useEffect, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { patientsApi } from '../../patients/api/patientsApi';
import { doctorsApi } from '../../doctors/api/doctorsApi';
import type { AppointmentCreate, Patient, Doctor } from '../../types';

interface AppointmentFormProps {
  onSubmit: (data: AppointmentCreate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  initialPatientId?: number;
}

const APPOINTMENT_TYPES = ['Consultation', 'Follow-up', 'Emergency', 'Procedure', 'Lab', 'Imaging'];

export default function AppointmentForm({ onSubmit, onCancel, loading = false, initialPatientId }: AppointmentFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [form, setForm] = useState<AppointmentCreate>({
    patient_id: initialPatientId ?? 0,
    doctor_id: 0,
    appointment_date: '',
    appointment_type: 'Consultation',
    reason: '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([patientsApi.list(), doctorsApi.list()]).then(([p, d]) => {
      setPatients(p.filter(x => x.is_active));
      setDoctors(d.filter(x => x.is_active));
    });
  }, []);

  const set = (field: keyof AppointmentCreate, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.patient_id) { setSubmitError('Patient is required.'); return; }
    if (!form.doctor_id) { setSubmitError('Doctor is required.'); return; }
    if (!form.appointment_date) { setSubmitError('Appointment date/time is required.'); return; }
    try {
      await onSubmit(form);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to book appointment.';
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
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>
            Date & Time <span style={{ color: 'var(--error)' }}>*</span>
          </label>
          <input type="datetime-local" value={form.appointment_date} onChange={e => set('appointment_date', e.target.value)} required />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Type</label>
          <select value={form.appointment_type ?? ''} onChange={e => set('appointment_type', e.target.value)}>
            {APPOINTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Reason</label>
        <textarea rows={2} value={form.reason ?? ''} onChange={e => set('reason', e.target.value)} placeholder="Reason for visit" style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Booking…' : 'Book Appointment'}
        </button>
      </div>
    </form>
  );
}
