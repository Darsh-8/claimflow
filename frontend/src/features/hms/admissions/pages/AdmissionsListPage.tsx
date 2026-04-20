import { useState, useEffect } from 'react';
import { Plus, Loader2, ClipboardList, Search } from 'lucide-react';
import { toast } from 'sonner';
import { admissionsApi } from '../api/admissionsApi';
import AdmissionForm from '../components/AdmissionForm';
import { SearchInput } from '../../../components/SearchInput';
import { EmptyState } from '../../../components/EmptyState';
import type { Admission, AdmissionCreate } from '../../types';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  admitted: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  discharged: { bg: 'var(--success-bg)', color: 'var(--success)' },
};

function statusBadge(status: string) {
  const s = STATUS_STYLE[status?.toLowerCase()] ?? { bg: 'var(--border)', color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: s.bg, color: s.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function fmt(dt?: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdmissionsListPage() {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const fetchAdmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      setAdmissions(await admissionsApi.list({ status: statusFilter || undefined }));
    } catch {
      setError('Failed to load admissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmissions(); }, [statusFilter]);

  const filtered = admissions.filter(a => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.patient_name?.toLowerCase().includes(q) ||
      a.doctor_name?.toLowerCase().includes(q) ||
      a.diagnosis?.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (data: AdmissionCreate) => {
    setSaving(true);
    try {
      await admissionsApi.create(data);
      setShowForm(false);
      fetchAdmissions();
      toast.success('Patient admitted successfully.');
    } catch {
      toast.error('Failed to create admission.');
    } finally {
      setSaving(false);
    }
  };

  const handleDischarge = async (admission: Admission) => {
    if (!confirm(`Discharge patient "${admission.patient_name}"?`)) return;
    try {
      await admissionsApi.discharge(admission.id);
      fetchAdmissions();
      toast.success('Patient discharged.');
    } catch {
      toast.error('Failed to discharge patient.');
    }
  };

  const currentlyAdmitted = admissions.filter(a => a.status === 'admitted').length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Admissions</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {currentlyAdmitted} currently admitted
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Admit Patient
        </button>
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Admit New Patient</h2>
            <AdmissionForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search patient, doctor, diagnosis…" />
        <div style={{ display: 'flex', gap: '6px' }}>
          {[{ v: '', label: 'All' }, { v: 'admitted', label: 'Admitted' }, { v: 'discharged', label: 'Discharged' }].map(opt => (
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
        <EmptyState icon={ClipboardList} message="No admissions found." />
      )}

      {!loading && filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                {['Patient', 'Doctor', 'Ward / Bed', 'Diagnosis', 'Admitted', 'Expected Discharge', 'Status', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{a.patient_name ?? `#${a.patient_id}`}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{a.doctor_name ?? `#${a.doctor_id}`}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {a.bed_number ? `Bed ${a.bed_number}` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.diagnosis || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmt(a.admission_date)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmt(a.expected_discharge)}</td>
                  <td>{statusBadge(a.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {a.status === 'admitted' && (
                      <button
                        onClick={() => handleDischarge(a)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                      >
                        Discharge
                      </button>
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
