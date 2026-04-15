import { useState, useEffect } from 'react';
import { Plus, Loader2, Calendar, Search } from 'lucide-react';
import { toast } from 'sonner';
import { appointmentsApi } from '../api/appointmentsApi';
import AppointmentForm from '../components/AppointmentForm';
import type { Appointment, AppointmentCreate } from '../../types';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  completed: { bg: 'var(--success-bg)', color: 'var(--success)' },
  cancelled: { bg: 'var(--error-bg)', color: 'var(--error)' },
  no_show: { bg: '#fef3c7', color: '#d97706' },
};

function statusBadge(status: string) {
  const s = STATUS_STYLE[status?.toLowerCase()] ?? { bg: 'var(--border)', color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: s.bg, color: s.color, textTransform: 'capitalize' }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDateTime(dt: string) {
  return new Date(dt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AppointmentsListPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const fetchAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      setAppointments(await appointmentsApi.list({ status: statusFilter || undefined }));
    } catch {
      setError('Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, [statusFilter]);

  const filtered = appointments.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.patient_name?.toLowerCase().includes(q) ||
      a.doctor_name?.toLowerCase().includes(q) ||
      a.reason?.toLowerCase().includes(q) ||
      a.appointment_type.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (data: AppointmentCreate) => {
    setSaving(true);
    try {
      await appointmentsApi.create(data);
      setShowForm(false);
      fetchAppointments();
      toast.success('Appointment booked.');
    } catch {
      toast.error('Failed to book appointment.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (appt: Appointment) => {
    try {
      await appointmentsApi.complete(appt.id);
      fetchAppointments();
      toast.success('Appointment marked as completed.');
    } catch {
      toast.error('Failed to update appointment.');
    }
  };

  const handleCancel = async (appt: Appointment) => {
    if (!confirm(`Cancel appointment for "${appt.patient_name}"?`)) return;
    try {
      await appointmentsApi.cancel(appt.id);
      fetchAppointments();
      toast.success('Appointment cancelled.');
    } catch {
      toast.error('Failed to cancel appointment.');
    }
  };

  const todayCount = appointments.filter(a => {
    const d = new Date(a.appointment_date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Appointments</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {todayCount} appointment{todayCount !== 1 ? 's' : ''} today
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Book Appointment
        </button>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Book Appointment</h2>
            <AppointmentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input type="text" placeholder="Search patient, doctor, reason…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[{ v: '', label: 'All' }, { v: 'scheduled', label: 'Scheduled' }, { v: 'completed', label: 'Completed' }, { v: 'cancelled', label: 'Cancelled' }].map(opt => (
            <button key={opt.v} onClick={() => setStatusFilter(opt.v)}
              style={{ border: 'none', borderRadius: '100px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: statusFilter === opt.v ? 'var(--accent-blue)' : 'var(--border)', color: statusFilter === opt.v ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      )}
      {error && <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Calendar size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No appointments found.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
                {['Patient', 'Doctor', 'Date & Time', 'Type', 'Reason', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-page)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{a.patient_name ?? `#${a.patient_id}`}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{a.doctor_name ?? `#${a.doctor_id}`}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtDateTime(a.appointment_date)}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{a.appointment_type}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.reason || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>{statusBadge(a.status)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {a.status === 'scheduled' && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => handleComplete(a)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 8px', color: 'var(--success)', borderColor: 'var(--success)' }}>Complete</button>
                        <button onClick={() => handleCancel(a)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 8px', color: 'var(--error)', borderColor: 'var(--error)' }}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
