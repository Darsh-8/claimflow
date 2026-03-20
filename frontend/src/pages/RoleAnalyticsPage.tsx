import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, ShieldAlert, Activity, Building, TrendingUp, AlertTriangle } from 'lucide-react';
import { analyticsApi, type RoleAnalyticsResponse } from '../client/apiClient';

export default function RoleAnalyticsPage() {
    const [data, setData] = useState<RoleAnalyticsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; text: React.ReactNode }>({
        visible: false, x: 0, y: 0, text: ''
    });

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const result = await analyticsApi.getRoleAnalytics();
                setData(result);
            } catch (err: any) {
                console.error('Failed to fetch role analytics:', err);
                setError('Failed to load deep analytics data.');
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
    }, []);

    const handleTooltip = (e: React.MouseEvent, text: React.ReactNode) => {
        setTooltip({ visible: true, x: e.clientX, y: e.clientY, text });
    };
    const closeTooltip = () => setTooltip({ ...tooltip, visible: false });

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-8 text-center text-[var(--accent)] flex flex-col items-center">
                <AlertTriangle size={48} className="mb-4 text-[var(--danger)]" />
                <h2 className="text-xl font-semibold mb-2">Error Loading Analytics</h2>
                <p>{error}</p>
            </div>
        );
    }
    
    // Formatting currency
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
    };

    const isInsurer = data.role === 'INSURER';

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                    {isInsurer ? 'Insurer Financial Analytics' : 'Hospital Revenue Analytics'}
                </h1>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                    Deep financial insights and trend analysis based on your processed claims.
                </p>
            </div>

            {/* KPI Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '24px',
                marginBottom: '32px'
            }}>
                {/* Revenue Claimed */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
                    borderRadius: '16px', padding: '24px', border: '1px solid rgba(59, 130, 246, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '10px', borderRadius: '12px', color: '#3B82F6' }}>
                            <TrendingUp size={24} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Claimed</h3>
                    </div>
                    <div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatCurrency(data.total_revenue_claimed)}
                        </span>
                    </div>
                </div>

                {/* Revenue Approved */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)',
                    borderRadius: '16px', padding: '24px', border: '1px solid rgba(16, 185, 129, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '10px', borderRadius: '12px', color: '#10B981' }}>
                            <DollarSign size={24} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Approved</h3>
                    </div>
                    <div>
                        <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatCurrency(data.total_revenue_approved)}
                        </span>
                    </div>
                </div>

                {/* Insurer Only: Fraud Savings */}
                {isInsurer && data.total_fraud_savings !== null && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)',
                        borderRadius: '16px', padding: '24px', border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '10px', borderRadius: '12px', color: '#EF4444' }}>
                                <ShieldAlert size={24} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600 }}>Fraud Prevented</h3>
                        </div>
                        <div>
                            <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {formatCurrency(data.total_fraud_savings)}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Charts Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: isInsurer ? '1fr 1fr' : '1fr',
                gap: '24px'
            }}>
                {/* Top Diagnoses */}
                <div style={{
                    background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
                    border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                        <Activity size={20} style={{ color: 'var(--primary)' }} />
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Top Diagnoses</h2>
                    </div>
                    
                    {data.top_diagnoses.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No diagnosis data available.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {data.top_diagnoses.map((diag, i) => {
                                const maxCount = Math.max(...data.top_diagnoses.map(d => d.count), 1);
                                const pct = (diag.count / maxCount) * 100;
                                return (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {diag.label}
                                            </span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {diag.count} claim{diag.count !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div
                                                onMouseMove={(e) => handleTooltip(e, `${diag.label}: ${diag.count} claims`)}
                                                onMouseLeave={closeTooltip}
                                                style={{
                                                    width: `${pct}%`, height: '100%',
                                                    background: 'linear-gradient(90deg, var(--primary) 0%, #818cf8 100%)',
                                                    borderRadius: '4px', transition: 'width 1s ease-out'
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Top Hospitals (Insurer Only) */}
                {isInsurer && data.top_hospitals && (
                    <div style={{
                        background: 'var(--bg-card)', borderRadius: '16px', padding: '24px',
                        border: '1px solid var(--border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                            <Building size={20} style={{ color: '#F59E0B' }} />
                            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Top Hospitals by Volume</h2>
                        </div>
                        
                        {data.top_hospitals.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No hospital data available.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {data.top_hospitals.map((hosp, i) => {
                                    const maxCount = Math.max(...data.top_hospitals!.map(h => h.count), 1);
                                    const pct = (hosp.count / maxCount) * 100;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                    {hosp.hospital_name}
                                                </span>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {hosp.count} claim{hosp.count !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div
                                                    onMouseMove={(e) => handleTooltip(e, `${hosp.hospital_name}: ${hosp.count} claims`)}
                                                    onMouseLeave={closeTooltip}
                                                    style={{
                                                        width: `${pct}%`, height: '100%',
                                                        background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 100%)',
                                                        borderRadius: '4px', transition: 'width 1s ease-out'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Portal for Tooltips */}
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
