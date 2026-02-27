interface StatusBadgeProps {
    status: string;
}

const statusConfig: Record<string, { className: string; label: string }> = {
    PENDING: { className: 'badge-pending', label: 'Pending' },
    PROCESSING: { className: 'badge-processing', label: 'Processing' },
    EXTRACTED: { className: 'badge-extracted', label: 'Extracted' },
    VALIDATED: { className: 'badge-validated', label: 'Validated' },
    COMPLETE: { className: 'badge-complete', label: 'Complete' },
    INCOMPLETE: { className: 'badge-incomplete', label: 'Incomplete' },
    ERROR: { className: 'badge-error', label: 'Error' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
    const config = statusConfig[status] || { className: 'badge-pending', label: status };
    return (
        <span className={`badge ${config.className}`}>
            {config.label}
        </span>
    );
}
