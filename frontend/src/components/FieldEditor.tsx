import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

interface FieldEditorProps {
    fieldId: number;
    label: string;
    value: string | null;
    confidence: number | null;
    isCorrected: boolean;
    onSave: (fieldId: number, newValue: string) => void;
}

export default function FieldEditor({ fieldId, label, value, confidence, isCorrected, onSave }: FieldEditorProps) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(value || '');

    const handleSave = () => {
        onSave(fieldId, editValue);
        setEditing(false);
    };

    const handleCancel = () => {
        setEditValue(value || '');
        setEditing(false);
    };

    const confPercent = confidence != null ? Math.round(confidence * 100) : null;
    const confClass = confPercent != null
        ? confPercent >= 80 ? 'confidence-high'
            : confPercent >= 50 ? 'confidence-medium'
                : 'confidence-low'
        : '';

    return (
        <div className="field-row">
            <span className="field-label">{label.replace(/_/g, ' ')}</span>
            <div className="field-value" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {editing ? (
                    <>
                        <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            autoFocus
                            style={{ flex: 1 }}
                        />
                        <button className="btn-icon" onClick={handleSave} title="Save">
                            <Check size={16} style={{ color: 'var(--success)' }} />
                        </button>
                        <button className="btn-icon" onClick={handleCancel} title="Cancel">
                            <X size={16} style={{ color: 'var(--error)' }} />
                        </button>
                    </>
                ) : (
                    <>
                        <span className={isCorrected ? 'field-corrected' : ''}>
                            {value || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Not found</span>}
                        </span>
                        <button className="btn-icon" onClick={() => setEditing(true)} title="Edit">
                            <Pencil size={14} />
                        </button>
                    </>
                )}
            </div>
            {confPercent != null && (
                <div className="field-confidence" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span>{confPercent}%</span>
                    <div className="confidence-bar" style={{ width: '50px' }}>
                        <div className={`confidence-fill ${confClass}`} style={{ width: `${confPercent}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
}
