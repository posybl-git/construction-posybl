'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  getCurrentMonthPKT,
  formatDate,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import type { Expense, ProjectForSite } from '@/types/database';

type ViewPeriod = 'month' | 'year';

interface EnrichedExpense extends Expense {
  project_name?: string;
}

export default function SiteMonthlyViewPage() {
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthPKT());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<ProjectForSite[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [viewPeriod, selectedMonth, selectedYear]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Get assigned project IDs
    const { data: assignments } = await supabase
      .from('project_assignments')
      .select('project_id')
      .eq('user_id', user.id);

    const projectIds = (assignments || []).map(a => a.project_id);
    if (projectIds.length === 0) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    // 2. Fetch project names via restricted view
    let { data: projects } = await supabase
      .from('projects_for_site')
      .select('id, name, address, status')
      .in('id', projectIds);

    if (!projects || projects.length === 0) {
      const { data: fallbackProjects } = await supabase
        .from('projects')
        .select('id, name, address, status')
        .in('id', projectIds)
        .is('deleted_at', null);
      projects = fallbackProjects;
    }

    const assignedList = (projects || []) as ProjectForSite[];
    setAssignedProjects(assignedList);
    const projectMap = new Map(assignedList.map(p => [p.id, p.name]));

    // Determine query date range
    let startDate = '';
    let endDate = '';

    if (viewPeriod === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      startDate = `${selectedMonth}-01`;
      const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${(m + 1).toString().padStart(2, '0')}-01`;
      endDate = nextM;

      // Previous month total for MoM
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      const prevStart = `${prevY}-${prevM.toString().padStart(2, '0')}-01`;
      const prevEnd = `${selectedMonth}-01`;

      const { data: prevExp } = await supabase
        .from('expenses')
        .select('amount')
        .in('project_id', projectIds)
        .gte('expense_date', prevStart)
        .lt('expense_date', prevEnd)
        .is('deleted_at', null)
        .range(0, 50000);

      const pTotal = (prevExp || []).reduce((s, e) => s + Number(e.amount), 0);
      setPrevMonthTotal(pTotal);
    } else {
      startDate = `${selectedYear}-01-01`;
      endDate = `${Number(selectedYear) + 1}-01-01`;
    }

    // Fetch expenses for assigned sites
    const { data: expData } = await supabase
      .from('expenses')
      .select('*')
      .in('project_id', projectIds)
      .gte('expense_date', startDate)
      .lt('expense_date', endDate)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .range(0, 50000);

    const enriched: EnrichedExpense[] = ((expData || []) as Expense[]).map(e => ({
      ...e,
      project_name: projectMap.get(e.project_id) || 'Assigned Site',
    }));

    setExpenses(enriched);
    setLoading(false);
  }

  function navigateMonth(offset: number) {
    const [year, month] = selectedMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + offset, 1);
    const y = newDate.getFullYear();
    const m = (newDate.getMonth() + 1).toString().padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  }

  function navigateYear(offset: number) {
    setSelectedYear((prev) => (Number(prev) + offset).toString());
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [curY, curM] = selectedMonth.split('-').map(Number);
  const monthLabel = `${monthNames[curM - 1]} ${curY}`;

  const totalSpend = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);
  const momDiff = totalSpend - prevMonthTotal;
  const momPct = prevMonthTotal > 0 ? (momDiff / prevMonthTotal) * 100 : 0;

  // Breakdown by Project
  const byProject = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>();
    expenses.forEach(e => {
      const pid = e.project_id;
      if (!map.has(pid)) {
        map.set(pid, { id: pid, name: e.project_name || 'Assigned Site', total: 0, count: 0 });
      }
      const item = map.get(pid)!;
      item.total += Number(e.amount);
      item.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Breakdown by Category
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach(e => {
      map.set(e.category, (map.get(e.category) || 0) + Number(e.amount));
    });
    return Array.from(map.entries())
      .map(([cat, amt]) => ({ cat, amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [expenses]);

  // Daily spend progression (1 to 31)
  const dailySpendData = useMemo(() => {
    if (viewPeriod !== 'month') return [];
    const [y, m] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();

    const days: { day: number; dateStr: string; amount: number }[] = [];
    const spendMap: Record<number, number> = {};

    expenses.forEach(e => {
      const dayNum = parseInt(e.expense_date.split('-')[2], 10);
      spendMap[dayNum] = (spendMap[dayNum] || 0) + Number(e.amount);
    });

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${selectedMonth}-${d.toString().padStart(2, '0')}`;
      days.push({
        day: d,
        dateStr: dStr,
        amount: spendMap[d] || 0,
      });
    }

    return days;
  }, [viewPeriod, selectedMonth, expenses]);

  // Yearly 12-month data
  const yearlyMonthsData = useMemo(() => {
    if (viewPeriod !== 'year') return [];

    const monthTotals: number[] = new Array(12).fill(0);
    expenses.forEach(e => {
      const mIdx = parseInt(e.expense_date.split('-')[1], 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        monthTotals[mIdx] += Number(e.amount);
      }
    });

    return monthNames.map((name, i) => ({
      name,
      monthIndex: i + 1,
      total: monthTotals[i],
    }));
  }, [viewPeriod, expenses]);

  const maxDailyAmount = Math.max(...dailySpendData.map(d => d.amount), 1);
  const maxMonthlyAmount = Math.max(...yearlyMonthsData.map(m => m.total), 1);

  return (
    <div className="page-container" style={{ maxWidth: '780px' }}>
      {/* Header & Toggle */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {viewPeriod === 'month' ? '📆 Monthly Site Spend' : '📊 Annual Site Spend'}
          </h1>
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
            {viewPeriod === 'month'
              ? `Site expenditures for ${monthLabel}`
              : `Total site costs across ${selectedYear}`}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            background: 'var(--color-white)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${viewPeriod === 'month' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewPeriod('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewPeriod === 'year' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewPeriod('year')}
          >
            Year
          </button>
        </div>
      </div>

      {/* Period Navigation */}
      <div
        className="card"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {viewPeriod === 'month' ? (
          <div className="flex items-center justify-between flex-wrap gap-xs" style={{ width: '100%' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateMonth(-1)}>
              ← Prev
            </button>
            <span style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--color-navy)' }}>
              {monthLabel}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateMonth(1)}>
              Next →
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-xs" style={{ width: '100%' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateYear(-1)}>
              ← Prev Year
            </button>
            <span style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--color-navy)' }}>
              Year {selectedYear}
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateYear(1)}>
              Next Year →
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid-stats-3" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span>Total Spend</span>
          </div>
          <div className="stat-card__value">{formatPKR(totalSpend)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {expenses.length} entries
          </span>
        </div>

        {viewPeriod === 'month' && (
          <div className={`stat-card ${momDiff > 0 ? 'stat-card--warning' : 'stat-card--success'}`}>
            <div className="stat-card__label">
              <span>vs Last Month</span>
            </div>
            <div className={`stat-card__value ${momDiff > 0 ? 'text-danger' : 'text-success'}`}>
              {momDiff > 0 ? `+${formatPKRShort(momDiff)}` : formatPKRShort(momDiff)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              {momPct >= 0 ? '+' : ''}{momPct.toFixed(0)}% from last month
            </span>
          </div>
        )}

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Sites with Spend</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {byProject.length} Sites
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Spent on {byProject.length} assigned site{byProject.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading monthly view...</span>
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📆</div>
          <div className="empty-state__title">No expenses in this period</div>
        </div>
      ) : (
        <div>
          {/* Daily Spend Progression Bars */}
          <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', margin: 0 }}>
                {viewPeriod === 'month' ? '📅 Daily Spend' : '📊 Month-by-Month'}
              </h3>
            </div>

            {viewPeriod === 'month' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '3px',
                  height: '110px',
                  borderBottom: '2px solid var(--color-line)',
                  overflowX: 'auto',
                }}
              >
                {dailySpendData.map(d => {
                  const heightPct = d.amount > 0 ? Math.max((d.amount / maxDailyAmount) * 100, 8) : 0;
                  return (
                    <div
                      key={d.day}
                      style={{
                        flex: '1 1 0',
                        minWidth: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                      title={`${formatDate(d.dateStr)}: ${formatPKR(d.amount)}`}
                    >
                      {d.amount > 0 && (
                        <div
                          style={{
                            width: '100%',
                            height: `${heightPct}%`,
                            background: 'linear-gradient(180deg, var(--color-cyan) 0%, var(--color-primary-blue) 100%)',
                            borderRadius: '2px 2px 0 0',
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: '0.5625rem',
                          color: d.amount > 0 ? 'var(--color-navy)' : 'var(--color-faint-text)',
                          fontWeight: d.amount > 0 ? 700 : 400,
                          marginTop: '3px',
                        }}
                      >
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '8px',
                  height: '130px',
                  borderBottom: '2px solid var(--color-line)',
                  overflowX: 'auto',
                }}
              >
                {yearlyMonthsData.map(m => {
                  const heightPct = m.total > 0 ? Math.max((m.total / maxMonthlyAmount) * 100, 8) : 0;
                  return (
                    <div
                      key={m.name}
                      style={{
                        flex: '1 1 0',
                        minWidth: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                      title={`${m.name}: ${formatPKR(m.total)}`}
                    >
                      {m.total > 0 && (
                        <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '3px' }}>
                          {formatPKRShort(m.total)}
                        </span>
                      )}
                      <div
                        style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          background: m.total > 0
                            ? 'linear-gradient(180deg, var(--color-cyan) 0%, var(--color-deep-blue) 100%)'
                            : '#F0F4F8',
                          borderRadius: '3px 3px 0 0',
                        }}
                      />
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-navy)', marginTop: '4px' }}>
                        {m.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Breakdown by Project & Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* By Site */}
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', marginBottom: '0.75rem' }}>
                🏗️ By Construction Site
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {byProject.map(p => {
                  const pct = totalSpend > 0 ? (p.total / totalSpend) * 100 : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.78125rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={{ fontWeight: 700 }}>{formatPKRShort(p.total)}</span>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '5px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Category */}
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', marginBottom: '0.75rem' }}>
                🏷️ By Category
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {byCategory.slice(0, 8).map(c => {
                  const pct = totalSpend > 0 ? (c.amt / totalSpend) * 100 : 0;
                  return (
                    <div key={c.cat}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.78125rem', marginBottom: '0.2rem' }}>
                        <span>{c.cat}</span>
                        <span style={{ fontWeight: 700 }}>{formatPKRShort(c.amt)}</span>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '5px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: 'var(--color-cyan)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
