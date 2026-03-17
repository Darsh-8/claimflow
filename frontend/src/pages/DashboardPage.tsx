import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    FileStack, RefreshCw, Plus, Clock, User,
    FileCheck2, Loader2, CheckCircle2, XCircle
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { claimsApi, type ClaimListItem } from '../client/apiClient';

export default function DashboardPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const q = (searchParams.get('q') ?? '').toLowerCase().trim();
    const [claims, setClaims] = useState<ClaimListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchClaims = async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const data = await claimsApi.list();
            setClaims(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch claims:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchClaims();
        const interval = setInterval(() => fetchClaims(), 5000);
        return () => clearInterval(interval);
    }, []);

    const formatDate = (dateStr: string) => {
        const d = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
        return d.toLocaleDateString(undefined, {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    };

    // Stat counts
    const total = claims.length;
    const processing = claims.filter(c => c.status === 'PROCESSING' || c.status === 'PENDING').length;
    const validated = claims.filter(c => c.status === 'VALIDATED' || c.status === 'COMPLETE').length;
    const errors = claims.filter(c => c.status === 'ERROR' || c.status === 'INCOMPLETE').length;
    const extracted = claims.filter(c => c.status === 'EXTRACTED').length;

    // Filtered list for the table
    const filtered = q
        ? claims.filter(c =>
            String(c.id).includes(q) ||
            (c.patient_name ?? '').toLowerCase().includes(q) ||
            (c.policy_number ?? '').toLowerCase().includes(q)
        )
        : claims;

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
                <p style={{ marginTop: '14px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading claims…</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            {/* ── Refresh progress bar (shows on manual + auto refresh) ── */}
            {refreshing && (
                <div style={{
                    position: 'fixed', top: 64, left: 240, right: 0, zIndex: 100, height: '3px',
                    background: 'var(--border)',
                }}>
                    <div style={{
                        height: '100%', background: 'var(--accent-blue)',
                        animation: 'indeterminate 1.2s ease-in-out infinite',
                        position: 'absolute', width: '40%',
                    }} />
                </div>
            )}

            {/* ── Page header ── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Claims Overview</h1>
                    <p className="page-subtitle">
                        {total} claim{total !== 1 ? 's' : ''} total
                        {lastUpdated && (
                            <span style={{ marginLeft: '8px', opacity: 0.6 }}>
                                · Updated {lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                            </span>
                        )}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => fetchClaims(true)}
                        disabled={refreshing}
                        style={{ minWidth: '110px' }}
                    >
                        <RefreshCw
                            size={15}
                            style={refreshing
                                ? { animation: 'spin 0.6s linear infinite', transformOrigin: 'center' }
                                : { transition: 'transform 0.3s ease' }
                            }
                        />
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/upload')}>
                        <Plus size={16} />
                        New Claim
                    </button>
                </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="stat-grid">
                {/* Total Claims */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <span className="stat-card-title">Total Claims</span>
                        <div className="stat-card-icon" style={{ background: '#EFF6FF' }}>
                            <FileStack size={18} style={{ color: '#3B82F6' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{total}</div>
                    {total > 0 && (
                        <>
                            <div className="stat-card-bar">
                                {validated > 0 && <div className="stat-bar-seg" style={{ flex: validated, background: '#10B981' }} />}
                                {extracted > 0 && <div className="stat-bar-seg" style={{ flex: extracted, background: '#8B5CF6' }} />}
                                {processing > 0 && <div className="stat-bar-seg" style={{ flex: processing, background: '#3B82F6' }} />}
                                {errors > 0 && <div className="stat-bar-seg" style={{ flex: errors, background: '#EF4444' }} />}
                            </div>
                            <div className="stat-card-breakdown">
                                {validated > 0 && <span><span className="stat-breakdown-dot" style={{ background: '#10B981' }} />{validated} Complete</span>}
                                {extracted > 0 && <span><span className="stat-breakdown-dot" style={{ background: '#8B5CF6' }} />{extracted} Extracted</span>}
                                {processing > 0 && <span><span className="stat-breakdown-dot" style={{ background: '#3B82F6' }} />{processing} Processing</span>}
                                {errors > 0 && <span><span className="stat-breakdown-dot" style={{ background: '#EF4444' }} />{errors} Errors</span>}
                            </div>
                        </>
                    )}
                </div>

                {/* Processing */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <span className="stat-card-title">In Progress</span>
                        <div className="stat-card-icon" style={{ background: '#EFF6FF' }}>
                            <Loader2 size={18} style={{ color: '#3B82F6' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{processing}</div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Pending + Processing</p>
                </div>

                {/* Validated */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <span className="stat-card-title">Validated</span>
                        <div className="stat-card-icon" style={{ background: '#ECFDF5' }}>
                            <CheckCircle2 size={18} style={{ color: '#10B981' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{validated}</div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Complete + Validated</p>
                </div>

                {/* Errors */}
                <div className="stat-card">
                    <div className="stat-card-header">
                        <span className="stat-card-title">Errors</span>
                        <div className="stat-card-icon" style={{ background: '#FEF2F2' }}>
                            <XCircle size={18} style={{ color: '#EF4444' }} />
                        </div>
                    </div>
                    <div className="stat-card-value">{errors}</div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>Error + Incomplete</p>
                </div>
            </div>

            {/* ── Claims table ── */}
            {claims.length === 0 ? (
                <div className="card empty-state">
                    <div className="empty-state-icon"><FileStack size={56} /></div>
                    <h3 style={{ marginBottom: '6px', fontWeight: 600 }}>No claims yet</h3>
                    <p className="empty-state-text">Upload your first claim document to get started.</p>
                    <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => navigate('/upload')}>
                        <Plus size={16} /> Upload Documents
                    </button>
                </div>
            ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                    {/* Table header strip */}
                    <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Claims List</h2>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {q ? `${filtered.length} of ${total} match` : `${total} record${total !== 1 ? 's' : ''}`}
                        </span>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Claim ID</th>
                                <th>Patient Name</th>
                                <th>Policy No.</th>
                                <th>Documents</th>
                                <th>Submitted</th>
                                <th>Status</th>
                                <th>Risk Score</th>
                            </tr>
                        </thead>
                        <tbody className="stagger">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No claims match &ldquo;{q}&rdquo;
                                    </td>
                                </tr>
                            ) : filtered.map((claim) => (
                                <tr key={claim.id} onClick={() => navigate(`/claims/${claim.id}`)}>
                                    <td>
                                        <span style={{
                                            fontFamily: 'var(--font-mono)',
                                            fontSize: '0.82rem',
                                            fontWeight: 600,
                                            color: 'var(--accent-blue)',
                                        }}>
                                            #{String(claim.id).padStart(5, '0')}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '28px', height: '28px', borderRadius: '50%',
                                                background: 'var(--accent-light)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <User size={13} style={{ color: 'var(--accent-blue)' }} />
                                            </div>
                                            <span style={{ fontWeight: 500 }}>
                                                {claim.patient_name || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400 }}>{claim.status === 'PROCESSING' || claim.status === 'PENDING' ? 'Processing…' : 'Unknown'}</span>}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ color: claim.policy_number ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                                        {claim.policy_number || '—'}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FileCheck2 size={13} style={{ color: 'var(--text-muted)' }} />
                                            <span style={{ fontSize: '0.82rem' }}>
                                                {claim.document_count} file{claim.document_count !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            <Clock size={12} />
                                            {formatDate(claim.created_at)}
                                        </div>
                                    </td>
                                    <td><StatusBadge status={claim.status} /></td>
                                    <td>
                                        {claim.fraud_risk_score !== null ? (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: claim.fraud_risk_score > 70 ? 'var(--error-bg)' : claim.fraud_risk_score > 30 ? 'var(--warning-bg)' : 'var(--success-bg)',
                                                color: claim.fraud_risk_score > 70 ? 'var(--error)' : claim.fraud_risk_score > 30 ? 'var(--warning)' : 'var(--success)',
                                                border: `1px solid ${claim.fraud_risk_score > 70 ? '#fca5a5' : claim.fraud_risk_score > 30 ? '#fde047' : '#86efac'}`
                                            }}>
                                                {claim.fraud_risk_score}
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Pending</span>
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
