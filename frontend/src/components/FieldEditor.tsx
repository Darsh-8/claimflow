import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

interface FieldEditorProps {
    fieldId: number;
    label: string;
    value: string | null;
    isCorrected: boolean;
    canEdit?: boolean;
    onSave: (fieldId: number, newValue: string) => void;
}

export default function FieldEditor({ fieldId, label, value, isCorrected, canEdit = true, onSave }: FieldEditorProps) {
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


    return (
        <div className="field-row">
            <span className="field-label">{label.replace(/_/g, ' ')}</span>
            <div className="field-value" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                {editing && canEdit ? (
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
                        {canEdit && (
                            <button className="btn-icon" onClick={() => setEditing(true)} title="Edit">
                                <Pencil size={14} />
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
