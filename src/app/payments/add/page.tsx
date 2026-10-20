'use client';

import { Suspense, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parsePKRInput, formatPKR, getTodayPKT } from '@/lib/format';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, PaymentMethod } from '@/types/database';

export default function AddPaymentPage() {
  return (
    <Suspense fallback={<div className="page-container"><p className="text-muted">Loading...</p></div>}>
      <AddPaymentForm />
    </Suspense>
  );
}

function AddPaymentForm() {
  const searchParams = useSearchParams();
  const preselectedProject = searchParams.get('project');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(preselectedProject || '');
  const [paymentDate, setPaymentDate] = useState(getTodayPKT());
  const [amountInput, setAmountInput] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [note, setNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      setProjects((data || []) as Project[]);
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const amount = parsePKRInput(amountInput);
    if (amount === null || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from('client_payments').insert({
      project_id: projectId,
      payment_date: paymentDate,
      amount,
      method,
      reference_no: referenceNo || null,
      received_by: receivedBy || null,
      note: note || null,
      created_by: user.id,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push('/payments');
  }

  const paymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: 'cash', label: '💵 Cash' },
    { value: 'bank_transfer', label: '🏦 Bank Transfer' },
    { value: 'cheque', label: '📝 Cheque' },
    { value: 'easypaisa', label: '📱 Easypaisa' },
    { value: 'jazzcash', label: '📱 JazzCash' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Record Client Payment</h1>
      </div>

      <div className="card-flat" style={{ maxWidth: '560px' }}>
        <form onSubmit={handleSubmit}>
          {/* Project */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-project">Project *</label>
            <select
              id="payment-project"
              className="form-select"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              required
            >
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-amount">Amount (PKR) *</label>
            <input
              id="payment-amount"
              className="form-input form-input-lg"
              inputMode="numeric"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder='e.g. "5 lakh" or "500000"'
              required
            />
            {amountInput && parsePKRInput(amountInput) !== null && (
              <span className="form-hint" style={{ color: 'var(--color-success)' }}>
                → {formatPKR(parsePKRInput(amountInput))}
              </span>
            )}
          </div>

          {/* Date */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-date">Date Received *</label>
            <input
              id="payment-date"
              type="date"
              className="form-input"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              required
            />
          </div>

          {/* Payment Method */}
          <div className="form-group">
            <label className="form-label">Method *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {paymentMethods.map(m => (
                <button
                  key={m.value}
                  type="button"
                  className={`chip ${method === m.value ? 'chip--active' : ''}`}
                  onClick={() => setMethod(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-ref">Reference No.</label>
            <input
              id="payment-ref"
              className="form-input"
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              placeholder="Cheque no., transaction ID, etc."
            />
          </div>

          {/* Received By */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-received-by">Received By</label>
            <input
              id="payment-received-by"
              className="form-input"
              value={receivedBy}
              onChange={e => setReceivedBy(e.target.value)}
              placeholder="Who received this payment?"
            />
          </div>

          {/* Note */}
          <div className="form-group">
            <label className="form-label" htmlFor="payment-note">Note</label>
            <input
              id="payment-note"
              className="form-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Any notes..."
            />
          </div>

          {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}

          <div className="flex gap-sm">
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? <span className="spinner" /> : '💰 Record Payment'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => router.push('/payments')}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
