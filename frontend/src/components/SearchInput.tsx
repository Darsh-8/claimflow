import { Search } from 'lucide-react';

export function SearchInput({ value, onChange, placeholder = 'Search...' }: { value: string, onChange: (val: string) => void, placeholder?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', flex: 1, minWidth: '200px' }}>
      <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input 
        type="text" 
        placeholder={placeholder} 
        value={value} 
        onChange={e => onChange(e.target.value)}
        style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }} 
      />
    </div>
  );
}
