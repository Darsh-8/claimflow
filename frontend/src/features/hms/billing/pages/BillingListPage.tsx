import { useState, useEffect } from 'react';
import { Plus, Loader2, Receipt, Search, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { billingApi } from '../api/billingApi';
import InvoiceForm from '../components/InvoiceForm';
import { SearchInput } from '../../../components/SearchInput';
import { EmptyState } from '../../../components/EmptyState';
import type { Invoice, InvoiceCreate } from '../../types';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#d97706' },
  paid: { bg: 'var(--success-bg)', color: 'var(--success)' },
  partial: { bg: 'var(--accent-light)', color: 'var(--accent-blue)' },
  cancelled: { bg: 'var(--error-bg)', color: 'var(--error)' },
};

function statusBadge(status: string) {
  const s = STATUS_STYLE[status?.toLowerCase()] ?? { bg: 'var(--border)', color: 'var(--text-muted)' };
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: s.bg, color: s.color, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function fmt(dt?: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Net Banking', 'Cheque', 'Insurance'];

export default function BillingListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [payingId, setPayingId] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState('Cash');

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      setInvoices(await billingApi.list({ status: statusFilter || undefined }));
    } catch {
      setError('Failed to load invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [statusFilter]);

  const filtered = invoices.filter(inv => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      inv.patient_name?.toLowerCase().includes(q) ||
      inv.invoice_number.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (data: InvoiceCreate) => {
    setSaving(true);
    try {
      await billingApi.create(data);
      setShowForm(false);
      fetchInvoices();
      toast.success('Invoice created.');
    } catch {
      toast.error('Failed to create invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!payingId) return;
    try {
      await billingApi.markPaid(payingId, payMethod);
      setPayingId(null);
      fetchInvoices();
      toast.success('Invoice marked as paid.');
    } catch {
      toast.error('Failed to update invoice.');
    }
  };

  const handleCancel = async (inv: Invoice) => {
    if (!confirm(`Cancel invoice ${inv.invoice_number}?`)) return;
    try {
      await billingApi.cancel(inv.id);
      fetchInvoices();
      toast.success('Invoice cancelled.');
    } catch {
      toast.error('Failed to cancel invoice.');
    }
  };

  const totalPending = invoices.filter(i => i.status === 'pending' || i.status === 'partial').reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const totalCollected = invoices.reduce((s, i) => s + i.paid_amount, 0);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Mark Paid Modal */}
      {payingId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Mark as Paid</h2>
            <div style={{ marginBottom: '16px' }}>
              <label className="field-label" style={{ display: 'block', marginBottom: '5px' }}>Payment Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPayingId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleMarkPaid}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>Billing</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ₹{totalCollected.toLocaleString('en-IN')} collected · ₹{totalPending.toLocaleString('en-IN')} pending
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Invoices', value: invoices.length, icon: <Receipt size={16} /> },
          { label: 'Paid', value: invoices.filter(i => i.status === 'paid').length, color: 'var(--success)' },
          { label: 'Pending', value: invoices.filter(i => i.status === 'pending').length, color: '#d97706' },
          { label: 'Total Collected', value: `₹${totalCollected.toLocaleString('en-IN')}`, icon: <IndianRupee size={14} />, color: 'var(--accent-blue)' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '4px' }}>{card.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: card.color ?? 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '28px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Create Invoice</h2>
            <InvoiceForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} loading={saving} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search patient or invoice number…" />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[{ v: '', label: 'All' }, { v: 'pending', label: 'Pending' }, { v: 'paid', label: 'Paid' }, { v: 'partial', label: 'Partial' }, { v: 'cancelled', label: 'Cancelled' }].map(opt => (
            <button key={opt.v} onClick={() => setStatusFilter(opt.v)}
              style={{ border: 'none', borderRadius: '100px', padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: statusFilter === opt.v ? 'var(--accent-blue)' : 'var(--border)', color: statusFilter === opt.v ? '#fff' : 'var(--text-secondary)', transition: 'all 150ms' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={24} style={{ animation: 'spin 0.7s linear infinite', color: 'var(--text-muted)' }} />
        </div>
      )}
      {error && <div className="validation-item validation-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Receipt} message="No invoices found." />
      )}

      {!loading && filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                {['Invoice #', 'Patient', 'Date', 'Total', 'Paid', 'Balance', 'Status', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{inv.invoice_number}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.patient_name ?? `#${inv.patient_id}`}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmt(inv.invoice_date)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{inv.total.toLocaleString('en-IN')}</td>
                  <td style={{ color: 'var(--success)' }}>₹{inv.paid_amount.toLocaleString('en-IN')}</td>
                  <td style={{ color: inv.total > inv.paid_amount ? '#d97706' : 'var(--text-muted)' }}>
                    ₹{(inv.total - inv.paid_amount).toLocaleString('en-IN')}
                  </td>
                  <td>{statusBadge(inv.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {(inv.status === 'pending' || inv.status === 'partial') && (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setPayingId(inv.id)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 8px', color: 'var(--success)', borderColor: 'var(--success)' }}>Mark Paid</button>
                        <button onClick={() => handleCancel(inv)} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 8px', color: 'var(--error)', borderColor: 'var(--error)' }}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
