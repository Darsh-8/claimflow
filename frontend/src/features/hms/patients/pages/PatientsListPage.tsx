import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Loader2, UserX, Filter, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePatients } from '../hooks/usePatients';
import { patientsApi } from '../api/patientsApi';
import PatientForm from '../components/PatientForm';
import { SearchInput } from '../../../components/SearchInput';
import { EmptyState } from '../../../components/EmptyState';
import type { PatientCreate } from '../../types';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['Male', 'Female', 'Other'];

export default function PatientsListPage() {
  const navigate = useNavigate();
  const { patients, loading, error, refetch, search, setSearch } = usePatients();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterGender, setFilterGender] = useState('');
  const [filterBloodGroup, setFilterBloodGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState('active'); // 'active' | 'inactive' | ''

  const hasActiveFilters = filterGender || filterBloodGroup || filterStatus !== 'active';

  const filtered = useMemo(() => {
    return patients.filter(p => {
      if (filterGender && p.gender !== filterGender) return false;
      if (filterBloodGroup && p.blood_group !== filterBloodGroup) return false;
      if (filterStatus === 'active' && !p.is_active) return false;
      if (filterStatus === 'inactive' && p.is_active) return false;
      return true;
    });
  }, [patients, filterGender, filterBloodGroup, filterStatus]);

  const clearFilters = () => {
    setFilterGender('');
    setFilterBloodGroup('');
    setFilterStatus('active');
  };

  const handleCreate = async (data: PatientCreate) => {
    setSaving(true);
    try {
      const patient = await patientsApi.create(data);
      setShowForm(false);
      refetch();
      toast.success(`Patient "${patient.name}" registered successfully.`);
    } catch {
      toast.error('Failed to register patient. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Patients</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {filtered.length} patient{filtered.length !== 1 ? 's' : ''}
            {hasActiveFilters && <span style={{ color: 'var(--accent-blue)', marginLeft: '6px' }}>· filtered</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowFilters(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}
          >
            <Filter size={15} /> Filters
            {hasActiveFilters && (
              <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--accent-blue)', borderRadius: '50%' }} />
            )}
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> New Patient
          </button>
        </div>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Register New Patient</h2>
            <PatientForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div style={{ marginBottom: '10px' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, phone, email…" />
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card" style={{ marginBottom: '14px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Filter Patients</span>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Status */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>Status</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{ v: '', label: 'All' }, { v: 'active', label: 'Active' }, { v: 'inactive', label: 'Inactive' }].map(opt => (
                  <button key={opt.v} onClick={() => setFilterStatus(opt.v)}
                    style={{ border: 'none', borderRadius: '100px', padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: filterStatus === opt.v ? 'var(--accent-blue)' : 'var(--border)', color: filterStatus === opt.v ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gender */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>Gender</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[{ v: '', label: 'All' }, ...GENDERS.map(g => ({ v: g, label: g }))].map(opt => (
                  <button key={opt.v} onClick={() => setFilterGender(opt.v)}
                    style={{ border: 'none', borderRadius: '100px', padding: '4px 12px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: filterGender === opt.v ? 'var(--accent-blue)' : 'var(--border)', color: filterGender === opt.v ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Blood Group */}
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>Blood Group</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[{ v: '', label: 'All' }, ...BLOOD_GROUPS.map(bg => ({ v: bg, label: bg }))].map(opt => (
                  <button key={opt.v} onClick={() => setFilterBloodGroup(opt.v)}
                    style={{ border: 'none', borderRadius: '100px', padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: filterBloodGroup === opt.v ? 'var(--accent-blue)' : 'var(--border)', color: filterBloodGroup === opt.v ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}
      {error && <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={UserX} message={search || hasActiveFilters ? 'No patients match your filters.' : 'No patients yet. Register one to get started.'} />
      )}

      {!loading && filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                {['Name', 'Age / Gender', 'Blood Group', 'Phone', 'Email', 'Status', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => navigate(`/hms/patients/${p.id}`)}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {p.age ? `${p.age} yrs` : '—'}{p.gender ? ` · ${p.gender}` : ''}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {p.blood_group
                      ? <span style={{ background: 'var(--error-bg)', color: 'var(--error)', padding: '2px 7px', borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem' }}>{p.blood_group}</span>
                      : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.phone || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.email || '—'}</td>
                  <td>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: p.is_active ? 'var(--success-bg)' : 'var(--error-bg)', color: p.is_active ? 'var(--success)' : 'var(--error)' }}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)' }}>View →</span>
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
