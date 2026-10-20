'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  formatPaymentMethod,
  formatStatus,
  getStatusVariant,
} from '@/lib/format';
import { exportPaymentsToCSV } from '@/lib/export';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import type { ClientPayment, Project, PaymentMethod } from '@/types/database';

interface EnrichedPayment extends ClientPayment {
  project_name?: string;
  project_status?: string;
  milestone_name?: string;
}

function PaymentsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<EnrichedPayment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (PRD §6.14)
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || 'all');
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Edit payment modal state
  const [editingPayment, setEditingPayment] = useState<EnrichedPayment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editMethod, setEditMethod] = useState<PaymentMethod>('bank_transfer');
  const [editRef, setEditRef] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setStatusFilter(statusParam);
    } else {
      setStatusFilter('all');
    }
  }, [searchParams]);

  useEffect(() => {
    loadPayments(true);
  }, []);

  async function loadPayments(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // 1. Fetch payments
    const { data: payData } = await supabase
      .from('client_payments')
      .select('*')
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });

    // 2. Fetch projects
    const { data: projData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    // 3. Fetch milestones
    const { data: msData } = await supabase
      .from('payment_milestones')
      .select('id, name')
      .is('deleted_at', null);

    const projectList = (projData || []) as Project[];
    const projectMap = new Map(projectList.map(p => [p.id, p]));
    const msMap = new Map((msData || []).map(m => [m.id, m.name]));

    const enriched: EnrichedPayment[] = ((payData || []) as ClientPayment[]).map(p => {
      const proj = projectMap.get(p.project_id);
      return {
        ...p,
        project_name: proj?.name || 'Unknown Project',
        project_status: proj?.status || 'active',
        milestone_name: p.milestone_id ? msMap.get(p.milestone_id) : undefined,
      };
    });

    setPayments(enriched);
    setProjects(projectList);
    setLoading(false);
  }

  function handleStatusFilterChange(newStatus: string) {
    setStatusFilter(newStatus);
    if (newStatus === 'all') {
      router.replace('/payments', { scroll: false });
    } else {
      router.replace(`/payments?status=${newStatus}`, { scroll: false });
    }
  }

  function handleOpenEdit(pay: EnrichedPayment) {
    setEditingPayment(pay);
    setEditAmount(pay.amount.toString());
    setEditDate(pay.payment_date);
    setEditMethod(pay.method);
    setEditRef(pay.reference_no || '');
    setEditNote(pay.note || '');
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPayment) return;
    setSavingEdit(true);
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount');
      setSavingEdit(false);
      return;
    }
    const updatedId = editingPayment.id;
    const { error: updateErr } = await supabase
      .from('client_payments')
      .update({
        amount: amt,
        payment_date: editDate,
        method: editMethod,
        reference_no: editRef.trim() || null,
        note: editNote.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingPayment.id);

    if (updateErr) {
      alert(`Error updating payment: ${updateErr.message}`);
    } else {
      setEditingPayment(null);
      await loadPayments(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${updatedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('row-highlight');
          setTimeout(() => el.classList.remove('row-highlight'), 2500);
        }
      }, 50);
    }
    setSavingEdit(false);
  }

  // Soft delete payment
  async function handleDeletePayment(id: string) {
    if (!confirm('Move this payment to trash? Project totals will update immediately.')) return;
    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('client_payments')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', id);

    await loadPayments(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Filtered payments (Combines Status + Project + Method + Date Range + Search)
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (statusFilter !== 'all' && p.project_status !== statusFilter) return false;
      if (selectedProject && p.project_id !== selectedProject) return false;
      if (selectedMethod && p.method !== selectedMethod) return false;
      if (startDate && p.payment_date < startDate) return false;
      if (endDate && p.payment_date > endDate) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          (p.project_name && p.project_name.toLowerCase().includes(q)) ||
          (p.reference_no && p.reference_no.toLowerCase().includes(q)) ||
          (p.received_by && p.received_by.toLowerCase().includes(q)) ||
          (p.note && p.note.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [payments, statusFilter, selectedProject, selectedMethod, startDate, endDate, search]);

  const totalFilteredAmount = useMemo(
    () => filteredPayments.reduce((s, p) => s + Number(p.amount), 0),
    [filteredPayments]
  );

  const activeFilters =
    (statusFilter !== 'all' ? 1 : 0) +
    (selectedProject ? 1 : 0) +
    (selectedMethod ? 1 : 0) +
    (startDate || endDate ? 1 : 0) +
    (search ? 1 : 0);

  const uniqueProjectsInFilter = useMemo(
    () => new Set(filteredPayments.map(p => p.project_id)).size,
    [filteredPayments]
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">💰 Client Payments (Money In)</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Record and reconcile all client advances and milestone payments
          </p>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => exportPaymentsToCSV(filteredPayments)}
            disabled={filteredPayments.length === 0}
          >
            📥 Export CSV ({filteredPayments.length})
          </button>
          <Link href="/payments/add" className="btn btn-primary">
            ➕ Record Payment
          </Link>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card stat-card--success">
          <div className="stat-card__label">
            <span>Total Collected</span>
            <Tooltip text={TOOLTIPS.client_has_paid} />
          </div>
          <div className="stat-card__value text-success">{formatPKR(totalFilteredAmount)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {filteredPayments.length} payment transactions
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">
            <span>
              {statusFilter === 'active'
                ? 'Active Sites Paid'
                : statusFilter === 'on_hold'
                ? 'On-Hold Sites Paid'
                : 'Projects Paid'}
            </span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {uniqueProjectsInFilter} {uniqueProjectsInFilter === 1 ? 'Site' : 'Sites'}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {statusFilter === 'active'
              ? 'Across active construction sites'
              : statusFilter === 'on_hold'
              ? 'Sites currently on hold'
              : 'Across all project stages'}
          </span>
        </div>

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Average Payment</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-primary-blue)' }}>
            {formatPKRShort(filteredPayments.length > 0 ? totalFilteredAmount / filteredPayments.length : 0)}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Per receipt
          </span>
        </div>
      </div>

      {/* Multi-Filters Bar (PRD §6.14) */}
      <div className="card filter-bar-container">
        <div className="filter-bar-controls">
          <input
            type="text"
            className="input"
            placeholder="Search project, trx ref, note..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            className="select"
            value={statusFilter}
            onChange={e => handleStatusFilterChange(e.target.value)}
          >
            <option value="all">All Project Statuses ({payments.length})</option>
            <option value="active">Active Projects Only ({payments.filter(p => p.project_status === 'active').length})</option>
            <option value="on_hold">On Hold Projects ({payments.filter(p => p.project_status === 'on_hold').length})</option>
            <option value="completed">Completed Projects ({payments.filter(p => p.project_status === 'completed').length})</option>
          </select>

          <select
            className="select"
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
          >
            <option value="">All Sites ({projects.length})</option>
            {projects
              .filter(p => statusFilter === 'all' || p.status === statusFilter)
              .map(p => (
                <option key={p.id} value={p.id}>
                  🏗️ {p.name} {p.status !== 'active' ? `(${formatStatus(p.status)})` : ''}
                </option>
              ))}
          </select>

          <select
            className="select"
            value={selectedMethod}
            onChange={e => setSelectedMethod(e.target.value)}
          >
            <option value="">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="easypaisa">Easypaisa</option>
            <option value="jazzcash">JazzCash</option>
            <option value="other">Other</option>
          </select>

          {/* Date Range Pill with From -> To labels */}
          <div className="date-range-pill">
            <span style={{ fontSize: '0.8125rem', flexShrink: 0 }}>📅</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary-text)', flexShrink: 0 }}>From:</span>
            <input
              type="date"
              className="date-range-pill-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              title="Start Date (From)"
            />
            <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 700, margin: '0 0.15rem', flexShrink: 0 }}>➔</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-secondary-text)', flexShrink: 0 }}>To:</span>
            <input
              type="date"
              className="date-range-pill-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              title="End Date (To)"
            />
          </div>

          {activeFilters > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                handleStatusFilterChange('all');
                setSelectedProject('');
                setSelectedMethod('');
                setStartDate('');
                setEndDate('');
                setSearch('');
              }}
              style={{ color: 'var(--color-red)', fontWeight: 600 }}
            >
              Clear
            </button>
          )}
        </div>

        <span className="text-muted" style={{ fontSize: '0.78125rem', flexShrink: 0 }}>
          Showing {filteredPayments.length} of {payments.length} payments
        </span>
      </div>

      {/* Active Filter Banner when filtered to Active Projects */}
      {statusFilter === 'active' && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1E40AF', fontSize: '0.875rem' }}>
            <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
            <span>
              <strong>Showing Active Projects Only:</strong> {filteredPayments.length} payment records totaling <strong>{formatPKRShort(totalFilteredAmount)}</strong> across {uniqueProjectsInFilter} active sites (matching Dashboard).
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => handleStatusFilterChange('all')}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            Show All Projects ({payments.length} payments)
          </button>
        </div>
      )}

      {/* Active Filter Banner when filtered to On Hold Projects */}
      {statusFilter === 'on_hold' && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#FFFBEB',
            border: '1px solid #FDE68A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400E', fontSize: '0.875rem' }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <span>
              <strong>Showing On-Hold Projects:</strong> {filteredPayments.length} payment records totaling <strong>{formatPKRShort(totalFilteredAmount)}</strong> for on-hold sites.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => handleStatusFilterChange('all')}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            Show All Projects ({payments.length} payments)
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading payments ledger...</span>
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">💰</div>
          <div className="empty-state__title">No payments found</div>
          <div className="empty-state__desc">
            Try adjusting your search criteria or record a new client payment.
          </div>
          <Link href="/payments/add" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Record Payment
          </Link>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Method</th>
                  <th>Reference / Trx ID</th>
                  <th>Linked Milestone</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Amount Received</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((pay) => (
                  <tr key={pay.id} id={`row-${pay.id}`}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{pay.serial_no ?? '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500, fontSize: '0.8125rem' }}>
                      {formatDate(pay.payment_date)}
                    </td>
                    <td>
                      <div className="flex items-center gap-xs">
                        <Link href={`/projects/${pay.project_id}`} style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                          {pay.project_name}
                        </Link>
                        {pay.project_status && pay.project_status !== 'active' && (
                          <span className={`badge badge-${getStatusVariant(pay.project_status)}`} style={{ fontSize: '0.6875rem', padding: '0.1rem 0.4rem' }}>
                            {formatStatus(pay.project_status)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-success">
                        {formatPaymentMethod(pay.method)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                      {pay.reference_no || '-'}
                    </td>
                    <td>
                      {pay.milestone_name ? (
                        <span className="chip chip--cyan" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                          {pay.milestone_name}
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>General Advance</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>
                      {pay.note || '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-money text-success" style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                        +{formatPKR(pay.amount)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="flex justify-end gap-xs">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-info"
                          onClick={() => handleOpenEdit(pay)}
                          title="Edit Payment"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-danger"
                          onClick={() => handleDeletePayment(pay.id)}
                          title="Move to Trash"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Client Payment</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingPayment(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-proj">Project</label>
                <input
                  id="edit-pay-proj"
                  type="text"
                  className="input"
                  value={editingPayment.project_name || ''}
                  disabled
                  style={{ background: 'var(--color-bg-secondary, #F1F5F9)', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-amt">Amount Received (PKR) <span className="required">*</span></label>
                <input
                  id="edit-pay-amt"
                  type="number"
                  className="input"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-date">Date Received <span className="required">*</span></label>
                <input
                  id="edit-pay-date"
                  type="date"
                  className="input"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-method">Payment Method</label>
                <select
                  id="edit-pay-method"
                  className="select"
                  value={editMethod}
                  onChange={(e) => setEditMethod(e.target.value as PaymentMethod)}
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Physical Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-ref">Cheque No. / Transaction ID</label>
                <input
                  id="edit-pay-ref"
                  type="text"
                  className="input"
                  placeholder="e.g. FT26098234 or CHQ-00912"
                  value={editRef}
                  onChange={(e) => setEditRef(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-note">Notes</label>
                <input
                  id="edit-pay-note"
                  type="text"
                  className="input"
                  placeholder="e.g. Received via Meezan Bank online transfer"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentsListPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="loading-screen">
            <div className="spinner spinner-lg" />
            <span className="text-muted">Loading payments ledger...</span>
          </div>
        </div>
      }
    >
      <PaymentsListContent />
    </Suspense>
  );
}
