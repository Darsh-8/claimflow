import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, RefreshCw, ShieldCheck, Save, FileUp,
    FileText, Layers, ClipboardCheck, Clock, AlertTriangle
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import FieldEditor from '../components/FieldEditor';
import ValidationCard from '../components/ValidationCard';
import FileDropzone from '../components/FileDropzone';
import { claimsApi, type ClaimDataResponse } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DOC_TYPE_LABELS: Record<string, string> = {
    discharge_summary: 'Discharge Summary',
    bill: 'Bill / Invoice',
    lab_report: 'Lab Report',
    prescription: 'Prescription',
    pre_auth: 'Pre-Authorization',
};

const DOC_TYPE_OPTIONS = [
    { value: 'discharge_summary', label: 'Discharge Summary' },
    { value: 'bill', label: 'Bill / Invoice' },
    { value: 'lab_report', label: 'Lab Report' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'pre_auth', label: 'Pre-Authorization Form' },
];

const CATEGORY_LABELS: Record<string, string> = {
    patient: '👤 Patient Information',
    policy: '🔐 Policy Details',
    hospital: '🏥 Hospital Details',
    clinical: '🩺 Clinical Data',
    financial: '💰 Financial Data',
    documents_present: '📄 Document Flags',
};

const CATEGORY_ORDER = ['patient', 'policy', 'hospital', 'clinical', 'financial', 'documents_present'];

