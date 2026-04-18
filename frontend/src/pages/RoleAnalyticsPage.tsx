import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DollarSign, ShieldAlert, Activity, Building, TrendingUp,
  AlertTriangle, RefreshCw, Loader2, TrendingDown, Percent,
  BarChart3, Stethoscope,
} from 'lucide-react';
import { analyticsApi, type RoleAnalyticsResponse } from '../client/apiClient';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (val: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(val);

const fmtShort = (val: number) => {
  if (val >= 1_00_00_000) return `₹${(val / 1_00_00_000).toFixed(1)}Cr`;
  if (val >= 1_00_000)    return `₹${(val / 1_00_000).toFixed(1)}L`;
  if (val >= 1_000)       return `₹${(val / 1_000).toFixed(1)}K`;
  return `₹${val.toFixed(0)}`;
};

const DIAG_PALETTE = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B',
  '#EC4899', '#8B5CF6', '#14B8A6', '#F97316',
];

// ── Approval ring ─────────────────────────────────────────────────────────────

function ApprovalRing({ claimed, approved }: { claimed: number; approved: number }) {
  const pct = claimed > 0 ? Math.min(Math.round((approved / claimed) * 100), 100) : 0;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <svg width={136} height={136} viewBox="0 0 136 136">
        {/* track */}
        <circle cx={68} cy={68} r={r} fill="none" stroke="var(--border)" strokeWidth={12} />
        {/* fill */}
        <circle
          cx={68} cy={68} r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: 'stroke-dasharray 800ms cubic-bezier(.4,0,.2,1)' }}
        />
        <text x={68} y={63} textAnchor="middle" fontSize={22} fontWeight={800} fill={color}>{pct}%</text>
        <text x={68} y={80} textAnchor="middle" fontSize={11} fill="var(--text-muted)">approved</text>
      </svg>
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {fmtShort(approved)} of {fmtShort(claimed)} recovered
      </p>
    </div>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────

