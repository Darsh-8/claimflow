import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, FileText, X, Loader2, ScanLine, Brain, ShieldCheck, AlertOctagon, User } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { claimsApi } from '../client/apiClient';

const DOC_TYPE_OPTIONS = [
    { value: 'discharge_summary', label: 'Discharge Summary' },
    { value: 'bill', label: 'Bill / Invoice' },
    { value: 'lab_report', label: 'Lab Report' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'pre_auth', label: 'Pre-Authorization Form' },
];

interface FileEntry {
    file: File;
    docType: string;
}

export default function UploadPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const patientName = searchParams.get('patient') || undefined;
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFilesSelected = (files: File[]) => {
        const newEntries = files.map((file) => ({
            file,
            docType: guessDocType(file.name),
        }));
        setEntries((prev) => [...prev, ...newEntries]);
        setError(null);
    };

    const guessDocType = (filename: string): string => {
        const lower = filename.toLowerCase();
        if (lower.includes('discharge') || lower.includes('summary')) return 'discharge_summary';
        if (lower.includes('bill') || lower.includes('invoice')) return 'bill';
        if (lower.includes('lab') || lower.includes('report') || lower.includes('investigation')) return 'lab_report';
        if (lower.includes('prescription') || lower.includes('rx')) return 'prescription';
        if (lower.includes('pre_auth') || lower.includes('authorization')) return 'pre_auth';
        return 'discharge_summary';
    };

    const removeEntry = (index: number) => {
        setEntries((prev) => prev.filter((_, i) => i !== index));
    };

    const updateDocType = (index: number, newType: string) => {
        setEntries((prev) =>
            prev.map((entry, i) => (i === index ? { ...entry, docType: newType } : entry))
        );
    };

    const handleUpload = async () => {
        if (entries.length === 0) {
            setError('Please add at least one document.');
            return;
        }
        setUploading(true);
        setError(null);
        try {
            const files = entries.map((e) => e.file);
            const docTypes = entries.map((e) => e.docType);
            const result = await claimsApi.upload(files, docTypes, patientName);
            navigate(`/claims/${result.claim_id}`);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Upload Claim Documents</h1>
                    <p className="page-subtitle">
                        Drop hospital documents below — our AI pipeline handles the rest.
                    </p>
                </div>
            </div>

            {patientName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--accent-light)', border: '1px solid var(--accent-blue)', borderRadius: 'var(--radius-sm)', padding: '10px 16px', marginBottom: '20px' }}>
                    <User size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                        Creating claim for patient: <strong>{patientName}</strong>
                    </span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>

                {/* ── Left column: dropzone + file list + actions ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Dropzone */}
                    <div className="card" style={{ padding: '28px' }}>
                        <FileDropzone onFilesSelected={handleFilesSelected} />
                    </div>

                    {/* File List */}
                    {entries.length > 0 && (
                        <div className="card" style={{ padding: '20px' }}>
                            <h3 style={{
                                fontSize: '0.78rem', fontWeight: 700, marginBottom: '14px',
                                color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}>
                                <FileText size={14} style={{ color: 'var(--accent-blue)' }} />
                                Documents to Upload
                                <span style={{
                                    background: 'var(--accent-light)', color: 'var(--accent-blue)',
                                    borderRadius: '100px', padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700
                                }}>
                                    {entries.length}
                                </span>
                            </h3>
                            <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {entries.map((entry, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '11px 14px',
                                            background: 'var(--border-subtle)',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div style={{
                                            width: '34px', height: '34px', borderRadius: 'var(--radius-sm)',
                                            background: 'var(--info-bg)', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {entry.file.name}
                                            </div>
                                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                                {formatSize(entry.file.size)}
                                            </div>
                                        </div>
                                        <select
                                            value={entry.docType}
                                            onChange={(e) => updateDocType(i, e.target.value)}
                                            style={{ width: '200px', flexShrink: 0 }}
                                        >
                                            {DOC_TYPE_OPTIONS.map((opt) => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                        <button className="btn-icon" onClick={() => removeEntry(i)} title="Remove">
                                            <X size={15} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="validation-item validation-error">
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Upload Button */}
                    <button
                        className="btn btn-primary"
                        onClick={handleUpload}
                        disabled={uploading || entries.length === 0}
                        style={{ opacity: uploading || entries.length === 0 ? 0.5 : 1, alignSelf: 'flex-start' }}
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={18} className="spinner" style={{ border: 'none', width: '18px', height: '18px' }} />
                                Processing…
                            </>
                        ) : (
                            <>
                                <Upload size={18} />
                                Upload & Process Claim
                            </>
                        )}
                    </button>
                </div>

                {/* ── Right column: pipeline info ── */}
                <div className="pipeline-panel">
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        What happens next?
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                        Once uploaded, your documents go through a 4-stage automated pipeline.
                    </p>

                    <div className="pipeline-step">
                        <div className="pipeline-step-num">
                            <ScanLine size={13} />
                        </div>
                        <div>
                            <div className="pipeline-step-label">OCR Extraction</div>
                            <div className="pipeline-step-desc">Kimi K2.5 vision model reads all pages across PDF, JPG, PNG files.</div>
                        </div>
                    </div>

                    <div className="pipeline-step">
                        <div className="pipeline-step-num">
                            <Brain size={13} />
                        </div>
                        <div>
                            <div className="pipeline-step-label">AI Field Parsing</div>
                            <div className="pipeline-step-desc">LLM extracts patient, policy, clinical and financial fields — supports Hindi, Bengali, Tamil & more.</div>
                        </div>
                    </div>

                    <div className="pipeline-step">
                        <div className="pipeline-step-num">
                            <ShieldCheck size={13} />
                        </div>
                        <div>
                            <div className="pipeline-step-label">IRDAI Validation</div>
                            <div className="pipeline-step-desc">Checks mandatory document completeness, ICD-10 codes, and regulatory compliance.</div>
                        </div>
                    </div>

                    <div className="pipeline-step">
                        <div className="pipeline-step-num">
                            <AlertOctagon size={13} />
                        </div>
                        <div>
                            <div className="pipeline-step-label">Fraud Scoring</div>
                            <div className="pipeline-step-desc">30+ rules covering billing, clinical, temporal and network anomalies assign a 0–100 risk score.</div>
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            Supported Formats
                        </div>
                        <div className="format-pills">
                            <span className="format-pill">PDF</span>
                            <span className="format-pill">JPG</span>
                            <span className="format-pill">PNG</span>
                            <span className="format-pill">TIFF</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            Document Types
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {DOC_TYPE_OPTIONS.map(opt => (
                                <div key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />
                                    {opt.label}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
