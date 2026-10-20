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
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import type { Expense, ProjectForSite } from '@/types/database';

interface EnrichedExpense extends Expense {
  project_name?: string;
}

export default function SiteDailyViewPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayPKT());
  const [expenses, setExpenses] = useState<EnrichedExpense[]>([]);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<EnrichedExpense | null>(null);
  const [assignedProjects, setAssignedProjects] = useState<ProjectForSite[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadExpenses();
  }, [selectedDate]);

  async function loadExpenses() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Get assigned projects
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

    // Get project names from restricted view
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

    const { data: exp } = await supabase
      .from('expenses')
      .select('*')
      .eq('expense_date', selectedDate)
      .in('project_id', projectIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, 50000);

    const enriched: EnrichedExpense[] = ((exp || []) as Expense[]).map(e => ({
      ...e,
      project_name: projectMap.get(e.project_id) || 'Assigned Site',
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

  return (
    <div className="page-container" style={{ maxWidth: '780px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">📅 Daily Site Expenses</h1>
          <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
            Day view of site expenditures for your assigned projects
          </p>
        </div>
        <Link href="/expenses/add" className="btn btn-primary btn-sm">
          ➕ Add Expense
        </Link>
      </div>

      {/* Date Navigation */}
      <div
        className="card"
        style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div className="flex items-center gap-xs">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigateDate(-1)}>
            ← Prev
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(getYesterdayPKT())}>
            Yesterday
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(getTodayPKT())}>
            Today
          </button>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1.125rem', color: 'var(--color-navy)' }}>
            {getRelativeDay(selectedDate)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            {formatDate(selectedDate)}
          </div>
        </div>

        <div className="flex items-center gap-xs">
          <input
            type="date"
            className="input"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={getTodayPKT()}
            style={{ height: '32px', fontSize: '0.8125rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => navigateDate(1)}
            disabled={selectedDate >= getTodayPKT()}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Day Total Strip */}
      <div className="grid-stats-3" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span>Day Total Spend</span>
          </div>
          <div className="stat-card__value">{formatPKR(dayTotal)}</div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {expenses.length} items logged
          </span>
        </div>

        <div className="stat-card stat-card--info">
          <div className="stat-card__label">
            <span>Sites with Spend</span>
          </div>
          <div className="stat-card__value" style={{ color: 'var(--color-navy)' }}>
            {byProject.length} Sites
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Spent on {byProject.length} site{byProject.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="stat-card stat-card--success">
          <div className="stat-card__label">
            <span>Total Items</span>
          </div>
          <div className="stat-card__value text-success">
            {expenses.length} Items
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading site expenses...</span>
        </div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📅</div>
          <div className="empty-state__title">No expenses logged on this date</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Spend by Site */}
          {byProject.length > 1 && (
            <div className="card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
                🏗️ Spend by Site Today
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {byProject.map(p => (
                  <div key={p.id} className="flex justify-between items-center" style={{ fontSize: '0.8125rem' }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    <span style={{ fontWeight: 700 }}>{formatPKRShort(p.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Items Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.625rem 1rem', background: 'var(--color-card-deep)', borderBottom: '1px solid var(--color-line)' }}>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-navy)', margin: 0 }}>All Expense Items ({expenses.length})</h3>
            </div>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>Description</th>
                    <th>Site</th>
                    <th>Paid Via</th>
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
                        <div style={{ fontWeight: 600, color: 'var(--color-navy)', fontSize: '0.84375rem' }}>
                          {exp.expense_name}
                        </div>
                        <div className="flex items-center gap-xs flex-wrap">
                          {exp.purpose && <span className="text-muted" style={{ fontSize: '0.6875rem' }}>{exp.purpose}</span>}
                          {exp.reference_no && (
                            <span className="badge badge-neutral" style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)' }}>
                              Ref #{exp.reference_no}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{exp.project_name}</td>
                      <td>
                        <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`} style={{ fontSize: '0.65625rem' }}>
                          {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-money" style={{ fontSize: '0.875rem' }}>{formatPKR(exp.amount)}</span>
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
