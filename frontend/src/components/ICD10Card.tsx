import { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Loader2, RefreshCw, Dna } from 'lucide-react';
import { claimsApi, type ComprehendICD10Entity } from '../client/apiClient';

interface Props {
    claimId: number;
    // Pre-populated from cached ExtractedFields in the data response
    cachedCodes?: string;      // the comma string from comprehend_icd10_codes field
    cachedEntities?: ComprehendICD10Entity[];
}

function scoreColor(score: number): { bg: string; text: string; border: string } {
    if (score >= 0.85) return { bg: 'rgba(16,185,129,0.12)', text: '#10b981', border: 'rgba(16,185,129,0.3)' };
    if (score >= 0.6)  return { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
    return                    { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', border: 'rgba(239,68,68,0.3)'  };
}

function scoreLabel(score: number): string {
    if (score >= 0.85) return 'High';
    if (score >= 0.6)  return 'Medium';
    return 'Low';
}

export default function ICD10Card({ claimId, cachedCodes, cachedEntities }: Props) {
    const [entities, setEntities] = useState<ComprehendICD10Entity[]>(cachedEntities ?? []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [fetched, setFetched] = useState(cachedEntities ? cachedEntities.length > 0 : false);

    const fetchCodes = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await claimsApi.getComprehendICD10(claimId);
            setEntities(result.entities);
            setFetched(true);
        } catch (err: any) {
            setError(err?.response?.data?.detail ?? 'Failed to fetch ICD-10 codes. OCR may not be complete yet.');
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (idx: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });
    };

    // Filter: hide negation-flagged entities in the primary view
    const affirmed = entities.filter(e => !e.traits.includes('NEGATION'));
    const negated  = entities.filter(e => e.traits.includes('NEGATION'));

    return (
        <div style={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--info-bg)',
            overflow: 'hidden',
            marginBottom: '24px',
        }}>
            {/* Header */}
            <div style={{
                padding: '18px 22px',
                borderBottom: entities.length > 0 || fetched ? '1px solid var(--border)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }}>
                <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    background: 'rgba(59,130,246,0.15)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <Dna size={20} style={{ color: 'var(--info)' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--info)' }}>
                        ICD-10 Code Analysis
                    </h3>
                </div>

                {/* Quick code pills from cache */}
                {cachedCodes && !fetched && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {cachedCodes.split(',').map(c => c.trim()).filter(Boolean).map(code => (
                            <span key={code} style={{
                                padding: '4px 10px', borderRadius: '20px',
                                background: 'rgba(59,130,246,0.15)', color: 'var(--info)',
                                fontSize: '0.78rem', fontWeight: 700,
                                fontFamily: 'var(--font-mono, monospace)',
                                border: '1px solid rgba(59,130,246,0.3)',
                            }}>{code}</span>
                        ))}
                    </div>
                )}

                <button
                    onClick={fetchCodes}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{ flexShrink: 0, fontSize: '0.8rem', padding: '7px 14px' }}
                >
                    {loading
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
                        : fetched
                            ? <><RefreshCw size={14} /> Re-analyze</>
                            : <><Activity size={14} /> Analyze ICD-10</>
                    }
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '14px 22px', color: 'var(--error)', fontSize: '0.85rem', background: 'var(--error-bg)', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
                    ⚠ {error}
                </div>
            )}

            {/* Empty / not yet fetched */}
            {!loading && fetched && entities.length === 0 && (
                <div style={{ padding: '28px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    <Activity size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                    <p style={{ margin: 0 }}>No ICD-10 codes detected in the document text.</p>
                </div>
            )}

            {/* Entity list */}
            {affirmed.length > 0 && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {affirmed.map((entity, idx) => {
                        const colors = scoreColor(entity.icd10_score);
                        const isOpen = expanded.has(idx);
                        const pct = Math.round(entity.icd10_score * 100);

                        return (
                            <div key={idx} style={{
                                background: 'var(--bg-card)',
                                borderRadius: '10px',
                                border: `1px solid ${colors.border}`,
                                overflow: 'hidden',
                                transition: 'box-shadow 0.15s ease',
                            }}>
                                {/* Row */}
                                <div
                                    onClick={() => toggleExpand(idx)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '12px 16px', cursor: 'pointer',
                                    }}
                                >
                                    {/* Code badge */}
                                    <span style={{
                                        padding: '5px 12px', borderRadius: '20px',
                                        background: colors.bg, color: colors.text,
                                        fontSize: '0.85rem', fontWeight: 800,
                                        fontFamily: 'var(--font-mono, monospace)',
                                        border: `1.5px solid ${colors.border}`,
                                        flexShrink: 0, letterSpacing: '0.03em',
                                    }}>
                                        {entity.icd10_code}
                                    </span>

                                    {/* Description */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {entity.description ?? entity.text}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            Matched text: <em>"{entity.text}"</em>
                                        </div>
                                    </div>

                                    {/* Confidence */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: colors.text }}>{pct}%</div>
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{scoreLabel(entity.icd10_score)}</div>
                                    </div>

                                    {/* Confidence bar */}
                                    <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', flexShrink: 0 }}>
                                        <div style={{
                                            width: `${pct}%`, height: '100%',
                                            background: colors.text, borderRadius: '3px',
                                            transition: 'width 0.4s ease',
                                        }} />
                                    </div>

                                    {/* Expand toggle */}
                                    {entity.alternatives.length > 0 && (
                                        isOpen
                                            ? <ChevronUp size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    )}
                                </div>

                                {/* Alternatives panel */}
                                {isOpen && entity.alternatives.length > 0 && (
                                    <div style={{
                                        borderTop: '1px solid var(--border)',
                                        background: 'var(--border-subtle)',
                                        padding: '10px 16px',
                                    }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                            Alternative Codes
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {entity.alternatives.map((alt, ai) => (
                                                <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{
                                                        padding: '3px 9px', borderRadius: '12px',
                                                        background: 'var(--border)', color: 'var(--text-secondary)',
                                                        fontSize: '0.78rem', fontWeight: 700,
                                                        fontFamily: 'var(--font-mono, monospace)',
                                                    }}>{alt.code}</span>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>{alt.description}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                                        {Math.round(alt.score * 100)}%
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Negated entities footer */}
            {negated.length > 0 && fetched && (
                <div style={{
                    padding: '10px 22px',
                    borderTop: '1px solid var(--border)',
                    fontSize: '0.78rem', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'var(--border-subtle)',
                }}>
                    <span style={{ color: 'var(--text-muted)' }}>⊘</span>
                    <span>
                        <strong>{negated.length}</strong> negated condition{negated.length > 1 ? 's' : ''} excluded:{' '}
                        {negated.map(n => n.icd10_code).join(', ')}
                    </span>
                </div>
            )}
        </div>
    );
}
