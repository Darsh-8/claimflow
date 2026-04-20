import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Loader2, Stethoscope, Phone, Mail, X, Edit2, IndianRupee, Calendar, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useDoctors } from '../hooks/useDoctors';
import { doctorsApi } from '../api/doctorsApi';
import DoctorForm from '../components/DoctorForm';
import type { Doctor, DoctorCreate } from '../../types';

const DEPT_COLORS: Record<string, string> = {
  'Cardiology': '#EF4444',
  'Cardiothoracic Surgery': '#DC2626',
  'Emergency Department': '#F97316',
  'Neurology': '#8B5CF6',
  'Neurosurgery': '#7C3AED',
  'Oncology': '#EC4899',
  'Pediatrics': '#10B981',
  'Gynecology & Obstetrics': '#F59E0B',
  'Orthopedics': '#3B82F6',
  'General Surgery': '#06B6D4',
  'General Medicine / Internal Medicine': '#6366F1',
};
const deptColor = (dept?: string) => DEPT_COLORS[dept ?? ''] ?? '#64748B';

// Build the department list from existing doctors + defaults
const ALL_FILTER = 'All';

function DoctorQuickView({
  doctor,
  onClose,
  onEdit,
  onDeactivate,
}: {
  doctor: Doctor;
  onClose: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
}) {
  return createPortal(
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', width: '100%', maxWidth: '480px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        {/* Header strip */}
        <div style={{ background: deptColor(doctor.department), padding: '24px 24px 20px', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: '14px', right: '14px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', padding: '4px' }}>
            <X size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.3rem', flexShrink: 0 }}>
              {doctor.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff' }}>{doctor.name}</div>
              {doctor.specialization && <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', marginTop: '2px' }}>{doctor.specialization}</div>}
              {doctor.department && <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>{doctor.department}</div>}
            </div>
          </div>
          <span style={{ marginTop: '12px', display: 'inline-block', fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: '100px', background: doctor.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
            {doctor.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Details */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {[
              { icon: <BadgeCheck size={14} />, label: 'Qualification', value: doctor.qualification },
              { icon: <BadgeCheck size={14} />, label: 'Reg. No.', value: doctor.registration_number },
              { icon: <Phone size={14} />, label: 'Phone', value: doctor.phone },
              { icon: <Mail size={14} />, label: 'Email', value: doctor.email },
              { icon: <IndianRupee size={14} />, label: 'Consult Fee', value: doctor.consultation_fee ? `₹${doctor.consultation_fee}` : undefined },
              { icon: <Calendar size={14} />, label: 'Available', value: doctor.available_days },
            ].map(row => (
              <div key={row.label}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                  {row.icon} {row.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: row.value ? 'var(--text-primary)' : 'var(--text-muted)' }}>{row.value ?? '—'}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
            {doctor.is_active && (
              <button className="btn btn-primary" onClick={onEdit} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Edit2 size={14} /> Edit Doctor
              </button>
            )}
            {doctor.is_active && (
              <button className="btn btn-secondary" onClick={onDeactivate} style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>
                Deactivate
              </button>
            )}
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function DoctorsListPage() {
  const { doctors, loading, error, refetch, search, setSearch } = useDoctors();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quickView, setQuickView] = useState<Doctor | null>(null);
  const [editDoctor, setEditDoctor] = useState<Doctor | null>(null);
  const [deptFilter, setDeptFilter] = useState(ALL_FILTER);

  // Collect departments that actually exist in the current doctor list
  const existingDepts = Array.from(new Set(doctors.map(d => d.department).filter(Boolean))) as string[];
  const filterDepts = [ALL_FILTER, ...existingDepts];

  const filtered = deptFilter === ALL_FILTER
    ? doctors
    : doctors.filter(d => d.department === deptFilter);

  const handleCreate = async (data: DoctorCreate) => {
    setSaving(true);
    try {
      await doctorsApi.create(data);
      setShowForm(false);
      refetch();
      toast.success('Doctor added successfully.');
    } catch {
      toast.error('Failed to add doctor.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: DoctorCreate) => {
    if (!editDoctor) return;
    setSaving(true);
    try {
      await doctorsApi.update(editDoctor.id, data);
      setEditDoctor(null);
      setQuickView(null);
      refetch();
      toast.success('Doctor updated.');
    } catch {
      toast.error('Failed to update doctor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (doctor: Doctor) => {
    if (!confirm(`Deactivate Dr. ${doctor.name}?`)) return;
    try {
      await doctorsApi.deactivate(doctor.id);
      setQuickView(null);
      refetch();
      toast.success('Doctor deactivated.');
    } catch {
      toast.error('Failed to deactivate doctor.');
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Doctors</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {doctors.length} doctor{doctors.length !== 1 ? 's' : ''} · {doctors.filter(d => d.is_active).length} active
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Doctor
        </button>
      </div>

      {/* Add Doctor Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Add New Doctor</h2>
            <DoctorForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        </div>
      )}

      {/* Edit Doctor Modal */}
      {editDoctor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Doctor</h2>
            <DoctorForm initial={editDoctor} onSubmit={handleUpdate} onCancel={() => setEditDoctor(null)} loading={saving} />
          </div>
        </div>
      )}

      {/* Quick-view popup */}
      {quickView && (
        <DoctorQuickView
          doctor={quickView}
          onClose={() => setQuickView(null)}
          onEdit={() => { setEditDoctor(quickView); setQuickView(null); }}
          onDeactivate={() => handleDeactivate(quickView)}
        />
      )}

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', marginBottom: '12px' }}>
        <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input type="text" placeholder="Search by name, specialization, department…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }} />
      </div>

      {/* Department filter pills */}
      {filterDepts.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {filterDepts.map(dept => (
            <button
              key={dept}
              onClick={() => setDeptFilter(dept)}
              style={{
                border: 'none', borderRadius: '100px', padding: '4px 12px',
                fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                background: deptFilter === dept ? 'var(--accent-blue)' : 'var(--border)',
                color: deptFilter === dept ? '#fff' : 'var(--text-secondary)',
                transition: 'all 150ms',
              }}
            >
              {dept}
              {dept !== ALL_FILTER && (
                <span style={{ marginLeft: '5px', opacity: 0.7 }}>
                  {doctors.filter(d => d.department === dept).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}
      {error && <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Stethoscope size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ margin: 0 }}>{search ? 'No doctors match your search.' : 'No doctors yet.'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {filtered.map(d => (
            <div
              key={d.id}
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => setQuickView(d)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setQuickView(d); }}
              style={{ padding: '16px', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms', borderTop: `3px solid ${deptColor(d.department)}` }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: deptColor(d.department), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                  {d.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>{d.name}</div>
                  {d.specialization && <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 600 }}>{d.specialization}</div>}
                  {d.department && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px' }}>{d.department}</div>}
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '100px', background: d.is_active ? 'var(--success-bg)' : 'var(--error-bg)', color: d.is_active ? 'var(--success)' : 'var(--error)', flexShrink: 0 }}>
                  {d.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {(d.phone || d.consultation_fee || d.available_days) && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {d.phone && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={11} />{d.phone}</span>}
                  {d.consultation_fee && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}><IndianRupee size={11} />{d.consultation_fee}</span>}
                  {d.available_days && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={11} />{d.available_days}</span>}
                </div>
              )}
              <div style={{ marginTop: '10px', fontSize: '0.72rem', color: 'var(--accent-blue)', textAlign: 'right' }}>Click to view details →</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
