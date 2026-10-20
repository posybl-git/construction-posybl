'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  getTodayPKT,
  getCurrentMonthPKT,
  formatDate,
  formatStatus,
  getStatusVariant,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { NotificationBell } from '@/components/NotificationBell';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import type { Expense, ProjectForSite } from '@/types/database';

export default function SiteDashboard() {
  const [todayExpenses, setTodayExpenses] = useState<(Expense & { project_name?: string })[]>([]);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<(Expense & { project_name?: string }) | null>(null);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [cashWithYou, setCashWithYou] = useState(0);
  const [assignedProjects, setAssignedProjects] = useState<ProjectForSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(1);
  const [currentUserId, setCurrentUserId] = useState('');

  const supabase = createClient();

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const today = getTodayPKT();
    const currentMonth = getCurrentMonthPKT();
    const monthStart = `${currentMonth}-01`;
    const [year, month] = currentMonth.split('-').map(Number);
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

    // 1. Calculate Site Float (Cash with you) — uses server-side RPC to avoid Supabase row limit
    const { data: floatData } = await supabase.rpc('get_user_float_balance', { p_user_id: user.id });
    const floatRow = Array.isArray(floatData) ? floatData[0] : floatData;
    setCashWithYou(floatRow ? Number(floatRow.float_balance) : 0);

    // 2. Get assigned project IDs
    const { data: assignments } = await supabase
      .from('project_assignments')
      .select('project_id')
      .eq('user_id', user.id);

    const projectIds = (assignments || []).map(a => a.project_id);

    if (projectIds.length > 0) {
      // Get project names from restricted view (PRD §14: projects_for_site without contract_value) or projects table
      let { data: projects } = await supabase
        .from('projects_for_site')
        .select('id, name, address, status, project_type')
        .in('id', projectIds);

      if (!projects || projects.length === 0) {
        const { data: fallbackProjects } = await supabase
          .from('projects')
          .select('id, name, address, status, project_type')
          .in('id', projectIds)
          .is('deleted_at', null);
        projects = fallbackProjects;
      }

      const assignedList = (projects || []) as ProjectForSite[];
      setAssignedProjects(assignedList);

      // Get today's expenses created by this user
      const { data: todayExp } = await supabase
        .from('expenses')
        .select('*')
        .in('project_id', projectIds)
        .eq('expense_date', today)
        .eq('created_by', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(0, 50000);

      const todayData = todayExp || [];
      const todayWithNames = todayData.map(e => ({
        ...e,
        project_name: assignedList.find(p => p.id === e.project_id)?.name || 'Assigned Site',
      }));

      setTodayExpenses(todayWithNames as (Expense & { project_name?: string })[]);
      setTodayTotal(todayData.reduce((sum, e) => sum + Number(e.amount), 0));

      // Get this month total for user's expenses
      const { data: monthExp } = await supabase
        .from('expenses')
        .select('amount')
        .in('project_id', projectIds)
        .gte('expense_date', monthStart)
        .lt('expense_date', nextMonth)
        .eq('created_by', user.id)
        .is('deleted_at', null)
        .range(0, 50000);

      setMonthTotal((monthExp || []).reduce((sum, e) => sum + Number(e.amount), 0));
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <span className="text-muted">Loading supervisor portal...</span>
      </div>
    );
  }

  const isNegative = cashWithYou < 0;

  return (
    <div className="page-container" style={{ maxWidth: '680px', paddingBottom: '5rem' }}>
      {/* Walkthrough Banner / Button */}
      <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-navy)' }}>
          Site Supervisor Portal
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => { setWalkthroughStep(1); setShowWalkthrough(true); }}
          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
        >
          💡 How to Use
        </button>
      </div>

      {/* First-Run Walkthrough Modal (PRD §6.15) */}
      {showWalkthrough && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Supervisor Quick Guide</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowWalkthrough(false)}>✕</button>
            </div>

            <div style={{ padding: '0.5rem 0 1.25rem' }}>
              {walkthroughStep === 1 && (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💵</div>
                  <h3 style={{ fontSize: '1.125rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
                    1. Site Float in Hand
                  </h3>
                  <p style={{ fontSize: '0.84375rem', color: 'var(--color-body-text)' }}>
                    This is physical cash the owner gave you to spend on site. When you record an expense marked <em>Paid via: Site float</em>, your cash balance reduces automatically.
                  </p>
                </div>
              )}

              {walkthroughStep === 2 && (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>➕</div>
                  <h3 style={{ fontSize: '1.125rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
                    2. Adding Daily Expenses
                  </h3>
                  <p style={{ fontSize: '0.84375rem', color: 'var(--color-body-text)' }}>
                    Tap the green <strong>Add Expense</strong> button as soon as you spend money. Enter quantity and rate (e.g. 50 bags @ 850) and the app calculates the total automatically.
                  </p>
                </div>
              )}

              {walkthroughStep === 3 && (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏷️</div>
                  <h3 style={{ fontSize: '1.125rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
                    3. Quick Categories
                  </h3>
                  <p style={{ fontSize: '0.84375rem', color: 'var(--color-body-text)' }}>
                    Tap ready-made category chips (Cement, Sariya, Mistri, Dihari, etc.) instead of typing. Roman Urdu trade terms are fully supported.
                  </p>
                </div>
              )}

              {walkthroughStep === 4 && (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📖</div>
                  <h3 style={{ fontSize: '1.125rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
                    4. Check Your Passbook
                  </h3>
                  <p style={{ fontSize: '0.84375rem', color: 'var(--color-body-text)' }}>
                    Tap <strong>View Cash Ledger</strong> anytime to see every cash handover and expense with a running balance, exactly matching the cash in your pocket.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>Step {walkthroughStep} of 4</span>
              <div className="flex gap-xs">
                {walkthroughStep > 1 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWalkthroughStep(walkthroughStep - 1)}>
                    Back
                  </button>
                )}
                {walkthroughStep < 4 ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setWalkthroughStep(walkthroughStep + 1)}>
                    Next →
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowWalkthrough(false)}>
                    Got it!
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Primary Headline Card: Cash With You (PRD §6.3) */}
      <div
        className="card"
        style={{
          background: isNegative ? '#FDF4F4' : '#F2F8FD',
          borderColor: isNegative ? '#F5C2C2' : '#C4DEF6',
          borderRadius: 'var(--radius-xl)',
          padding: '1.5rem',
          marginBottom: '1rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
          <div className="flex items-center gap-xs">
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Site Float Balance
            </span>
            <Tooltip text={TOOLTIPS.cash_with_you_site} />
          </div>
          <span className={`badge ${isNegative ? 'badge-danger' : 'badge-success'}`}>
            {isNegative ? 'Reimbursement Due' : 'Available Cash'}
          </span>
        </div>

        <div
          className={`text-money-lg ${isNegative ? 'text-danger' : 'text-success'}`}
          style={{ fontSize: '2.5rem', lineHeight: 1.1, fontWeight: 800 }}
        >
          {isNegative
            ? `Company owes you Rs ${Math.abs(cashWithYou).toLocaleString('en-IN')}`
            : formatPKR(cashWithYou)}
        </div>

        <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
          {isNegative
            ? 'You spent personal money on site costs. Company owes you a reimbursement.'
            : 'Cash handed to you by admin that has not yet been spent on site.'}
        </p>

        {currentUserId && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-line)' }}>
            <Link
              href={`/users/${currentUserId}`}
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-primary-blue)' }}
            >
              📖 View Your Cash Passbook Ledger →
            </Link>
          </div>
        )}
      </div>

      {/* 2. Secondary Primary Cards (PRD §6.3: You spent today, You spent this month, Your projects) */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card" style={{ padding: '0.875rem' }}>
          <div className="stat-card__label" style={{ fontSize: '0.75rem' }}>
            <span>You spent today</span>
            <Tooltip text={TOOLTIPS.you_spent_today} />
          </div>
          <div className="stat-card__value" style={{ fontSize: '1.1875rem' }}>
            {formatPKRShort(todayTotal)}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '0.875rem' }}>
          <div className="stat-card__label" style={{ fontSize: '0.75rem' }}>
            <span>This month</span>
            <Tooltip text={TOOLTIPS.you_spent_this_month} />
          </div>
          <div className="stat-card__value" style={{ fontSize: '1.1875rem' }}>
            {formatPKRShort(monthTotal)}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '0.875rem' }}>
          <div className="stat-card__label" style={{ fontSize: '0.75rem' }}>
            <span>Your sites</span>
            <Tooltip text={TOOLTIPS.your_projects} />
          </div>
          <div className="stat-card__value" style={{ fontSize: '1.1875rem' }}>
            {assignedProjects.length}
          </div>
        </div>
      </div>

      {/* 3. Prominent Add Expense Button (PRD §6.3 & §6.6) */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/expenses/add"
          className="btn btn-primary btn-full btn-lg"
          style={{
            height: '54px',
            fontSize: '1.0625rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 4px 14px rgba(27, 117, 188, 0.35)',
          }}
        >
          ➕ Record New Expense
        </Link>
      </div>

      {/* 4. Assigned Projects List */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '0.625rem' }}>
          <h2 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', margin: 0 }}>
            Your Assigned Construction Sites ({assignedProjects.length})
          </h2>
        </div>

        {assignedProjects.length === 0 ? (
          <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <span className="text-muted" style={{ fontSize: '0.8125rem' }}>
              No construction sites assigned to your account yet. Contact admin.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {assignedProjects.map(p => (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: '0.875rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-navy)' }}>
                    {p.name}
                  </div>
                  {p.address && (
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      📍 {p.address}
                    </div>
                  )}
                </div>
                <span className={`badge badge-${getStatusVariant(p.status)}`}>
                  {formatStatus(p.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Today's Entries Section with Day Total */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '0.875rem 1rem',
            background: 'var(--color-card-deep)',
            borderBottom: '1px solid var(--color-line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', margin: 0 }}>
              Today&apos;s Expense Entries
            </h2>
            <span className="text-muted" style={{ fontSize: '0.71875rem' }}>
              {todayExpenses.length} entries recorded today
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="text-muted" style={{ fontSize: '0.6875rem' }}>DAY TOTAL</span>
            <div className="text-money" style={{ color: 'var(--color-navy)', fontSize: '1rem' }}>
              {formatPKR(todayTotal)}
            </div>
          </div>
        </div>

        {todayExpenses.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <div className="empty-state__icon" style={{ fontSize: '1.75rem' }}>📝</div>
            <div className="empty-state__title" style={{ fontSize: '0.9375rem' }}>No expenses entered today</div>
            <div className="empty-state__desc" style={{ fontSize: '0.8125rem' }}>
              Tap Add Expense above to record material, labour, or site purchases.
            </div>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                              <tr>
                  <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                  <th>Item / Category</th>
                  <th>Site</th>
                  <th>Paid Via</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {todayExpenses.map((exp, idx) => (
                  <tr
                    key={exp.id}
                    onClick={() => setSelectedDetailExpense(exp)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{exp.serial_no ?? '—'}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '0.84375rem' }}>
                        {exp.expense_name}
                      </div>
                      {exp.purpose && (
                        <div className="text-muted" style={{ fontSize: '0.71875rem' }}>{exp.purpose}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>
                      {exp.project_name}
                    </td>
                    <td>
                      <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.6875rem' }}>
                        {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="text-money" style={{ fontSize: '0.875rem' }}>
                        {formatPKRShort(exp.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        expense={selectedDetailExpense}
        onClose={() => setSelectedDetailExpense(null)}
      />
    </div>
  );
}
