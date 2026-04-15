import { useState, useEffect } from 'react';
import { Plus, Loader2, BedDouble, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { wardsApi } from '../api/wardsApi';
import type { Ward, WardCreate } from '../../types';

const WARD_TYPES = ['General', 'Private', 'Semi-Private', 'ICU', 'NICU', 'Emergency', 'Pediatric', 'Maternity'];

function WardForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial?: Ward;
  onSubmit: (data: WardCreate) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<WardCreate>({
    name: initial?.name ?? '',
    ward_type: initial?.ward_type ?? 'General',
    total_beds: initial?.total_beds ?? 10,
    available_beds: initial?.available_beds ?? 10,
    floor: initial?.floor ?? '',
    description: initial?.description ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  const set = (field: keyof WardCreate, value: string | number) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim()) { setErr('Ward name is required.'); return; }
    if (form.available_beds > form.total_beds) { setErr('Available beds cannot exceed total beds.'); return; }
    try {
      await onSubmit(form);
    } catch {
      setErr('Failed to save ward.');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {err && <div className="validation-item validation-error"><span>{err}</span></div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Ward Name <span style={{ color: 'var(--error)' }}>*</span></label>
          <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ward A" required />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Type</label>
          <select value={form.ward_type} onChange={e => set('ward_type', e.target.value)}>
            {WARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Total Beds</label>
          <input type="number" min={1} value={form.total_beds} onChange={e => set('total_beds', Number(e.target.value))} />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Available Beds</label>
          <input type="number" min={0} value={form.available_beds} onChange={e => set('available_beds', Number(e.target.value))} />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Floor</label>
          <input type="text" value={form.floor ?? ''} onChange={e => set('floor', e.target.value)} placeholder="e.g. 2nd Floor" />
        </div>
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Description</label>
        <textarea rows={2} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Optional notes about this ward" style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Saving…' : initial ? 'Save Changes' : 'Add Ward'}
        </button>
      </div>
    </form>
  );
}

export default function WardsListPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editWard, setEditWard] = useState<Ward | null>(null);

  const fetchWards = async () => {
    setLoading(true);
    setError(null);
    try {
      setWards(await wardsApi.list());
    } catch {
      setError('Failed to load wards.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWards(); }, []);

  const handleCreate = async (data: WardCreate) => {
    setSaving(true);
    try {
      await wardsApi.create(data);
      setShowForm(false);
      fetchWards();
      toast.success('Ward added.');
    } catch {
      toast.error('Failed to add ward.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: WardCreate) => {
    if (!editWard) return;
    setSaving(true);
    try {
      await wardsApi.update(editWard.id, data);
      setEditWard(null);
      fetchWards();
      toast.success('Ward updated.');
    } catch {
      toast.error('Failed to update ward.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ward: Ward) => {
    if (!confirm(`Delete ward "${ward.name}"? This cannot be undone.`)) return;
    try {
      await wardsApi.delete(ward.id);
      fetchWards();
      toast.success('Ward deleted.');
    } catch {
      toast.error('Failed to delete ward.');
    }
  };

  const WARD_TYPE_COLORS: Record<string, string> = {
    ICU: '#EF4444', NICU: '#DC2626', Emergency: '#F97316',
    Maternity: '#EC4899', Pediatric: '#10B981', Private: '#3B82F6',
    'Semi-Private': '#6366F1', General: '#64748B',
  };
  const typeColor = (t: string) => WARD_TYPE_COLORS[t] ?? '#64748B';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Wards</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {wards.length} ward{wards.length !== 1 ? 's' : ''} · {wards.reduce((s, w) => s + w.available_beds, 0)} beds available
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Ward
        </button>
      </div>

      {(showForm || editWard) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {editWard ? 'Edit Ward' : 'Add New Ward'}
            </h2>
            <WardForm
              initial={editWard ?? undefined}
              onSubmit={editWard ? handleUpdate : handleCreate}
              onCancel={() => { setShowForm(false); setEditWard(null); }}
              loading={saving}
            />
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      )}
      {error && <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {!loading && !error && wards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <BedDouble size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No wards yet. Add one to start tracking bed availability.</p>
        </div>
      )}

      {!loading && wards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {wards.map(w => {
            const occupancy = w.total_beds > 0 ? Math.round(((w.total_beds - w.available_beds) / w.total_beds) * 100) : 0;
            return (
              <div key={w.id} className="card" style={{ borderTop: `3px solid ${typeColor(w.ward_type)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{w.name}</div>
                    <div style={{ fontSize: '0.75rem', color: typeColor(w.ward_type), fontWeight: 600, marginTop: '2px' }}>{w.ward_type}</div>
                    {w.floor && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>{w.floor}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setEditWard(w)} className="btn-icon" title="Edit"><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(w)} className="btn-icon" title="Delete" style={{ color: 'var(--error)' }}><Trash2 size={13} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{w.total_beds}</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)' }}>{w.available_beds}</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Free</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: occupancy > 80 ? 'var(--error)' : 'var(--text-primary)' }}>{occupancy}%</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Occupied</div>
                  </div>
                </div>

                <div style={{ background: 'var(--border)', borderRadius: '100px', height: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${occupancy}%`, height: '100%', background: occupancy > 80 ? 'var(--error)' : occupancy > 60 ? '#f59e0b' : 'var(--success)', borderRadius: '100px', transition: 'width 300ms' }} />
                </div>

                {w.description && (
                  <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{w.description}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
