import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Stethoscope, BedDouble, ClipboardList,
  Calendar, Receipt, TrendingUp, RefreshCw, AlertCircle,
  Activity, BarChart3, DollarSign, HeartPulse,
} from 'lucide-react';
import { hmsAnalyticsApi, type HMSAnalytics } from './hmsAnalyticsApi';

const WARD_TYPE_COLORS: Record<string, string> = {
  ICU: '#EF4444',
  GENERAL: '#3B82F6',
  PRIVATE: '#8B5CF6',
  SEMI_PRIVATE: '#F59E0B',
};

const APPT_TYPE_COLORS: Record<string, string> = {
  OPD: '#3B82F6',
  FOLLOW_UP: '#10B981',
  EMERGENCY: '#EF4444',
};

export default function HMSAnalyticsPage() {
  const [data, setData] = useState<HMSAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; text: string }>({
    visible: false, x: 0, y: 0, text: '',
  });

  const showTip = (e: React.MouseEvent, text: string) =>
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, text });
  const hideTip = () => setTooltip(p => ({ ...p, visible: false }));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await hmsAnalyticsApi.get());
    } catch {
      setError('Failed to load HMS analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="empty-state" style={{ height: 'calc(100vh - 120px)' }}>
        <div className="spinner" style={{ width: '40px', height: '40px' }} />
        <p style={{ marginTop: '14px', color: 'var(--text-secondary)' }}>Loading HMS analytics…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} style={{ color: 'var(--error)', marginBottom: '16px' }} />
        <h3>Something went wrong</h3>
        <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={load} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    );
  }

  const { patients, doctors, wards, admissions, appointments, billing, top_diagnoses } = data;

  // Appointment donut
  const apptSegments = [
    { label: 'OPD', value: appointments.by_type.OPD, color: APPT_TYPE_COLORS.OPD },
    { label: 'Follow-up', value: appointments.by_type.FOLLOW_UP, color: APPT_TYPE_COLORS.FOLLOW_UP },
    { label: 'Emergency', value: appointments.by_type.EMERGENCY, color: APPT_TYPE_COLORS.EMERGENCY },
  ].filter(s => s.value > 0);
  const apptTotal = apptSegments.reduce((s, seg) => s + seg.value, 0);
  let cumPct = 0;

  const maxTrend = Math.max(...admissions.monthly_trends.map(t => t.admissions + t.discharges), 1);

  const fmt = (n: number) =>
    n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(1)}L` :
    n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${n.toFixed(0)}`;

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HeartPulse size={24} style={{ color: 'var(--accent-blue)' }} />
            HMS Analytics
          </h1>
          <p className="page-subtitle">Hospital management insights — patients, admissions, billing & more</p>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* ── KPI Row ── */}
      <div className="stat-grid" style={{ marginBottom: '28px' }}>
        {/* Patients */}
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(59,130,246,0.06))', borderColor: 'rgba(59,130,246,0.12)' }}>
          <div className="stat-card-header">
            <span className="stat-card-title">Total Patients</span>
            <div className="stat-card-icon" style={{ background: '#EFF6FF' }}>
              <Users size={18} style={{ color: '#3B82F6' }} />
            </div>
          </div>
          <div className="stat-card-value">{patients.total}</div>
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#10B981', fontWeight: 600 }}>{patients.active}</span> Active</span>
            <span><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{patients.inactive}</span> Inactive</span>
            <span><span style={{ color: '#3B82F6', fontWeight: 600 }}>+{patients.new_this_month}</span> This month</span>
          </div>
        </div>

        {/* Admissions */}
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(139,92,246,0.06))', borderColor: 'rgba(139,92,246,0.12)' }}>
          <div className="stat-card-header">
            <span className="stat-card-title">Currently Admitted</span>
            <div className="stat-card-icon" style={{ background: '#F5F3FF' }}>
              <ClipboardList size={18} style={{ color: '#8B5CF6' }} />
            </div>
          </div>
          <div className="stat-card-value">{admissions.currently_admitted}</div>
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#10B981', fontWeight: 600 }}>{admissions.discharged_this_month}</span> Discharged this month</span>
            <span><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{admissions.total}</span> Total ever</span>
          </div>
        </div>

        {/* Today's Appointments */}
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(16,185,129,0.06))', borderColor: 'rgba(16,185,129,0.12)' }}>
          <div className="stat-card-header">
            <span className="stat-card-title">Today's Appointments</span>
            <div className="stat-card-icon" style={{ background: '#ECFDF5' }}>
              <Calendar size={18} style={{ color: '#10B981' }} />
            </div>
          </div>
          <div className="stat-card-value">{appointments.today}</div>
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#3B82F6', fontWeight: 600 }}>{appointments.by_status.scheduled}</span> Scheduled</span>
            <span><span style={{ color: '#10B981', fontWeight: 600 }}>{appointments.by_status.completed}</span> Completed</span>
            <span><span style={{ color: 'var(--error)', fontWeight: 600 }}>{appointments.by_status.cancelled}</span> Cancelled</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(249,115,22,0.06))', borderColor: 'rgba(249,115,22,0.12)' }}>
          <div className="stat-card-header">
            <span className="stat-card-title">Total Billed</span>
            <div className="stat-card-icon" style={{ background: '#FFF7ED' }}>
              <DollarSign size={18} style={{ color: '#F97316' }} />
            </div>
          </div>
          <div className="stat-card-value" style={{ fontSize: billing.total_billed >= 1e7 ? '1.6rem' : '2rem' }}>
            {fmt(billing.total_billed)}
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <span><span style={{ color: '#10B981', fontWeight: 600 }}>{fmt(billing.total_collected)}</span> Collected</span>
            <span><span style={{ color: 'var(--error)', fontWeight: 600 }}>{fmt(billing.pending_amount)}</span> Pending</span>
          </div>
        </div>
      </div>

      {/* ── Row 1: Monthly Trends + Bed Occupancy ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Monthly Admissions vs Discharges */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={17} style={{ color: 'var(--text-muted)' }} />
            Monthly Admissions & Discharges
          </h3>
          {admissions.monthly_trends.every(t => t.admissions === 0 && t.discharges === 0) ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No admission data yet.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '200px', gap: '10px', paddingTop: '16px' }}>
                {admissions.monthly_trends.map((t, idx) => {
                  const total = t.admissions + t.discharges;
                  const h = (total / maxTrend) * 100;
                  const admPct = total > 0 ? (t.admissions / total) * 100 : 0;
                  const disPct = 100 - admPct;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', gap: '6px' }}>
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {total > 0 && (
                          <div style={{ marginBottom: '4px', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{total}</div>
                        )}
                        <div
                          style={{ width: '100%', maxWidth: '44px', height: `${Math.max(h, 3)}%`, borderRadius: '5px 5px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'height 0.8s ease-out', cursor: 'pointer' }}
                          onMouseMove={e => showTip(e, `${t.month}: ${t.admissions} admitted, ${t.discharges} discharged`)}
                          onMouseLeave={hideTip}
                        >
                          {admPct > 0 && <div style={{ height: `${admPct}%`, background: '#8B5CF6' }} />}
                          {disPct > 0 && <div style={{ height: `${disPct}%`, background: '#10B981' }} />}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {t.month.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8B5CF6', display: 'inline-block' }} /> Admissions
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} /> Discharges
                </span>
              </div>
            </>
          )}
        </div>

        {/* Ward Bed Occupancy */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BedDouble size={17} style={{ color: 'var(--text-muted)' }} />
            Ward Occupancy
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 18px' }}>
            {wards.occupied_beds}/{wards.total_beds} beds occupied ({wards.occupancy_rate}%)
          </p>
          {wards.breakdown.length === 0 ? (
            <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No wards configured.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {wards.breakdown.map(w => {
                const color = WARD_TYPE_COLORS[w.ward_type] ?? '#64748B';
                return (
                  <div key={w.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{w.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {w.occupied_beds}/{w.total_beds} · <span style={{ fontWeight: 600, color }}>{w.occupancy_rate}%</span>
                      </span>
                    </div>
                    <div
                      style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer' }}
                      onMouseMove={e => showTip(e, `${w.name} (${w.ward_type}): ${w.occupied_beds} occupied, ${w.available_beds} available`)}
                      onMouseLeave={hideTip}
                    >
                      <div style={{
                        width: `${w.occupancy_rate}%`,
                        height: '100%',
                        background: color,
                        borderRadius: '4px',
                        transition: 'width 0.8s ease-out',
                        minWidth: w.occupied_beds > 0 ? '6px' : '0',
                      }} />
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '3px' }}>{w.ward_type}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Appointment Breakdown + Billing + Doctors ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '24px' }}>

        {/* Appointment Type Donut */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={17} style={{ color: 'var(--text-muted)' }} />
            Appointments by Type
          </h3>
          {apptTotal === 0 ? (
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No appointments yet.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <svg width="140" height="140" viewBox="0 0 140 140">
                  {apptSegments.map(seg => {
                    const pct = (seg.value / apptTotal) * 100;
                    const dash = `${pct * 2.513} ${251.3 - pct * 2.513}`;
                    const offset = -cumPct * 2.513;
                    cumPct += pct;
                    return (
                      <circle
                        key={seg.label}
                        cx="70" cy="70" r="40"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="22"
                        strokeDasharray={dash}
                        strokeDashoffset={offset}
                        onMouseMove={e => showTip(e, `${seg.label}: ${seg.value} (${Math.round(pct)}%)`)}
                        onMouseLeave={hideTip}
                        style={{ cursor: 'pointer' }}
                      />
                    );
                  })}
                  <text x="70" y="65" textAnchor="middle" style={{ fontSize: '1.4rem', fontWeight: 700, fill: 'var(--text-primary)' }}>{apptTotal}</text>
                  <text x="70" y="82" textAnchor="middle" style={{ fontSize: '0.62rem', fill: 'var(--text-muted)' }}>total</text>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {apptSegments.map(seg => (
                  <div key={seg.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: seg.color, flexShrink: 0, display: 'inline-block' }} />
                      {seg.label}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {seg.value} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>({Math.round((seg.value / apptTotal) * 100)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Billing Summary */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={17} style={{ color: 'var(--text-muted)' }} />
            Revenue Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'Total Billed', value: billing.total_billed, color: '#3B82F6', pct: 100 },
              { label: 'Collected', value: billing.total_collected, color: '#10B981', pct: billing.total_billed > 0 ? (billing.total_collected / billing.total_billed) * 100 : 0 },
              { label: 'Pending', value: billing.pending_amount, color: '#EF4444', pct: billing.total_billed > 0 ? (billing.pending_amount / billing.total_billed) * 100 : 0 },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(row.value)}</span>
                </div>
                <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(row.pct, 100)}%`, height: '100%', background: row.color, borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span><span style={{ fontWeight: 600, color: '#10B981' }}>{billing.paid_count}</span> Paid</span>
              <span><span style={{ fontWeight: 600, color: '#F59E0B' }}>{billing.partial_count}</span> Partial</span>
              <span><span style={{ fontWeight: 600, color: '#EF4444' }}>{billing.pending_count}</span> Pending</span>
            </div>
          </div>
        </div>

        {/* Staff & Infrastructure */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={17} style={{ color: 'var(--text-muted)' }} />
            Staff & Infrastructure
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { label: 'Active Doctors', value: doctors.active, total: doctors.total, color: '#3B82F6', icon: <Stethoscope size={16} style={{ color: '#3B82F6' }} /> },
              { label: 'Active Wards', value: wards.total, total: wards.total, color: '#8B5CF6', icon: <BedDouble size={16} style={{ color: '#8B5CF6' }} /> },
              { label: 'Bed Occupancy', value: wards.occupied_beds, total: wards.total_beds, color: wards.occupancy_rate > 80 ? '#EF4444' : wards.occupancy_rate > 60 ? '#F59E0B' : '#10B981', icon: <TrendingUp size={16} style={{ color: '#10B981' }} /> },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {row.icon} {row.label}
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {row.value}<span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/{row.total}</span>
                  </span>
                </div>
                <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${row.total > 0 ? (row.value / row.total) * 100 : 0}%`, height: '100%', background: row.color, borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
                </div>
              </div>
            ))}
            <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ textAlign: 'center', padding: '10px', background: 'var(--bg-page)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{appointments.by_status.no_show}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>No-shows</div>
              </div>
              <div style={{ textAlign: 'center', padding: '10px', background: 'var(--bg-page)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{billing.total_invoices}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Invoices</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Top Diagnoses + Appointment Status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* Top Diagnoses */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HeartPulse size={17} style={{ color: 'var(--text-muted)' }} />
            Top Diagnoses
          </h3>
          {top_diagnoses.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No diagnosis data yet. Add admissions with diagnoses to see trends.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {top_diagnoses.map((d, idx) => {
                const maxCount = top_diagnoses[0].count;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                      background: idx === 0 ? 'var(--accent-blue)' : 'var(--border)',
                      color: idx === 0 ? '#fff' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700,
                    }}>
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>{d.diagnosis}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, marginLeft: '8px' }}>{d.count} cases</span>
                      </div>
                      <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${(d.count / maxCount) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #818CF8, #6366F1)', borderRadius: '3px', transition: 'width 0.8s ease-out' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Appointment Status Breakdown */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={17} style={{ color: 'var(--text-muted)' }} />
            Appointment Status
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'Scheduled', value: appointments.by_status.scheduled, color: '#3B82F6' },
              { label: 'Completed', value: appointments.by_status.completed, color: '#10B981' },
              { label: 'Cancelled', value: appointments.by_status.cancelled, color: '#EF4444' },
              { label: 'No Show', value: appointments.by_status.no_show, color: '#F59E0B' },
            ].map(row => {
              const pct = appointments.total > 0 ? (row.value / appointments.total) * 100 : 0;
              return (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '72px', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{row.label}</span>
                  <div
                    style={{ flex: 1, height: '24px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', cursor: 'pointer' }}
                    onMouseMove={e => showTip(e, `${row.label}: ${row.value} appointments (${Math.round(pct)}%)`)}
                    onMouseLeave={hideTip}
                  >
                    <div style={{ width: `${pct}%`, height: '100%', background: row.color, borderRadius: '4px', transition: 'width 0.8s ease-out', minWidth: row.value > 0 ? '12px' : '0' }} />
                  </div>
                  <span style={{ width: '28px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{row.value}</span>
                </div>
              );
            })}
          </div>

          {/* Quick Stats footer */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', textAlign: 'center' }}>
            <div style={{ padding: '10px', background: 'var(--bg-page)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{patients.total}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Patients</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-page)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{doctors.active}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Doctors</div>
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-page)', borderRadius: '8px' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>{wards.total}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>Wards</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltip.visible && createPortal(
        <div style={{
          position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14,
          background: 'var(--bg-card)', color: 'var(--text-primary)',
          padding: '7px 12px', borderRadius: '7px', fontSize: '0.8rem', fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: 9999,
          border: '1px solid var(--border)',
        }}>
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
}
