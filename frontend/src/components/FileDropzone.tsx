import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { CloudUpload } from 'lucide-react';

interface FileDropzoneProps {
    onFilesSelected: (files: File[]) => void;
    acceptedTypes?: string;
    maxFiles?: number;
}

export default function FileDropzone({ onFilesSelected, acceptedTypes, maxFiles }: FileDropzoneProps) {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        onFilesSelected(acceptedFiles);
    }, [onFilesSelected]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: acceptedTypes ? { 'application/*': acceptedTypes.split(',').map(t => t.trim()) } : undefined,
        maxFiles,
    });

    return (
        <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps()} />
            <div className="dropzone-icon">
                <CloudUpload size={48} />
            </div>
            <p className="dropzone-text">
                {isDragActive ? (
                    <strong>Drop files here…</strong>
                ) : (
                    <>
                        <strong>Drag & drop</strong> files here, or <strong>click to browse</strong>
                    </>
                )}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Supports PDF, JPG, PNG — up to 20 MB per file
            </p>
        </div>
    );
}
