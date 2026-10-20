'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  getWhatsAppShareLink,
  generateTempPassword,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import { fetchAllPages } from '@/lib/supabase-helpers';
import type { Profile, Project, CashIssuance, Expense } from '@/types/database';

interface LedgerItem {
  id: string;
  date: string;
  type: 'issuance' | 'expense' | 'return' | 'adjustment';
  description: string;
  project_id?: string | null;
  project_name?: string;
  category?: string;
  amount_in: number;
  amount_out: number;
  running_balance: number;
  method?: string;
  note?: string;
  raw_amount?: number;
}

export default function UserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [rawExpensesList, setRawExpensesList] = useState<Expense[]>([]);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<Expense | null>(null);
  const [totalIssued, setTotalIssued] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [currentFloat, setCurrentFloat] = useState(0);
  const [lastIssuance, setLastIssuance] = useState<CashIssuance | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<'admin' | 'site_manager'>('admin');

  // Filters
  const [projectFilter, setProjectFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Modals
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResetPassModal, setShowResetPassModal] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [showPasswordInputText, setShowPasswordInputText] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialsData, setCredentialsData] = useState<{
    name: string;
    loginId: string;
    tempPass: string;
    phone?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form states
  const [actionAmount, setActionAmount] = useState('');
  const [actionDate, setActionDate] = useState(new Date().toISOString().split('T')[0]);
  const [actionProject, setActionProject] = useState('');
  const [actionFunding, setActionFunding] = useState<'own_funds'>('own_funds');
  const [actionMethod, setActionMethod] = useState<'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'other'>('cash');
  const [actionNote, setActionNote] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Assignment edit state
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  // Edit Issuance/Entry state
  const [showEditIssuanceModal, setShowEditIssuanceModal] = useState(false);
  const [editingIssuanceItem, setEditingIssuanceItem] = useState<LedgerItem | null>(null);
  const [editIssuanceAmount, setEditIssuanceAmount] = useState('');
  const [editIssuanceDate, setEditIssuanceDate] = useState('');
  const [editIssuanceProject, setEditIssuanceProject] = useState('');
  const [editIssuanceMethod, setEditIssuanceMethod] = useState<'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'other'>('cash');
  const [editIssuanceNote, setEditIssuanceNote] = useState('');
  const [savingEditIssuance, setSavingEditIssuance] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadUserData(true);
  }, [userId]);

  async function loadUserData(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // Check viewer's role
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let currentRole: 'admin' | 'site_manager' = 'admin';
    if (currentUser) {
      const { data: viewerData } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();
      if (viewerData?.role) {
        currentRole = viewerData.role as 'admin' | 'site_manager';
        setViewerRole(currentRole);
      }
    }

    // 1. Load user profile
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      router.push(currentRole === 'site_manager' ? '/site' : '/users');
      return;
    }
    setProfile(userProfile as Profile);

    // 2. Load all projects
    const { data: allProjects } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    setProjects((allProjects || []) as Project[]);

    // 3. Load user's assigned projects
    const { data: assignments } = await supabase
      .from('project_assignments')
      .select('project_id')
      .eq('user_id', userId);
    const assignedIds = (assignments || []).map(a => a.project_id);
    setAssignedProjectIds(assignedIds);
    setSelectedProjects(assignedIds);

    // 4. Load cash issuances (via auto-paginating helper)
    const rawIssuances = await fetchAllPages<CashIssuance>((from, to) =>
      supabase
        .from('cash_issuances')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('issue_date', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to)
    );

    // 5. Load expenses created by this user paid via site_float
    const rawExpenses = await fetchAllPages<Expense>((from, to) =>
      supabase
        .from('expenses')
        .select('*')
        .eq('created_by', userId)
        .eq('paid_via', 'site_float')
        .is('deleted_at', null)
        .order('expense_date', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to)
    );
    setRawExpensesList(rawExpenses);

    // Calculate totals via server-side RPC (accurate, immune to row limits)
    const { data: floatData } = await supabase.rpc('get_user_float_balance', { p_user_id: userId });
    const floatRow = Array.isArray(floatData) ? floatData[0] : floatData;
    const issuedSum = floatRow ? Number(floatRow.total_issued) : 0;
    const spentSum = floatRow ? Number(floatRow.total_spent) : 0;
    setTotalIssued(issuedSum);
    setTotalSpent(spentSum);
    setCurrentFloat(issuedSum - spentSum);

    const positiveIssuances = rawIssuances.filter(i => Number(i.amount) > 0 && !i.is_adjustment);
    if (positiveIssuances.length > 0) {
      setLastIssuance(positiveIssuances[positiveIssuances.length - 1]);
    } else {
      setLastIssuance(null);
    }

    // 6. Build chronological passbook ledger (PRD §6.12)
    interface RawEvent {
      date: string;
      createdAt: string;
      type: 'issuance' | 'expense' | 'return' | 'adjustment';
      amount: number;
      description: string;
      project_id?: string | null;
      category?: string;
      method?: string;
      note?: string;
      id: string;
    }

    const events: RawEvent[] = [];

    rawIssuances.forEach(i => {
      const numAmt = Number(i.amount);
      if (i.is_adjustment) {
        events.push({
          id: i.id,
          date: i.issue_date,
          createdAt: i.created_at,
          type: 'adjustment',
          amount: numAmt,
          description: `Adjustment: ${i.note || 'Cash count correction'}`,
          project_id: i.project_id,
          method: i.method,
          note: i.note || undefined,
        });
      } else if (numAmt < 0) {
        events.push({
          id: i.id,
          date: i.issue_date,
          createdAt: i.created_at,
          type: 'return',
          amount: Math.abs(numAmt),
          description: `Cash Returned: ${i.note || 'Unspent cash returned'}`,
          project_id: i.project_id,
          method: i.method,
          note: i.note || undefined,
        });
      } else {
        events.push({
          id: i.id,
          date: i.issue_date,
          createdAt: i.created_at,
          type: 'issuance',
          amount: numAmt,
          description: i.note ? `Cash Handed Over (${i.note})` : 'Cash Handed Over',
          project_id: i.project_id,
          method: i.method,
          note: i.note || undefined,
        });
      }
    });

    rawExpenses.forEach(e => {
      events.push({
        id: e.id,
        date: e.expense_date,
        createdAt: e.created_at,
        type: 'expense',
        amount: Number(e.amount),
        description: e.expense_name,
        project_id: e.project_id,
        category: e.category,
        method: e.paid_method || undefined,
        note: e.purpose || undefined,
      });
    });

    // Sort chronologically ascending to compute running balance
    events.sort((a, b) => {
      if (a.date === b.date) {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return a.date.localeCompare(b.date);
    });

    let runningBal = 0;
    const computedLedger: LedgerItem[] = events.map(ev => {
      let amountIn = 0;
      let amountOut = 0;

      if (ev.type === 'issuance') {
        amountIn = ev.amount;
        runningBal += ev.amount;
      } else if (ev.type === 'return') {
        amountOut = ev.amount;
        runningBal -= ev.amount;
      } else if (ev.type === 'expense') {
        amountOut = ev.amount;
        runningBal -= ev.amount;
      } else if (ev.type === 'adjustment') {
        if (ev.amount >= 0) {
          amountIn = ev.amount;
          runningBal += ev.amount;
        } else {
          amountOut = Math.abs(ev.amount);
          runningBal += ev.amount; // adding negative
        }
      }

      const proj = (allProjects || []).find(p => p.id === ev.project_id);

      return {
        id: ev.id,
        date: ev.date,
        type: ev.type,
        description: ev.description,
        project_id: ev.project_id,
        project_name: proj?.name,
        category: ev.category,
        amount_in: amountIn,
        amount_out: amountOut,
        running_balance: runningBal,
        method: ev.method,
        note: ev.note,
        raw_amount: ev.amount,
      };
    });

    // Reverse for display: newest first
    setLedger(computedLedger.reverse());
    setLoading(false);
  }

  // Handle Issue Cash
  async function handleIssueCash(e: React.FormEvent) {
    e.preventDefault();
    if (!actionAmount) return;
    setSavingAction(true);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('cash_issuances').insert({
      user_id: userId,
      project_id: actionProject || null,
      issue_date: actionDate,
      amount: Number(actionAmount),
      funding_source: actionFunding,
      method: actionMethod,
      note: actionNote || null,
      created_by: user?.id,
    });

    resetForm();
    setShowIssueModal(false);
    loadUserData();
  }

  // Handle Record Cash Returned
  async function handleReturnCash(e: React.FormEvent) {
    e.preventDefault();
    if (!actionAmount) return;
    setSavingAction(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Negative amount represents cash returned
    await supabase.from('cash_issuances').insert({
      user_id: userId,
      project_id: actionProject || null,
      issue_date: actionDate,
      amount: -Math.abs(Number(actionAmount)),
      funding_source: actionFunding,
      method: actionMethod,
      note: actionNote || 'Unspent cash returned to admin',
      created_by: user?.id,
    });

    resetForm();
    setShowReturnModal(false);
    loadUserData();
  }

  // Handle Adjustment
  async function handleAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!actionAmount || !actionNote.trim()) {
      alert('Adjustment reason/note is mandatory.');
      return;
    }
    setSavingAction(true);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('cash_issuances').insert({
      user_id: userId,
      project_id: actionProject || null,
      issue_date: actionDate,
      amount: Number(actionAmount),
      funding_source: actionFunding,
      method: actionMethod,
      note: actionNote.trim(),
      is_adjustment: true,
      created_by: user?.id,
    });

    resetForm();
    setShowAdjustModal(false);
    loadUserData();
  }

  // Handle Save Assignments
  async function handleSaveAssignments() {
    setSavingAction(true);
    const { error: delErr } = await supabase.from('project_assignments').delete().eq('user_id', userId);
    if (delErr) {
      console.error('Error deleting previous assignments:', delErr);
    }

    if (selectedProjects.length > 0) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const rows = selectedProjects.map(pid => ({
        project_id: pid,
        user_id: userId,
        created_by: currentUser?.id,
      }));
      const { error: insErr } = await supabase.from('project_assignments').insert(rows);
      if (insErr) {
        console.error('Error inserting assignments:', insErr);
      }
    }

    setShowAssignModal(false);
    setSavingAction(false);
    await loadUserData();
  }

  async function handleResetSupervisorPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setPasswordError('');

    const passToSet = customPassword.trim();
    if (!passToSet || passToSet.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }

    setUpdatingPassword(true);

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_user_password', {
        target_user_id: profile.id,
        new_password: passToSet,
      });

      if (rpcError) {
        setPasswordError(rpcError.message);
        setUpdatingPassword(false);
        return;
      }

      setCredentialsData({
        name: profile.full_name,
        loginId: profile.phone || profile.email || profile.full_name,
        tempPass: passToSet,
        phone: profile.phone || undefined,
      });

      setShowResetPassModal(false);
      setCustomPassword('');
      setUpdatingPassword(false);
      setShowCredentialsModal(true);
    } catch {
      setPasswordError('An unexpected error occurred while updating password.');
      setUpdatingPassword(false);
    }
  }

  // Edit Issuance
  function handleOpenEditIssuance(item: LedgerItem) {
    setEditingIssuanceItem(item);
    setEditIssuanceAmount(String(item.raw_amount !== undefined ? Math.abs(item.raw_amount) : (item.amount_in || item.amount_out)));
    setEditIssuanceDate(item.date);
    setEditIssuanceProject(item.project_id || '');
    setEditIssuanceMethod((item.method as any) || 'cash');
    setEditIssuanceNote(item.note || '');
    setShowEditIssuanceModal(true);
  }

  async function handleSaveEditIssuance(e: React.FormEvent) {
    e.preventDefault();
    if (!editingIssuanceItem || !editIssuanceAmount) return;
    setSavingEditIssuance(true);

    const updatedId = editingIssuanceItem.id;
    const baseAmt = Math.abs(Number(editIssuanceAmount));
    let finalAmt = baseAmt;
    if (editingIssuanceItem.type === 'return') {
      finalAmt = -baseAmt;
    } else if (editingIssuanceItem.type === 'adjustment' && editingIssuanceItem.raw_amount !== undefined && editingIssuanceItem.raw_amount < 0) {
      finalAmt = -baseAmt;
    }

    const { error } = await supabase
      .from('cash_issuances')
      .update({
        amount: finalAmt,
        issue_date: editIssuanceDate,
        project_id: editIssuanceProject || null,
        method: editIssuanceMethod,
        note: editIssuanceNote || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingIssuanceItem.id);

    if (error) {
      console.error('Error updating issuance:', error);
      alert('Failed to update entry: ' + error.message);
      setSavingEditIssuance(false);
      return;
    }

    setSavingEditIssuance(false);
    setShowEditIssuanceModal(false);
    setEditingIssuanceItem(null);
    await loadUserData(false);
    setTimeout(() => {
      const el = document.getElementById(`row-${updatedId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), 2500);
      }
    }, 50);
  }

  // Soft delete cash issuance / return / adjustment
  async function handleDeleteLedgerEntry(item: LedgerItem) {
    if (!confirm(`Move "${item.description}" to trash? The staff member's float balance will recalculate immediately.`)) return;
    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('cash_issuances')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', item.id);

    if (error) {
      console.error('Error deleting issuance:', error);
      alert('Failed to delete entry: ' + error.message);
      return;
    }

    await loadUserData(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  function resetForm() {
    setActionAmount('');
    setActionNote('');
    setSavingAction(false);
  }

  // Filtered ledger rows
  const filteredLedger = ledger.filter(item => {
    if (projectFilter && item.project_name !== projectFilter) return false;
    if (startDateFilter && item.date < startDateFilter) return false;
    if (endDateFilter && item.date > endDateFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <span className="text-muted">Loading supervisor cash ledger...</span>
      </div>
    );
  }

  if (!profile) return null;

  const isNegative = currentFloat < 0;

  return (
    <div className="page-container">
      {/* Top Breadcrumb Header */}
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={viewerRole === 'site_manager' ? '/site' : '/users'}
          className="btn btn-ghost btn-sm"
          style={{ paddingLeft: 0 }}
        >
          {viewerRole === 'site_manager' ? '← Back to Site Home' : '← Back to All Staff'}
        </Link>
      </div>

      {/* Main Float Header (PRD §6.12) */}
      <div
        className="card"
        style={{
          background: isNegative ? '#FDF4F4' : '#F2F8FD',
          borderColor: isNegative ? '#F5C2C2' : '#C4DEF6',
          borderRadius: 'var(--radius-xl)',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="flex justify-between items-start flex-wrap gap-md">
          <div>
            <div className="flex items-center gap-sm" style={{ marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-navy)', margin: 0 }}>
                {profile.full_name}
              </h1>
              <span className={`badge ${profile.role === 'admin' ? 'badge-success' : 'badge-neutral'}`}>
                {profile.role === 'admin' ? 'Admin' : 'Site Manager'}
              </span>
              {!profile.is_active && (
                <span className="badge badge-danger">Deactivated</span>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
              Login: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{profile.phone || profile.email || 'N/A'}</span>
              {profile.last_login_at ? ` · Last active: ${formatDate(profile.last_login_at)}` : ''}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex gap-xs flex-wrap">
            {viewerRole === 'admin' ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowIssueModal(true)}
                >
                  💵 Issue Cash
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowReturnModal(true)}
                >
                  ↩️ Cash Returned
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAdjustModal(true)}
                >
                  ⚖️ Adjustment
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCustomPassword(generateTempPassword());
                    setPasswordError('');
                    setShowResetPassModal(true);
                  }}
                >
                  🔑 Reset Password
                </button>
                {profile.role === 'site_manager' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowAssignModal(true)}
                  >
                    🏗️ Sites ({assignedProjectIds.length})
                  </button>
                )}
              </>
            ) : (
              <Link href="/expenses/add" className="btn btn-primary btn-sm">
                ➕ Record Site Expense
              </Link>
            )}
          </div>
        </div>

        {/* Headline Float Figure */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-line)' }}>
          <div className="flex items-center gap-xs">
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Float Balance
            </span>
            <Tooltip text={TOOLTIPS.cash_with_staff_admin} />
          </div>

          <div
            className={`text-money-lg ${isNegative ? 'text-danger' : 'text-success'}`}
            style={{ fontSize: '2.25rem', marginTop: '0.25rem', lineHeight: 1.1 }}
          >
            {isNegative ? `You owe him Rs ${Math.abs(currentFloat).toLocaleString('en-IN')}` : formatPKR(currentFloat)}
          </div>

          <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
            Total issued all-time: <strong>{formatPKRShort(totalIssued)}</strong> · Total spent all-time: <strong>{formatPKRShort(totalSpent)}</strong>
            {lastIssuance && (
              <> · Last handed over: <strong>{formatPKRShort(lastIssuance.amount)}</strong> on {formatDate(lastIssuance.issue_date)}</>
            )}
          </div>
        </div>
      </div>

      {/* Passbook Cash Ledger Section (PRD §6.12) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            background: 'var(--color-card-deep)',
            borderBottom: '1px solid var(--color-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.0625rem', color: 'var(--color-navy)', margin: 0 }}>
              📖 Chronological Cash Ledger (Passbook)
            </h2>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              Every rupee handed over, spent from float, returned, or adjusted
            </span>
          </div>

          {/* Ledger Filters */}
          <div className="filter-bar-responsive flex items-center gap-xs flex-wrap">
            <select
              className="select"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '32px' }}
            >
              <option value="">All Sites</option>
              {projects.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>

            <input
              type="date"
              className="input"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              placeholder="Start"
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '32px', width: '130px' }}
            />
            <input
              type="date"
              className="input"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              placeholder="End"
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '32px', width: '130px' }}
            />
            {(projectFilter || startDateFilter || endDateFilter) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setProjectFilter(''); setStartDateFilter(''); setEndDateFilter(''); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="empty-state" style={{ margin: '1.5rem' }}>
            <div className="empty-state__icon">📄</div>
            <div className="empty-state__title">No ledger entries recorded</div>
            <div className="empty-state__desc">
              Cash issuances and site float expenses will appear here chronologically with running balances.
            </div>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Date</th>
                  <th>Transaction / Description</th>
                  <th>Site / Category</th>
                  <th style={{ textAlign: 'right' }}>Cash In (+)</th>
                  <th style={{ textAlign: 'right' }}>Cash Out (−)</th>
                  <th style={{ textAlign: 'right' }}>Running Balance</th>
                  <th style={{ textAlign: 'right', width: '90px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((item, idx) => (
                  <tr
                    key={item.id}
                    id={`row-${item.id}`}
                    onClick={() => {
                      if (item.type === 'expense') {
                        const exp = rawExpensesList.find(e => e.id === item.id);
                        if (exp) setSelectedDetailExpense(exp);
                      }
                    }}
                    style={{ cursor: item.type === 'expense' ? 'pointer' : 'default' }}
                  >
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>
                      {formatDate(item.date)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                        {item.type === 'issuance' && '💵 '}
                        {item.type === 'expense' && '💸 '}
                        {item.type === 'return' && '↩️ '}
                        {item.type === 'adjustment' && '⚖️ '}
                        {item.description}
                      </div>
                      {item.note && item.type !== 'adjustment' && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{item.note}</div>
                      )}
                    </td>
                    <td>
                      {item.project_name ? (
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{item.project_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>General Float</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {item.amount_in > 0 ? (
                        <span className="text-success" style={{ fontWeight: 700 }}>
                          +{formatPKRShort(item.amount_in)}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {item.amount_out > 0 ? (
                        <span className="text-danger" style={{ fontWeight: 700 }}>
                          −{formatPKRShort(item.amount_out)}
                        </span>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span
                        className={`text-money ${item.running_balance < 0 ? 'text-danger' : 'text-money'}`}
                        style={{ fontWeight: 800 }}
                      >
                        {formatPKR(item.running_balance)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {item.type !== 'expense' ? (
                        viewerRole === 'admin' ? (
                          <div style={{ display: 'inline-flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditIssuance(item);
                              }}
                              title="Edit entry"
                              style={{ padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLedgerEntry(item);
                              }}
                              title="Move to Trash"
                              style={{ padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                            >
                              🗑️
                            </button>
                          </div>
                        ) : null
                      ) : (
                        <Link
                          href={viewerRole === 'site_manager' ? `/site/daily?date=${item.date}` : `/expenses?search=${encodeURIComponent(item.description)}`}
                          className="btn btn-ghost btn-xs"
                          title={viewerRole === 'site_manager' ? 'View in Daily Expenses' : 'View in Expenses'}
                          style={{ padding: '0.2rem 0.4rem' }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          ↗️
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL: ISSUE CASH */}
      {/* ============================================================ */}
      {showIssueModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">💵 Issue Cash to {profile.full_name}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowIssueModal(false)}>✕</button>
            </div>
            <form onSubmit={handleIssueCash}>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-detail-amt">Amount (PKR) <span className="required">*</span></label>
                <input
                  id="issue-detail-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. 50000"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-detail-date">Date Handed Over <span className="required">*</span></label>
                <input
                  id="issue-detail-date"
                  type="date"
                  className="input"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-detail-proj">Project (Optional)</label>
                <select
                  id="issue-detail-proj"
                  className="select"
                  value={actionProject}
                  onChange={(e) => setActionProject(e.target.value)}
                >
                  <option value="">General Float</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-detail-meth">Method</label>
                <select
                  id="issue-detail-meth"
                  className="select"
                  value={actionMethod}
                  onChange={(e) => setActionMethod(e.target.value as 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'other')}
                >
                  <option value="cash">Physical Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-detail-note">Note</label>
                <input
                  id="issue-detail-note"
                  type="text"
                  className="input"
                  placeholder="e.g. For weekly wages and material"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowIssueModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingAction}>
                  {savingAction ? 'Saving...' : 'Record Cash Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CASH RETURNED */}
      {/* ============================================================ */}
      {showReturnModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">↩️ Record Cash Returned by {profile.full_name}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReturnModal(false)}>✕</button>
            </div>
            <form onSubmit={handleReturnCash}>
              <div className="form-group">
                <label className="form-label" htmlFor="ret-amt">Cash Amount Returned (PKR) <span className="required">*</span></label>
                <input
                  id="ret-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. 15000"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  required
                  min={1}
                />
                <span className="form-helper">This will reduce the supervisor&apos;s float balance.</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ret-date">Date Returned <span className="required">*</span></label>
                <input
                  id="ret-date"
                  type="date"
                  className="input"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ret-note">Note</label>
                <input
                  id="ret-note"
                  type="text"
                  className="input"
                  placeholder="e.g. Unspent balance returned after foundation completion"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingAction}>
                  {savingAction ? 'Saving...' : 'Record Cash Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADJUSTMENT (PRD §6.12) */}
      {/* ============================================================ */}
      {showAdjustModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">⚖️ Record Float Adjustment</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdjustModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAdjustment}>
              <div className="alert-banner alert-banner--warning">
                <span>⚠️</span>
                <span style={{ fontSize: '0.8125rem' }}>
                  Use this when physical cash count differs from app balance. Mandatory note is required and written to audit log.
                </span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="adj-amt">
                  Adjustment Amount (PKR) <span className="required">*</span>
                </label>
                <input
                  id="adj-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. -500 for missing or +2000 for forgotten receipt"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                  required
                />
                <span className="form-helper">Use positive to increase float or negative to decrease float.</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="adj-date">Adjustment Date <span className="required">*</span></label>
                <input
                  id="adj-date"
                  type="date"
                  className="input"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="adj-note">
                  Mandatory Reason / Note <span className="required">*</span>
                </label>
                <input
                  id="adj-note"
                  type="text"
                  className="input"
                  placeholder="e.g. Physical cash count discrepancy audit correction"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingAction}>
                  {savingAction ? 'Saving...' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ASSIGN SITES */}
      {/* ============================================================ */}
      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">🏗️ Assign Sites to {profile.full_name}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)}>✕</button>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '1.25rem' }}>
              {projects.map(p => {
                const isChecked = selectedProjects.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0',
                      borderBottom: '1px solid #F0F4F8',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjects([...selectedProjects, p.id]);
                        } else {
                          setSelectedProjects(selectedProjects.filter(id => id !== p.id));
                        }
                      }}
                    />
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{p.name}</span>
                      {p.address && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.address}</div>}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-sm">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveAssignments} disabled={savingAction}>
                {savingAction ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RESET USER PASSWORD */}
      {/* ============================================================ */}
      {showResetPassModal && profile && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-navy)' }}>
                🔑 Set Password for {profile.full_name}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowResetPassModal(false);
                  setPasswordError('');
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetSupervisorPassword}>
              <div
                style={{
                  background: '#F0F5FA',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  fontSize: '0.8125rem',
                }}
              >
                <div><strong>Staff Member:</strong> {profile.full_name}</div>
                <div><strong>Login ID:</strong> {profile.phone || profile.email || 'N/A'}</div>
                <div><strong>Role:</strong> {profile.role === 'admin' ? 'Admin' : 'Site Supervisor'}</div>
              </div>

              <div className="form-group">
                <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                  <label className="form-label" htmlFor="reset-detail-pass" style={{ marginBottom: 0 }}>
                    New Password *
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setCustomPassword(generateTempPassword())}
                    style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)' }}
                  >
                    🎲 Generate Random
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-detail-pass"
                    type={showPasswordInputText ? 'text' : 'password'}
                    className="input"
                    value={customPassword}
                    onChange={e => setCustomPassword(e.target.value)}
                    placeholder="Enter or generate password (min 6 chars)"
                    required
                    minLength={6}
                    autoFocus
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordInputText(!showPasswordInputText)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    {showPasswordInputText ? '🙈' : '👁️'}
                  </button>
                </div>
                <span className="form-helper">
                  Admin can set a custom password or auto-generate one. Credentials can be shared via WhatsApp.
                </span>
              </div>

              {passwordError && (
                <p className="form-error" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                  ⚠️ {passwordError}
                </p>
              )}

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowResetPassModal(false);
                    setPasswordError('');
                  }}
                  disabled={updatingPassword}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updatingPassword}
                >
                  {updatingPassword ? 'Updating Password...' : 'Save & Share Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ONE-TIME CREDENTIALS DISPLAY (PRD §2.1) */}
      {/* ============================================================ */}
      {showCredentialsModal && credentialsData && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-navy)' }}>
                🔑 Credentials Updated Successfully
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCredentialsModal(false)}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: '#F0F5FA',
                border: '1px solid #C8DCEF',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ marginBottom: '0.75rem' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>NAME</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-navy)' }}>
                  {credentialsData.name}
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>LOGIN IDENTIFIER</div>
                <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--color-primary-blue)', fontFamily: 'var(--font-mono)' }}>
                  {credentialsData.loginId}
                </div>
              </div>

              <div>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>NEW PASSWORD</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '1.375rem',
                    color: 'var(--color-navy)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.05em',
                  }}
                >
                  {credentialsData.tempPass}
                </div>
              </div>
            </div>

            {/* Action Buttons: Copy & Share on WhatsApp */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {(() => {
                const message = `Assalam-o-Alaikum ${credentialsData.name},\n\nYour login password for Android Properties has been updated:\n\n📱 Login: ${credentialsData.loginId}\n🔑 New Password: ${credentialsData.tempPass}\n\nPlease log in here: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`;
                const whatsappUrl = getWhatsAppShareLink(credentialsData.phone, message);

                return (
                  <>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-whatsapp btn-full btn-lg"
                    >
                      💬 Share on WhatsApp
                    </a>

                    <button
                      type="button"
                      className="btn btn-secondary btn-full"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `Android Properties Login\nUser: ${credentialsData.loginId}\nPassword: ${credentialsData.tempPass}\nLink: ${typeof window !== 'undefined' ? window.location.origin : ''}/login`
                        );
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      }}
                    >
                      {copied ? '✅ Credentials Copied!' : '📋 Copy Credentials'}
                    </button>
                  </>
                );
              })()}

              <button
                type="button"
                className="btn btn-ghost btn-full"
                onClick={() => setShowCredentialsModal(false)}
                style={{ marginTop: '0.5rem' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT CASH ISSUANCE / ENTRY */}
      {/* ============================================================ */}
      {showEditIssuanceModal && editingIssuanceItem && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">
                ✏️ Edit {editingIssuanceItem.type === 'issuance' ? 'Cash Issuance' : editingIssuanceItem.type === 'return' ? 'Cash Return' : 'Adjustment'}
              </h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEditIssuanceModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveEditIssuance}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-iss-amt">Amount (PKR) <span className="required">*</span></label>
                <input
                  id="edit-iss-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. 50000"
                  value={editIssuanceAmount}
                  onChange={(e) => setEditIssuanceAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-iss-date">Date <span className="required">*</span></label>
                <input
                  id="edit-iss-date"
                  type="date"
                  className="input"
                  value={editIssuanceDate}
                  onChange={(e) => setEditIssuanceDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-iss-proj">Project (Optional)</label>
                <select
                  id="edit-iss-proj"
                  className="select"
                  value={editIssuanceProject}
                  onChange={(e) => setEditIssuanceProject(e.target.value)}
                >
                  <option value="">General Float</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-iss-meth">Method</label>
                <select
                  id="edit-iss-meth"
                  className="select"
                  value={editIssuanceMethod}
                  onChange={(e) => setEditIssuanceMethod(e.target.value as any)}
                >
                  <option value="cash">Cash in Hand</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="easypaisa">EasyPaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-iss-note">Notes / Reference</label>
                <input
                  id="edit-iss-note"
                  type="text"
                  className="input"
                  placeholder="e.g. Handed over at office"
                  value={editIssuanceNote}
                  onChange={(e) => setEditIssuanceNote(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditIssuanceModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingEditIssuance}>
                  {savingEditIssuance ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={selectedDetailExpense ? {
          ...selectedDetailExpense,
          created_by_name: profile?.full_name,
          project_name: projects.find(p => p.id === selectedDetailExpense.project_id)?.name,
        } : null}
        onClose={() => setSelectedDetailExpense(null)}
      />
    </div>
  );
}
