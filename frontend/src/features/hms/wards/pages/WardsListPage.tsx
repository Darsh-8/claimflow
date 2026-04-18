import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, BedDouble, Edit2, Trash2, Search, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { wardsApi } from '../api/wardsApi';
import type { Ward, WardCreate } from '../../types';

const WARD_TYPES = ['General', 'Private', 'Semi-Private', 'ICU', 'NICU', 'Emergency', 'Pediatric', 'Maternity'];

const WARD_TYPE_META: Record<string, { color: string; bg: string; border: string }> = {
  ICU:          { color: '#EF4444', bg: '#FEF2F2', border: '#FCA5A5' },
  NICU:         { color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3' },
  Emergency:    { color: '#F97316', bg: '#FFF7ED', border: '#FED7AA' },
  Maternity:    { color: '#EC4899', bg: '#FDF2F8', border: '#FBCFE8' },
  Pediatric:    { color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  Private:      { color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  'Semi-Private':{ color: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE' },
  General:      { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
};

function typeMeta(t: string) {
  return WARD_TYPE_META[t] ?? WARD_TYPE_META['General'];
}

// Circular occupancy ring
function OccupancyRing({ pct, color }: { pct: number; color: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" style={{ display: 'block' }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
      <circle
        cx={32} cy={32} r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: 'stroke-dasharray 600ms cubic-bezier(.4,0,.2,1)' }}
      />
      <text x={32} y={36} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// Ward form modal
function WardFormModal({
  initial, onSubmit, onClose, loading,
}: {
  initial?: Ward;
  onSubmit: (data: WardCreate) => Promise<void>;
  onClose: () => void;
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
    try { await onSubmit(form); } catch { setErr('Failed to save ward.'); }
  };

  const meta = typeMeta(form.ward_type);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', padding: '0', width: '100%', maxWidth: '560px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'scaleIn 180ms ease' }}>
        {/* Modal header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid var(--border)', background: meta.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BedDouble size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {initial ? `Edit  ${initial.name}` : 'Add New Ward'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {initial ? 'Update ward details below' : 'Fill in the details for your new ward'}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {err && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', fontSize: '0.83rem', borderLeft: '3px solid var(--error)' }}>
              <AlertTriangle size={14} /> {err}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ward Name <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ward A" required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ward Type
              </label>
              <select value={form.ward_type} onChange={e => set('ward_type', e.target.value)}>
                {WARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Beds</label>
              <input type="number" min={1} value={form.total_beds} onChange={e => set('total_beds', Number(e.target.value))} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Available</label>
              <input type="number" min={0} value={form.available_beds} onChange={e => set('available_beds', Number(e.target.value))} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Floor</label>
              <input type="text" value={form.floor ?? ''} onChange={e => set('floor', e.target.value)} placeholder="2nd Floor" />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Description</label>
            <textarea rows={2} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Optional notes about this ward" style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ minWidth: '120px' }}>
              {loading ? <><Loader2 size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving…</> : initial ? 'Save Changes' : 'Add Ward'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Ward card
function WardCard({ ward, onEdit, onDelete }: { ward: Ward; onEdit: () => void; onDelete: () => void }) {
  const occupied = ward.total_beds - ward.available_beds;
  const pct = ward.total_beds > 0 ? Math.round((occupied / ward.total_beds) * 100) : 0;
  const meta = typeMeta(ward.ward_type);
  const ringColor = pct > 80 ? 'var(--error)' : pct > 60 ? 'var(--warning)' : 'var(--success)';
  const barColor = pct > 80 ? 'var(--error)' : pct > 60 ? 'var(--warning)' : 'var(--success)';

  return (
    <div
      className="card"
      style={{
        padding: '20px',
        borderTop: `3px solid ${meta.color}`,
        transition: 'box-shadow 200ms ease, transform 200ms ease',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '';
        (e.currentTarget as HTMLElement).style.transform = '';
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ward.name}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '100px', fontSize: '0.72rem', fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
            {ward.ward_type}
          </span>
          {ward.floor && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>📍 {ward.floor}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
          <button onClick={onEdit} className="btn-icon" title="Edit" style={{ padding: '6px' }}><Edit2 size={13} /></button>
          <button onClick={onDelete} className="btn-icon" title="Delete" style={{ padding: '6px', color: 'var(--error)', borderColor: '#FCA5A5' }}><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <OccupancyRing pct={pct} color={ringColor} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{ward.total_beds}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.05em' }}>Total</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1 }}>{ward.available_beds}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.05em' }}>Free</div>
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: pct > 80 ? 'var(--error)' : 'var(--text-primary)', lineHeight: 1 }}>{occupied}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '2px', letterSpacing: '0.05em' }}>Occupied</div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ background: 'var(--border)', borderRadius: '100px', height: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '100px', transition: 'width 500ms cubic-bezier(.4,0,.2,1)' }} />
          </div>
        </div>
      </div>

      {/* Status chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '2px', borderTop: '1px solid var(--border-subtle)' }}>
        {ward.available_beds === 0 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem', fontWeight: 600, color: 'var(--error)' }}>
            <AlertTriangle size={12} /> Full
          </span>
        ) : pct > 80 ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem', fontWeight: 600, color: 'var(--warning)' }}>
            <Activity size={12} /> Near Capacity
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.73rem', fontWeight: 600, color: 'var(--success)' }}>
            <CheckCircle size={12} /> Beds Available
          </span>
        )}
        {ward.description && (
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={ward.description}>
            {ward.description}
          </span>
        )}
      </div>
    </div>
  );
}

export default function WardsListPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editWard, setEditWard] = useState<Ward | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  const fetchWards = async () => {
    setLoading(true); setError(null);
    try { setWards(await wardsApi.list()); }
    catch { setError('Failed to load wards.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchWards(); }, []);

  const handleCreate = async (data: WardCreate) => {
    setSaving(true);
    try { await wardsApi.create(data); setShowForm(false); fetchWards(); toast.success('Ward added.'); }
    catch { toast.error('Failed to add ward.'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (data: WardCreate) => {
    if (!editWard) return; setSaving(true);
    try { await wardsApi.update(editWard.id, data); setEditWard(null); fetchWards(); toast.success('Ward updated.'); }
    catch { toast.error('Failed to update ward.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (ward: Ward) => {
    if (!confirm(`Delete ward "${ward.name}"? This cannot be undone.`)) return;
    try { await wardsApi.delete(ward.id); fetchWards(); toast.success('Ward deleted.'); }
    catch { toast.error('Failed to delete ward.'); }
  };

  // Summary stats
  const totalBeds = wards.reduce((s, w) => s + w.total_beds, 0);
  const totalFree  = wards.reduce((s, w) => s + w.available_beds, 0);
  const totalOccupied = totalBeds - totalFree;
  const overallPct = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;
  const criticalWards = wards.filter(w => w.total_beds > 0 && ((w.total_beds - w.available_beds) / w.total_beds) > 0.8).length;

  // Filtered list
  const filtered = useMemo(() => {
    let list = wards;
    if (typeFilter !== 'All') list = list.filter(w => w.ward_type === typeFilter);
    if (search.trim()) list = list.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || w.ward_type.toLowerCase().includes(search.toLowerCase()) || (w.floor ?? '').toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [wards, typeFilter, search]);

  const usedTypes = useMemo(() => ['All', ...Array.from(new Set(wards.map(w => w.ward_type)))], [wards]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Wards</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {wards.length} ward{wards.length !== 1 ? 's' : ''} · {totalFree} beds available
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Add Ward
        </button>
      </div>

      {/* Summary stats row */}
      {!loading && wards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Beds', value: totalBeds, color: 'var(--accent-blue)', bg: 'var(--info-bg)', icon: BedDouble },
            { label: 'Available', value: totalFree, color: 'var(--success)', bg: 'var(--success-bg)', icon: CheckCircle },
            { label: 'Occupied', value: totalOccupied, color: 'var(--text-primary)', bg: 'var(--border-subtle)', icon: Activity },
            { label: 'Near Capacity', value: criticalWards, color: criticalWards > 0 ? 'var(--error)' : 'var(--text-muted)', bg: criticalWards > 0 ? 'var(--error-bg)' : 'var(--border-subtle)', icon: AlertTriangle },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color={color} />
              </div>
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overall occupancy bar */}
      {!loading && wards.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Overall Occupancy</span>
          <div style={{ flex: 1, background: 'var(--border)', borderRadius: '100px', height: '8px', overflow: 'hidden' }}>
            <div style={{ width: `${overallPct}%`, height: '100%', background: overallPct > 80 ? 'var(--error)' : overallPct > 60 ? 'var(--warning)' : 'var(--success)', borderRadius: '100px', transition: 'width 600ms cubic-bezier(.4,0,.2,1)' }} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: overallPct > 80 ? 'var(--error)' : 'var(--text-primary)', minWidth: '36px', textAlign: 'right' }}>{overallPct}%</span>
        </div>
      )}

      {/* Search + filter */}
      {!loading && wards.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search wards..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {usedTypes.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '100px',
                  border: `1px solid ${typeFilter === t ? typeMeta(t === 'All' ? 'General' : t).color : 'var(--border)'}`,
                  background: typeFilter === t ? typeMeta(t === 'All' ? 'General' : t).bg : 'var(--bg-card)',
                  color: typeFilter === t ? typeMeta(t === 'All' ? 'General' : t).color : 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--error-bg)', borderRadius: 'var(--radius-sm)', color: 'var(--error)', marginBottom: '16px', borderLeft: '3px solid var(--error)' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && wards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 40px', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <div style={{ width: '72px', height: '72px', background: 'var(--info-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <BedDouble size={32} color="var(--accent-blue)" />
          </div>
          <h3 style={{ margin: '0 0 8px', fontWeight: 700, color: 'var(--text-primary)' }}>No Wards Yet</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Add your first ward to start tracking bed availability.</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> Add First Ward
          </button>
        </div>
      )}

      {/* No search results */}
      {!loading && !error && wards.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <Search size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p style={{ margin: 0 }}>No wards match your search.</p>
        </div>
      )}

      {/* Ward grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', animation: 'fadeIn 250ms ease' }}>
          {filtered.map(w => (
            <WardCard key={w.id} ward={w} onEdit={() => setEditWard(w)} onDelete={() => handleDelete(w)} />
          ))}
        </div>
      )}

      {/* Modal */}
      {(showForm || editWard) && (
        <WardFormModal
          initial={editWard ?? undefined}
          onSubmit={editWard ? handleUpdate : handleCreate}
          onClose={() => { setShowForm(false); setEditWard(null); }}
          loading={saving}
        />
      )}
    </div>
  );
}
