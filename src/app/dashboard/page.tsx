'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  getTodayPKT,
  getCurrentMonthPKT,
  getBudgetVariant,
  formatStatus,
  getStatusVariant,
  formatDate,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { NotificationBell } from '@/components/NotificationBell';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { fetchAllPages } from '@/lib/supabase-helpers';
import type { Project, DashboardStats, PaymentMilestone, Expense, CashIssuance, ClientPayment } from '@/types/database';

interface ProjectWithFinancials extends Project {
  total_received: number;
  total_expenses: number;
  total_paid_out: number;
  outstanding_payables: number;
  client_balance_due: number;
  cash_in_hand: number;
  project_margin: number;
  margin_percent: number;
  budget_used_percent: number;
  spent_from_client_money: number;
  spent_from_own_pocket: number;
  client_money_with_us: number;
  assigned_supervisors: { id: string; name: string; phone?: string | null }[];
}

interface AlertItem {
  id: string;
  type: 'milestone' | 'budget' | 'payable' | 'float';
  title: string;
  desc: string;
  severity: 'danger' | 'warning';
  link: string;
}

type PeriodType = 'today' | 'this_month' | 'this_year' | 'all_time';

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    spent_today: 0,
    spent_this_month: 0,
    total_received: 0,
    total_receivable: 0,
    client_money_with_us: 0,
    own_money_in_sites: 0,
    cash_with_staff: 0,
    total_unpaid_payables: 0,
  });
  const [projects, setProjects] = useState<ProjectWithFinancials[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [period, setPeriod] = useState<PeriodType>('all_time');
  const [projectStatusTab, setProjectStatusTab] = useState<'all' | 'active' | 'on_hold' | 'completed'>('active');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadDashboard();
  }, [period]);

  async function loadDashboard() {
    setLoading(true);
    const today = getTodayPKT();
    const currentMonth = getCurrentMonthPKT();
    const currentYear = new Date().getFullYear().toString();
    const monthStart = `${currentMonth}-01`;
    const [year, month] = currentMonth.split('-').map(Number);
    const nextMonth = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

    // 1. Fetch active projects
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    // 2. Fetch all expenses (via auto-paginating helper to load all 1200+ rows)
    const allExpenses = await fetchAllPages<Expense>((from, to) =>
      supabase
        .from('expenses')
        .select('*')
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .range(from, to)
    );

    // 3. Fetch all client payments
    const allPayments = await fetchAllPages<ClientPayment>((from, to) =>
      supabase
        .from('client_payments')
        .select('*')
        .is('deleted_at', null)
        .range(from, to)
    );

    // 4. Fetch all cash issuances for float tracking
    const allIssuances = await fetchAllPages<CashIssuance>((from, to) =>
      supabase
        .from('cash_issuances')
        .select('*')
        .is('deleted_at', null)
        .range(from, to)
    );

    // 5. Fetch payment milestones for alerts
    const { data: allMilestones } = await supabase
      .from('payment_milestones')
      .select('*')
      .is('deleted_at', null);

    // 6. Fetch project assignments and supervisor profiles
    const { data: assignmentsData } = await supabase
      .from('project_assignments')
      .select('project_id, user_id');

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .eq('role', 'site_manager');

    const expensesList = allExpenses || [];
    const paymentsList = allPayments || [];
    const issuancesList = allIssuances || [];
    const milestonesList = (allMilestones || []) as PaymentMilestone[];
    const assignList = (assignmentsData || []) as { project_id: string; user_id: string }[];
    const supervisorProfiles = profilesData || [];

    // Calculate site float (cash with staff) — uses server-side RPC for accuracy
    const { data: allFloatBalances } = await supabase.rpc('get_all_float_balances');
    const cashWithStaff = (allFloatBalances || []).reduce(
      (sum: number, f: { float_balance: number }) => sum + Number(f.float_balance), 0
    );

    // Calculate Spent Today & Spent This Month across all projects (PRD §6.1 & §6.7)
    const totalSpentToday = expensesList
      .filter(e => e.expense_date === today)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalSpentThisMonth = expensesList
      .filter(e => e.expense_date >= monthStart && e.expense_date < nextMonth)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const projectsWithFinancials: ProjectWithFinancials[] = [];
    let totalReceivedSum = 0;
    let totalReceivableSum = 0;
    let clientMoneyWithUsSum = 0;
    let ownMoneyInSitesSum = 0;
    let totalUnpaidPayablesSum = 0;

    for (const project of projectsData || []) {
      let projExpenses = expensesList.filter(e => e.project_id === project.id);
      let projPayments = paymentsList.filter(p => p.project_id === project.id);

      // Filter by selected period if specified
      if (period === 'today') {
        projExpenses = projExpenses.filter(e => e.expense_date === today);
        projPayments = projPayments.filter(p => p.payment_date === today);
      } else if (period === 'this_month') {
        projExpenses = projExpenses.filter(e => e.expense_date >= monthStart && e.expense_date < nextMonth);
        projPayments = projPayments.filter(p => p.payment_date >= monthStart && p.payment_date < nextMonth);
      } else if (period === 'this_year') {
        projExpenses = projExpenses.filter(e => e.expense_date.startsWith(currentYear));
        projPayments = projPayments.filter(p => p.payment_date.startsWith(currentYear));
      }

      const totalReceived = projPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalExpenses = projExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
      const totalPaidOut = projExpenses
        .filter(e => e.payment_status === 'paid')
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const outstandingPayables = projExpenses
        .filter(e => e.payment_status === 'unpaid')
        .reduce((sum, e) => sum + Number(e.amount), 0);

      // Cost plus projects
      let contractValue = Number(project.contract_value);
      if (project.project_type === 'cost_plus' && project.supervision_percent) {
        contractValue = totalExpenses * (1 + Number(project.supervision_percent) / 100);
      }

      const clientBalanceDue = contractValue - totalReceived;
      const cashInHand = totalReceived - totalPaidOut;
      const projectMargin = contractValue - totalExpenses;
      const marginPercent = contractValue > 0 ? (projectMargin / contractValue) * 100 : 0;
      const budgetUsedPercent = contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0;

      // PRD §5 & §6.5 Row 2 arithmetic:
      const spentFromClientMoney = Math.min(totalPaidOut, totalReceived);
      const spentFromOwnPocket = Math.max(0, totalPaidOut - totalReceived);
      const clientMoneyLeft = Math.max(0, totalReceived - totalPaidOut);

      // Find assigned supervisors
      const assignedIds = assignList.filter(a => a.project_id === project.id).map(a => a.user_id);
      const assignedSupervisors = supervisorProfiles
        .filter(s => assignedIds.includes(s.id))
        .map(s => ({ id: s.id, name: s.full_name, phone: s.phone }));

      projectsWithFinancials.push({
        ...project,
        total_received: totalReceived,
        total_expenses: totalExpenses,
        total_paid_out: totalPaidOut,
        outstanding_payables: outstandingPayables,
        client_balance_due: clientBalanceDue,
        cash_in_hand: cashInHand,
        project_margin: projectMargin,
        margin_percent: marginPercent,
        budget_used_percent: budgetUsedPercent,
        spent_from_client_money: spentFromClientMoney,
        spent_from_own_pocket: spentFromOwnPocket,
        client_money_with_us: clientMoneyLeft,
        assigned_supervisors: assignedSupervisors,
      });

      if (project.status === 'active') {
        totalReceivedSum += totalReceived;
        totalReceivableSum += clientBalanceDue;
        clientMoneyWithUsSum += clientMoneyLeft;
        ownMoneyInSitesSum += spentFromOwnPocket;
        totalUnpaidPayablesSum += outstandingPayables;
      }
    }

    // Generate Alerts (PRD §6.2)
    const alertList: AlertItem[] = [];

    // 1. Overdue milestones
    milestonesList.forEach(m => {
      if (m.planned_date && m.planned_date < today && m.status !== 'received') {
        const proj = (projectsData || []).find(p => p.id === m.project_id);
        alertList.push({
          id: `ms-${m.id}`,
          type: 'milestone',
          title: `Milestone Overdue: ${m.name}`,
          desc: `${proj?.name || 'Project'} — ${formatPKRShort(m.planned_amount)} planned for ${formatDate(m.planned_date)} not fully received`,
          severity: 'danger',
          link: `/projects/${m.project_id}`,
        });
      }
    });

    // 2. Projects over 80% budget
    projectsWithFinancials.filter(p => p.status === 'active' && p.budget_used_percent >= 80).forEach(p => {
      alertList.push({
        id: `bg-${p.id}`,
        type: 'budget',
        title: `Budget Alert (${p.budget_used_percent.toFixed(0)}%): ${p.name}`,
        desc: `Spent ${formatPKRShort(p.total_expenses)} of ${formatPKRShort(p.contract_value)} contract budget`,
        severity: p.budget_used_percent >= 100 ? 'danger' : 'warning',
        link: `/projects/${p.id}`,
      });
    });

    // 3. Unpaid bills over 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const oldUnpaid = expensesList.filter(e => e.payment_status === 'unpaid' && e.expense_date < thirtyDaysAgoStr);
    if (oldUnpaid.length > 0) {
      const oldSum = oldUnpaid.reduce((s, e) => s + Number(e.amount), 0);
      alertList.push({
        id: 'old-unpaid',
        type: 'payable',
        title: `${oldUnpaid.length} Unpaid Bills Ageing Over 30 Days`,
        desc: `Total ${formatPKR(oldSum)} outstanding to vendors/labour for more than a month`,
        severity: 'warning',
        link: '/payables',
      });
    }

    // 4. Staff float running negative
    if (cashWithStaff < 0) {
      alertList.push({
        id: 'neg-float',
        type: 'float',
        title: `Staff Float Negative (${formatPKRShort(cashWithStaff)})`,
        desc: 'Supervisors have spent personal funds exceeding cash in hand. Reimbursement due.',
        severity: 'danger',
        link: '/users',
      });
    }

    setAlerts(alertList);
    setProjects(projectsWithFinancials);
    setStats({
      spent_today: totalSpentToday,
      spent_this_month: totalSpentThisMonth,
      total_received: totalReceivedSum,
      total_receivable: totalReceivableSum,
      client_money_with_us: clientMoneyWithUsSum,
      own_money_in_sites: ownMoneyInSitesSum,
      cash_with_staff: cashWithStaff,
      total_unpaid_payables: totalUnpaidPayablesSum,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <span className="text-muted">Loading financial overview...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Top Header & Period Selector */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Executive Dashboard</h1>
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
            Real-time financial overview across all active construction projects
          </p>
        </div>

        {/* Period Selector Tabs (PRD §6.2) */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-white)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
            boxShadow: 'var(--shadow-xs)',
            overflowX: 'auto',
            maxWidth: '100%',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${period === 'today' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod('today')}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            Today
          </button>
          <button
            type="button"
            className={`btn btn-sm ${period === 'this_month' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod('this_month')}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            This Month
          </button>
          <button
            type="button"
            className={`btn btn-sm ${period === 'this_year' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod('this_year')}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            This Year
          </button>
          <button
            type="button"
            className={`btn btn-sm ${period === 'all_time' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod('all_time')}
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Primary 8 Financial KPI Cards (PRD §6.2) */}
      <div className="grid-stats-8" style={{ marginBottom: '1.5rem' }}>
        {/* Card 1: Spent Today */}
        <Link href="/expenses/daily" style={{ textDecoration: 'none' }} title="Click to view daily expenses breakdown">
          <div className="stat-card stat-card--tappable">
            <div className="stat-card__label">
              <span>Spent Today</span>
              <Tooltip text={TOOLTIPS.spent_today} />
            </div>
            <div className="stat-card__value">{formatPKRShort(stats.spent_today)}</div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              All sites
            </span>
            <div className="stat-card__hover-hint">
              <span>Click for daily breakdown</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 2: Spent This Month */}
        <Link href="/expenses/monthly" style={{ textDecoration: 'none' }} title="Click to view monthly expense breakdown">
          <div className="stat-card stat-card--tappable">
            <div className="stat-card__label">
              <span>Spent This Month</span>
              <Tooltip text={TOOLTIPS.spent_this_month} />
            </div>
            <div className="stat-card__value">{formatPKRShort(stats.spent_this_month)}</div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              Current calendar month
            </span>
            <div className="stat-card__hover-hint">
              <span>Click for monthly breakdown</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 3: Clients Have Paid */}
        <Link href="/payments?status=active" style={{ textDecoration: 'none' }} title="Click to view client payments ledger">
          <div className="stat-card stat-card--success stat-card--tappable">
            <div className="stat-card__label">
              <span>Clients Have Paid</span>
              <Tooltip text={TOOLTIPS.clients_have_paid_dashboard} />
            </div>
            <div className="stat-card__value text-success">{formatPKRShort(stats.total_received)}</div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              Total cash collected
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view payments</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 4: Clients Still Owe */}
        <Link href="/projects?filter=balance_due" style={{ textDecoration: 'none' }} title="Click to view projects with balance due">
          <div className="stat-card stat-card--warning stat-card--tappable">
            <div className="stat-card__label">
              <span>Clients Still Owe</span>
              <Tooltip text={TOOLTIPS.clients_still_owe_dashboard} />
            </div>
            <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
              {formatPKRShort(stats.total_receivable)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              Sum of balance dues
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view balance dues</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 5: Client Money With Us */}
        <Link href="/projects?filter=surplus&status=active" style={{ textDecoration: 'none' }} title="Click to view active projects with client surplus">
          <div className="stat-card stat-card--info stat-card--tappable">
            <div className="stat-card__label">
              <span>Client Money With Us</span>
              <Tooltip text={TOOLTIPS.client_money_still_with_us_dashboard} />
            </div>
            <div className="stat-card__value" style={{ color: 'var(--color-primary-blue)' }}>
              {formatPKRShort(stats.client_money_with_us)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              Received & not yet spent
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view surplus sites</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 6: Our Own Money in Sites */}
        <Link href="/projects?filter=overspent" style={{ textDecoration: 'none' }} title="Click to view overspent projects">
          <div className={`stat-card ${stats.own_money_in_sites > 0 ? 'stat-card--danger' : ''} stat-card--tappable`}>
            <div className="stat-card__label">
              <span>Our Own Money in Sites</span>
              <Tooltip text={TOOLTIPS.our_own_money_in_sites} />
            </div>
            <div className={`stat-card__value ${stats.own_money_in_sites > 0 ? 'text-danger' : ''}`}>
              {formatPKRShort(stats.own_money_in_sites)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              {stats.own_money_in_sites > 0 ? '⚠️ You are out of pocket' : 'Zero personal funds deployed'}
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view overspent sites</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 7: Cash with Staff */}
        <Link href="/users" style={{ textDecoration: 'none' }} title="Click to manage staff floats and cash custody">
          <div className={`stat-card ${stats.cash_with_staff < 0 ? 'stat-card--danger' : 'stat-card--info'} stat-card--tappable`}>
            <div className="stat-card__label">
              <span>Cash with Staff (Float)</span>
              <Tooltip text={TOOLTIPS.cash_with_staff_admin} />
            </div>
            <div className={`stat-card__value ${stats.cash_with_staff < 0 ? 'text-danger' : ''}`}>
              {formatPKRShort(stats.cash_with_staff)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              {stats.cash_with_staff < 0 ? '⚠️ Company owes staff' : 'Unspent cash with supervisors'}
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view staff floats</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>

        {/* Card 8: Still to Pay Vendors */}
        <Link href="/payables" style={{ textDecoration: 'none' }} title="Click to view unpaid vendor payables">
          <div className="stat-card stat-card--warning stat-card--tappable">
            <div className="stat-card__label">
              <span>Still to Pay Vendors</span>
              <Tooltip text={TOOLTIPS.still_to_pay_vendors} />
            </div>
            <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
              {formatPKRShort(stats.total_unpaid_payables)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
              Total unpaid dues
            </span>
            <div className="stat-card__hover-hint">
              <span>Click to view payables</span>
              <span>&rarr;</span>
            </div>
          </div>
        </Link>
      </div>

      {/* Alerts Panel (PRD §6.2) */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '1.0625rem', marginBottom: '0.75rem', color: 'var(--color-navy)' }}>
            🔔 Attention & Alerts ({alerts.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {alerts.map(a => (
              <Link key={a.id} href={a.link} style={{ textDecoration: 'none' }}>
                <div
                  className={`alert-banner alert-banner--${a.severity}`}
                  style={{
                    margin: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.84375rem' }}>{a.title}</strong>
                    <div style={{ fontSize: '0.78125rem', marginTop: '0.125rem', opacity: 0.9 }}>
                      {a.desc}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Review →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Construction Projects Header */}
      <div
        className="section-header-wrap"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem 1.25rem',
          marginBottom: '0.875rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 260px', minWidth: '220px' }}>
          <div className="flex items-center gap-xs">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-navy)', margin: 0, letterSpacing: '-0.02em' }}>
              Construction Projects
            </h2>
            <span className="badge badge-primary" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)' }}>
              {projects.filter(p => p.status === 'active').length} Active {projects.filter(p => p.status !== 'archived').length !== projects.filter(p => p.status === 'active').length ? `/ ${projects.filter(p => p.status !== 'archived').length} Total` : ''}
            </span>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem', lineHeight: 1.35 }}>
            Summary of contract value, payments, balance due and margin
          </p>
        </div>

        <div className="flex items-center gap-xs" style={{ flexShrink: 0, flexWrap: 'wrap' }}>
          <Link href="/projects/new" className="btn btn-secondary btn-sm" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>➕</span> New Project
          </Link>
          <Link href="/projects" className="btn btn-ghost btn-sm" style={{ fontWeight: 600, color: 'var(--color-primary-blue)' }}>
            View All Projects →
          </Link>
        </div>
      </div>

      {/* Project Status Filter Tabs */}
      <div className="flex items-center gap-xs" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`chip ${projectStatusTab === 'active' ? 'chip--active' : ''}`}
          onClick={() => setProjectStatusTab('active')}
        >
          Active ({projects.filter(p => p.status === 'active').length})
        </button>
        <button
          type="button"
          className={`chip ${projectStatusTab === 'all' ? 'chip--active' : ''}`}
          onClick={() => setProjectStatusTab('all')}
        >
          All Sites ({projects.filter(p => p.status !== 'archived').length})
        </button>
        {projects.some(p => p.status === 'on_hold') && (
          <button
            type="button"
            className={`chip ${projectStatusTab === 'on_hold' ? 'chip--active' : ''}`}
            onClick={() => setProjectStatusTab('on_hold')}
          >
            On Hold ({projects.filter(p => p.status === 'on_hold').length})
          </button>
        )}
        {projects.some(p => p.status === 'completed') && (
          <button
            type="button"
            className={`chip ${projectStatusTab === 'completed' ? 'chip--active' : ''}`}
            onClick={() => setProjectStatusTab('completed')}
          >
            Completed ({projects.filter(p => p.status === 'completed').length})
          </button>
        )}
      </div>

      {projects.filter(p => {
        if (p.status === 'archived') return false;
        if (projectStatusTab === 'all') return true;
        return p.status === projectStatusTab;
      }).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🏗️</div>
          <div className="empty-state__title">No {projectStatusTab === 'all' ? '' : projectStatusTab === 'on_hold' ? 'on-hold ' : `${projectStatusTab} `}projects</div>
          <div className="empty-state__desc">
            {projectStatusTab === 'active'
              ? 'No projects currently marked as active.'
              : 'No projects match this status filter.'}
          </div>
          <Link href="/projects/new" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Create Project
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {projects.filter(p => {
            if (p.status === 'archived') return false;
            if (projectStatusTab === 'all') return true;
            return p.status === projectStatusTab;
          }).map(project => {
            const variant = getBudgetVariant(project.budget_used_percent);
            const isOverspent = (project.spent_from_own_pocket || 0) > 0 || project.total_expenses > project.total_received;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div className={`card card--hoverable ${isOverspent ? 'card--overspent' : ''}`}>
                  <div className="flex items-start justify-between" style={{ marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 280px' }}>
                      <div className="flex items-center gap-xs" style={{ flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                        <h3 style={{ fontSize: '1.0625rem', color: isOverspent ? '#991B1B' : 'var(--color-navy)', fontWeight: 700, margin: 0 }}>
                          {project.name}
                        </h3>
                        {isOverspent && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 700,
                              color: '#991B1B',
                              background: '#FEE2E2',
                              padding: '0.125rem 0.45rem',
                              borderRadius: 'var(--radius-full)',
                              border: '1px solid #FCA5A5',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            ⚠️ Overspent
                          </span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.8125rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                        <span>Client: <strong style={{ color: 'var(--color-navy)' }}>{project.client_name || 'N/A'}</strong></span>
                        {project.address && <span>· {project.address}</span>}
                        <span>· {formatStatus(project.project_type)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-xs flex-wrap" style={{ flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '0.71875rem',
                          fontWeight: 600,
                          color: 'var(--color-primary-blue)',
                          background: '#F0F7FF',
                          padding: '0.2rem 0.55rem',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid #BFDBFE',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        click to see the detail →
                      </span>
                      {project.assigned_supervisors && project.assigned_supervisors.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                          {project.assigned_supervisors.map(sup => (
                            <span
                              key={sup.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.2rem 0.55rem',
                                background: '#E8F2FC',
                                color: 'var(--color-deep-blue)',
                                borderRadius: 'var(--radius-full)',
                                border: '1px solid #BFDBFE'
                              }}
                              title={sup.phone ? `Phone: ${sup.phone}` : undefined}
                            >
                              <span>👷</span> {sup.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            padding: '0.2rem 0.55rem',
                            background: '#FFFBEB',
                            color: '#B45309',
                            borderRadius: 'var(--radius-full)',
                            border: '1px solid #FDE68A'
                          }}
                        >
                          <span>⚠️</span> Unassigned
                        </span>
                      )}
                      <span className={`badge badge-${getStatusVariant(project.status)}`}>
                        {formatStatus(project.status)}
                      </span>
                    </div>
                  </div>

                  {/* Financial metrics grid */}
                  <div className="project-metrics-grid">
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Contract Value</div>
                      <div className="text-money">{formatPKRShort(project.contract_value)}</div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Client Paid</div>
                      <div className="text-money text-success">{formatPKRShort(project.total_received)}</div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Client Still Owes</div>
                      <div className="text-money" style={{ color: 'var(--color-amber)' }}>
                        {formatPKRShort(project.client_balance_due)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Total Spent</div>
                      <div className="text-money">{formatPKRShort(project.total_expenses)}</div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Margin</div>
                      <div className={`text-money ${project.project_margin >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatPKRShort(project.project_margin)}
                        <span className="text-shorthand">
                          ({project.margin_percent.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Budget Progress Bar */}
                  <div className="flex items-center gap-sm">
                    <div className={`progress-bar progress-bar--${variant}`} style={{ flex: 1 }}>
                      <div
                        className="progress-bar__fill"
                        style={{ width: `${Math.min(project.budget_used_percent, 100)}%` }}
                      />
                    </div>
                    <span className="text-muted" style={{ fontSize: '0.75rem', minWidth: '2.75rem', textAlign: 'right', fontWeight: 600 }}>
                      {project.budget_used_percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
