'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  getTodayPKT,
  getYesterdayPKT,
  getCurrentMonthPKT,
} from '@/lib/format';
import { exportExpensesToCSV } from '@/lib/export';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import { fetchAllPages } from '@/lib/supabase-helpers';
import type { Expense, Project, Profile } from '@/types/database';

type DatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_12_months'
  | 'custom';

type GroupBy = 'none' | 'date' | 'payee' | 'project';

interface EnrichedExpense extends Expense {
  project_name?: string;
  created_by_name?: string;
}

export default function AllExpensesPage() {
  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [loading, setLoading] = useState(true);

  // Filters (PRD §6.14)
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  const [selectedPayee, setSelectedPayee] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPaidVia, setSelectedPaidVia] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');

  // Edit Expense Modal state
  const [editingExpense, setEditingExpense] = useState<EnrichedExpense | null>(null);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<EnrichedExpense | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editPaidVia, setEditPaidVia] = useState<'site_float' | 'direct'>('direct');
  const [editSupervisorId, setEditSupervisorId] = useState<string>('');
  const [savingEditExpense, setSavingEditExpense] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadAllData(true);
  }, []);

  async function loadAllData(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // 1. Fetch all active expenses via auto-paginating helper (loads all 1200+ rows)
    const expData = await fetchAllPages<Expense>((from, to) =>
      supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    // 2. Fetch projects
    const { data: projData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    // 3. Fetch profiles
    const { data: profData } = await supabase
      .from('profiles')
      .select('*');

    const projectList = (projData || []) as Project[];
    const profileList = (profData || []) as Profile[];
    const projectMap = new Map(projectList.map(p => [p.id, p.name]));
    const profileMap = new Map(profileList.map(p => [p.id, p.full_name]));

    const enriched: EnrichedExpense[] = ((expData || []) as Expense[]).map(e => ({
      ...e,
      project_name: projectMap.get(e.project_id) || 'Unknown Project',
      created_by_name: profileMap.get(e.created_by) || 'User',
    }));

    setExpenses(enriched);
    setProjects(projectList);
    setProfiles(profileList);
    setLoading(false);
  }

  function handleOpenEditExpense(exp: EnrichedExpense) {
    setEditingExpense(exp);
    setEditName(exp.expense_name);
    setEditAmount(exp.amount.toString());
    setEditDate(exp.expense_date);
    setEditProjectId(exp.project_id);
    setEditPaidVia(exp.paid_via);

    const supProfiles = profiles.filter(p => p.role === 'site_manager');
    if (exp.paid_via === 'site_float' && exp.created_by) {
      setEditSupervisorId(exp.created_by);
    } else if (supProfiles.length > 0) {
      setEditSupervisorId(supProfiles[0].id);
    } else {
      setEditSupervisorId('');
    }
  }


  async function handleSaveEditExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    setSavingEditExpense(true);
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid expense amount');
      setSavingEditExpense(false);
      return;
    }

    const updatedId = editingExpense.id;
    const { data: { user } } = await supabase.auth.getUser();

    let finalCreatedBy = editingExpense.created_by;
    if (editPaidVia === 'site_float') {
      if (!editSupervisorId) {
        alert('Please select a site supervisor for site float');
        setSavingEditExpense(false);
        return;
      }
      finalCreatedBy = editSupervisorId;
    } else if (editPaidVia === 'direct') {
      if (user) {
        finalCreatedBy = user.id;
      }
    }

    const { error: updateErr } = await supabase
      .from('expenses')
      .update({
        expense_name: editName.trim(),
        amount: amt,
        expense_date: editDate,
        project_id: editProjectId,
        payment_status: 'paid',
        paid_via: editPaidVia,
        created_by: finalCreatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingExpense.id);

    if (updateErr) {
      alert(`Error updating expense: ${updateErr.message}`);
    } else {
      setEditingExpense(null);
      await loadAllData(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${updatedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('row-highlight');
          setTimeout(() => el.classList.remove('row-highlight'), 2500);
        }
      }, 50);
    }
    setSavingEditExpense(false);
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm('Move this expense to trash? You can restore it anytime from Settings → Trash.')) {
      return;
    }

    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('expenses')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', id);

    await loadAllData(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Determine date bounds based on preset
  const dateBounds = useMemo(() => {
    const today = getTodayPKT();
    const yesterday = getYesterdayPKT();
    const currentMonth = getCurrentMonthPKT();
    const currentYear = new Date().getFullYear();

    if (datePreset === 'today') {
      return { start: today, end: today };
    }
    if (datePreset === 'yesterday') {
      return { start: yesterday, end: yesterday };
    }
    if (datePreset === 'this_week') {
      const d = new Date();
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff)).toISOString().split('T')[0];
      return { start: monday, end: today };
    }
    if (datePreset === 'this_month') {
      return { start: `${currentMonth}-01`, end: today };
    }
    if (datePreset === 'last_month') {
      const [y, m] = currentMonth.split('-').map(Number);
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      const prevMStr = `${prevY}-${prevM.toString().padStart(2, '0')}`;
      const lastDay = new Date(prevY, prevM, 0).getDate();
      return { start: `${prevMStr}-01`, end: `${prevMStr}-${lastDay}` };
    }
    if (datePreset === 'this_year') {
      return { start: `${currentYear}-01-01`, end: today };
    }
    if (datePreset === 'last_12_months') {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return { start: d.toISOString().split('T')[0], end: today };
    }
    if (datePreset === 'custom') {
      return { start: customStartDate, end: customEndDate };
    }
    return { start: '', end: '' };
  }, [datePreset, customStartDate, customEndDate]);

  // Filtered expenses (PRD §6.14: "Filters combine — each narrows the result")
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      // Date bounds
      if (dateBounds.start && e.expense_date < dateBounds.start) return false;
      if (dateBounds.end && e.expense_date > dateBounds.end) return false;

      // Project filter
      if (selectedProject && e.project_id !== selectedProject) return false;



      // Payee filter
      if (selectedPayee && (e.vendor_name || '') !== selectedPayee) return false;

      // Payment status filter
      if (selectedStatus && e.payment_status !== selectedStatus) return false;

      // Paid via filter
      if (selectedPaidVia && e.paid_via !== selectedPaidVia) return false;

      // Recorded by user
      if (selectedUser && e.created_by !== selectedUser) return false;

      // Min amount
      if (minAmount && Number(e.amount) < Number(minAmount)) return false;

      // Max amount
      if (maxAmount && Number(e.amount) > Number(maxAmount)) return false;

      // Search substring match
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          e.expense_name.toLowerCase().includes(q) ||
          (e.vendor_name && e.vendor_name.toLowerCase().includes(q)) ||
          (e.purpose && e.purpose.toLowerCase().includes(q)) ||
          (e.project_name && e.project_name.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [
    expenses,
    dateBounds,
    selectedProject,
    selectedPayee,
    selectedStatus,
    selectedPaidVia,
    selectedUser,
    minAmount,
    maxAmount,
    searchQuery,
  ]);

  // Sort filtered expenses
  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      if (sortBy === 'amount_desc') return Number(b.amount) - Number(a.amount);
      if (sortBy === 'amount_asc') return Number(a.amount) - Number(b.amount);
      if (sortBy === 'date_asc') return a.expense_date.localeCompare(b.expense_date);
      return b.expense_date.localeCompare(a.expense_date);
    });
  }, [filteredExpenses, sortBy]);

  // Active filters count
  const activeFilterCount =
    (datePreset !== 'all' ? 1 : 0) +
    (selectedProject ? 1 : 0) +
    (selectedPayee ? 1 : 0) +
    (selectedStatus ? 1 : 0) +
    (selectedPaidVia ? 1 : 0) +
    (selectedUser ? 1 : 0) +
    (minAmount || maxAmount ? 1 : 0) +
    (searchQuery ? 1 : 0);

  function handleClearFilters() {
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedProject('');
    setSelectedPayee('');
    setSelectedStatus('');
    setSelectedPaidVia('');
    setSelectedUser('');
    setSearchQuery('');
    setMinAmount('');
    setMaxAmount('');
  }

  // Calculated Live Metrics for filtered view (PRD §6.14)
  const totalFilteredAmount = useMemo(() => {
    return filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  }, [filteredExpenses]);

  const totalPaidAmount = useMemo(() => {
    return filteredExpenses.filter(e => e.payment_status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
  }, [filteredExpenses]);

  const totalUnpaidAmount = useMemo(() => {
    return filteredExpenses.filter(e => e.payment_status === 'unpaid').reduce((s, e) => s + Number(e.amount), 0);
  }, [filteredExpenses]);

  // Unique payees list for dropdown
  const uniquePayees = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach(e => {
      if (e.vendor_name) set.add(e.vendor_name);
    });
    return Array.from(set).sort();
  }, [expenses]);

  // Grouping logic (PRD §6.5 & §6.14)
  const groupedData = useMemo(() => {
    if (groupBy === 'none') return null;

    const map = new Map<string, EnrichedExpense[]>();
    sortedExpenses.forEach(e => {
      let key = 'Other';
      if (groupBy === 'date') key = formatDate(e.expense_date);
      else if (groupBy === 'payee') key = e.vendor_name || 'Unassigned Payee';
      else if (groupBy === 'project') key = e.project_name || 'Unassigned Project';

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });

    return Array.from(map.entries()).map(([groupTitle, items]) => ({
      groupTitle,
      items,
      total: items.reduce((s, it) => s + Number(it.amount), 0),
    }));
  }, [sortedExpenses, groupBy]);

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">💸 All Expenses Ledger</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Comprehensive expense tracking with multi-criteria search, filtering and export
          </p>
        </div>
        <div className="flex gap-xs">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => exportExpensesToCSV(filteredExpenses)}
            disabled={filteredExpenses.length === 0}
          >
            📥 Export CSV ({filteredExpenses.length})
          </button>
          <Link href="/expenses/add" className="btn btn-primary">
            ➕ Add Expense
          </Link>
        </div>
      </div>

      {/* Live Financial Totals Strip (PRD §6.14: "Totals respect the filters") */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span>Filtered Spend Total</span>
            <Tooltip text={TOOLTIPS.total_spent} />
          </div>
          <div className="stat-card__value">{formatPKR(totalFilteredAmount)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {filteredExpenses.length} expense entries
          </span>
        </div>

        <div className="stat-card stat-card--success">
          <div className="stat-card__label">
            <span>Paid (Settled)</span>
            <Tooltip text={TOOLTIPS.spent_from_client_money} />
          </div>
          <div className="stat-card__value text-success">{formatPKR(totalPaidAmount)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {filteredExpenses.filter(e => e.payment_status === 'paid').length} paid bills
          </span>
        </div>

        <div className="stat-card stat-card--warning">
          <div className="stat-card__label">
            <span>Unpaid (Due to Vendors)</span>
            <Tooltip text={TOOLTIPS.still_to_pay_vendors} />
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
            {formatPKR(totalUnpaidAmount)}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {filteredExpenses.filter(e => e.payment_status === 'unpaid').length} pending bills
          </span>
        </div>
      </div>

      {/* Multi-Filters Panel (PRD §6.14) */}
      <div
        className="card"
        style={{
          padding: '1.125rem',
          marginBottom: '1.25rem',
          background: 'var(--color-card-bg)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div className="flex justify-between items-center" style={{ marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="flex items-center gap-xs">
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-navy)' }}>
              🔍 Multi-Criteria Filters
            </span>
            {activeFilterCount > 0 && (
              <span className="badge badge-info" style={{ fontSize: '0.6875rem' }}>
                {activeFilterCount} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-xs">
            {activeFilterCount > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleClearFilters}
                style={{ color: 'var(--color-red)', fontWeight: 600 }}
              >
                Clear All Filters
              </button>
            )}
          </div>
        </div>

        {/* Date Presets Row */}
        <div style={{ marginBottom: '0.875rem' }}>
          <div className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.375rem' }}>
            Date Range Preset:
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All Time'],
                ['today', 'Today'],
                ['yesterday', 'Yesterday'],
                ['this_week', 'This Week'],
                ['this_month', 'This Month'],
                ['last_month', 'Last Month'],
                ['this_year', 'This Year'],
                ['last_12_months', 'Last 12 Months'],
                ['custom', 'Custom Range'],
              ] as [DatePreset, string][]
            ).map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                className={`btn btn-xs ${datePreset === val ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDatePreset(val)}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Inputs if custom preset */}
        {datePreset === 'custom' && (
          <div className="flex items-center gap-sm" style={{ marginBottom: '0.875rem', flexWrap: 'wrap' }}>
            <div>
              <span className="text-muted" style={{ fontSize: '0.6875rem' }}>Start Date:</span>
              <input
                type="date"
                className="input"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                style={{ height: '34px', fontSize: '0.8125rem' }}
              />
            </div>
            <div>
              <span className="text-muted" style={{ fontSize: '0.6875rem' }}>End Date:</span>
              <input
                type="date"
                className="input"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                style={{ height: '34px', fontSize: '0.8125rem' }}
              />
            </div>
          </div>
        )}

        {/* Dropdowns Filter Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.625rem',
            marginBottom: '0.75rem',
          }}
        >
          {/* Search Query */}
          <input
            type="text"
            className="input"
            placeholder="Search description, note..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          />

          {/* Project Filter */}
          <select
            className="select"
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Projects ({projects.length})</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                🏗️ {p.name}
              </option>
            ))}
          </select>



          {/* Payee / Vendor Filter */}
          <select
            className="select"
            value={selectedPayee}
            onChange={e => setSelectedPayee(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Payees / Vendors</option>
            {uniquePayees.map(v => (
              <option key={v} value={v}>
                🏪 {v}
              </option>
            ))}
          </select>

          {/* Payment Status Filter */}
          <select
            className="select"
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Statuses</option>
            <option value="paid">✅ Paid (Settled)</option>
            <option value="unpaid">⚠️ Unpaid (Due)</option>
          </select>

          {/* Paid Via Channel */}
          <select
            className="select"
            value={selectedPaidVia}
            onChange={e => setSelectedPaidVia(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Paid Via Channels</option>
            <option value="site_float">Site Float (Supervisor)</option>
            <option value="direct">Direct (Admin)</option>
          </select>

          {/* Recorded by User */}
          <select
            className="select"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="">All Team Members</option>
            {profiles.map(u => (
              <option key={u.id} value={u.id}>
                👤 {u.full_name} ({u.role === 'admin' ? 'Admin' : 'Supervisor'})
              </option>
            ))}
          </select>

          {/* Min / Max Amount */}
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input
              type="number"
              className="input"
              placeholder="Min PKR"
              value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              style={{ height: '34px', fontSize: '0.8125rem', width: '50%' }}
            />
            <input
              type="number"
              className="input"
              placeholder="Max PKR"
              value={maxAmount}
              onChange={e => setMaxAmount(e.target.value)}
              style={{ height: '34px', fontSize: '0.8125rem', width: '50%' }}
            />
          </div>
        </div>

        {/* Sorting & Group By Controls */}
        <div className="flex justify-between items-center" style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-line)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="flex items-center gap-xs">
            <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Group by:</span>
            <button
              type="button"
              className={`btn btn-xs ${groupBy === 'none' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGroupBy('none')}
            >
              None
            </button>
            <button
              type="button"
              className={`btn btn-xs ${groupBy === 'date' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGroupBy('date')}
            >
              📅 Date
            </button>

            <button
              type="button"
              className={`btn btn-xs ${groupBy === 'project' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGroupBy('project')}
            >
              🏗️ Project
            </button>
            <button
              type="button"
              className={`btn btn-xs ${groupBy === 'payee' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setGroupBy('payee')}
            >
              🏪 Payee
            </button>
          </div>

          <div className="flex items-center gap-xs">
            <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Sort:</span>
            <select
              className="select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{ height: '28px', fontSize: '0.75rem', padding: '0 0.5rem' }}
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Amount (Highest First)</option>
              <option value="amount_asc">Amount (Lowest First)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expenses Table or Grouped View */}
      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading expenses ledger...</span>
        </div>
      ) : sortedExpenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📝</div>
          <div className="empty-state__title">No matching expenses</div>
          <div className="empty-state__desc">
            Try adjusting or clearing your search filters.
          </div>
          {activeFilterCount > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleClearFilters} style={{ marginTop: '1rem' }}>
              Clear All Filters
            </button>
          )}
        </div>
      ) : groupBy !== 'none' && groupedData ? (
        /* Grouped View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {groupedData.map(group => (
            <div key={group.groupTitle} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'var(--color-card-deep)',
                  borderBottom: '1px solid var(--color-line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0 }}>
                    {group.groupTitle}
                  </h3>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                    {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="text-muted" style={{ fontSize: '0.6875rem' }}>SUBTOTAL: </span>
                  <span className="text-money" style={{ fontSize: '1.0625rem', fontWeight: 800 }}>
                    {formatPKR(group.total)}
                  </span>
                </div>
              </div>

              <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                      <th>Date</th>
                      <th>Expense Item</th>
                      <th>Project</th>
                      <th>Paid Via</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((exp, idx) => (
                      <tr
                        key={exp.id}
                        id={`row-${exp.id}`}
                        onClick={() => setSelectedDetailExpense(exp)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{exp.serial_no ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                          {formatDate(exp.expense_date)}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{exp.expense_name}</div>
                          <div className="flex items-center gap-xs flex-wrap" style={{ marginTop: '0.125rem' }}>
                            {exp.vendor_name && (
                              <span className="text-muted" style={{ fontSize: '0.75rem' }}>Payee: {exp.vendor_name}</span>
                            )}
                            {exp.reference_no && (
                              <span className="badge badge-neutral" style={{ fontSize: '0.6875rem', fontFamily: 'var(--font-mono)' }}>
                                Ref #{exp.reference_no}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          <Link
                            href={`/projects/${exp.project_id}`}
                            style={{ fontWeight: 600 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {exp.project_name}
                          </Link>
                        </td>
                        <td>
                          <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.6875rem' }}>
                            {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${exp.payment_status === 'paid' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.6875rem' }}>
                            {exp.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="text-money">{formatPKR(exp.amount)}</span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="flex justify-end gap-xs">
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-info"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditExpense(exp);
                              }}
                              title="Edit Expense"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExpense(exp.id);
                              }}
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
          ))}
        </div>
      ) : (
        /* Flat Table View */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Date</th>
                  <th>Expense Item</th>
                  <th>Project</th>
                  <th>Payee / Vendor</th>
                  <th>Paid Via</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedExpenses.map((exp, idx) => (
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
                        style={{ fontWeight: 600, fontSize: '0.8125rem' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {exp.project_name}
                      </Link>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      {exp.vendor_name || '—'}
                    </td>
                    <td>
                      <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.6875rem' }}>
                        {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${exp.payment_status === 'paid' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.6875rem' }}>
                        {exp.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-money" style={{ fontWeight: 700 }}>{formatPKR(exp.amount)}</span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="flex justify-end gap-xs">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-info"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditExpense(exp);
                          }}
                          title="Edit Expense"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteExpense(exp.id);
                          }}
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

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Expense</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingExpense(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditExpense}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-exp-proj">Site / Project *</label>
                <select
                  id="edit-exp-proj"
                  className="select"
                  value={editProjectId}
                  onChange={(e) => setEditProjectId(e.target.value)}
                  required
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-exp-name">Description *</label>
                <input
                  id="edit-exp-name"
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>



              <div className="form-group">
                <label className="form-label" htmlFor="edit-exp-amt">Total Amount (PKR) *</label>
                <input
                  id="edit-exp-amt"
                  type="number"
                  className="input"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-exp-date">Expense Date *</label>
                <input
                  id="edit-exp-date"
                  type="date"
                  className="input"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: editPaidVia === 'site_float' ? '0.75rem' : '1rem' }}>
                <label className="form-label" htmlFor="edit-exp-via">Paid Via</label>
                <select
                  id="edit-exp-via"
                  className="select"
                  value={editPaidVia}
                  onChange={(e) => {
                    const via = e.target.value as 'site_float' | 'direct';
                    setEditPaidVia(via);
                    if (via === 'site_float' && !editSupervisorId) {
                      const sup = profiles.find(p => p.role === 'site_manager');
                      if (sup) setEditSupervisorId(sup.id);
                    }
                  }}
                >
                  <option value="direct">🏛️ Direct (Admin)</option>
                  <option value="site_float">💼 Site Float (Supervisor)</option>
                </select>
              </div>

              {/* Site Supervisor Picker — shown when Site Float is selected */}
              {editPaidVia === 'site_float' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" htmlFor="edit-exp-supervisor">
                    Assigned Site Supervisor *
                  </label>
                  <select
                    id="edit-exp-supervisor"
                    className="select"
                    value={editSupervisorId}
                    onChange={(e) => setEditSupervisorId(e.target.value)}
                    required
                  >
                    <option value="">Select supervisor...</option>
                    {profiles
                      .filter(p => p.role === 'site_manager' && p.is_active !== false)
                      .map(sup => (
                        <option key={sup.id} value={sup.id}>
                          👤 {sup.full_name} {sup.phone ? `(${sup.phone})` : ''}
                        </option>
                      ))}
                  </select>
                  <span className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    This expense will deduct from this supervisor&apos;s cash passbook and appear in their site portal.
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingExpense(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditExpense}
                >
                  {savingEditExpense ? 'Saving...' : 'Save Changes'}
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