function BarRow({
  label, count, maxCount, color, rank, rankPrimary,
  onMouseMove, onMouseLeave,
}: {
  label: string; count: number; maxCount: number;
  color: string; rank: number; rankPrimary: boolean;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{
        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
        background: rankPrimary ? color : 'var(--border)',
        color: rankPrimary ? '#fff' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.7rem', fontWeight: 700,
      }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{
            fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '72%',
          }}>{label}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>
            {count} {count === 1 ? 'claim' : 'claims'}
          </span>
        </div>
        <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
            style={{
              width: `${pct}%`, height: '100%', background: color,
              borderRadius: '4px', transition: 'width 900ms cubic-bezier(.4,0,.2,1)',
              cursor: 'pointer', minWidth: count > 0 ? '6px' : '0',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RoleAnalyticsPage() {
  const [data, setData] = useState<RoleAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; text: string }>({
    visible: false, x: 0, y: 0, text: '',
  });

  const showTip = (e: React.MouseEvent, text: string) =>
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, text });
  const hideTip = () => setTooltip(p => ({ ...p, visible: false }));

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await analyticsApi.getRoleAnalytics()); }
    catch { setError('Failed to load analytics data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 120px)', gap: '14px', color: 'var(--text-muted)' }}>
      <Loader2 size={32} style={{ animation: 'spin 0.7s linear infinite' }} />
      <p style={{ margin: 0 }}>Loading analytics…</p>
    </div>
  );

  if (error || !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 120px)', gap: '14px' }}>
      <AlertTriangle size={40} color="var(--error)" />
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{error || 'No data.'}</p>
      <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );

  const isInsurer = data.role === 'INSURER';
  const approvalPct = data.total_revenue_claimed > 0
    ? Math.round((data.total_revenue_approved / data.total_revenue_claimed) * 100)
    : 0;
  const pendingAmount = Math.max(0, data.total_revenue_claimed - data.total_revenue_approved);

  const maxDiagCount = Math.max(...(data.top_diagnoses.map(d => d.count)), 1);
  const maxHospCount = Math.max(...(data.top_hospitals?.map(h => h.count) ?? [1]), 1);

  return (
    <div style={{ paddingBottom: '48px', animation: 'fadeIn 250ms ease' }}>

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isInsurer
              ? <><ShieldAlert size={22} style={{ color: 'var(--error)' }} /> Insurer Financial Analytics</>
              : <><BarChart3 size={22} style={{ color: 'var(--accent-blue)' }} /> Hospital Revenue Analytics</>
            }
          </h1>
          <p className="page-subtitle">
            {isInsurer
              ? 'Claim payouts, fraud savings, and hospital volume breakdown'
              : 'Revenue claimed vs approved, top diagnoses, and financial recovery metrics'
            }
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── KPI row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isInsurer ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
        gap: '20px',
        marginBottom: '28px',
      }}>

        {/* Total Claimed */}
        <div className="card" style={{
          padding: '24px',
          background: 'linear-gradient(135deg, var(--bg-card), rgba(59,130,246,0.05))',
          borderColor: 'rgba(59,130,246,0.15)',
          borderLeft: '4px solid #3B82F6',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                Total Claimed
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {fmtShort(data.total_revenue_claimed)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {fmt(data.total_revenue_claimed)}
              </div>
            </div>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#3B82F6" />
            </div>
          </div>
          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px' }}>
            <div style={{ width: '100%', height: '100%', background: '#3B82F6', borderRadius: '4px' }} />
          </div>
        </div>

        {/* Total Approved */}
        <div className="card" style={{
          padding: '24px',
          background: 'linear-gradient(135deg, var(--bg-card), rgba(16,185,129,0.05))',
          borderColor: 'rgba(16,185,129,0.15)',
          borderLeft: '4px solid #10B981',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                {isInsurer ? 'Total Paid Out' : 'Total Approved'}
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {fmtShort(data.total_revenue_approved)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {fmt(data.total_revenue_approved)}
              </div>
            </div>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={20} color="#10B981" />
            </div>
          </div>
          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${approvalPct}%`, height: '100%', background: '#10B981', borderRadius: '4px', transition: 'width 800ms ease' }} />
          </div>
        </div>

        {/* Fraud Savings — insurer only */}
        {isInsurer && data.total_fraud_savings != null && (
          <div className="card" style={{
            padding: '24px',
            background: 'linear-gradient(135deg, var(--bg-card), rgba(239,68,68,0.05))',
            borderColor: 'rgba(239,68,68,0.15)',
            borderLeft: '4px solid #EF4444',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  Fraud Prevented
                </div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                  {fmtShort(data.total_fraud_savings)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {fmt(data.total_fraud_savings)}
                </div>
              </div>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={20} color="#EF4444" />
              </div>
            </div>
            <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${data.total_revenue_claimed > 0 ? Math.min((data.total_fraud_savings / data.total_revenue_claimed) * 100, 100) : 0}%`,
                height: '100%', background: '#EF4444', borderRadius: '4px', transition: 'width 800ms ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Middle row: Approval ring + Pending + secondary KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', marginBottom: '24px' }}>

        {/* Approval ring card */}
        <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Approval Rate
          </h3>
          <ApprovalRing claimed={data.total_revenue_claimed} approved={data.total_revenue_approved} />
        </div>

        {/* Breakdown sub-cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Approval % */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: approvalPct >= 70 ? 'var(--success-bg)' : approvalPct >= 40 ? 'var(--warning-bg)' : 'var(--error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Percent size={16} color={approvalPct >= 70 ? 'var(--success)' : approvalPct >= 40 ? 'var(--warning)' : 'var(--error)'} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Recovery Rate
              </span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: approvalPct >= 70 ? 'var(--success)' : approvalPct >= 40 ? 'var(--warning)' : 'var(--error)', lineHeight: 1 }}>
              {approvalPct}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              of total claimed
            </div>
          </div>

          {/* Pending Amount */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={16} color="var(--warning)" />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isInsurer ? 'Not Paid Out' : 'Pending'}
              </span>
            </div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {fmtShort(pendingAmount)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {fmt(pendingAmount)}
            </div>
          </div>

          {/* Top diagnosis count */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--purple-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stethoscope size={16} color="var(--purple)" />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Top Diagnosis
              </span>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {data.top_diagnoses[0]?.label ?? '—'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {data.top_diagnoses[0]?.count ?? 0} claims
            </div>
          </div>

          {/* Unique diagnoses tracked */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={16} color="var(--info)" />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {isInsurer ? 'Hospitals Tracked' : 'Diagnoses Tracked'}
              </span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {isInsurer ? (data.top_hospitals?.length ?? 0) : data.top_diagnoses.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>unique entries</div>
          </div>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isInsurer ? '1fr 1fr' : '1fr', gap: '24px' }}>

        {/* Top Diagnoses */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <Stethoscope size={18} style={{ color: 'var(--accent-blue)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Top Diagnoses
            </h2>
            <span style={{
              marginLeft: 'auto', fontSize: '0.73rem', fontWeight: 600, padding: '2px 8px',
              borderRadius: '100px', background: 'var(--info-bg)', color: 'var(--info)',
            }}>
              Top {data.top_diagnoses.length}
            </span>
          </div>

          {data.top_diagnoses.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No diagnosis data yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data.top_diagnoses.map((diag, i) => (
                <BarRow
                  key={i}
                  label={diag.label}
                  count={diag.count}
                  maxCount={maxDiagCount}
                  color={DIAG_PALETTE[i % DIAG_PALETTE.length]}
                  rank={i + 1}
                  rankPrimary={i === 0}
                  onMouseMove={e => showTip(e, `${diag.label}: ${diag.count} claim${diag.count !== 1 ? 's' : ''}`)}
                  onMouseLeave={hideTip}
                />
              ))}
            </div>
          )}
        </div>

        {/* Top Hospitals (Insurer Only) */}
        {isInsurer && data.top_hospitals && (
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <Building size={18} style={{ color: '#F59E0B' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Top Hospitals by Volume
              </h2>
              <span style={{
                marginLeft: 'auto', fontSize: '0.73rem', fontWeight: 600, padding: '2px 8px',
                borderRadius: '100px', background: 'var(--warning-bg)', color: 'var(--warning)',
              }}>
                Top {data.top_hospitals.length}
              </span>
            </div>

            {data.top_hospitals.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No hospital data yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {data.top_hospitals.map((hosp, i) => (
                  <BarRow
                    key={i}
                    label={hosp.hospital_name}
                    count={hosp.count}
                    maxCount={maxHospCount}
                    color={i === 0 ? '#F59E0B' : i === 1 ? '#FBBF24' : '#FCD34D'}
                    rank={i + 1}
                    rankPrimary={i === 0}
                    onMouseMove={e => showTip(e, `${hosp.hospital_name}: ${hosp.count} claim${hosp.count !== 1 ? 's' : ''}`)}
                    onMouseLeave={hideTip}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hospital view: full-width revenue summary bar */}
        {!isInsurer && (
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
              <BarChart3 size={18} style={{ color: '#10B981' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Revenue Breakdown
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {[
                { label: 'Total Claimed', value: data.total_revenue_claimed, color: '#3B82F6', pct: 100 },
                { label: 'Total Approved', value: data.total_revenue_approved, color: '#10B981', pct: data.total_revenue_claimed > 0 ? (data.total_revenue_approved / data.total_revenue_claimed) * 100 : 0 },
                { label: 'Gap / Pending', value: pendingAmount, color: '#F59E0B', pct: data.total_revenue_claimed > 0 ? (pendingAmount / data.total_revenue_claimed) * 100 : 0 },
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                      {row.label}
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmtShort(row.value)}
                    </span>
                  </div>
                  <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(row.pct, 100)}%`,
                      height: '100%', background: row.color,
                      borderRadius: '4px', transition: 'width 900ms ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', textAlign: 'right' }}>
                    {Math.round(row.pct)}% of total
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tooltip portal */}
      {tooltip.visible && createPortal(
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14,
          background: 'var(--bg-card)', color: 'var(--text-primary)',
          padding: '7px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: 9999,
          border: '1px solid var(--border)',
        }}>
          {tooltip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
