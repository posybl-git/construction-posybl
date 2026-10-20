'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  formatPaymentMethod,
} from '@/lib/format';
import { exportPayablesToCSV } from '@/lib/export';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import { fetchAllPages } from '@/lib/supabase-helpers';
import type { Expense, Vendor, Project, PaymentMethod } from '@/types/database';

interface PayeePayables {
  vendor_id: string | null;
  vendor_name: string;
  total_unpaid: number;
  expenses: (Expense & { project_name?: string })[];
}

export default function PayablesPage() {
  const [payables, setPayables] = useState<PayeePayables[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters (PRD §6.14)
  const [payeeSearch, setPayeeSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [agingFilter, setAgingFilter] = useState<'all' | 'over30' | 'over60'>('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Mark as paid modal
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<(Expense & { project_name?: string }) | null>(null);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidMethod, setPaidMethod] = useState<PaymentMethod>('cash');
  const [marking, setMarking] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadPayables(true);
  }, []);

  async function loadPayables(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // Fetch all unpaid expenses via auto-paginating helper
    const unpaidExpenses = await fetchAllPages<Expense>((from, to) =>
      supabase
        .from('expenses')
        .select('*')
        .eq('payment_status', 'unpaid')
        .is('deleted_at', null)
        .order('expense_date', { ascending: true })
        .range(from, to)
    );

    // Fetch vendors
    const { data: vendorsData } = await supabase
      .from('vendors')
      .select('*')
      .is('deleted_at', null);
    const vendorMap = new Map((vendorsData || []).map((v: Vendor) => [v.id, v.name]));

    // Fetch projects
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    const projectList = (projectsData || []) as Project[];
    const projectMap = new Map(projectList.map(p => [p.id, p.name]));

    const groups: { [key: string]: PayeePayables } = {};
    let grandTotal = 0;

    for (const exp of (unpaidExpenses || []) as Expense[]) {
      const amount = Number(exp.amount);
      grandTotal += amount;

      const payeeName = exp.vendor_id
        ? (vendorMap.get(exp.vendor_id) || 'Unknown Vendor')
        : (exp.vendor_name || 'Unassigned Payee');
      const key = exp.vendor_id || payeeName || 'unassigned';

      if (!groups[key]) {
        groups[key] = {
          vendor_id: exp.vendor_id,
          vendor_name: payeeName,
          total_unpaid: 0,
          expenses: [],
        };
      }

      groups[key].total_unpaid += amount;
      groups[key].expenses.push({
        ...exp,
        project_name: projectMap.get(exp.project_id) || 'Unknown Project',
      });
    }

    setPayables(Object.values(groups).sort((a, b) => b.total_unpaid - a.total_unpaid));
    setProjects(projectList);
    setTotalOutstanding(grandTotal);
    setLoading(false);
  }

  async function handleConfirmMarkPaid(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedExpense) return;
    setMarking(true);

    const prevScrollY = window.scrollY;
    const { error } = await supabase
      .from('expenses')
      .update({
        payment_status: 'paid',
        paid_date: paidDate,
        paid_method: paidMethod,
      })
      .eq('id', selectedExpense.id);

    if (!error) {
      setSelectedExpense(null);
      await loadPayables(false);
      setTimeout(() => {
        window.scrollTo({ top: prevScrollY, behavior: 'instant' });
      }, 50);
    }
    setMarking(false);
  }

  // Filter logic across payees and their bills
  const filteredPayables = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];

    return payables
      .map(group => {
        // Filter expenses in group
        const matchingExpenses = group.expenses.filter(exp => {
          if (selectedProject && exp.project_id !== selectedProject) return false;
          if (agingFilter === 'over30' && exp.expense_date >= thirtyDaysAgoStr) return false;
          if (agingFilter === 'over60' && exp.expense_date >= sixtyDaysAgoStr) return false;
          if (minAmount && Number(exp.amount) < Number(minAmount)) return false;
          if (maxAmount && Number(exp.amount) > Number(maxAmount)) return false;
          return true;
        });

        if (matchingExpenses.length === 0) return null;

        if (payeeSearch) {
          const q = payeeSearch.toLowerCase();
          const match =
            group.vendor_name.toLowerCase().includes(q) ||
            matchingExpenses.some(
              e =>
                e.expense_name.toLowerCase().includes(q) ||
                (e.purpose && e.purpose.toLowerCase().includes(q))
            );
          if (!match) return null;
        }

        return {
          ...group,
          expenses: matchingExpenses,
          total_unpaid: matchingExpenses.reduce((s, e) => s + Number(e.amount), 0),
        };
      })
      .filter(Boolean) as PayeePayables[];
  }, [payables, payeeSearch, selectedProject, agingFilter, minAmount, maxAmount]);

  const filteredGrandTotal = useMemo(
    () => filteredPayables.reduce((s, g) => s + g.total_unpaid, 0),
    [filteredPayables]
  );

  const totalFilteredBillsCount = useMemo(
    () => filteredPayables.reduce((s, g) => s + g.expenses.length, 0),
    [filteredPayables]
  );

  // Flatten for CSV export
  function handleExportPayables() {
    const flatRows: {
      vendor_name: string;
      expense_name: string;
      project_name: string;
      expense_date: string;
      amount: number;
      category: string;
      purpose?: string | null;
    }[] = [];

    filteredPayables.forEach(g => {
      g.expenses.forEach(e => {
        flatRows.push({
          vendor_name: g.vendor_name,
          expense_name: e.expense_name,
          project_name: e.project_name || 'N/A',
          expense_date: e.expense_date,
          amount: Number(e.amount),
          category: e.category,
          purpose: e.purpose,
        });
      });
    });

    exportPayablesToCSV(flatRows);
  }

  const activeFilters =
    (payeeSearch ? 1 : 0) +
    (selectedProject ? 1 : 0) +
    (agingFilter !== 'all' ? 1 : 0) +
    (minAmount || maxAmount ? 1 : 0);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <span className="text-muted">Loading payables...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">⏳ Who Do I Owe? (Payables)</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Unpaid bills across all sites — grouped by vendor, oldest first
          </p>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportPayables}
            disabled={totalFilteredBillsCount === 0}
          >
            📥 Export CSV ({totalFilteredBillsCount})
          </button>
          <Link href="/expenses/add" className="btn btn-primary">
            ➕ Add Expense
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card stat-card--warning">
          <div className="stat-card__label">
            <span>Total Outstanding Payables</span>
            <Tooltip text={TOOLTIPS.still_to_pay_vendors} />
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
            {formatPKR(filteredGrandTotal)}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Across {filteredPayables.length} payees / vendors
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">
            <span>Pending Invoices</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {totalFilteredBillsCount} Bills
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Awaiting cash settlement
          </span>
        </div>

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Payees to Settle</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-primary-blue)' }}>
            {filteredPayables.length} Accounts
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Labour, mistri & hardware
          </span>
        </div>
      </div>

      {/* Filters Bar (PRD §6.14) */}
      <div
        className="card"
        style={{
          padding: '0.875rem 1rem',
          marginBottom: '1.25rem',
          background: 'var(--color-card-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.625rem',
        }}
      >
        <div className="filter-bar-responsive flex items-center gap-xs flex-wrap">
          <input
            type="text"
            className="input"
            placeholder="Search vendor, description..."
            value={payeeSearch}
            onChange={e => setPayeeSearch(e.target.value)}
            style={{ width: '220px', height: '34px', fontSize: '0.8125rem' }}
          />

          <select
            className="select"
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Construction Sites</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                🏗️ {p.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={agingFilter}
            onChange={e => setAgingFilter(e.target.value as any)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="all">All Bill Ages</option>
            <option value="over30">⚠️ Ageing &gt; 30 Days</option>
            <option value="over60">🚨 Critical &gt; 60 Days</option>
          </select>

          <input
            type="number"
            className="input"
            placeholder="Min Amount"
            value={minAmount}
            onChange={e => setMinAmount(e.target.value)}
            style={{ width: '120px', height: '34px', fontSize: '0.8125rem' }}
          />

          {activeFilters > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPayeeSearch('');
                setSelectedProject('');
                setAgingFilter('all');
                setMinAmount('');
                setMaxAmount('');
              }}
              style={{ color: 'var(--color-red)' }}
            >
              Clear
            </button>
          )}
        </div>

        <span className="text-muted" style={{ fontSize: '0.78125rem' }}>
          Showing {totalFilteredBillsCount} unpaid bills
        </span>
      </div>

      {filteredPayables.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">✨</div>
          <div className="empty-state__title">All Caught Up!</div>
          <div className="empty-state__desc">There are no outstanding unpaid bills matching your filter.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredPayables.map(group => (
            <div key={group.vendor_name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '0.875rem 1.25rem',
                  background: 'var(--color-card-deep)',
                  borderBottom: '1px solid var(--color-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1.0625rem', color: 'var(--color-navy)', margin: 0 }}>
                    🏪 {group.vendor_name}
                  </h3>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {group.expenses.length} unpaid bill{group.expenses.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="text-muted" style={{ fontSize: '0.6875rem' }}>TOTAL DUE: </span>
                  <span className="text-money text-danger" style={{ fontSize: '1.125rem', fontWeight: 800 }}>
                    {formatPKR(group.total_unpaid)}
                  </span>
                </div>
              </div>

              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="table">
                  <thead>
                                        <tr>
                      <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                      <th>Date</th>
                      <th>Description / Purpose</th>
                      <th>Site</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Amount Due</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.expenses.map((exp, idx) => (
                      <tr
                        key={exp.id}
                        id={`row-${exp.id}`}
                        onClick={() => setSelectedDetailExpense(exp)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{exp.serial_no ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>
                          {formatDate(exp.expense_date)}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{exp.expense_name}</div>
                          {exp.purpose && (
                            <div className="text-muted" style={{ fontSize: '0.71875rem' }}>{exp.purpose}</div>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/projects/${exp.project_id}`}
                            style={{ fontSize: '0.8125rem', fontWeight: 600 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {exp.project_name}
                          </Link>
                        </td>
                        <td>
                          <span className="chip chip--cyan" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                            {exp.category}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="text-money text-danger" style={{ fontWeight: 700 }}>
                            {formatPKR(exp.amount)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedExpense(exp);
                              setPaidDate(new Date().toISOString().split('T')[0]);
                            }}
                          >
                            ✅ Mark as Paid
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: MARK AS PAID (PRD §6.9) */}
      {selectedExpense && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">✅ Settle Unpaid Bill</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedExpense(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmMarkPaid}>
              <div style={{ background: '#F8FAFC', padding: '0.875rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-secondary-text)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Expense Item
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-navy)' }}>
                  {selectedExpense.expense_name}
                </div>
                <div className="text-money text-danger" style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem' }}>
                  {formatPKR(selectedExpense.amount)}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="paid-date-input">
                  Date Paid <span className="required">*</span>
                </label>
                <input
                  id="paid-date-input"
                  type="date"
                  className="input"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label" htmlFor="paid-method-select">
                  Payment Method <span className="required">*</span>
                </label>
                <select
                  id="paid-method-select"
                  className="select"
                  value={paidMethod}
                  onChange={e => setPaidMethod(e.target.value as PaymentMethod)}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedExpense(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={marking}>
                  {marking ? 'Updating...' : 'Confirm Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={selectedDetailExpense}
        onClose={() => setSelectedDetailExpense(null)}
      />
    </div>
  );
}
