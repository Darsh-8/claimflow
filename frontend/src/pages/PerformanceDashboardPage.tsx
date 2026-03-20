import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Activity, Clock, FileCheck2, BarChart3, TrendingUp, AlertCircle, RefreshCw,
    ShieldAlert, FileText, AlertTriangle, Info
} from 'lucide-react';
import { analyticsApi, type ClaimAnalyticsResponse } from '../client/apiClient';
import StatusBadge from '../components/StatusBadge';

const DOC_TYPE_LABELS: Record<string, string> = {
    discharge_summary: 'Discharge Summary',
    bill: 'Bill / Invoice',
    lab_report: 'Lab Report',
    prescription: 'Prescription',
    pre_auth: 'Pre-Auth Form',
    unknown: 'Other',
};

const FRAUD_BUCKET_COLORS: Record<string, string> = {
    '0-20': '#10B981',
    '21-40': '#34D399',
    '41-60': '#FBBF24',
    '61-80': '#F97316',
    '81-100': '#EF4444',
};

const STATUS_COLORS: Record<string, string> = {
    approved: '#10B981',
    rejected: '#EF4444',
    processing: '#3B82F6',
    info_requested: '#F59E0B',
};

export default function PerformanceDashboardPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<ClaimAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean, x: number, y: number, text: React.ReactNode }>({ visible: false, x: 0, y: 0, text: '' });

    const handleTooltip = (e: React.MouseEvent, text: React.ReactNode) => {
        setTooltip({ visible: true, x: e.clientX, y: e.clientY, text });
    };
    const closeTooltip = () => setTooltip(prev => ({ ...prev, visible: false }));

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await analyticsApi.getAnalytics();
            setData(res);
        } catch (err) {
            console.error('Failed to load analytics', err);
            setError('Failed to load analytics data. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    if (loading) {
        return (
            <div className="empty-state" style={{ height: 'calc(100vh - 120px)' }}>
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
                <p style={{ marginTop: '14px', color: 'var(--text-secondary)' }}>Gathering insights...</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="empty-state">
                <AlertCircle size={48} style={{ color: 'var(--error)', marginBottom: '16px' }} />
                <h3>Oops, something went wrong</h3>
                <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
                <button className="btn btn-secondary" onClick={fetchAnalytics} style={{ marginTop: '16px' }}>
                    <RefreshCw size={16} /> Retry
                </button>
            </div>
        );
    }

    const {
        total_claims, approved, processing, rejected, info_requested,
        success_rate, avg_processing_time_hours, avg_fraud_risk_score,
        monthly_stats, fraud_risk_distribution, doc_type_breakdown,
        recent_claims, top_rejection_reasons
    } = data;

    const maxMonthlyTotal = Math.max(...monthly_stats.map(s => s.total), 1);
    const maxFraudBucket = Math.max(...fraud_risk_distribution.map(b => b.count), 1);
    const maxDocCount = Math.max(...doc_type_breakdown.map(d => d.count), 1);

    // Donut chart segments
    const donutSegments = [
        { label: 'Approved', value: approved, color: STATUS_COLORS.approved },
        { label: 'Rejected', value: rejected, color: STATUS_COLORS.rejected },
        { label: 'Processing', value: processing, color: STATUS_COLORS.processing },
        { label: 'Info Requested', value: info_requested, color: STATUS_COLORS.info_requested },
    ].filter(s => s.value > 0);

    const donutTotal = donutSegments.reduce((s, seg) => s + seg.value, 0);
    let cumulativePercent = 0;

    const formatDate = (iso: string) => {
        const d = iso.endsWith('Z') ? new Date(iso) : new Date(iso + 'Z');
        return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div className="page-header" style={{ marginBottom: '32px' }}>
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <BarChart3 size={24} style={{ color: 'var(--accent-blue)' }} />
                        Performance Analytics
                    </h1>
                    <p className="page-subtitle">Real-time insights into your claim processing efficiency</p>
                </div>
                <button className="btn btn-secondary" onClick={fetchAnalytics}>
                    <RefreshCw size={15} /> Refresh Data
                </button>
            </div>

            {/* ── KPI Cards ── */}
            <div className="stat-grid" style={{ marginBottom: '28px' }}>
                {/* Total Claims */}
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(59, 130, 246, 0.06))', borderColor: 'rgba(59, 130, 246, 0.12)' }}>
                    <div className="stat-card-header">
                        <span className="stat-card-title">Total Claims</span>
                        <div className="stat-card-icon" style={{ background: '#EFF6FF' }}>
                            <FileCheck2 size={18} style={{ color: '#3B82F6' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{total_claims}</div>
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#10B981', fontWeight: 600 }}>{approved}</span> Approved</span>
                        <span><span style={{ color: '#EF4444', fontWeight: 600 }}>{rejected}</span> Rejected</span>
                        <span><span style={{ color: '#3B82F6', fontWeight: 600 }}>{processing}</span> Processing</span>
                        {info_requested > 0 && <span><span style={{ color: '#F59E0B', fontWeight: 600 }}>{info_requested}</span> Info Req.</span>}
                    </div>
                </div>

                {/* Success Rate */}
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(16, 185, 129, 0.06))', borderColor: 'rgba(16, 185, 129, 0.12)' }}>
                    <div className="stat-card-header">
                        <span className="stat-card-title">Approval Rate</span>
                        <div className="stat-card-icon" style={{ background: '#ECFDF5' }}>
                            <TrendingUp size={18} style={{ color: '#10B981' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{success_rate}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>%</span></div>
                    <div className="stat-card-bar" style={{ marginTop: '10px' }}>
                        <div className="stat-bar-seg" style={{ flex: success_rate, background: '#10B981', borderRadius: '4px 0 0 4px' }} />
                        <div className="stat-bar-seg" style={{ flex: 100 - success_rate, background: 'var(--border)', borderRadius: '0 4px 4px 0' }} />
                    </div>
                </div>

                {/* Avg Approval Time */}
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(139, 92, 246, 0.06))', borderColor: 'rgba(139, 92, 246, 0.12)' }}>
                    <div className="stat-card-header">
                        <span className="stat-card-title">Avg Approval Time</span>
                        <div className="stat-card-icon" style={{ background: '#F5F3FF' }}>
                            <Clock size={18} style={{ color: '#8B5CF6' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">
                        {avg_processing_time_hours} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>hrs</span>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={13} style={{ color: '#8B5CF6' }} />
                        Submission → Decision
                    </div>
                </div>

                {/* Avg Fraud Risk */}
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, var(--bg-card), rgba(249, 115, 22, 0.06))', borderColor: 'rgba(249, 115, 22, 0.12)' }}>
                    <div className="stat-card-header">
                        <span className="stat-card-title">Avg Fraud Risk</span>
                        <div className="stat-card-icon" style={{ background: '#FFF7ED' }}>
                            <ShieldAlert size={18} style={{ color: '#F97316' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">
                        {avg_fraud_risk_score} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/100</span>
                    </div>
                    <div className="stat-card-bar" style={{ marginTop: '10px' }}>
                        <div className="stat-bar-seg" style={{
                            flex: avg_fraud_risk_score,
                            background: avg_fraud_risk_score > 60 ? '#EF4444' : avg_fraud_risk_score > 30 ? '#F97316' : '#10B981',
                            borderRadius: '4px 0 0 4px',
                        }} />
                        <div className="stat-bar-seg" style={{ flex: 100 - avg_fraud_risk_score, background: 'var(--border)', borderRadius: '0 4px 4px 0' }} />
                    </div>
                </div>
            </div>

            {/* ── Row 1: Donut Chart + Monthly Trends ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px', marginBottom: '24px' }}>

                {/* Donut Chart – Status Distribution */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={17} style={{ color: 'var(--text-muted)' }} />
                        Status Distribution
                    </h3>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <svg width="180" height="180" viewBox="0 0 180 180">
                            {donutSegments.map((seg) => {
                                const percent = (seg.value / donutTotal) * 100;
                                const dashArray = `${percent * 3.14} ${314 - percent * 3.14}`;
                                const dashOffset = -cumulativePercent * 3.14;
                                cumulativePercent += percent;
                                return (
                                    <circle
                                        key={seg.label}
                                        cx="90" cy="90" r="50"
                                        fill="none"
                                        stroke={seg.color}
                                        strokeWidth="28"
                                        strokeDasharray={dashArray}
                                        strokeDashoffset={dashOffset}
                                        style={{ transition: 'stroke-dasharray 1s ease-out, stroke-dashoffset 1s ease-out' }}
                                        onMouseMove={(e) => handleTooltip(e, `${seg.label}: ${seg.value} claims (${donutTotal > 0 ? Math.round((seg.value / donutTotal) * 100) : 0}%)`)}
                                        onMouseLeave={closeTooltip}
                                    />
                                );
                            })}
                            <text x="90" y="85" textAnchor="middle" style={{ fontSize: '1.8rem', fontWeight: 700, fill: 'var(--text-primary)' }}>{total_claims}</text>
                            <text x="90" y="105" textAnchor="middle" style={{ fontSize: '0.7rem', fill: 'var(--text-muted)' }}>total claims</text>
                        </svg>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {donutSegments.map(seg => (
                            <div key={seg.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
                                    {seg.label}
                                </span>
                                <span style={{ fontWeight: 600 }}>{seg.value} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>({donutTotal > 0 ? Math.round((seg.value / donutTotal) * 100) : 0}%)</span></span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Monthly Trends – Stacked Bar */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart3 size={17} style={{ color: 'var(--text-muted)' }} />
                        Monthly Claim Volume
                    </h3>
                    {monthly_stats.length === 0 ? (
                        <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            No monthly data available yet.
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '220px', paddingTop: '20px', gap: '12px' }}>
                                {monthly_stats.map((stat, idx) => {
                                    const heightPercentage = (stat.total / maxMonthlyTotal) * 100;
                                    const approvedPct = stat.total > 0 ? (stat.approved / stat.total) * 100 : 0;
                                    const rejectedPct = stat.total > 0 ? (stat.rejected / stat.total) * 100 : 0;
                                    const otherPct = 100 - approvedPct - rejectedPct;
                                    return (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', gap: '8px' }}>
                                            <div style={{ width: '100%', maxWidth: '52px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <div style={{ marginBottom: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                    {stat.total}
                                                </div>
                                                <div style={{ width: '100%', height: `${Math.max(heightPercentage, 4)}%`, borderRadius: '6px 6px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'height 0.8s ease-out' }}>
                                                    {approvedPct > 0 && <div onMouseMove={(e) => handleTooltip(e, `Approved: ${stat.approved} claims`)} onMouseLeave={closeTooltip} style={{ height: `${approvedPct}%`, background: '#10B981', width: '100%' }} />}
                                                    {otherPct > 0 && <div onMouseMove={(e) => handleTooltip(e, `Other: ${stat.total - stat.approved - stat.rejected} claims`)} onMouseLeave={closeTooltip} style={{ height: `${otherPct}%`, background: '#60A5FA', width: '100%' }} />}
                                                    {rejectedPct > 0 && <div onMouseMove={(e) => handleTooltip(e, `Rejected: ${stat.rejected} claims`)} onMouseLeave={closeTooltip} style={{ height: `${rejectedPct}%`, background: '#EF4444', width: '100%' }} />}
                                                </div>
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{stat.month.split(' ')[0]}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} /> Approved</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#60A5FA', display: 'inline-block' }} /> Other</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} /> Rejected</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Row 2: Fraud Risk Distribution + Document Types ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>

                {/* Fraud Risk Histogram */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldAlert size={17} style={{ color: 'var(--text-muted)' }} />
                        Fraud Risk Distribution
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {fraud_risk_distribution.map((bucket) => (
                            <div key={bucket.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ width: '52px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{bucket.label}</span>
                                <div onMouseMove={(e) => handleTooltip(e, `${bucket.count} claims (Risk: ${bucket.label})`)} onMouseLeave={closeTooltip} style={{ flex: 1, height: '26px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                    <div style={{
                                        width: `${maxFraudBucket > 0 ? (bucket.count / maxFraudBucket) * 100 : 0}%`,
                                        height: '100%',
                                        background: FRAUD_BUCKET_COLORS[bucket.label] || '#94A3B8',
                                        borderRadius: '4px',
                                        transition: 'width 0.8s ease-out',
                                        minWidth: bucket.count > 0 ? '14px' : '0',
                                    }} />
                                </div>
                                <span style={{ width: '28px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{bucket.count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Document Type Breakdown */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={17} style={{ color: 'var(--text-muted)' }} />
                        Document Types
                    </h3>
                    {doc_type_breakdown.length === 0 ? (
                        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No documents yet.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {doc_type_breakdown.map((dt) => (
                                <div key={dt.doc_type} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ width: '120px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>
                                        {DOC_TYPE_LABELS[dt.doc_type] || dt.doc_type}
                                    </span>
                                    <div onMouseMove={(e) => handleTooltip(e, `${dt.count} ${DOC_TYPE_LABELS[dt.doc_type] || dt.doc_type} documents`)} onMouseLeave={closeTooltip} style={{ flex: 1, height: '26px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${(dt.count / maxDocCount) * 100}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, #818CF8, #6366F1)',
                                            borderRadius: '4px',
                                            transition: 'width 0.8s ease-out',
                                            minWidth: '14px',
                                        }} />
                                    </div>
                                    <span style={{ width: '28px', fontSize: '0.82rem', fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{dt.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Row 3: Recent Claims + Top Rejection Reasons ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px' }}>

                {/* Recent Claims */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={17} style={{ color: 'var(--text-muted)' }} />
                        Recent Claims
                    </h3>
                    {recent_claims.length === 0 ? (
                        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No claims yet.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>ID</th>
                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Patient</th>
                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Risk</th>
                                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent_claims.map(claim => (
                                    <tr
                                        key={claim.id}
                                        onClick={() => navigate(`/claims/${claim.id}`)}
                                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s ease' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.04)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                                            #{String(claim.id).padStart(5, '0')}
                                        </td>
                                        <td style={{ padding: '10px', fontSize: '0.85rem', fontWeight: 500 }}>
                                            {claim.patient_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Processing…</span>}
                                        </td>
                                        <td style={{ padding: '10px' }}>
                                            <StatusBadge status={claim.status} />
                                        </td>
                                        <td style={{ padding: '10px' }}>
                                            {claim.fraud_risk_score !== null ? (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                                                    background: claim.fraud_risk_score > 70 ? 'var(--error-bg)' : claim.fraud_risk_score > 30 ? 'var(--warning-bg)' : 'var(--success-bg)',
                                                    color: claim.fraud_risk_score > 70 ? 'var(--error)' : claim.fraud_risk_score > 30 ? 'var(--warning)' : 'var(--success)',
                                                }}>
                                                    {claim.fraud_risk_score}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {formatDate(claim.created_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Top Rejection Reasons */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertTriangle size={17} style={{ color: 'var(--text-muted)' }} />
                        Top Rejection Reasons
                    </h3>
                    {top_rejection_reasons.length === 0 ? (
                        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <Info size={32} style={{ color: 'var(--border)' }} />
                            No rejections recorded yet.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {top_rejection_reasons.map((reason, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    <span style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        background: idx === 0 ? '#FEF2F2' : 'var(--border)',
                                        color: idx === 0 ? 'var(--error)' : 'var(--text-secondary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                                    }}>
                                        {idx + 1}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '0.84rem', lineHeight: 1.4, margin: 0, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                                            {reason.reason}
                                        </p>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                            {reason.count} claim{reason.count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {tooltip.visible && createPortal(
                <div style={{
                    position: 'fixed',
                    left: tooltip.x + 15,
                    top: tooltip.y + 15,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    border: '1px solid var(--border)'
                }}>
                    {tooltip.text}
                </div>,
                document.body
            )}
        </div>
    );
}
