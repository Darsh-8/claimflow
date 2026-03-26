import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, RefreshCw, ShieldCheck, Save, FileUp, Download,
    FileText, Layers, ClipboardCheck, Clock, AlertTriangle, BookOpen, Users
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import FieldEditor from '../components/FieldEditor';
import ValidationCard from '../components/ValidationCard';
import FileDropzone from '../components/FileDropzone';
import ICD10Card from '../components/ICD10Card';
import { claimsApi, type ClaimDataResponse, type PatientHistoryResponse, type ComprehendICD10Entity, type UserResponse } from '../client/apiClient';
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
    const [activeTab, setActiveTab] = useState<'fields' | 'documents' | 'validation' | 'fraud' | 'history'>('fields');

    // Patient History
    const [patientHistory, setPatientHistory] = useState<PatientHistoryResponse | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Missing Policy State
    const [insurers, setInsurers] = useState<UserResponse[]>([]);
    const [selectedInsurerId, setSelectedInsurerId] = useState<string>('');
    const [enteredPolicyNumber, setEnteredPolicyNumber] = useState<string>('');
    const [enteredDiagnosis, setEnteredDiagnosis] = useState<string>('');
    const [enteredIcdCode, setEnteredIcdCode] = useState<string>('');
    const [enteredBillAmount, setEnteredBillAmount] = useState<string>('');
    
    const [missingPolicyNumber, setMissingPolicyNumber] = useState(false);
    const [missingDiagnosis, setMissingDiagnosis] = useState(false);
    const [missingIcdCode, setMissingIcdCode] = useState(false);
    const [missingBillAmount, setMissingBillAmount] = useState(false);
    
    const [linkError, setLinkError] = useState('');
    const [linkLoading, setLinkLoading] = useState(false);

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

    // Fetch patient history by policy number only (names are not unique identifiers)
    useEffect(() => {
        if (!id || !data?.claim.policy_number) return;
        if (patientHistory) return; // already loaded
        setHistoryLoading(true);
        claimsApi.getPatientHistory(parseInt(id))
            .then(setPatientHistory)
            .catch(() => setPatientHistory(null))
            .finally(() => setHistoryLoading(false));
    }, [id, data?.claim.policy_number, patientHistory]);

    // Fetch Insurers if in EXTRACTED state
    useEffect(() => {
        if (data?.claim.status === 'EXTRACTED') {
            import('../client/apiClient').then(m => m.usersApi.getInsurers().then(setInsurers).catch(console.error));

            // Prefill policy number if OCR caught it
            let foundPolicy = '';
            if (data.claim.policy_number) {
                foundPolicy = data.claim.policy_number;
            } else {
                const po = data.extracted_fields.find(f => f.field_category === 'policy' && f.field_name === 'policy.policy_number');
                if (po?.field_value) {
                    foundPolicy = po.field_value;
                }
            }
            if (foundPolicy) {
                setEnteredPolicyNumber(foundPolicy);
            }
            // Add a new piece of state to track missing policy number
            setMissingPolicyNumber(!foundPolicy);

            // Check for missing mandatory fields
            const hasDiagnosis = data.extracted_fields.some(f => f.field_name === 'clinical.diagnosis' && f.field_value);
            const hasLlmIcd = data.extracted_fields.some(f => f.field_name === 'clinical.icd_code' && f.field_value);
            
            // If Comprehend found ICD codes, use the top one as a fallback for the icd_code field
            const comprehendCodesField = data.extracted_fields.find(f => f.field_name === 'comprehend_icd10_codes');
            const topComprehendCode = comprehendCodesField?.field_value
                ? comprehendCodesField.field_value.split(',')[0].trim()
                : null;
            const hasIcdCode = hasLlmIcd || !!topComprehendCode;
            
            // Look for either bill_amount or total_bill_amount
            const hasBillAmount = data.extracted_fields.some(f => 
                (f.field_name === 'financial.bill_amount' || f.field_name === 'financial.total_bill_amount') 
                && f.field_value
            );
            
            setMissingDiagnosis(!hasDiagnosis);
            setMissingIcdCode(!hasIcdCode);
            // Pre-fill with top comprehend code so hospital can just confirm rather than type
            if (!hasLlmIcd && topComprehendCode) {
                setEnteredIcdCode(topComprehendCode);
            }
            setMissingBillAmount(!hasBillAmount);
        }
    }, [data?.claim.status, data?.claim.policy_number, data?.extracted_fields]);

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

    const handleLinkPolicySubmit = async () => {
        if (!id || !selectedInsurerId || !enteredPolicyNumber) {
            setLinkError('Both Insurer and Policy Number are required.');
            return;
        }
        if (missingDiagnosis && !enteredDiagnosis) {
            setLinkError('Diagnosis is required.');
            return;
        }
                // ICD-10 code is optional — Comprehend Medical provides fallback
        if (missingBillAmount && !enteredBillAmount) {
            setLinkError('Bill Amount is required.');
            return;
        }
        
        setLinkError('');
        setLinkLoading(true);
        try {
            await claimsApi.linkPolicy(
                parseInt(id), 
                parseInt(selectedInsurerId), 
                enteredPolicyNumber,
                missingDiagnosis ? enteredDiagnosis : undefined,
                missingIcdCode ? enteredIcdCode : undefined,
                missingBillAmount ? enteredBillAmount : undefined
            );
            await fetchData();
        } catch (err: any) {
            setLinkError(err?.response?.data?.detail || 'Failed to submit policy information.');
        } finally {
            setLinkLoading(false);
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

    // Group fields by category (filtering out raw Comprehend JSON)
    const fieldsByCategory = new Map<string, typeof data.extracted_fields>();
    for (const field of data.extracted_fields) {
        if (field.field_name.startsWith('comprehend_icd10_')) {
            continue;
        }
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
        { key: 'history' as const, label: 'Patient History', icon: Users, count: patientHistory?.total_past_claims ?? 0 },
    ];

    // Parse cached Comprehend Medical data from extracted fields
    const comprehendCodeField = data.extracted_fields.find(
        f => f.field_category === 'clinical' && f.field_name === 'comprehend_icd10_codes'
    );
    const cachedEntities: ComprehendICD10Entity[] = data.extracted_fields
        .filter(f => f.field_category === 'clinical' && f.field_name.match(/^comprehend_icd10_\d+$/))
        .sort((a, b) => a.field_name.localeCompare(b.field_name, undefined, { numeric: true }))
        .map(f => { try { return JSON.parse(f.field_value ?? ''); } catch { return null; } })
        .filter(Boolean) as ComprehendICD10Entity[];

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

            {/* Missing Policy Banner */}
            {user?.role === 'HOSPITAL' && data.claim.status === 'EXTRACTED' && (
                <div className="card" style={{ marginBottom: '24px', padding: '24px', border: '2px solid var(--warning)', background: '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#854d0e' }}>
                            Missing Information Required
                        </h3>
                    </div>
                    <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: '#92400e' }}>
                        The automated extraction pipeline completed successfully, but some mandatory information is missing. Please provide the details below to proceed to automated validation.
                    </p>
                    
                    {linkError && (
                        <div style={{ padding: '12px', background: 'var(--error-bg)', color: 'var(--error)', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '16px', border: '1px solid #fecaca' }}>
                            {linkError}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                Insurer <span style={{ color: 'var(--error)' }}>*</span>
                            </label>
                            <select
                                value={selectedInsurerId}
                                onChange={(e) => setSelectedInsurerId(e.target.value)}
                                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white' }}
                                disabled={linkLoading}
                            >
                                <option value="">-- Select Insurer --</option>
                                {insurers.map(i => (
                                    <option key={i.id} value={i.id}>{i.username}</option>
                                ))}
                            </select>
                        </div>
                        {missingPolicyNumber && (
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    Policy Number <span style={{ color: 'var(--error)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={enteredPolicyNumber}
                                    onChange={(e) => setEnteredPolicyNumber(e.target.value)}
                                    placeholder="Enter policy number..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white' }}
                                    disabled={linkLoading}
                                />
                            </div>
                        )}
                        
                        {missingDiagnosis && (
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    Diagnosis <span style={{ color: 'var(--error)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={enteredDiagnosis}
                                    onChange={(e) => setEnteredDiagnosis(e.target.value)}
                                    placeholder="Enter diagnosis..."
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white' }}
                                    disabled={linkLoading}
                                />
                            </div>
                        )}

                        {missingIcdCode && (
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    ICD-10 Code <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.78rem' }}>(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={enteredIcdCode}
                                    onChange={(e) => setEnteredIcdCode(e.target.value)}
                                    placeholder="e.g. A01.0"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white' }}
                                    disabled={linkLoading}
                                />
                            </div>
                        )}

                        {missingBillAmount && (
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    Total Bill Amount <span style={{ color: 'var(--error)' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={enteredBillAmount}
                                    onChange={(e) => setEnteredBillAmount(e.target.value)}
                                    placeholder="e.g. ₹55,000"
                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white' }}
                                    disabled={linkLoading}
                                />
                            </div>
                        )}
                        
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', marginTop: '10px' }}>
                            <button 
                                className="btn btn-primary" 
                                style={{ padding: '10px 24px', background: '#d97706', borderColor: '#d97706', height: '42px' }}
                                onClick={handleLinkPolicySubmit}
                                disabled={linkLoading || !selectedInsurerId || !enteredPolicyNumber}
                            >
                                {linkLoading ? 'Submitting...' : 'Submit & Run Validation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Requested Banner */}
            {user?.role === 'HOSPITAL' && data.claim.status === 'INFO_REQUESTED' && (
                <div style={{ 
                    marginBottom: '24px', 
                    padding: '16px 20px', 
                    borderLeft: '4px solid var(--warning)', 
                    background: 'var(--warning-bg)', 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '12px',
                    borderRadius: '8px' 
                }}>
                    <AlertTriangle size={20} style={{ color: 'var(--warning)', marginTop: '2px' }} />
                    <div>
                        <h4 style={{ margin: '0 0 4px 0', color: '#854d0e', fontSize: '0.95rem', fontWeight: 600 }}>Information Requested</h4>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#a16207' }}>
                            The insurer has requested additional information or missing documents. Please click <strong>Upload Missing Doc</strong> below to submit the required files and resume processing.
                        </p>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={fetchData}>
                    <RefreshCw size={15} />
                    Refresh
                </button>

                {user?.role === 'HOSPITAL' && (
                    <>
                        {data.claim.status !== 'EXTRACTED' && (
                            <button className="btn btn-primary" onClick={runValidation} disabled={validating}>
                                <ShieldCheck size={15} />
                                {validating ? 'Validating…' : 'Run Validation'}
                            </button>
                        )}
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

            {/* Document Summary */}
            {data.summary && (
                <div className="card animate-scale-in" style={{
                    marginBottom: '24px',
                    padding: '24px',
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0fdfa 100%)',
                    border: '1px solid #bbf7d0',
                    borderLeft: '4px solid #22c55e',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: '#dcfce7', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <BookOpen size={18} style={{ color: '#16a34a' }} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#15803d', margin: 0 }}>
                                Document Summary
                            </h3>
                            <span style={{ fontSize: '0.72rem', color: '#4ade80' }}>
                                {data.summary.document_count} document{data.summary.document_count !== 1 ? 's' : ''} analyzed · {formatDate(data.summary.created_at)}
                            </span>
                        </div>
                    </div>

                    <div style={{
                        padding: '16px 18px',
                        background: 'rgba(255,255,255,0.7)', borderRadius: '8px',
                        border: '1px solid rgba(34,197,94,0.15)',
                    }}>
                        {data.summary.summary_text.split('\n\n').map((paragraph, idx) => (
                            <p key={idx} style={{
                                fontSize: '0.9rem', lineHeight: '1.7', color: '#1a1a2e',
                                margin: idx === 0 ? '0 0 12px 0' : '12px 0',
                                ...(idx === data.summary!.summary_text.split('\n\n').length - 1 ? { marginBottom: 0 } : {}),
                            }}>
                                {paragraph}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* ICD-10 Code Analysis Card */}
            <ICD10Card
                claimId={data.claim.id}
                cachedCodes={comprehendCodeField?.field_value ?? undefined}
                cachedEntities={cachedEntities.length > 0 ? cachedEntities : undefined}
            />

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
                                            isCorrected={field.is_manually_corrected || corrections.has(field.id)}
                                            canEdit={user?.role === 'HOSPITAL'}
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
                            {user?.role === 'INSURER' && (
                                <button
                                    className="btn-icon"
                                    onClick={() => claimsApi.downloadDocument(data.claim.id, doc.id, doc.original_filename)}
                                    title="Download Document"
                                    style={{ marginLeft: '12px', color: 'var(--accent-blue)', background: 'var(--info-bg)' }}
                                >
                                    <Download size={16} />
                                </button>
                            )}
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

            {activeTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {historyLoading ? (
                        <div className="empty-state">
                            <div className="spinner" style={{ width: '32px', height: '32px' }} />
                            <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>Loading patient history...</p>
                        </div>
                    ) : patientHistory && patientHistory.claims.length > 0 ? (
                        <>
                            <div style={{
                                padding: '14px 18px',
                                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.05))',
                                borderRadius: '10px',
                                border: '1px solid rgba(99, 102, 241, 0.15)',
                                marginBottom: '4px'
                            }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>
                                    <Users size={15} style={{ verticalAlign: 'middle', marginRight: '8px', color: '#6366F1' }} />
                                    <strong>{patientHistory.patient_name}</strong> has <strong style={{ color: '#6366F1' }}>{patientHistory.total_past_claims}</strong> previous claim{patientHistory.total_past_claims !== 1 ? 's' : ''} on record.
                                </p>
                            </div>
                            {patientHistory.claims.map((claim) => (
                                <div
                                    key={claim.claim_id}
                                    onClick={() => navigate(`/claims/${claim.claim_id}`)}
                                    style={{
                                        padding: '18px',
                                        borderRadius: '10px',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        cursor: 'pointer',
                                        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                                        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.boxShadow = 'none';
                                        e.currentTarget.style.borderColor = 'var(--border)';
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                                            Claim #{String(claim.claim_id).padStart(5, '0')}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <StatusBadge status={claim.status} />
                                            {claim.fraud_risk_score !== null && (
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600,
                                                    background: claim.fraud_risk_score > 70 ? 'var(--error-bg)' : claim.fraud_risk_score > 30 ? 'var(--warning-bg)' : 'var(--success-bg)',
                                                    color: claim.fraud_risk_score > 70 ? 'var(--error)' : claim.fraud_risk_score > 30 ? 'var(--warning)' : 'var(--success)',
                                                }}>
                                                    Risk: {claim.fraud_risk_score}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                                        {claim.diagnosis && (
                                            <span>🩺 <strong style={{ color: 'var(--text-primary)' }}>{claim.diagnosis}</strong></span>
                                        )}
                                        {claim.total_amount && (
                                            <span>💰 Amount: <strong style={{ color: 'var(--text-primary)' }}>{claim.total_amount}</strong></span>
                                        )}
                                        {claim.hospital_name && (
                                            <span>🏥 {claim.hospital_name}</span>
                                        )}
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={12} /> {formatDate(claim.created_at)}
                                        </span>
                                        {claim.reviewer_decision && (
                                            <span>Decision: <strong>{claim.reviewer_decision}</strong></span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div className="card empty-state">
                            <Users size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                            <h3 style={{ marginTop: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>No Previous Claims</h3>
                            <p style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                {data.claim.patient_name
                                    ? `No other claims found for ${data.claim.patient_name}.`
                                    : 'Patient name has not been extracted yet. Process the claim first.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
