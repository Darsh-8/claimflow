import { AlertTriangle, XCircle, Info, CheckCircle, ShieldCheck, ShieldX, Code } from 'lucide-react';
import type { ValidationResponse } from '../api/client';

interface ValidationCardProps {
    validation: ValidationResponse;
}

// Human-readable labels for IRDAI checklist keys
const IRDAI_LABELS: Record<string, string> = {
    'patient.name': 'Patient Name',
    'patient.age': 'Patient Age',
    'clinical.diagnosis': 'Diagnosis',
    'clinical.icd_code': 'ICD-10 Diagnosis Code',
    'hospital.name': 'Hospital Name',
    'financial.bill_amount': 'Total Bill Amount',
    'financial.admission_date': 'Admission Date',
    'financial.discharge_date': 'Discharge Date',
};

export default function ValidationCard({ validation }: ValidationCardProps) {
    const hasIrdai = validation?.irdai_checklist && Object.keys(validation.irdai_checklist).length > 0;
    const hasCodeVal = validation?.code_validation && Object.keys(validation.code_validation).length > 0;

    if (!validation) return null;

    return (
        <div className="animate-fade-in">
            {/* Overall Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{
                    width: '56px', height: '56px', borderRadius: 'var(--radius-md)',
                    background: validation.status === 'COMPLETE'
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(245, 158, 11, 0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {validation.status === 'COMPLETE'
                        ? <CheckCircle size={28} style={{ color: 'var(--success)' }} />
                        : <AlertTriangle size={28} style={{ color: 'var(--warning)' }} />
                    }
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                        {validation.status === 'COMPLETE' ? 'Claim Complete' : 'Claim Incomplete'}
                    </div>
                    {validation.overall_confidence != null && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Confidence: {Math.round(validation.overall_confidence * 100)}%
                        </div>
                    )}
                </div>
            </div>

            {/* Confidence Bar */}
            {validation.overall_confidence != null && (
                <div style={{ marginBottom: '24px' }}>
                    <div className="confidence-bar" style={{ height: '8px' }}>
                        <div
                            className={`confidence-fill ${validation.overall_confidence >= 0.8 ? 'confidence-high'
                                : validation.overall_confidence >= 0.5 ? 'confidence-medium'
                                    : 'confidence-low'
                                }`}
                            style={{ width: `${Math.round(validation.overall_confidence * 100)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* IRDAI Compliance Checklist                                */}
            {/* -------------------------------------------------------- */}
            {hasIrdai && (
                <div style={{ marginBottom: '24px', padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--info)', marginBottom: '12px', letterSpacing: '0.06em', fontWeight: 700 }}>
                        IRDAI Mandatory Fields
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {Object.entries(validation.irdai_checklist!).map(([key, present]) => (
                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                                {present
                                    ? <ShieldCheck size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                    : <ShieldX size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                }
                                <span style={{ color: present ? 'var(--text-primary)' : 'var(--warning)' }}>
                                    {IRDAI_LABELS[key] ?? key}
                                    {!present && <span style={{ fontSize: '0.7rem', marginLeft: '4px', opacity: 0.7 }}>(not found)</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* -------------------------------------------------------- */}
            {/* Code Validation (ICD-10 / PCS)                           */}
            {/* -------------------------------------------------------- */}
            {hasCodeVal && (
                <div style={{ marginBottom: '24px', padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '12px', letterSpacing: '0.06em', fontWeight: 700 }}>
                        Clinical Code Validation
                    </h4>
                    {Object.entries(validation.code_validation!).map(([type, info]) => (
                        <div key={type} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                            <Code size={14} style={{ color: '#a78bfa', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', color: '#a78bfa' }}>
                                    {type === 'icd10' ? 'ICD-10-CM' : 'ICD-10-PCS'}
                                </span>
                                {info.code && (
                                    <span style={{
                                        marginLeft: '8px', fontSize: '0.75rem',
                                        fontFamily: 'monospace',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        background: info.valid ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: info.valid ? 'var(--success)' : 'var(--error)',
                                    }}>
                                        {info.code}
                                    </span>
                                )}
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {info.valid === null
                                        ? <span style={{ color: 'var(--text-secondary)' }}>{info.message}</span>
                                        : info.valid
                                            ? <span style={{ color: 'var(--success)' }}>✓ {info.description ?? info.message}</span>
                                            : <span style={{ color: 'var(--error)' }}>✗ {info.message}</span>
                                    }
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Errors */}
            {validation.errors && validation.errors.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--error)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                        Errors ({validation.errors.length})
                    </h4>
                    {validation.errors.map((err, i) => (
                        <div key={i} className="validation-item validation-error">
                            <XCircle size={16} style={{ color: 'var(--error)', flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ fontSize: '0.875rem' }}>{err}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Warnings */}
            {validation.warnings && validation.warnings.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--warning)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                        Warnings ({validation.warnings.length})
                    </h4>
                    {validation.warnings.map((w, i) => (
                        <div key={i} className="validation-item validation-warning">
                            <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ fontSize: '0.875rem' }}>{w}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Missing Documents */}
            {validation.missing_docs && validation.missing_docs.length > 0 && (
                <div>
                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--info)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                        Missing Documents ({validation.missing_docs.length})
                    </h4>
                    {validation.missing_docs.map((doc, i) => (
                        <div key={i} className="validation-item validation-info">
                            <Info size={16} style={{ color: 'var(--info)', flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ fontSize: '0.875rem' }}>{doc}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* All good */}
            {(!validation.errors || validation.errors.length === 0) &&
                (!validation.warnings || validation.warnings.length === 0) && (
                    <div className="validation-item validation-success">
                        <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
                        <span style={{ fontSize: '0.875rem' }}>All validation checks passed!</span>
                    </div>
                )}

            {/* Raw JSON Output */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em' }}>
                    Raw Validation Data
                </h4>
                <pre style={{
                    backgroundColor: 'var(--bg-secondary)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    maxHeight: '300px',
                    overflowY: 'auto'
                }}>
                    {JSON.stringify(validation, null, 2)}
                </pre>
            </div>
        </div>
    );
}
