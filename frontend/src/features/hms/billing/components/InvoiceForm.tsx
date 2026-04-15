import { useState, useEffect, type FormEvent } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { patientsApi } from '../../patients/api/patientsApi';
import type { InvoiceCreate, LineItem, Patient } from '../../types';

interface InvoiceFormProps {
  onSubmit: (data: InvoiceCreate) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  initialPatientId?: number;
}

const emptyLineItem = (): LineItem => ({ description: '', quantity: 1, unit_price: 0, total: 0 });

export default function InvoiceForm({ onSubmit, onCancel, loading = false, initialPatientId }: InvoiceFormProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState<Omit<InvoiceCreate, 'line_items'>>({
    patient_id: initialPatientId ?? 0,
    subtotal: 0,
    discount: 0,
    tax_rate: 18,
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    patientsApi.list().then(p => setPatients(p.filter(x => x.is_active)));
  }, []);

  const updateLineItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const next = [...prev];
      const item = { ...next[idx], [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        item.total = Number(item.quantity) * Number(item.unit_price);
      }
      next[idx] = item;
      // recalculate subtotal
      const subtotal = next.reduce((s, i) => s + i.total, 0);
      setForm(f => ({ ...f, subtotal }));
      return next;
    });
  };

  const addLine = () => setLineItems(prev => [...prev, emptyLineItem()]);
  const removeLine = (idx: number) => {
    setLineItems(prev => {
      const next = prev.filter((_, i) => i !== idx);
      const subtotal = next.reduce((s, i) => s + i.total, 0);
      setForm(f => ({ ...f, subtotal }));
      return next;
    });
  };

  const taxRate = form.tax_rate ?? 18;
  const discount = form.discount ?? 0;
  const taxAmount = ((form.subtotal - discount) * taxRate) / 100;
  const total = form.subtotal - discount + taxAmount;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!form.patient_id) { setSubmitError('Patient is required.'); return; }
    if (lineItems.some(l => !l.description.trim())) { setSubmitError('All line items need a description.'); return; }
    try {
      await onSubmit({ ...form, line_items: lineItems });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invoice.';
      setSubmitError(msg);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {submitError && (
        <div className="validation-item validation-error">
          <span style={{ fontSize: '0.875rem' }}>{submitError}</span>
        </div>
      )}

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>
          Patient <span style={{ color: 'var(--error)' }}>*</span>
        </label>
        <select value={form.patient_id || ''} onChange={e => setForm(f => ({ ...f, patient_id: Number(e.target.value) }))} required>
          <option value="">Select patient</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Line items */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label className="field-label">Line Items</label>
          <button type="button" onClick={addLine} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}>
            <Plus size={13} /> Add item
          </button>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 100px 32px', gap: '0', background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', padding: '6px 10px' }}>
            {['Description', 'Qty', 'Unit Price', 'Total', ''].map(h => (
              <div key={h} style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{h}</div>
            ))}
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px 100px 32px', gap: '0', borderBottom: idx < lineItems.length - 1 ? '1px solid var(--border)' : 'none', padding: '6px 10px', alignItems: 'center' }}>
              <input
                type="text" value={item.description}
                onChange={e => updateLineItem(idx, 'description', e.target.value)}
                placeholder="Service / item"
                style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', outline: 'none', color: 'var(--text-primary)', padding: '2px 0' }}
              />
              <input
                type="number" min={1} value={item.quantity}
                onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', outline: 'none', color: 'var(--text-primary)', padding: '2px 4px', width: '70px' }}
              />
              <input
                type="number" min={0} step="0.01" value={item.unit_price}
                onChange={e => updateLineItem(idx, 'unit_price', Number(e.target.value))}
                style={{ border: 'none', background: 'transparent', fontSize: '0.85rem', outline: 'none', color: 'var(--text-primary)', padding: '2px 4px', width: '100px' }}
              />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>₹{item.total.toFixed(2)}</div>
              <button
                type="button" onClick={() => removeLine(idx)}
                disabled={lineItems.length === 1}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', opacity: lineItems.length === 1 ? 0.3 : 1, padding: '2px', display: 'flex', alignItems: 'center' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Discount (₹)</label>
          <input type="number" min={0} step="0.01" value={form.discount ?? 0}
            onChange={e => setForm(f => ({ ...f, discount: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Tax Rate (%)</label>
          <input type="number" min={0} max={100} step="0.01" value={form.tax_rate ?? 18}
            onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Total</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>₹{total.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Notes</label>
        <textarea rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, remarks…" style={{ resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading && <Loader2 size={15} style={{ animation: 'spin 0.7s linear infinite' }} />}
          {loading ? 'Creating…' : 'Create Invoice'}
        </button>
      </div>
    </form>
  );
}
