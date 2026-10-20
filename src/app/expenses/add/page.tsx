'use client';

import { Suspense, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parsePKRInput, formatPKR, formatPKRShort, getTodayPKT, getYesterdayPKT, getRelativeDay } from '@/lib/format';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Project, ProjectForSite, PaidVia } from '@/types/database';

const FORM_STORAGE_KEY = 'site-ledger-expense-draft';

interface LastExpenseInfo {
  id: string;
  serial_no: number | null;
  expense_name: string;
  amount: number;
  expense_date: string;
  paid_via: string;
  project_name: string;
  created_at: string;
}

interface SupervisorOption {
  id: string;
  full_name: string;
  phone: string | null;
  float_balance: number;
  assigned_project_ids: string[];
}

export default function AddExpensePage() {
  return (
    <Suspense fallback={<div className="page-container"><p className="text-muted">Loading...</p></div>}>
      <AddExpenseForm />
    </Suspense>
  );
}

function AddExpenseForm() {
  const searchParams = useSearchParams();
  const preselectedProject = searchParams.get('project');

  const [projects, setProjects] = useState<(Project | ProjectForSite)[]>([]);

  const [userRole, setUserRole] = useState<string>('');
  const [userFloatBalance, setUserFloatBalance] = useState<number | null>(null);

  // Last added expense state
  const [lastExpense, setLastExpense] = useState<LastExpenseInfo | null>(null);

  // Supervisor Selection Modal state (for Admins)
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<SupervisorOption | null>(null);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [supervisorSearch, setSupervisorSearch] = useState('');

  // Split / "Other" expense state (Available for Admin & Site Manager)
  const [activeSites, setActiveSites] = useState<(Project | ProjectForSite)[]>([]);
  const [isOtherProject, setIsOtherProject] = useState(false);
  const [splitDetails, setSplitDetails] = useState('');
  interface SplitResult { totalAmount: number; perSiteAmount: number; siteCount: number; }
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);

  // Form state
  const [projectId, setProjectId] = useState(preselectedProject || '');
  const [expenseName, setExpenseName] = useState('');

  const [amountInput, setAmountInput] = useState('');
  const [expenseDate, setExpenseDate] = useState(getTodayPKT());

  const [paidVia, setPaidVia] = useState<PaidVia>('site_float');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // Load form draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem(FORM_STORAGE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.projectId && !preselectedProject) setProjectId(parsed.projectId);
        if (parsed.expenseName) setExpenseName(parsed.expenseName);
        if (parsed.amountInput) setAmountInput(parsed.amountInput);
      } catch { /* ignore */ }
    }
  }, [preselectedProject]);

  // Save form state to localStorage on changes
  useEffect(() => {
    const draft = { projectId, expenseName, amountInput };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(draft));
  }, [projectId, expenseName, amountInput]);



  useEffect(() => {
    loadFormData();
  }, []);

  async function loadLastExpense(allProjects?: (Project | ProjectForSite)[]) {
    try {
      const { data: exp, error } = await supabase
        .from('expenses')
        .select('id, serial_no, expense_name, amount, expense_date, paid_via, project_id, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !exp) {
        setLastExpense(null);
        return;
      }

      const currentProjects = allProjects && allProjects.length > 0 ? allProjects : projects;
      let projName = currentProjects.find(p => p.id === exp.project_id)?.name;

      if (!projName && exp.project_id) {
        const { data: pSite } = await supabase
          .from('projects_for_site')
          .select('name')
          .eq('id', exp.project_id)
          .maybeSingle();

        if (pSite?.name) {
          projName = pSite.name;
        } else {
          const { data: pProj } = await supabase
            .from('projects')
            .select('name')
            .eq('id', exp.project_id)
            .maybeSingle();
          if (pProj?.name) projName = pProj.name;
        }
      }

      setLastExpense({
        id: exp.id,
        serial_no: exp.serial_no || null,
        expense_name: exp.expense_name,
        amount: Number(exp.amount),
        expense_date: exp.expense_date,
        paid_via: exp.paid_via,
        project_name: projName || 'Project',
        created_at: exp.created_at,
      });
    } catch (err) {
      console.error('Failed to load last expense:', err);
    }
  }

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role || 'site_manager';
    setUserRole(role);
    setPaidVia(role === 'admin' ? 'direct' : 'site_float');

    // Calculate site float balance for site manager - uses server-side RPC to avoid row limit
    const { data: floatData } = await supabase.rpc('get_user_float_balance', { p_user_id: user.id });
    const floatRow = Array.isArray(floatData) ? floatData[0] : floatData;
    setUserFloatBalance(floatRow ? Number(floatRow.float_balance) : 0);

    // Load projects based on role - only active projects can receive new expenses
    if (role === 'admin') {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('name');
      const projectList = (data || []) as Project[];
      setProjects(projectList);
      setActiveSites(projectList);

      // Load all active supervisors with their project assignments & live float balances
      const { data: supsData } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role, is_active')
        .eq('role', 'site_manager')
        .eq('is_active', true)
        .order('full_name');

      const { data: allAssignments } = await supabase
        .from('project_assignments')
        .select('project_id, user_id');

      // Load all float balances via server-side RPC to avoid row limit
      const { data: allFloatBalances } = await supabase.rpc('get_all_float_balances');
      const floatMap = new Map<string, number>((allFloatBalances || []).map((f: { user_id: string; float_balance: number }) => [f.user_id, Number(f.float_balance)]));

      const enrichedSupervisors: SupervisorOption[] = (supsData || []).map(s => {
        const assignedIds = (allAssignments || []).filter(a => a.user_id === s.id).map(a => a.project_id);

        return {
          id: s.id,
          full_name: s.full_name,
          phone: s.phone,
          float_balance: Number(floatMap.get(s.id) || 0),
          assigned_project_ids: assignedIds,
        };
      });

      setSupervisors(enrichedSupervisors);
      await loadLastExpense(projectList);
    } else {
      // Site manager - load assigned projects for direct selection (only active sites)
      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('user_id', user.id);

      let assignedProjectsList: ProjectForSite[] = [];
      const projectIds = (assignments || []).map(a => a.project_id);
      if (projectIds.length > 0) {
        let { data } = await supabase
          .from('projects_for_site')
          .select('id, name, address, status, project_type')
          .in('id', projectIds)
          .eq('status', 'active');

        if (!data || data.length === 0) {
          const { data: fallbackData } = await supabase
            .from('projects')
            .select('id, name, address, status, project_type')
            .in('id', projectIds)
            .eq('status', 'active')
            .is('deleted_at', null);
          data = fallbackData;
        }

        assignedProjectsList = (data || []) as ProjectForSite[];
        setProjects(assignedProjectsList);

        if (projectIds.length === 1 && !preselectedProject) {
          setProjectId(projectIds[0]);
        }
      }

      // Also load ALL active sites across the company for splitting shared expenses
      // Only status === 'active' - on_hold sites do NOT receive split amounts
      let { data: allActive } = await supabase
        .from('projects_for_site')
        .select('id, name, address, status, project_type')
        .eq('status', 'active')
        .order('name');

      if (!allActive || allActive.length === 0) {
        const { data: fallbackActive } = await supabase
          .from('projects')
          .select('id, name, address, status, project_type')
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('name');
        allActive = fallbackActive;
      }

      if (allActive && allActive.length > 0) {
        setActiveSites(allActive as ProjectForSite[]);
      }

      await loadLastExpense(assignedProjectsList);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const amount = parsePKRInput(amountInput);
    if (amount === null || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    // ── SPLIT MODE: "Other (Split to All Active Sites)" ──────────────────
    if (isOtherProject) {
      if (!splitDetails.trim()) {
        setError('Please describe what this shared expense is for (e.g. "Food for staff", "Motorcycle petrol").');
        return;
      }

      // STRICT: Target sites must ONLY be active sites (on_hold & completed are strictly excluded)
      const targetSites = activeSites.filter(p => p.status === 'active');

      if (targetSites.length === 0) {
        setError('No active sites found to split this expense across. (Sites on hold or completed cannot receive split expenses).');
        return;
      }

      if (userRole === 'admin' && paidVia === 'site_float' && !selectedSupervisor) {
        setError('Please select which supervisor paid from their site cash float.');
        setShowSupervisorModal(true);
        return;
      }

      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); setLoading(false); return; }

      const expenseCreatedBy = (userRole === 'admin' && paidVia === 'site_float' && selectedSupervisor)
        ? selectedSupervisor.id
        : user.id;

      const siteCount = targetSites.length;
      const basePerSite = Math.floor(amount / siteCount);
      const remainder = amount - basePerSite * siteCount;

      const sharedLabel = `${expenseName} (Shared: ${splitDetails.trim()})`;

      const rows = targetSites.map((p, idx) => ({
        project_id: p.id,
        expense_name: sharedLabel,
        quantity: null,
        unit: null,
        rate: null,
        amount: idx === 0 ? basePerSite + remainder : basePerSite, // first site absorbs remainder
        expense_date: expenseDate,
        category: 'General',
        purpose: `Shared expense split across ${siteCount} active sites (${splitDetails.trim()})`,
        vendor_id: null,
        reference_no: 'N/A',
        payment_status: 'paid' as const,
        paid_date: expenseDate,
        paid_method: 'cash',
        paid_from: 'own_funds' as const,
        paid_via: paidVia,
        is_reimbursable: false,
        created_by: expenseCreatedBy,
      }));

      const { error: insertError } = await supabase.from('expenses').insert(rows);
      if (insertError) {
        setError(insertError.message);
        setLoading(false);
        return;
      }

      localStorage.removeItem(FORM_STORAGE_KEY);
      await loadLastExpense();
      setSplitResult({ totalAmount: amount, perSiteAmount: basePerSite, siteCount });
      setSuccess(true);
      setLoading(false);
      return;
    }
    // ── END SPLIT MODE ───────────────────────────────────────────────────

    if (userRole === 'admin' && paidVia === 'site_float' && !selectedSupervisor) {
      setError('Please select which supervisor paid from their site cash float.');
      setShowSupervisorModal(true);
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    // For site float expenses recorded by admin, attribute custody to the selected supervisor
    const expenseCreatedBy = (userRole === 'admin' && paidVia === 'site_float' && selectedSupervisor)
      ? selectedSupervisor.id
      : user.id;

    const { error: insertError } = await supabase.from('expenses').insert({
      project_id: projectId,
      expense_name: expenseName,
      quantity: null,
      unit: null,
      rate: null,
      amount,
      expense_date: expenseDate,
      category: 'General',
      purpose: null,
      vendor_id: null,
      reference_no: 'N/A',
      payment_status: 'paid',
      paid_date: expenseDate,
      paid_method: 'cash',
      paid_from: 'own_funds',
      paid_via: paidVia,
      is_reimbursable: false,
      created_by: expenseCreatedBy,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    // Clear draft
    localStorage.removeItem(FORM_STORAGE_KEY);
    await loadLastExpense();
    setSplitResult(null);
    setSuccess(true);
    setLoading(false);
  }

  function handleAddAnother() {
    setSuccess(false);
    setSplitResult(null);
    setIsOtherProject(false);
    setSplitDetails('');
    setExpenseName('');
    setAmountInput('');
    loadLastExpense();
  }

  // Filter supervisors for modal
  const filteredSupervisors = supervisors.filter(s => {
    const q = supervisorSearch.toLowerCase().trim();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q));
  }).sort((a, b) => {
    // If a project is selected, put supervisors assigned to this project first
    if (projectId) {
      const aAssigned = a.assigned_project_ids.includes(projectId);
      const bAssigned = b.assigned_project_ids.includes(projectId);
      if (aAssigned && !bAssigned) return -1;
      if (!aAssigned && bAssigned) return 1;
    }
    return a.full_name.localeCompare(b.full_name);
  });

  if (success) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{splitResult ? '🔀' : '✅'}</div>
        <h2 style={{ marginBottom: '0.5rem' }}>
          {splitResult ? 'Expense Split!' : 'Expense Added!'}
        </h2>
        <p className="text-muted" style={{ marginBottom: splitResult ? '0.75rem' : '1.5rem' }}>
          {expenseName}{splitDetails ? ` - ${splitDetails}` : ''} - {formatPKR(parsePKRInput(amountInput))}
        </p>

        {/* Split breakdown summary */}
        {splitResult && (
          <div style={{
            display: 'inline-block',
            background: '#F0F7FF',
            border: '1px solid #BFDBFE',
            borderRadius: 'var(--radius-lg)',
            padding: '0.875rem 1.25rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
            minWidth: '260px',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
              📊 Split Summary
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)', lineHeight: 1.7 }}>
              <div>Total Amount: <strong style={{ color: 'var(--color-navy)' }}>{formatPKR(splitResult.totalAmount)}</strong></div>
              <div>Active Sites: <strong style={{ color: 'var(--color-navy)' }}>{splitResult.siteCount}</strong></div>
              <div>Per Site: <strong style={{ color: 'var(--color-success)' }}>{formatPKR(splitResult.perSiteAmount)}</strong></div>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
              ✅ {splitResult.siteCount} expense records created
            </div>
          </div>
        )}

        <div className="flex gap-sm" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary btn-lg" onClick={handleAddAnother}>
            ➕ Add Another
          </button>
          <button
            className="btn btn-secondary btn-lg"
            onClick={() => router.push(userRole === 'admin' ? '/dashboard' : '/site')}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Add Expense</h1>
        </div>
      </div>

      <div style={{ maxWidth: '580px' }}>
        {/* Last Expense Added Box */}
        {lastExpense && (
          <div
            style={{
              background: '#F0F7FF',
              border: '1px solid #BFDBFE',
              borderRadius: 'var(--radius-lg)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
              boxShadow: '0 1px 3px rgba(27, 117, 188, 0.08)',
            }}
          >
            <div className="flex justify-between items-center">
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--color-primary-blue)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>🕒</span> Last Expense Added {lastExpense.serial_no ? <span style={{ opacity: 0.85 }}>#{lastExpense.serial_no}</span> : ''}
              </span>
              <span
                className={`badge ${lastExpense.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`}
                style={{ fontSize: '0.6875rem', padding: '0.1rem 0.45rem', fontWeight: 600 }}
              >
                {lastExpense.paid_via === 'site_float' ? '💼 Site Float' : '🏛️ Direct'}
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-sm flex-wrap">
              <div style={{ flex: 1, minWidth: '180px' }}>
                <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.9375rem', lineHeight: 1.35, wordBreak: 'break-word' }}>
                  {lastExpense.expense_name}
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {lastExpense.project_name && <span>📍 {lastExpense.project_name}</span>}
                  <span>•</span>
                  <span>📅 {getRelativeDay(lastExpense.expense_date)}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="text-money" style={{ color: 'var(--color-navy)', fontSize: '1.0625rem', fontWeight: 800 }}>
                  {formatPKR(lastExpense.amount)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="card-flat">
          <form onSubmit={handleSubmit}>
            {/* Project */}
          <div className="form-group">
            <label className="form-label" htmlFor="expense-project">Project *</label>
            <select
              id="expense-project"
              className="form-select"
              value={isOtherProject ? '__OTHER__' : projectId}
              onChange={e => {
                if (e.target.value === '__OTHER__') {
                  setIsOtherProject(true);
                  setProjectId('');
                } else {
                  setIsOtherProject(false);
                  setSplitDetails('');
                  setProjectId(e.target.value);
                }
              }}
              required={!isOtherProject}
            >
              <option value="">Select project...</option>
              {projects.filter(p => !p.status || p.status === 'active').map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__OTHER__">🔀 Other (Split to All Active Sites)</option>
            </select>
          </div>

          {/* Split Details - shown only when Other is selected */}
          {isOtherProject && (
            <div className="form-group">
              <div style={{
                padding: '0.75rem 1rem',
                background: '#FFF7ED',
                border: '1px solid #FCD34D',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                color: '#92400E',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.625rem',
              }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>🔀</span>
                <div>
                  <strong style={{ fontSize: '0.875rem' }}>Split across active sites only</strong>
                  <div style={{ marginTop: '0.25rem', color: '#78350F' }}>
                    The total amount will be divided equally among <strong>{activeSites.filter(p => p.status === 'active').length}</strong> active site{activeSites.filter(p => p.status === 'active').length !== 1 ? 's' : ''}:
                  </div>
                  {activeSites.filter(p => p.status === 'active').length > 0 && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', fontWeight: 600, color: '#92400E' }}>
                      {activeSites.filter(p => p.status === 'active').map(s => s.name).join(' · ')}
                    </div>
                  )}
                  <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#B45309' }}>
                    ℹ️ Projects that are on-hold or completed are strictly excluded from splits.
                  </div>
                  {activeSites.filter(p => p.status === 'active').length > 0 && parsePKRInput(amountInput) && (
                    <div style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--color-navy)' }}>
                      Each active site receives:{' '}
                      <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>
                        {formatPKR(Math.floor((parsePKRInput(amountInput) as number) / activeSites.filter(p => p.status === 'active').length))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <label className="form-label" htmlFor="expense-split-details">What is being shared? *</label>
              <input
                id="expense-split-details"
                className="form-input"
                value={splitDetails}
                onChange={e => setSplitDetails(e.target.value)}
                placeholder='e.g. "Food for staff", "Motorcycle petrol", "Car fuel", "Vehicle travel"'
                required
              />
              <span className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                This will appear in each site&apos;s expense description as: &ldquo;[Expense] (Shared: [Details])&rdquo;
              </span>
            </div>
          )}

          {/* Expense Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="expense-name">Description *</label>
            <input
              id="expense-name"
              className="form-input"
              value={expenseName}
              onChange={e => setExpenseName(e.target.value)}
              placeholder='e.g. "50 bags cement for roof slab" or "Mason daily wage for basement"'
              required
            />
          </div>



          {/* Total Amount (PKR) */}
          <div className="form-group">
            <label className="form-label" htmlFor="expense-amount">Total Amount (PKR) *</label>
            <input
              id="expense-amount"
              className="form-input form-input-lg"
              inputMode="numeric"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder='e.g. "55000", "5.5 lakh", or "45k"'
              required
            />
            {amountInput && parsePKRInput(amountInput) !== null && (
              <span className="form-hint" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                → {formatPKR(parsePKRInput(amountInput))}
              </span>
            )}
          </div>

          {/* Date */}
          <div className="form-group">
            <label className="form-label">Date *</label>
            <div className="flex gap-sm items-center">
              <input
                type="date"
                className="form-input"
                value={expenseDate}
                onChange={e => setExpenseDate(e.target.value)}
                max={getTodayPKT()}
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={`chip ${expenseDate === getTodayPKT() ? 'chip--active' : ''}`}
                onClick={() => setExpenseDate(getTodayPKT())}
              >
                Today
              </button>
              <button
                type="button"
                className={`chip ${expenseDate === getYesterdayPKT() ? 'chip--active' : ''}`}
                onClick={() => setExpenseDate(getYesterdayPKT())}
              >
                Yesterday
              </button>
            </div>
          </div>



          {/* Paid Via (Site Float vs Direct) */}
          <div className="form-group">
            <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Paid Via (Cash Custody) *</label>
              {userRole === 'admin' && paidVia === 'site_float' && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowSupervisorModal(true)}
                  style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', padding: '0.15rem 0.4rem' }}
                >
                  {selectedSupervisor ? '🔄 Switch Supervisor' : '➕ Select Supervisor'}
                </button>
              )}
            </div>
            <div className="flex gap-sm flex-wrap items-center">
              <button
                type="button"
                className={`chip ${paidVia === 'site_float' ? 'chip--active' : ''}`}
                onClick={() => {
                  if (userRole === 'admin') {
                    setPaidVia('site_float');
                    setShowSupervisorModal(true);
                  } else {
                    setPaidVia('site_float');
                  }
                }}
              >
                💼 {userRole === 'admin'
                  ? selectedSupervisor ? `Site Float: ${selectedSupervisor.full_name}` : 'Site Float (Supervisor Cash)'
                  : userFloatBalance !== null ? `Site Float (${formatPKRShort(userFloatBalance)} available)` : 'Site Float (My Cash)'}
              </button>
              <button
                type="button"
                className={`chip ${paidVia === 'direct' ? 'chip--active' : ''}`}
                onClick={() => {
                  setPaidVia('direct');
                }}
              >
                🏛️ Direct (Admin Paid)
              </button>
            </div>

            {/* Selected Supervisor Details Card for Admin */}
            {userRole === 'admin' && paidVia === 'site_float' && (
              <div style={{
                marginTop: '0.625rem',
                padding: '0.625rem 0.875rem',
                background: selectedSupervisor ? '#F0F7FF' : '#FFF9EE',
                border: `1px solid ${selectedSupervisor ? '#BFDBFE' : '#F8E0B0'}`,
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
              }}>
                {selectedSupervisor ? (
                  <div className="flex justify-between items-center flex-wrap gap-xs">
                    <div className="flex items-center gap-xs">
                      <span style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--color-primary-blue)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6875rem',
                        fontWeight: 700
                      }}>
                        {selectedSupervisor.full_name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{selectedSupervisor.full_name}</strong>
                        {selectedSupervisor.phone && <span className="text-muted" style={{ marginLeft: '0.35rem' }}>({selectedSupervisor.phone})</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-xs">
                      <span className={`badge ${selectedSupervisor.float_balance > 0 ? 'badge-success' : selectedSupervisor.float_balance === 0 ? 'badge-neutral' : 'badge-danger'}`} style={{ fontSize: '0.6875rem' }}>
                        Float: {formatPKR(selectedSupervisor.float_balance)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => setShowSupervisorModal(true)}
                        style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', textDecoration: 'underline' }}
                      >
                        Change
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span style={{ color: '#8C5B00' }}>⚠️ No supervisor selected yet. Please choose who paid.</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '28px' }}
                      onClick={() => setShowSupervisorModal(true)}
                    >
                      Choose Supervisor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="form-error" style={{ marginBottom: '1rem' }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Save Expense'}
          </button>
        </form>
      </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: SELECT SUPERVISOR POPUP (Admin Side) */}
      {/* ============================================================ */}
      {showSupervisorModal && (
        <div className="modal-backdrop" onClick={() => setShowSupervisorModal(false)}>
          <div
            className="modal"
            style={{ maxWidth: '480px', padding: '1.25rem' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header" style={{ marginBottom: '0.875rem', paddingBottom: '0.625rem' }}>
              <div>
                <h2 className="modal-title" style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-navy)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>💼</span> Select Site Supervisor
                </h2>
                <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem', marginBottom: 0 }}>
                  Select whose cash float was used. This expense will deduct from their passbook.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSupervisorModal(false)}
                aria-label="Close"
                style={{ padding: '0.25rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            {/* Search filter */}
            {supervisors.length > 3 && (
              <div style={{ marginBottom: '0.875rem' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="🔍 Search supervisor name or phone..."
                  value={supervisorSearch}
                  onChange={e => setSupervisorSearch(e.target.value)}
                  style={{ fontSize: '0.8125rem', padding: '0.45rem 0.75rem' }}
                  autoFocus
                />
              </div>
            )}

            {/* Supervisor List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
              {filteredSupervisors.length === 0 ? (
                <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                  <div className="empty-state__icon" style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>👤</div>
                  <div className="empty-state__title" style={{ fontSize: '0.9375rem' }}>No supervisors found</div>
                  <div className="empty-state__desc" style={{ fontSize: '0.75rem' }}>
                    {supervisors.length === 0
                      ? 'No active site managers created yet. Add supervisors in User Management.'
                      : 'No supervisors match your search filter.'}
                  </div>
                </div>
              ) : (
                filteredSupervisors.map(sup => {
                  const isSelected = selectedSupervisor?.id === sup.id;
                  const isAssigned = projectId && sup.assigned_project_ids.includes(projectId);

                  return (
                    <div
                      key={sup.id}
                      onClick={() => {
                        setSelectedSupervisor(sup);
                        setPaidVia('site_float');
                        setShowSupervisorModal(false);
                        setError('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.75rem 0.875rem',
                        borderRadius: 'var(--radius-lg)',
                        border: isSelected ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-line)',
                        background: isSelected ? '#F0F7FF' : 'var(--color-white)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        boxShadow: isSelected ? '0 2px 8px rgba(27, 117, 188, 0.15)' : 'none',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#F8FAFC';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--color-white)';
                      }}
                    >
                      <div className="flex items-center gap-sm" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: isSelected ? 'var(--color-primary-blue)' : '#E2ECF7',
                          color: isSelected ? '#FFFFFF' : 'var(--color-navy)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          flexShrink: 0,
                        }}>
                          {sup.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup.full_name}</span>
                            {isAssigned && (
                              <span style={{ fontSize: '0.625rem', background: '#FEF3C7', color: '#92400E', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                ⭐ Assigned
                              </span>
                            )}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                            📱 {sup.phone || 'No phone set'}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-secondary-text)', marginBottom: '0.15rem' }}>Cash Float</div>
                        <span className={`badge ${sup.float_balance > 0 ? 'badge-success' : sup.float_balance === 0 ? 'badge-neutral' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                          {formatPKR(sup.float_balance)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end gap-sm" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-line)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowSupervisorModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

