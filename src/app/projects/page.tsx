'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatStatus,
  getStatusVariant,
  getBudgetVariant,
} from '@/lib/format';
import Link from 'next/link';
import type { Project } from '@/types/database';

interface ProjectRow extends Project {
  total_received: number;
  total_expenses: number;
  total_paid_out: number;
  client_money_with_us: number;
  net_position: number;
  client_balance_due: number;
  project_margin: number;
  budget_used_percent: number;
  assigned_supervisors: { id: string; name: string; phone?: string | null }[];
}

function ProjectsListContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [supervisorsList, setSupervisorsList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get('status') || (searchParams.get('filter') === 'surplus' ? 'active' : 'all')
  );
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [supervisorFilter, setSupervisorFilter] = useState<string>('all');
  const [financialFilter, setFinancialFilter] = useState<string>(
    () => searchParams.get('filter') || 'all'
  );
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [search, setSearch] = useState('');
  const supabase = createClient();

  useEffect(() => {
    const filterParam = searchParams.get('filter');
    const statusParam = searchParams.get('status');
    if (filterParam) {
      setFinancialFilter(filterParam);
      if (filterParam === 'surplus' && !statusParam) {
        setStatusFilter('active');
      }
    }
    if (statusParam) {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);

    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const { data: projectExpenseTotals } = await supabase.rpc('get_project_expense_totals');
    const expenseTotalsMap = new Map<string, { total_expenses: number; total_paid_out: number }>(
      (projectExpenseTotals || []).map((t: { project_id: string; total_expenses: number; total_paid_out?: number }) => [
        t.project_id,
        {
          total_expenses: Number(t.total_expenses || 0),
          total_paid_out: Number(t.total_paid_out !== undefined ? t.total_paid_out : t.total_expenses || 0),
        },
      ])
    );

    const { data: allPayments } = await supabase
      .from('client_payments')
      .select('project_id, amount')
      .is('deleted_at', null)
      .range(0, 50000);

    const { data: assignmentsData } = await supabase
      .from('project_assignments')
      .select('project_id, user_id');

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .eq('role', 'site_manager');

    const payList = allPayments || [];
    const assignList = (assignmentsData || []) as { project_id: string; user_id: string }[];
    const supervisorProfiles = profilesData || [];

    setSupervisorsList(
      supervisorProfiles.map(s => ({ id: s.id, name: s.full_name }))
    );

    const enriched: ProjectRow[] = (projectsData || []).map(p => {
      const pPay = payList.filter(pay => pay.project_id === p.id);

      const totalReceived = pPay.reduce((s, pay) => s + Number(pay.amount), 0);
      const expData = expenseTotalsMap.get(p.id) || { total_expenses: 0, total_paid_out: 0 };
      const totalExpenses = expData.total_expenses;
      const totalPaidOut = expData.total_paid_out;

      let contractValue = Number(p.contract_value);
      if (p.project_type === 'cost_plus' && p.supervision_percent) {
        contractValue = totalExpenses * (1 + Number(p.supervision_percent) / 100);
      }

      const balanceDue = contractValue - totalReceived;
      const margin = contractValue - totalExpenses;
      const budgetUsed = contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0;
      const netPos = totalReceived - totalExpenses;
      const clientMoneyLeft = Math.max(0, totalReceived - totalPaidOut);

      // Find assigned supervisors
      const assignedIds = assignList.filter(a => a.project_id === p.id).map(a => a.user_id);
      const assignedSupervisors = supervisorProfiles
        .filter(s => assignedIds.includes(s.id))
        .map(s => ({ id: s.id, name: s.full_name, phone: s.phone }));

      return {
        ...p,
        total_received: totalReceived,
        total_expenses: totalExpenses,
        total_paid_out: totalPaidOut,
        client_money_with_us: clientMoneyLeft,
        net_position: netPos,
        client_balance_due: balanceDue,
        project_margin: margin,
        budget_used_percent: budgetUsed,
        assigned_supervisors: assignedSupervisors,
      };
    });

    setProjects(enriched);
    setLoading(false);
  }

  // Filter and sort
  const filtered = projects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.project_type !== typeFilter) return false;
    if (supervisorFilter === 'unassigned') {
      if (p.assigned_supervisors.length > 0) return false;
    } else if (supervisorFilter !== 'all') {
      if (!p.assigned_supervisors.some(s => s.id === supervisorFilter)) return false;
    }
    if (financialFilter === 'overspent') {
      if (p.net_position >= 0) return false;
    } else if (financialFilter === 'surplus') {
      if (p.net_position <= 0) return false;
    } else if (financialFilter === 'balance_due') {
      if (p.client_balance_due <= 0) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match =
        p.name.toLowerCase().includes(q) ||
        (p.client_name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q) ||
        p.assigned_supervisors.some(s => s.name.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'net_position') return b.net_position - a.net_position;
    if (sortBy === 'received') return b.total_received - a.total_received;
    if (sortBy === 'spend') return b.total_expenses - a.total_expenses;
    if (sortBy === 'balance_due') return b.client_balance_due - a.client_balance_due;
    if (sortBy === 'contract') return b.contract_value - a.contract_value;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalSurplusAmount = filtered.reduce(
    (sum, p) => sum + (p.client_money_with_us > 0 ? p.client_money_with_us : Math.max(0, p.net_position)),
    0
  );
  const totalOverspentAmount = filtered.reduce(
    (sum, p) => sum + Math.abs(Math.min(0, p.net_position)),
    0
  );
  const totalBalanceDueAmount = filtered.reduce(
    (sum, p) => sum + Math.max(0, p.client_balance_due),
    0
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Construction Projects</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Track all active, on-hold, and completed construction projects
          </p>
        </div>
        <Link href="/projects/new" className="btn btn-primary">
          🏗️ New Project
        </Link>
      </div>

      {/* Filter and Sorting Controls */}
      <div className="card filter-bar-container">
        <div className="filter-bar-controls">
          <input
            type="text"
            className="input"
            placeholder="Search project or client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <select
            className="select"
            value={financialFilter}
            onChange={e => setFinancialFilter(e.target.value)}
          >
            <option value="all">All Financial Statuses</option>
            <option value="overspent">⚠️ Overspent / Out of Pocket ({projects.filter(p => p.net_position < 0).length})</option>
            <option value="surplus">💰 Client Surplus ({projects.filter(p => p.net_position > 0).length})</option>
            <option value="balance_due">📋 Balance Due ({projects.filter(p => p.client_balance_due > 0).length})</option>
          </select>

          <select
            className="select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses ({projects.length})</option>
            <option value="active">Active ({projects.filter(p => p.status === 'active').length})</option>
            <option value="on_hold">On Hold ({projects.filter(p => p.status === 'on_hold').length})</option>
            <option value="completed">Completed ({projects.filter(p => p.status === 'completed').length})</option>
            <option value="archived">Archived ({projects.filter(p => p.status === 'archived').length})</option>
          </select>

          <select
            className="select"
            value={supervisorFilter}
            onChange={e => setSupervisorFilter(e.target.value)}
          >
            <option value="all">All Supervisors</option>
            <option value="unassigned">⚠️ Unassigned ({projects.filter(p => p.assigned_supervisors.length === 0).length})</option>
            {supervisorsList.map(sup => (
              <option key={sup.id} value={sup.id}>
                👷 {sup.name} ({projects.filter(p => p.assigned_supervisors.some(s => s.id === sup.id)).length})
              </option>
            ))}
          </select>

          <select
            className="select"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="turnkey">Turnkey (Fixed Price)</option>
            <option value="labour_only">Labour Only</option>
            <option value="cost_plus">Cost Plus / Supervision</option>
          </select>

          <select
            className="select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ height: '34px', fontSize: '0.8125rem' }}
          >
            <option value="created_at">Sort by Newest</option>
            <option value="net_position">Sort by Net Position (Surplus / Deficit)</option>
            <option value="received">Sort by Client Paid (High to Low)</option>
            <option value="spend">Sort by Total Spent (High to Low)</option>
            <option value="balance_due">Sort by Balance Due on Contract</option>
            <option value="contract">Sort by Contract Value</option>
          </select>

          {(statusFilter !== 'all' || typeFilter !== 'all' || supervisorFilter !== 'all' || financialFilter !== 'all' || search) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setSupervisorFilter('all');
                setFinancialFilter('all');
                setSearch('');
              }}
            >
              Clear
            </button>
          )}
        </div>

        <span className="text-muted" style={{ fontSize: '0.78125rem' }}>
          Showing {filtered.length} of {projects.length} projects
        </span>
      </div>

      {financialFilter === 'overspent' && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#991B1B', fontSize: '0.875rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>
                <strong>Showing Overspent Projects Only:</strong> Filtered to {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#FCA5A5' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                Total Out of Pocket:
                <strong style={{ fontSize: '0.9375rem', color: '#991B1B', background: '#FEE2E2', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  {formatPKR(totalOverspentAmount, false)}
                </strong>
                <span style={{ fontWeight: 600, color: '#DC2626' }}>
                  ({formatPKRShort(totalOverspentAmount)})
                </span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setFinancialFilter('all');
              setStatusFilter('all');
            }}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            Show All Projects
          </button>
        </div>
      )}

      {financialFilter === 'surplus' && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#1E40AF', fontSize: '0.875rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.25rem' }}>💰</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>
                <strong>Showing Client Surplus Projects:</strong> Filtered to {filtered.length} active project{filtered.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#93C5FD' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                Total Client Money With Us:
                <strong style={{ fontSize: '0.9375rem', color: '#1E3A8A', background: '#DBEAFE', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  {formatPKR(totalSurplusAmount, false)}
                </strong>
                <span style={{ fontWeight: 600, color: '#2563EB' }}>
                  ({formatPKRShort(totalSurplusAmount)})
                </span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setFinancialFilter('all');
              setStatusFilter('all');
            }}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            Show All Projects
          </button>
        </div>
      )}

      {financialFilter === 'balance_due' && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', color: '#92400E', fontSize: '0.875rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.2rem' }}>📋</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>
                <strong>Showing Balance Due Projects Only:</strong> Filtered to {filtered.length} project{filtered.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#FCD34D' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                Total Balance Due:
                <strong style={{ fontSize: '0.9375rem', color: '#92400E', background: '#FEF3C7', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  {formatPKR(totalBalanceDueAmount, false)}
                </strong>
                <span style={{ fontWeight: 600, color: '#D97706' }}>
                  ({formatPKRShort(totalBalanceDueAmount)})
                </span>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setFinancialFilter('all');
              setStatusFilter('all');
            }}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
          >
            Show All Projects
          </button>
        </div>
      )}

      {loading ? (
        <div className="loading-screen">
          <div className="spinner spinner-lg" />
          <span className="text-muted">Loading projects...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🏗️</div>
          <div className="empty-state__title">No projects found</div>
          <div className="empty-state__desc">
            {projects.length === 0 ? 'Create your first project to start tracking.' : 'Try adjusting your search or filters.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {filtered.map(project => {
            const variant = getBudgetVariant(project.budget_used_percent);
            const isOverspent = project.net_position < 0 || project.total_expenses > project.total_received;
            return (
              <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: 'none' }}>
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
                      {project.assigned_supervisors.length > 0 ? (
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
                                border: '1px solid #BFDBFE',
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
                            border: '1px solid #FDE68A',
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

                  {/* Financial Metrics */}
                  <div className="project-metrics-grid">
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Client Paid</div>
                      <div className="text-money text-success" title={formatPKR(project.total_received, false)}>
                        {formatPKRShort(project.total_received)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Total Spent</div>
                      <div className="text-money" title={formatPKR(project.total_expenses, false)}>
                        {formatPKRShort(project.total_expenses)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Paid − Spent</div>
                      <div
                        className={`text-money ${project.net_position >= 0 ? 'text-success' : 'text-danger'}`}
                        title={formatPKR(project.net_position, false)}
                      >
                        {project.net_position >= 0 ? '+' : ''}{formatPKRShort(project.net_position)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Contract (Lump Sum)</div>
                      <div className="text-money" title={formatPKR(project.contract_value, false)}>
                        {formatPKRShort(project.contract_value)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted" style={{ fontSize: '0.71875rem' }}>Balance Due</div>
                      <div
                        className="text-money"
                        style={{ color: 'var(--color-amber)' }}
                        title={formatPKR(project.client_balance_due, false)}
                      >
                        {formatPKRShort(project.client_balance_due)}
                      </div>
                    </div>
                  </div>

                  {/* Cash flow ratio bar */}
                  <div className="flex items-center gap-sm" style={{ marginTop: '0.5rem' }}>
                    <div className={`progress-bar progress-bar--${project.total_expenses > project.total_received ? 'danger' : 'success'}`} style={{ flex: 1, height: '6px' }}>
                      <div
                        className="progress-bar__fill"
                        style={{ width: `${project.total_received > 0 ? Math.min((project.total_expenses / project.total_received) * 100, 100) : (project.total_expenses > 0 ? 100 : 0)}%` }}
                      />
                    </div>
                    <span className="text-muted" style={{ fontSize: '0.71875rem', minWidth: '3.5rem', textAlign: 'right', fontWeight: 600 }}>
                      {project.net_position >= 0 ? 'Surplus' : 'Deficit'}
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

export default function ProjectsListPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <div className="loading-screen">
            <div className="spinner spinner-lg" />
            <span className="text-muted">Loading projects...</span>
          </div>
        </div>
      }
    >
      <ProjectsListContent />
    </Suspense>
  );
}
