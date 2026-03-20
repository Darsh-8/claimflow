import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Loader2, Building } from 'lucide-react';
import FileDropzone from '../components/FileDropzone';
import { claimsApi, usersApi, type UserResponse } from '../client/apiClient';

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
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [insurers, setInsurers] = useState<UserResponse[]>([]);
    const [selectedInsurerId, setSelectedInsurerId] = useState<number | ''>('');

    useEffect(() => {
        const fetchInsurers = async () => {
            try {
                const list = await usersApi.getInsurers();
                setInsurers(list);
            } catch (err) {
                console.error("Failed to fetch insurers", err);
            }
        };
        fetchInsurers();
    }, []);

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
        if (selectedInsurerId === '') {
            setError('Please select an Insurer for this claim.');
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const files = entries.map((e) => e.file);
            const docTypes = entries.map((e) => e.docType);
            const result = await claimsApi.upload(files, docTypes, Number(selectedInsurerId));
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
                <h1 className="page-title">Upload Claim Documents</h1>
                <p className="page-subtitle">
                    Upload hospital documents to create a new claim. Supported formats: PDF, JPG, PNG.
                </p>
            </div>

            {/* Insurer Selection */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Building size={18} style={{ color: 'var(--accent-blue)' }} /> 
                    Assign to Insurer
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        Select the Insurer handling this claim:
                    </label>
                    <select
                        value={selectedInsurerId}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSelectedInsurerId(val === '' ? '' : Number(val));
                            if (val !== '') setError(null);
                        }}
                        style={{
                            padding: '10px 14px',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            fontFamily: 'inherit',
                            backgroundColor: 'white',
                            color: 'var(--text-primary)',
                            maxWidth: '400px'
                        }}
                    >
                        <option value="">-- Choose an Insurer --</option>
                        {insurers.map(insurer => (
                            <option key={insurer.id} value={insurer.id}>
                                {insurer.username}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Dropzone */}
            <div className="card" style={{ padding: '28px', marginBottom: '20px' }}>
                <FileDropzone onFilesSelected={handleFilesSelected} />
            </div>

            {/* File List */}
            {entries.length > 0 && (
                <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Documents to Upload ({entries.length})
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
                                <FileText size={17} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
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
                <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>
                    <span>{error}</span>
                </div>
            )}

            {/* Upload Button */}
            <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || entries.length === 0}
                style={{ opacity: uploading || entries.length === 0 ? 0.5 : 1 }}
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
    );
}