export default function ClaimDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [data, setData] = useState<ClaimDataResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [validating, setValidating] = useState(false);
    const [corrections, setCorrections] = useState<Map<number, string>>(new Map());
    const [saving, setSaving] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('discharge_summary');
    const [activeTab, setActiveTab] = useState<'fields' | 'documents' | 'validation' | 'fraud'>('fields');

    // Review State
    const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REJECTED' | 'INFO_REQUESTED'>('APPROVED');
    const [reviewComments, setReviewComments] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            const result = await claimsApi.getData(parseInt(id));
            setData(result);
        } catch (err) {
            console.error('Failed to fetch claim data:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
        // Poll if processing
        const interval = setInterval(() => {
            if (data?.claim.status === 'PROCESSING' || data?.claim.status === 'PENDING') {
                fetchData();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [fetchData, data?.claim.status]);

    const handleFieldSave = (fieldId: number, newValue: string) => {
        setCorrections((prev) => new Map(prev).set(fieldId, newValue));
    };

    const submitCorrections = async () => {
        if (!id || corrections.size === 0) return;
        setSaving(true);
        try {
            const corrs = Array.from(corrections.entries()).map(([field_id, new_value]) => ({
                field_id,
                new_value,
            }));
            await claimsApi.correct(parseInt(id), corrs);
            setCorrections(new Map());
            await fetchData();
        } catch (err) {
            console.error('Failed to save corrections:', err);
        } finally {
            setSaving(false);
        }
    };

    const runValidation = async () => {
        if (!id) return;
        setValidating(true);
        try {
            await claimsApi.validate(parseInt(id));
            await fetchData();
        } catch (err) {
            console.error('Validation failed:', err);
        } finally {
            setValidating(false);
        }
    };

    const handleAdditionalUpload = async (files: File[]) => {
        if (!id || files.length === 0) return;
        try {
            await claimsApi.uploadAdditional(parseInt(id), files[0], uploadDocType);
            setShowUpload(false);
            await fetchData();
        } catch (err) {
            console.error('Additional upload failed:', err);
        }
    };

    const handleReviewSubmit = async () => {
        if (!id) return;
        setSubmittingReview(true);
        try {
            await claimsApi.submitReview(parseInt(id), reviewDecision, reviewComments);
            await fetchData();
        } catch (err) {
            console.error('Review submission failed:', err);
        } finally {
            setSubmittingReview(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const d = dateStr.endsWith('Z') ? new Date(dateStr) : new Date(dateStr + 'Z');
        return d.toLocaleDateString(undefined, {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
    };

    if (loading || !data) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
                <p style={{ marginTop: '14px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading claim data…</p>
            </div>
        );
    }

    // Processing state
    if (data.claim.status === 'PROCESSING' || data.claim.status === 'PENDING') {
        return (
            <div className="animate-fade-in">
                <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: '20px' }}>
                    <ArrowLeft size={15} /> Back
                </button>
                <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
                    <div className="spinner" style={{ width: '48px', height: '48px', margin: '0 auto 20px' }} />
                    <h2 style={{ marginBottom: '8px', fontWeight: 600 }}>Processing Claim #{data.claim.id}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
                        Documents are being processed through OCR and extraction pipeline…
                    </p>
                    <div className="progress-bar progress-bar-indeterminate" style={{ maxWidth: '360px', margin: '0 auto' }} />
                    <div style={{ marginTop: '14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {data.claim.ocr_completed} / {data.claim.document_count} documents processed
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (data.claim.status === 'ERROR') {
        return (
            <div className="animate-fade-in">
                <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ marginBottom: '20px' }}>
                    <ArrowLeft size={15} /> Back
                </button>
                <div className="card" style={{ padding: '48px', textAlign: 'center', border: '1px solid #fca5a5' }}>
                    <div style={{ width: '56px', height: '56px', margin: '0 auto 20px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <AlertTriangle size={28} style={{ color: 'var(--error)' }} />
                    </div>
                    <h2 style={{ marginBottom: '8px', fontWeight: 600, color: 'var(--error)' }}>Processing Failed</h2>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                        The automated pipeline encountered a critical error while extracting data from the documents. Please verify the uploaded files or view system logs.
                    </p>
                    <button className="btn btn-primary" onClick={fetchData} style={{ background: 'var(--error)', borderColor: 'var(--error)' }}>
                        <RefreshCw size={15} /> Refresh Status
                    </button>
                </div>
            </div>
        );
    }

    // Group fields by category
    const fieldsByCategory = new Map<string, typeof data.extracted_fields>();
    for (const field of data.extracted_fields) {
        if (!fieldsByCategory.has(field.field_category)) {
            fieldsByCategory.set(field.field_category, []);
        }
        fieldsByCategory.get(field.field_category)!.push(field);
    }

    const tabs = [
        { key: 'fields' as const, label: 'Extracted Fields', icon: Layers, count: data.extracted_fields.length },
        { key: 'documents' as const, label: 'Documents', icon: FileText, count: data.documents.length },
        { key: 'validation' as const, label: 'Validation', icon: ClipboardCheck, count: data.validation ? 1 : 0 },
        { key: 'fraud' as const, label: 'Fraud Alerts', icon: ShieldCheck, count: data.fraud_alerts ? data.fraud_alerts.length : 0 },
    ];

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <button className="btn-icon" onClick={() => navigate('/')} title="Back">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="page-title" style={{ marginBottom: 0 }}>Claim #{data.claim.id}</h1>
                <StatusBadge status={data.claim.status} />
                {data.claim.fraud_risk_score !== null && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        marginLeft: 'auto',
                        background: data.claim.fraud_risk_score > 70 ? 'var(--error-bg)' : data.claim.fraud_risk_score > 30 ? 'var(--warning-bg)' : 'var(--success-bg)',
                        color: data.claim.fraud_risk_score > 70 ? 'var(--error)' : data.claim.fraud_risk_score > 30 ? 'var(--warning)' : 'var(--success)',
                        border: `1px solid ${data.claim.fraud_risk_score > 70 ? '#fca5a5' : data.claim.fraud_risk_score > 30 ? '#fde047' : '#86efac'}`
                    }}>
                        Risk Score: {data.claim.fraud_risk_score}/100
                    </div>
                )}
            </div>

            {/* Meta info */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', fontSize: '0.82rem', color: 'var(--text-secondary)', paddingLeft: '44px' }}>
                {data.claim.patient_name && (
                    <span>Patient: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.claim.patient_name}</strong></span>
                )}
                {data.claim.policy_number && (
                    <span>Policy: <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{data.claim.policy_number}</strong></span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} /> {formatDate(data.claim.created_at)}
                </span>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={15} />
                    Refresh
                </button>

                {user?.role === 'HOSPITAL' && (
                    <>
                        <button className="btn btn-primary" onClick={runValidation} disabled={validating}>
                            <ShieldCheck size={15} />
                            {validating ? 'Validating…' : 'Run Validation'}
                        </button>
                        {corrections.size > 0 && (
                            <button className="btn btn-secondary" onClick={submitCorrections} disabled={saving}>
                                <Save size={15} />
                                {saving ? 'Saving…' : `Save ${corrections.size} Correction${corrections.size > 1 ? 's' : ''}`}
                            </button>
                        )}
                        <button className="btn btn-secondary" onClick={() => setShowUpload(!showUpload)}>
                            <FileUp size={15} />
                            Upload Missing Doc
                        </button>
                    </>
                )}
            </div>

            {/* Upload additional doc */}
            {showUpload && user?.role === 'HOSPITAL' && (
                <div className="card animate-scale-in" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>Upload Additional Document</h3>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Document Type</label>
                        <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} style={{ width: '250px' }}>
                            {DOC_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <FileDropzone onFilesSelected={handleAdditionalUpload} maxFiles={1} />
                </div>
            )}

            {/* Insurer Action Panel */}
            {(user?.role === 'INSURER' || data.claim.reviewer_decision) && (
                <div className="card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--accent-light)', background: '#FAFAFD' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShieldCheck size={18} />
                        Insurer Decision Panel
                    </h3>

                    {data.claim.reviewer_decision ? (
                        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Final Decision:</span>
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    background: data.claim.reviewer_decision === 'APPROVED' ? 'var(--success-bg)' : data.claim.reviewer_decision === 'REJECTED' ? 'var(--error-bg)' : 'var(--warning-bg)',
                                    color: data.claim.reviewer_decision === 'APPROVED' ? 'var(--success)' : data.claim.reviewer_decision === 'REJECTED' ? 'var(--error)' : 'var(--warning)',
                                    border: `1px solid ${data.claim.reviewer_decision === 'APPROVED' ? '#86efac' : data.claim.reviewer_decision === 'REJECTED' ? '#fca5a5' : '#fde047'}`
                                }}>
                                    {data.claim.reviewer_decision.replace('_', ' ')}
                                </span>
                            </div>
                            {data.claim.reviewer_comments && (
                                <div>
                                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Reviewer Notes:</span>
                                    <p style={{ fontSize: '0.875rem', marginTop: '6px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '6px' }}>
                                        {data.claim.reviewer_comments}
                                    </p>
                                </div>
                            )}
                            {data.claim.reviewed_at && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'right' }}>
                                    Reviewed on {formatDate(data.claim.reviewed_at)}
                                </div>
                            )}
                        </div>
                    ) : user?.role === 'INSURER' ? (
                        <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="APPROVED"
                                        checked={reviewDecision === 'APPROVED'}
                                        onChange={(e) => setReviewDecision(e.target.value as any)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--success)' }}
                                    />
                                    <span style={{ color: 'var(--success)' }}>Approve Claim</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="REJECTED"
                                        checked={reviewDecision === 'REJECTED'}
                                        onChange={(e) => setReviewDecision(e.target.value as any)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--error)' }}
                                    />
                                    <span style={{ color: 'var(--error)' }}>Reject Claim</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
                                    <input
                                        type="radio"
                                        name="decision"
                                        value="INFO_REQUESTED"
                                        checked={reviewDecision === 'INFO_REQUESTED'}
                                        onChange={(e) => setReviewDecision(e.target.value as any)}
                                        style={{ width: '16px', height: '16px', accentColor: 'var(--warning)' }}
                                    />
                                    <span style={{ color: 'var(--warning)' }}>Request More Info</span>
                                </label>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>
                                    Comments to Patient
                                </label>
                                <textarea
                                    value={reviewComments}
                                    onChange={(e) => setReviewComments(e.target.value)}
                                    placeholder="Explain the decision or list missing information..."
                                    style={{
                                        width: '100%', minHeight: '80px', padding: '12px',
                                        border: '1px solid var(--border)', borderRadius: '6px',
                                        fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleReviewSubmit}
                                    disabled={submittingReview}
                                    style={{
                                        background: reviewDecision === 'APPROVED' ? 'var(--success)' : reviewDecision === 'REJECTED' ? 'var(--error)' : 'var(--warning)',
                                        color: reviewDecision === 'INFO_REQUESTED' ? '#000' : '#fff'
                                    }}
                                >
                                    {submittingReview ? 'Submitting...' : 'Submit Decision'}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '20px', borderBottom: '2px solid var(--border)' }}>
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            padding: '10px 20px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
                            marginBottom: '-2px',
                            color: activeTab === tab.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            fontFamily: 'var(--font-sans)',
                            transition: 'all var(--transition-fast)',
                        }}
                    >
                        <tab.icon size={15} />
                        {tab.label}
                        <span style={{
                            background: activeTab === tab.key ? 'var(--accent-light)' : 'var(--border-subtle)',
                            color: activeTab === tab.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                            padding: '2px 7px',
                            borderRadius: '100px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                        }}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'fields' && (
                <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {data.extracted_fields.length === 0 ? (
                        <div className="card empty-state">
                            <Layers size={48} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                            <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No fields extracted yet.</p>
                        </div>
                    ) : (() => {
                        const knownInOrder = CATEGORY_ORDER.filter((cat) => fieldsByCategory.has(cat));
                        const unknownCats = [...fieldsByCategory.keys()].filter((cat) => !CATEGORY_ORDER.includes(cat));
                        const allCats = [...knownInOrder, ...unknownCats];
                        return allCats.map((category) => (
                            <div key={category} className="card" style={{ padding: '18px 20px' }}>
                                <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {CATEGORY_LABELS[category] || `📋 ${category.charAt(0).toUpperCase() + category.slice(1)}`}
                                </h3>
                                <div>
                                    {fieldsByCategory.get(category)!.map((field) => (
                                        <FieldEditor
                                            key={field.id}
                                            fieldId={field.id}
                                            label={field.field_name}
                                            value={corrections.has(field.id) ? corrections.get(field.id)! : field.field_value}
                                            confidence={field.confidence}
                                            isCorrected={field.is_manually_corrected || corrections.has(field.id)}
                                            onSave={handleFieldSave}
                                        />
                                    ))}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            )}

            {activeTab === 'documents' && (
                <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {data.documents.map((doc) => (
                        <div key={doc.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
                                width: '38px', height: '38px', borderRadius: 'var(--radius-sm)',
                                background: 'var(--info-bg)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <FileText size={18} style={{ color: 'var(--accent-blue)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{doc.original_filename}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type} · {doc.mime_type}
                                </div>
                            </div>
                            <StatusBadge status={doc.ocr_status} />
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'validation' && (
                <div className="card" style={{ padding: '24px' }}>
                    {data.validation ? (
                        <ValidationCard validation={data.validation} />
                    ) : (
                        <div className="empty-state">
                            <ClipboardCheck size={48} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                            <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                No validation run yet. Click &ldquo;Run Validation&rdquo; to check claim completeness.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'fraud' && (
                <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {data.fraud_alerts && data.fraud_alerts.length > 0 ? (
                        data.fraud_alerts.map((alert) => (
                            <div key={alert.id} style={{
                                padding: '16px', borderRadius: '8px',
                                borderLeft: '4px solid var(--error)',
                                background: 'white',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <h4 style={{ fontWeight: 600, color: 'var(--error)' }}>⚠ {alert.rule_triggered}</h4>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--error)' }}>Penalty: +{alert.risk_score}</span>
                                </div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', marginBottom: '8px' }}>{alert.reviewer_notes}</p>
                                {alert.details && (
                                    <div style={{
                                        margin: 0, padding: '10px 14px', background: 'var(--border-subtle)',
                                        borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)'
                                    }}>
                                        <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc' }}>
                                            {Object.entries(alert.details).map(([key, value]) => (
                                                <li key={key} style={{ marginBottom: '4px' }}>
                                                    <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                                                        {key.replace(/_/g, ' ')}:
                                                    </strong>{' '}
                                                    {Array.isArray(value) ? value.join(', ') : String(value)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="card empty-state">
                            <ShieldCheck size={48} style={{ color: 'var(--success)', opacity: 0.8 }} />
                            <h3 style={{ marginTop: '12px', fontWeight: 600, color: 'var(--success)' }}>Low Risk</h3>
                            <p style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No fraud alerts were triggered for this claim.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
