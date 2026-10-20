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
import Link from 'next/link';
import { fetchAllPages } from '@/lib/supabase-helpers';
import type { Expense, Project, Profile } from '@/types/database';

type ViewPeriod = 'month' | 'year';

interface EnrichedExpense extends Expense {
  project_name?: string;
  created_by_name?: string;
}

export default function MonthlyAndYearlyViewPage() {
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('month');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthPKT());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [yearMode, setYearMode] = useState<'calendar' | 'last12'>('calendar');

  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [prevMonthTotal, setPrevMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, [viewPeriod, selectedMonth, selectedYear, yearMode]);

  async function loadData() {
    setLoading(true);

    // Determine query date range
    let startDate = '';
    let endDate = '';

    if (viewPeriod === 'month') {
      const [y, m] = selectedMonth.split('-').map(Number);
      startDate = `${selectedMonth}-01`;
      const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${(m + 1).toString().padStart(2, '0')}-01`;
      endDate = nextM;

      // Also fetch previous month for MoM comparison (PRD §6.8)
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      const prevStart = `${prevY}-${prevM.toString().padStart(2, '0')}-01`;
      const prevEnd = `${selectedMonth}-01`;

      const prevExp = await fetchAllPages<{ amount: number }>((from, to) =>
        supabase
          .from('expenses')
          .select('amount')
          .gte('expense_date', prevStart)
          .lt('expense_date', prevEnd)
          .is('deleted_at', null)
          .range(from, to)
      );

      const pTotal = (prevExp || []).reduce((s, e) => s + Number(e.amount), 0);
      setPrevMonthTotal(pTotal);
    } else {
      if (yearMode === 'calendar') {
        startDate = `${selectedYear}-01-01`;
        endDate = `${Number(selectedYear) + 1}-01-01`;
      } else {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        startDate = d.toISOString().split('T')[0];
        endDate = new Date().toISOString().split('T')[0];
      }
    }

    // 1. Fetch current period expenses
    const expData = await fetchAllPages<Expense>((from, to) =>
      supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', startDate)
        .lt('expense_date', endDate)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .range(from, to)
    );

    // 2. Fetch projects
    const { data: projData } = await supabase
      .from('projects')
      .select('id, name')
      .is('deleted_at', null);

    // 3. Fetch profiles
    const { data: profData } = await supabase
      .from('profiles')
      .select('id, full_name');

    const projectMap = new Map((projData || []).map(p => [p.id, p.name]));
    const profileMap = new Map((profData || []).map(p => [p.id, p.full_name]));

    const enriched: EnrichedExpense[] = ((expData || []) as Expense[]).map(e => ({
      ...e,
      project_name: projectMap.get(e.project_id) || 'Unknown Project',
      created_by_name: profileMap.get(e.created_by) || 'Admin / Staff',
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

  // Month label
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [curY, curM] = selectedMonth.split('-').map(Number);
  const monthLabel = `${monthNames[curM - 1]} ${curY}`;

  // Metrics
  const totalSpend = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);

  // MoM Difference
  const momDiff = totalSpend - prevMonthTotal;
  const momPct = prevMonthTotal > 0 ? (momDiff / prevMonthTotal) * 100 : 0;

  // Breakdown by Project
  const byProject = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; count: number }>();
    expenses.forEach(e => {
      const pid = e.project_id;
      if (!map.has(pid)) {
        map.set(pid, { id: pid, name: e.project_name || 'Unknown', total: 0, count: 0 });
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

  // Breakdown by Person (PRD §6.8)
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    expenses.forEach(e => {
      const uid = e.created_by;
      const name = e.created_by_name || 'Staff';
      if (!map.has(uid)) {
        map.set(uid, { name, total: 0, count: 0 });
      }
      const item = map.get(uid)!;
      item.total += Number(e.amount);
      item.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Daily spend distribution across the month (1 to 31) (PRD §6.8)
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

  // Month-by-month distribution for the year (Jan to Dec) (PRD §6.8)
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
    <div className="page-container">
      {/* Page Header & View Toggle (PRD §6.8) */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {viewPeriod === 'month' ? '📆 Monthly Spend Analysis' : '📊 Annual Spend Analysis'}
          </h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            {viewPeriod === 'month'
              ? `Daily progression, MoM comparison and breakdowns for ${monthLabel}`
              : `12-Month spend distribution and site costs for ${selectedYear}`}
          </p>
        </div>

        {/* Month / Year Toggle */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-white)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-md)',
            padding: '2px',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${viewPeriod === 'month' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewPeriod('month')}
          >
            📆 Month View
          </button>
          <button
            type="button"
            className={`btn btn-sm ${viewPeriod === 'year' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setViewPeriod('year')}
          >
            📊 Year View
          </button>
        </div>
      </div>

      {/* Period Navigation Bar */}
      <div
        className="card"
        style={{
          padding: '0.75rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        {viewPeriod === 'month' ? (
          <div className="flex items-center flex-wrap gap-sm" style={{ width: '100%', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigateMonth(-1)}
            >
              ← Prev Month
            </button>

            <div style={{ textAlign: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-navy)' }}>
                {monthLabel}
              </span>
            </div>

            <div className="flex items-center gap-xs flex-wrap">
              <input
                type="month"
                className="input"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ height: '34px', fontSize: '0.8125rem' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigateMonth(1)}
              >
                Next Month →
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center flex-wrap gap-sm" style={{ width: '100%', justifyContent: 'space-between' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigateYear(-1)}
            >
              ← Prev Year
            </button>

            <div style={{ textAlign: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-navy)' }}>
                Year {selectedYear}
              </span>
            </div>

            <div className="flex items-center gap-xs flex-wrap">
              <select
                className="select"
                value={yearMode}
                onChange={e => setYearMode(e.target.value as any)}
                style={{ height: '34px', fontSize: '0.8125rem' }}
              >
                <option value="calendar">Calendar Year ({selectedYear})</option>
                <option value="last12">Rolling Last 12 Months</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigateYear(1)}
              >
                Next Year →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Top Metrics Strip */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span>{viewPeriod === 'month' ? 'Total Month Spend' : 'Total Year Spend'}</span>
            <Tooltip text={viewPeriod === 'month' ? TOOLTIPS.spent_this_month : 'All site expenditures across this year'} />
          </div>
          <div className="stat-card__value">{formatPKR(totalSpend)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {expenses.length} expense entries recorded
          </span>
        </div>

        {viewPeriod === 'month' ? (
          /* Month-over-Month Comparison (PRD §6.8) */
          <div className={`stat-card ${momDiff > 0 ? 'stat-card--warning' : 'stat-card--success'}`}>
            <div className="stat-card__label">
              <span>vs Previous Month</span>
              <Tooltip text="Comparison of total expenditure against the immediately preceding calendar month" />
            </div>
            <div className={`stat-card__value ${momDiff > 0 ? 'text-danger' : 'text-success'}`}>
              {momDiff > 0 ? `+${formatPKRShort(momDiff)}` : formatPKRShort(momDiff)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Prev Month: {formatPKRShort(prevMonthTotal)} ({momPct >= 0 ? '+' : ''}{momPct.toFixed(1)}%)
            </span>
          </div>
        ) : (
          <div className="stat-card stat-card--info">
            <div className="stat-card__label">
              <span>Monthly Average Spend</span>
            </div>
            <div className="stat-card__value" style={{ color: 'var(--color-primary-blue)' }}>
              {formatPKR(totalSpend / 12)}
            </div>
            <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Over 12 calendar months
            </span>
          </div>
        )}

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Sites with Spend</span>
            <Tooltip text="Number of unique construction sites with expenditures recorded during this period" />
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {byProject.length} Sites
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Across {byCategory.length} categories
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Calculating monthly financial aggregates...</span>
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📆</div>
          <div className="empty-state__title">No expenses recorded for this period</div>
          <div className="empty-state__desc">
            Use the date navigation above or record a new expense.
          </div>
        </div>
      ) : (
        <div>
          {/* ============================================================ */}
          {/* VISUAL BAR CHART (PRD §6.8 & §13 Phase 3) */}
          {/* ============================================================ */}
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.0625rem', color: 'var(--color-navy)', margin: 0 }}>
                {viewPeriod === 'month' ? '📅 Daily Spend Progression' : '📊 Month-by-Month Spend'}
              </h3>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                {viewPeriod === 'month' ? 'Day 1 to 31' : 'Jan to Dec'}
              </span>
            </div>

            {viewPeriod === 'month' ? (
              /* Daily Spend Bars (1 to 31) */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '4px',
                  height: '140px',
                  paddingTop: '1rem',
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
                        minWidth: '18px',
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
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: '0.625rem',
                          color: d.amount > 0 ? 'var(--color-navy)' : 'var(--color-faint-text)',
                          fontWeight: d.amount > 0 ? 700 : 400,
                          marginTop: '4px',
                        }}
                      >
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Yearly 12-Month Bars */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '12px',
                  height: '160px',
                  paddingTop: '1rem',
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
                        minWidth: '40px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                      title={`${m.name}: ${formatPKR(m.total)}`}
                    >
                      {m.total > 0 && (
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '4px' }}>
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
                          borderRadius: '4px 4px 0 0',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--color-navy)',
                          marginTop: '6px',
                        }}
                      >
                        {m.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* THREE COLUMN BREAKDOWN: PROJECT, CATEGORY, PERSON (PRD §6.8) */}
          {/* ============================================================ */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* 1. Breakdown by Project */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0 }}>
                  🏗️ Breakdown by Project
                </h3>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {byProject.length} Sites
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {byProject.map(p => {
                  const pct = totalSpend > 0 ? (p.total / totalSpend) * 100 : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                          {p.name}
                        </Link>
                        <div>
                          <span style={{ fontWeight: 700 }}>{formatPKRShort(p.total)}</span>
                          <span className="text-muted" style={{ fontSize: '0.6875rem', marginLeft: '0.25rem' }}>
                            ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '6px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Breakdown by Category */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0 }}>
                  🏷️ Breakdown by Category
                </h3>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {byCategory.length} Types
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {byCategory.slice(0, 10).map(c => {
                  const pct = totalSpend > 0 ? (c.amt / totalSpend) * 100 : 0;
                  return (
                    <div key={c.cat}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 500 }}>{c.cat}</span>
                        <div>
                          <span style={{ fontWeight: 700 }}>{formatPKRShort(c.amt)}</span>
                          <span className="text-muted" style={{ fontSize: '0.6875rem', marginLeft: '0.25rem' }}>
                            ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '6px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: 'var(--color-cyan)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Breakdown by Person who entered it (PRD §6.8) */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0 }}>
                  👷 Breakdown by Staff / Recorder
                </h3>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {byPerson.length} Users
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {byPerson.map((u, idx) => {
                  const pct = totalSpend > 0 ? (u.total / totalSpend) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                          👤 {u.name}
                        </span>
                        <div>
                          <span style={{ fontWeight: 700 }}>{formatPKRShort(u.total)}</span>
                          <span className="text-muted" style={{ fontSize: '0.6875rem', marginLeft: '0.25rem' }}>
                            ({pct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '6px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
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
