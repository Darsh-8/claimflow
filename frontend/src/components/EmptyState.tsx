import React from 'react';

export function EmptyState({ icon: Icon, message }: { icon: React.ElementType, message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
      <Icon size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
      <p style={{ margin: 0 }}>{message}</p>
    </div>
  );
}
