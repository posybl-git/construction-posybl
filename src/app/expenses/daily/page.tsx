'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  getTodayPKT,
  getYesterdayPKT,
  formatDate,
  getRelativeDay,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import type { Expense, Project, Profile } from '@/types/database';

interface EnrichedExpense extends Expense {
  project_name?: string;
  created_by_name?: string;
}

export default function DailyViewPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayPKT());
  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<EnrichedExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadExpenses();
  }, [selectedDate]);

  async function loadExpenses() {
    setLoading(true);

    const { data: exp } = await supabase
      .from('expenses')
      .select('*')
      .eq('expense_date', selectedDate)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, 50000);

    // Fetch projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .is('deleted_at', null);

    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name');

    const projectMap = new Map((projects || []).map(p => [p.id, p.name]));
    const profileMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

    const enriched: EnrichedExpense[] = ((exp || []) as Expense[]).map(e => ({
      ...e,
      project_name: projectMap.get(e.project_id) || 'Unknown Project',
      created_by_name: profileMap.get(e.created_by) || 'Staff / Admin',
    }));

    setExpenses(enriched);
    setLoading(false);
  }

  function navigateDate(offset: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  const dayTotal = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses]);



  // Breakdown by Project (PRD §6.7)
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

  // Breakdown by Person who recorded (PRD §6.7)
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    expenses.forEach(e => {
      const name = e.created_by_name || 'Staff';
      if (!map.has(name)) {
        map.set(name, { name, total: 0, count: 0 });
      }
      const item = map.get(name)!;
      item.total += Number(e.amount);
      item.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📅 Daily Expense View</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Daily spend audit across all construction sites and supervisors
          </p>
        </div>
        <Link href="/expenses/add" className="btn btn-primary">
          ➕ Add Expense
        </Link>
      </div>

      {/* Date Navigation Bar (PRD §6.7) */}
      <div
        className="card"
        style={{
          padding: '0.875rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div className="flex items-center gap-xs">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigateDate(-1)}
          >
            ← Prev Day
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedDate(getYesterdayPKT())}
          >
            Yesterday
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setSelectedDate(getTodayPKT())}
          >
            Today
          </button>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1875rem', color: 'var(--color-navy)' }}>
            {getRelativeDay(selectedDate)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.78125rem' }}>
            {formatDate(selectedDate)} (Asia/Karachi)
          </div>
        </div>

        <div className="flex items-center gap-xs">
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={getTodayPKT()}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigateDate(1)}
            disabled={selectedDate >= getTodayPKT()}
          >
            Next Day →
          </button>
        </div>
      </div>

      {/* Day Total Strip & Breakdown Cards */}
      <div className="grid-stats-3" style={{ marginBottom: '1.25rem' }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span>Day Total Spend</span>
            <Tooltip text={TOOLTIPS.spent_today} />
          </div>
          <div className="stat-card__value">{formatPKR(dayTotal)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {expenses.length} entries on this day
          </span>
        </div>

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Sites with Spend Today</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {byProject.length} Sites
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Expenses logged on {byProject.length} site{byProject.length !== 1 ? 's' : ''} today
          </span>
        </div>

        <div className="stat-card stat-card--success">
          <div className="stat-card__label">
            <span>Staff Reporting</span>
          </div>
          <div className="stat-card__value text-success">
            {byPerson.length} Supervisors
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Logged daily entries
          </span>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading daily expenditures...</span>
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📅</div>
          <div className="empty-state__title">No expenses on {formatDate(selectedDate)}</div>
          <div className="empty-state__desc">
            No material purchases, labour dihari or site costs were logged for this date.
          </div>
          <Link href="/expenses/add" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            Record Expense for This Date
          </Link>
        </div>
      ) : (
        <div>
          {/* Per-Project & Per-Person Breakdown Panels (PRD §6.7) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Project breakdown */}
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', marginBottom: '0.75rem' }}>
                🏗️ Spend by Construction Site
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {byProject.map(p => {
                  const pct = dayTotal > 0 ? (p.total / dayTotal) * 100 : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.2rem' }}>
                        <Link href={`/projects/${p.id}`} style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                          {p.name}
                        </Link>
                        <span style={{ fontWeight: 700 }}>{formatPKRShort(p.total)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '5px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Person breakdown */}
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', marginBottom: '0.75rem' }}>
                👷 Spend by Supervisor / Recorder
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {byPerson.map((u, idx) => {
                  const pct = dayTotal > 0 ? (u.total / dayTotal) * 100 : 0;
                  return (
                    <div key={idx}>
                      <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: 600 }}>👤 {u.name}</span>
                        <span style={{ fontWeight: 700 }}>{formatPKRShort(u.total)} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="progress-bar progress-bar--normal" style={{ height: '5px' }}>
                        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: 'var(--color-green)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Flat Items Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1.25rem', background: 'var(--color-card-deep)', borderBottom: '1px solid var(--color-line)' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', margin: 0 }}>All Expense Items ({expenses.length})</h3>
            </div>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>Item Description</th>
                    <th>Site</th>
                    <th>Payee / Vendor</th>
                    <th>Paid Via</th>
                    <th>Recorded By</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr
                      key={exp.id}
                      onClick={() => setSelectedDetailExpense(exp)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{exp.serial_no ?? '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{exp.expense_name}</div>
                        {exp.purpose && <div className="text-muted" style={{ fontSize: '0.71875rem' }}>{exp.purpose}</div>}
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
                      <td style={{ fontSize: '0.8125rem' }}>{exp.vendor_name || '—'}</td>
                      <td>
                        <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.6875rem' }}>
                          {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>{exp.created_by_name}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-money">{formatPKR(exp.amount)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
