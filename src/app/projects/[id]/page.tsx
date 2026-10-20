'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  formatStatus,
  getStatusVariant,
  getBudgetVariant,
  formatPaymentMethod,
  getWhatsAppShareLink,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import { ExpenseDetailModal } from '@/components/ExpenseDetailModal';
import type {
  Project,
  Expense,
  ClientPayment,
  PaymentMilestone,
  ProjectFinancials,
  ContractRevision,
  AuditLogEntry,
  Profile,
  ProjectType,
  PaymentMethod,
  PaymentStatus,
  PaidVia,
  MilestoneStatus,
  ProjectStatus,
} from '@/types/database';

type TabType = 'overview' | 'expenses' | 'payments' | 'milestones' | 'statement' | 'activity' | 'settings';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [financials, setFinancials] = useState<ProjectFinancials | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [revisions, setRevisions] = useState<ContractRevision[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);

  // Revision popup
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [newContractValue, setNewContractValue] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);

  // Add Milestone Modal
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [savingMilestone, setSavingMilestone] = useState(false);

  // Edit Milestone Modal
  const [editingMilestone, setEditingMilestone] = useState<PaymentMilestone | null>(null);
  const [editMilestoneName, setEditMilestoneName] = useState('');
  const [editMilestoneAmount, setEditMilestoneAmount] = useState('');
  const [editMilestoneDate, setEditMilestoneDate] = useState('');
  const [editMilestoneStatus, setEditMilestoneStatus] = useState<MilestoneStatus>('pending');
  const [savingEditMilestone, setSavingEditMilestone] = useState(false);

  // Add Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payMilestone, setPayMilestone] = useState('');
  const [payNote, setPayNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Edit Payment Modal
  const [editingPayment, setEditingPayment] = useState<ClientPayment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayMethod, setEditPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [editPayRef, setEditPayRef] = useState('');
  const [editPayMilestone, setEditPayMilestone] = useState('');
  const [editPayNote, setEditPayNote] = useState('');
  const [savingEditPayment, setSavingEditPayment] = useState(false);

  // Edit Expense Modal
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedDetailExpense, setSelectedDetailExpense] = useState<Expense | null>(null);
  const [editExpName, setEditExpName] = useState('');
  const [editExpAmount, setEditExpAmount] = useState('');
  const [editExpDate, setEditExpDate] = useState('');
  const [editExpProjectId, setEditExpProjectId] = useState('');
  const [editExpPaidVia, setEditExpPaidVia] = useState<PaidVia>('direct');
  const [editExpSupervisorId, setEditExpSupervisorId] = useState<string>('');
  const [savingEditExpense, setSavingEditExpense] = useState(false);

  // Project Details Settings state
  const [editProjName, setEditProjName] = useState('');
  const [editProjClientName, setEditProjClientName] = useState('');
  const [editProjClientPhone, setEditProjClientPhone] = useState('');
  const [editProjAddress, setEditProjAddress] = useState('');
  const [editProjPlotSize, setEditProjPlotSize] = useState('');
  const [editProjCoveredArea, setEditProjCoveredArea] = useState('');
  const [editProjType, setEditProjType] = useState<ProjectType>('turnkey');
  const [editProjSupervisionPercent, setEditProjSupervisionPercent] = useState('');
  const [editProjContractValue, setEditProjContractValue] = useState('');
  const [editProjStartDate, setEditProjStartDate] = useState('');
  const [editProjExpectedCompletion, setEditProjExpectedCompletion] = useState('');
  const [editProjStatus, setEditProjStatus] = useState<ProjectStatus>('active');
  const [editProjNotes, setEditProjNotes] = useState('');
  const [savingProjDetails, setSavingProjDetails] = useState(false);
  const [projDetailsSuccess, setProjDetailsSuccess] = useState(false);

  // Expense filters & grouping
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('');
  const [expensePaidViaFilter, setExpensePaidViaFilter] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseGroupBy, setExpenseGroupBy] = useState<'none' | 'category' | 'date' | 'payee'>('none');

  // Statement PDF generator state
  const [includeSpendInStatement, setIncludeSpendInStatement] = useState(false);

  // Settings & Buried Delete state
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingProject, setDeletingProject] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadProject(true);
  }, [projectId]);

  async function loadProject(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }

    // 1. Load project
    const { data: proj } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (!proj) {
      setLoading(false);
      return;
    }
    setProject(proj as Project);
    setNewContractValue(proj.contract_value.toString());

    setEditProjName(proj.name || '');
    setEditProjClientName(proj.client_name || '');
    setEditProjClientPhone(proj.client_phone || '');
    setEditProjAddress(proj.address || '');
    setEditProjPlotSize(proj.plot_size || '');
    setEditProjCoveredArea(proj.covered_area_sqft ? proj.covered_area_sqft.toString() : '');
    setEditProjType(proj.project_type || 'turnkey');
    setEditProjSupervisionPercent(proj.supervision_percent ? proj.supervision_percent.toString() : '');
    setEditProjContractValue(proj.contract_value ? proj.contract_value.toString() : '0');
    setEditProjStartDate(proj.start_date || '');
    setEditProjExpectedCompletion(proj.expected_completion || '');
    setEditProjStatus(proj.status || 'active');
    setEditProjNotes(proj.notes || '');

    // Load categories
    const { data: catData } = await supabase
      .from('expense_categories')
      .select('name')
      .order('name');
    setCategories((catData || []).map(c => c.name));

    // Load all projects (for site picker in edit expense modal)
    const { data: projsData } = await supabase
      .from('projects')
      .select('id, name')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    setAllProjects((projsData || []) as Project[]);

    // 2. Load expenses
    const { data: exp } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false });
    setExpenses((exp || []) as Expense[]);

    // 3. Load payments
    const { data: pay } = await supabase
      .from('client_payments')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });
    setPayments((pay || []) as ClientPayment[]);

    // 4. Load milestones
    const { data: ms } = await supabase
      .from('payment_milestones')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('sequence_no', { ascending: true });
    setMilestones((ms || []) as PaymentMilestone[]);

    // 5. Load contract revisions
    const { data: rev } = await supabase
      .from('contract_revisions')
      .select('*')
      .eq('project_id', projectId)
      .order('changed_at', { ascending: false });
    setRevisions((rev || []) as ContractRevision[]);

    // 6. Load audit log for this project
    const { data: audit } = await supabase
      .from('audit_log')
      .select('*')
      .eq('record_id', projectId)
      .order('changed_at', { ascending: false })
      .limit(20);
    setAuditLogs((audit || []) as AuditLogEntry[]);

    // 7. Load users & assignments
    const { data: usersData } = await supabase.from('profiles').select('*');
    setAllUsers((usersData || []) as Profile[]);

    const { data: assignData } = await supabase
      .from('project_assignments')
      .select('user_id')
      .eq('project_id', projectId);
    setAssignedUserIds((assignData || []).map(a => a.user_id));

    // 8. Calculate PRD §5 & §6.5 Financials
    const totalReceived = (pay || []).reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = (exp || []).reduce((s, e) => s + Number(e.amount), 0);
    const totalPaidOut = (exp || []).filter(e => e.payment_status === 'paid').reduce((s, e) => s + Number(e.amount), 0);
    const outstandingPayables = (exp || []).filter(e => e.payment_status === 'unpaid').reduce((s, e) => s + Number(e.amount), 0);
    const recoverable = (exp || []).filter(e => e.paid_from === 'own_funds' && e.is_reimbursable).reduce((s, e) => s + Number(e.amount), 0);

    let contractValue = Number(proj.contract_value);
    if (proj.project_type === 'cost_plus' && proj.supervision_percent) {
      contractValue = totalExpenses * (1 + Number(proj.supervision_percent) / 100);
    }

    const spentFromClientMoney = Math.min(totalPaidOut, totalReceived);
    const spentFromOwnPocket = Math.max(0, totalPaidOut - totalReceived);
    const clientMoneyWithUs = Math.max(0, totalReceived - totalPaidOut);

    setFinancials({
      total_received: totalReceived,
      total_expenses: totalExpenses,
      total_paid_out: totalPaidOut,
      outstanding_payables: outstandingPayables,
      client_balance_due: contractValue - totalReceived,
      cash_in_hand: totalReceived - totalPaidOut,
      net_position: totalReceived - totalExpenses,
      project_margin: contractValue - totalExpenses,
      margin_percent: contractValue > 0 ? ((contractValue - totalExpenses) / contractValue) * 100 : 0,
      budget_used_percent: contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0,
      spent_from_client_money: spentFromClientMoney,
      spent_from_own_pocket: spentFromOwnPocket,
      client_money_with_us: clientMoneyWithUs,
      recoverable,
    });

    setLoading(false);
  }

  // Soft Delete Expense
  async function handleDeleteExpense(id: string) {
    if (!confirm('Move this expense to trash?')) return;
    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('expenses')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', id);
    await loadProject(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Edit Milestone Handlers
  function handleOpenEditMilestone(m: PaymentMilestone) {
    setEditingMilestone(m);
    setEditMilestoneName(m.name);
    setEditMilestoneAmount(m.planned_amount.toString());
    setEditMilestoneDate(m.planned_date || '');
    setEditMilestoneStatus(m.status);
  }

  async function handleSaveEditMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMilestone) return;
    setSavingEditMilestone(true);
    const amt = parseFloat(editMilestoneAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid planned amount');
      setSavingEditMilestone(false);
      return;
    }
    const updatedId = editingMilestone.id;
    const { error } = await supabase
      .from('payment_milestones')
      .update({
        name: editMilestoneName.trim(),
        planned_amount: amt,
        planned_date: editMilestoneDate || null,
        status: editMilestoneStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingMilestone.id);

    if (error) {
      alert('Error updating milestone: ' + error.message);
    } else {
      setEditingMilestone(null);
      await loadProject(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${updatedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('row-highlight');
          setTimeout(() => el.classList.remove('row-highlight'), 2500);
        }
      }, 50);
    }
    setSavingEditMilestone(false);
  }

  async function handleDeleteMilestone(milestoneId: string) {
    if (!confirm('Delete this milestone from payment schedule?')) return;
    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('payment_milestones')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', milestoneId);

    if (error) {
      alert('Error deleting milestone: ' + error.message);
    } else {
      await loadProject(false);
      setTimeout(() => {
        window.scrollTo({ top: prevScrollY, behavior: 'instant' });
      }, 50);
    }
  }

  // Edit Payment Handlers
  function handleOpenEditPayment(p: ClientPayment) {
    setEditingPayment(p);
    setEditPayAmount(p.amount.toString());
    setEditPayDate(p.payment_date);
    setEditPayMethod(p.method);
    setEditPayRef(p.reference_no || '');
    setEditPayMilestone(p.milestone_id || '');
    setEditPayNote(p.note || '');
  }

  async function handleSaveEditPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPayment) return;
    setSavingEditPayment(true);
    const amt = parseFloat(editPayAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid payment amount');
      setSavingEditPayment(false);
      return;
    }
    const updatedId = editingPayment.id;
    const { error } = await supabase
      .from('client_payments')
      .update({
        amount: amt,
        payment_date: editPayDate,
        method: editPayMethod,
        reference_no: editPayRef.trim() || null,
        milestone_id: editPayMilestone || null,
        note: editPayNote.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingPayment.id);

    if (error) {
      alert('Error updating payment: ' + error.message);
    } else {
      setEditingPayment(null);
      await loadProject(false);
      setTimeout(() => {
        const el = document.getElementById(`row-${updatedId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          el.classList.add('row-highlight');
          setTimeout(() => el.classList.remove('row-highlight'), 2500);
        }
      }, 50);
    }
    setSavingEditPayment(false);
  }

  // Edit Expense Handlers
  function handleOpenEditExpense(exp: Expense) {
    setEditingExpense(exp);
    setEditExpName(exp.expense_name);
    setEditExpAmount(exp.amount.toString());
    setEditExpDate(exp.expense_date);
    setEditExpProjectId(exp.project_id);
    setEditExpPaidVia(exp.paid_via);

    const supUsers = allUsers.filter(u => u.role === 'site_manager');
    if (exp.paid_via === 'site_float' && exp.created_by) {
      setEditExpSupervisorId(exp.created_by);
    } else if (supUsers.length > 0) {
      const assignedSup = supUsers.find(u => assignedUserIds.includes(u.id));
      setEditExpSupervisorId(assignedSup ? assignedSup.id : supUsers[0].id);
    } else {
      setEditExpSupervisorId('');
    }
  }

  async function handleSaveEditExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    setSavingEditExpense(true);
    const amt = parseFloat(editExpAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid expense amount');
      setSavingEditExpense(false);
      return;
    }

    const updatedId = editingExpense.id;
    const { data: { user } } = await supabase.auth.getUser();

    let finalCreatedBy = editingExpense.created_by;
    if (editExpPaidVia === 'site_float') {
      if (!editExpSupervisorId) {
        alert('Please select a site supervisor for site float');
        setSavingEditExpense(false);
        return;
      }
      finalCreatedBy = editExpSupervisorId;
    } else if (editExpPaidVia === 'direct') {
      if (user) {
        finalCreatedBy = user.id;
      }
    }

    const { error } = await supabase
      .from('expenses')
      .update({
        expense_name: editExpName.trim(),
        amount: amt,
        expense_date: editExpDate,
        project_id: editExpProjectId,
        payment_status: 'paid',
        paid_via: editExpPaidVia,
        created_by: finalCreatedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingExpense.id);

    if (error) {
      alert('Error updating expense: ' + error.message);
    } else {
      setEditingExpense(null);
      await loadProject(false);
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

  // Project Details Edit Handler (Settings tab)
  async function handleSaveProjectDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setSavingProjDetails(true);
    setProjDetailsSuccess(false);

    const contractVal = parseFloat(editProjContractValue);
    const covArea = editProjCoveredArea ? parseFloat(editProjCoveredArea) : null;
    const supPct = editProjType === 'cost_plus' && editProjSupervisionPercent ? parseFloat(editProjSupervisionPercent) : null;

    const { error } = await supabase
      .from('projects')
      .update({
        name: editProjName.trim(),
        client_name: editProjClientName.trim() || null,
        client_phone: editProjClientPhone.trim() || null,
        address: editProjAddress.trim() || null,
        plot_size: editProjPlotSize.trim() || null,
        covered_area_sqft: covArea,
        project_type: editProjType,
        supervision_percent: supPct,
        contract_value: isNaN(contractVal) ? 0 : contractVal,
        start_date: editProjStartDate || null,
        expected_completion: editProjExpectedCompletion || null,
        status: editProjStatus,
        notes: editProjNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (error) {
      alert('Error updating project details: ' + error.message);
    } else {
      setProjDetailsSuccess(true);
      loadProject();
      setTimeout(() => setProjDetailsSuccess(false), 3000);
    }
    setSavingProjDetails(false);
  }

  // Add Milestone
  async function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!newMilestoneName || !newMilestoneAmount) return;
    setSavingMilestone(true);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('payment_milestones').insert({
      project_id: projectId,
      name: newMilestoneName,
      planned_amount: Number(newMilestoneAmount),
      planned_date: newMilestoneDate || null,
      sequence_no: milestones.length + 1,
      created_by: user?.id,
    });

    setNewMilestoneName('');
    setNewMilestoneAmount('');
    setNewMilestoneDate('');
    setShowMilestoneModal(false);
    setSavingMilestone(false);
    loadProject();
  }

  // Add Payment
  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payAmount) return;
    setSavingPayment(true);
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('client_payments').insert({
      project_id: projectId,
      amount: Number(payAmount),
      payment_date: payDate,
      method: payMethod,
      reference_no: payRef || null,
      milestone_id: payMilestone || null,
      note: payNote || null,
      created_by: user?.id,
    });

    setPayAmount('');
    setPayRef('');
    setPayMilestone('');
    setPayNote('');
    setShowPaymentModal(false);
    setSavingPayment(false);
    loadProject();
  }

  // Delete Payment (Soft delete - PRD)
  async function handleDeletePayment(paymentId: string) {
    if (!confirm('Move this payment to trash? Project collected totals will update immediately.')) return;
    const prevScrollY = window.scrollY;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('client_payments')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id,
      })
      .eq('id', paymentId);

    if (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment: ' + error.message);
      return;
    }

    await loadProject(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }


  // Revise Contract Value (PRD §4.6)
  async function handleReviseContract(e: React.FormEvent) {
    e.preventDefault();
    if (!newContractValue || !project) return;
    setSavingRevision(true);
    const { data: { user } } = await supabase.auth.getUser();

    const oldVal = Number(project.contract_value);
    const newVal = Number(newContractValue);

    // 1. Record in contract_revisions
    await supabase.from('contract_revisions').insert({
      project_id: projectId,
      old_value: oldVal,
      new_value: newVal,
      reason: revisionReason.trim() || 'Variation / Scope revision',
      changed_by: user?.id,
    });

    // 2. Update projects table
    await supabase
      .from('projects')
      .update({
        contract_value: newVal,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('id', projectId);

    setShowRevisionModal(false);
    setRevisionReason('');
    setSavingRevision(false);
    loadProject();
  }

  // Toggle Project Archive (PRD §4.8)
  async function handleToggleArchive() {
    if (!project) return;
    const isArchived = project.status === 'archived';
    const nextStatus = isArchived ? 'active' : 'archived';

    if (!confirm(isArchived ? 'Restore this project to Active status?' : 'Archive this project? It will drop out of active lists, but all financial history remains fully intact.')) {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('projects')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('id', projectId);

    loadProject();
  }

  // Buried Soft Delete Project (PRD §4.8)
  async function handleDeleteProject() {
    if (!project) return;
    if (deleteConfirmName.trim() !== project.name.trim()) {
      alert(`Name mismatch. Please type exactly: "${project.name}" to confirm.`);
      return;
    }

    setDeletingProject(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const batchId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      // Cascade soft delete to project and children
      const { error: projErr } = await supabase
        .from('projects')
        .update({ deleted_at: nowIso, deleted_by: user?.id, delete_batch_id: batchId })
        .eq('id', projectId);

      if (projErr) {
        console.error('Error deleting project:', projErr);
        alert('Failed to delete project: ' + projErr.message);
        setDeletingProject(false);
        return;
      }

      await supabase
        .from('expenses')
        .update({ deleted_at: nowIso, deleted_by: user?.id, delete_batch_id: batchId })
        .eq('project_id', projectId);

      await supabase
        .from('client_payments')
        .update({ deleted_at: nowIso, deleted_by: user?.id, delete_batch_id: batchId })
        .eq('project_id', projectId);

      await supabase
        .from('payment_milestones')
        .update({ deleted_at: nowIso, deleted_by: user?.id, delete_batch_id: batchId })
        .eq('project_id', projectId);

      await supabase
        .from('cash_issuances')
        .update({ deleted_at: nowIso, deleted_by: user?.id, delete_batch_id: batchId })
        .eq('project_id', projectId);

      router.push('/projects');
    } catch (err: any) {
      console.error('Error deleting project:', err);
      alert('Failed to delete project: ' + (err?.message || 'Unknown error'));
      setDeletingProject(false);
    }
  }

  // Update Assigned Supervisors
  async function handleToggleAssignment(userId: string) {
    const isAssigned = assignedUserIds.includes(userId);
    if (isAssigned) {
      setAssignedUserIds(prev => prev.filter(id => id !== userId));
      const { error } = await supabase
        .from('project_assignments')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (error) {
        console.error('Error removing assignment:', error);
      }
    } else {
      setAssignedUserIds(prev => [...prev, userId]);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('project_assignments')
        .insert({
          project_id: projectId,
          user_id: userId,
          created_by: currentUser?.id,
        });
      if (error) {
        console.error('Error adding assignment:', error);
      }
    }
    await loadProject();
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner spinner-lg" /><span className="text-muted">Loading project ledger...</span></div>;
  }

  if (!project || !financials) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏗️</div>
        <div className="empty-state__title">Project Not Found</div>
        <div className="empty-state__desc">The requested project may have been deleted or does not exist.</div>
        <Link href="/projects" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Projects
        </Link>
      </div>
    );
  }

  // Filtered expenses
  const filteredExpenses = expenses.filter(e => {
    if (expenseStatusFilter && e.payment_status !== expenseStatusFilter) return false;
    if (expensePaidViaFilter && e.paid_via !== expensePaidViaFilter) return false;
    if (expenseSearch) {
      const q = expenseSearch.toLowerCase();
      const match = e.expense_name.toLowerCase().includes(q) ||
        (e.vendor_name && e.vendor_name.toLowerCase().includes(q)) ||
        (e.purpose && e.purpose.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const filteredExpensesTotal = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Milestone sum vs contract value warning check (PRD §4.2)
  const milestoneSum = milestones.reduce((s, m) => s + Number(m.planned_amount), 0);
  const milestoneDiff = Number(project.contract_value) - milestoneSum;

  return (
    <div className="page-container">
      {/* Top Breadcrumb & Actions */}
      <div className="flex justify-between items-center no-print" style={{ marginBottom: '1rem' }}>
        <Link href="/projects" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>
          ← Back to All Projects
        </Link>
        <div className="flex gap-xs">
          <Link href="/expenses/add" className="btn btn-primary btn-sm">
            ➕ Add Expense
          </Link>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPaymentModal(true)}
          >
            💰 Record Payment
          </button>
        </div>
      </div>

      {/* Project Title Header */}
      <div className="page-header no-print" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="flex items-center gap-sm flex-wrap">
            <h1 className="page-title" style={{ margin: 0 }}>{project.name}</h1>
            <span className={`badge badge-${getStatusVariant(project.status)}`}>
              {formatStatus(project.status)}
            </span>
            <span className="badge badge-neutral">
              {formatStatus(project.project_type)}
            </span>
            {revisions.length > 0 && (
              <span
                className="badge badge-info"
                style={{ cursor: 'pointer' }}
                onClick={() => setShowRevisionModal(true)}
                title="View revision history"
              >
                🔄 Revised ({revisions.length})
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: '0.35rem' }}>
            Client: <strong>{project.client_name || 'N/A'}</strong> {project.client_phone ? `(${project.client_phone})` : ''}
            {project.address ? ` · ${project.address}` : ''}
            {project.plot_size ? ` · Plot: ${project.plot_size}` : ''}
            {project.covered_area_sqft ? ` · ${project.covered_area_sqft} sq ft` : ''}
            {` · Contract Value: `}<strong style={{ color: 'var(--color-navy)' }}>{formatPKR(project.contract_value)}</strong>
          </p>

          {/* Assigned Supervisors display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="text-muted" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              Assigned Supervisors:
            </span>
            {allUsers.filter(u => assignedUserIds.includes(u.id)).length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                {allUsers.filter(u => assignedUserIds.includes(u.id)).map(sup => (
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
                    <span>👷</span> {sup.full_name} {sup.phone ? `(${sup.phone})` : ''}
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
                <span>⚠️</span> No supervisor assigned yet
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setActiveTab('settings')}
              style={{ fontSize: '0.75rem', color: 'var(--color-primary-blue)', padding: '0 0.35rem', fontWeight: 600 }}
            >
              Manage →
            </button>
          </div>
        </div>

        <div className="flex gap-xs">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRevisionModal(true)}
          >
            📝 Revise Contract
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 8-CARD FINANCIAL STRIP ABOVE THE FOLD (PRD §6.5) */}
      {/* ============================================================ */}
      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        {/* ROW 1: THE MONEY & PRIMARY CASH FLOW */}
        <div style={{ marginBottom: '0.625rem' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
            Primary Cash Flow (Paid vs Spent)
          </div>
          <div className="grid-stats-8">
            {/* Card 1: Client has paid */}
            <div
              className="stat-card stat-card--success stat-card--tappable"
              onClick={() => setActiveTab('payments')}
            >
              <div className="stat-card__label">
                <span>Client Has Paid</span>
                <Tooltip text={TOOLTIPS.client_has_paid} />
              </div>
              <div className="stat-card__value text-success">
                {formatPKRShort(financials.total_received)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                {payments.length} payment{payments.length === 1 ? '' : 's'} received
              </span>
            </div>

            {/* Card 2: Total spent */}
            <div
              className="stat-card stat-card--tappable"
              onClick={() => setActiveTab('expenses')}
            >
              <div className="stat-card__label">
                <span>Total Site Spent</span>
                <Tooltip text={TOOLTIPS.total_spent} />
              </div>
              <div className="stat-card__value">{formatPKRShort(financials.total_expenses)}</div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                Paid & unpaid bills ({expenses.length})
              </span>
            </div>

            {/* Card 3: Difference (Paid − Spent) */}
            <div
              className={`stat-card ${financials.net_position >= 0 ? 'stat-card--success' : 'stat-card--danger'} stat-card--tappable`}
              onClick={() => setActiveTab('overview')}
            >
              <div className="stat-card__label">
                <span>Difference (Paid − Spent)</span>
                <Tooltip text="Difference between what the client has paid and what has been spent on this site. Positive means surplus client funds; negative means out-of-pocket spending." />
              </div>
              <div className={`stat-card__value ${financials.net_position >= 0 ? 'text-success' : 'text-danger'}`}>
                {financials.net_position >= 0 ? '+' : ''}{formatPKRShort(financials.net_position)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem', fontWeight: 600 }}>
                {financials.net_position >= 0 ? '🟢 Client Surplus (In Hand)' : '🔴 Overspent / Out of Pocket'}
              </span>
            </div>

            {/* Card 4: Contract Value (Lump Sum) */}
            <div
              className="stat-card stat-card--tappable"
              onClick={() => setShowRevisionModal(true)}
            >
              <div className="stat-card__label">
                <span>Contract Value</span>
                <Tooltip text="Agreed total lump sum contract value for the project." />
              </div>
              <div className="stat-card__value">{formatPKRShort(project.contract_value)}</div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                Lump sum total · Click to revise
              </span>
            </div>
          </div>
        </div>

        {/* ROW 2: CASH FLOW & SECONDARY DETAILS */}
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-secondary-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
            Cash & Liabilities Breakdown
          </div>
          <div className="grid-stats-8">
            {/* Card 5: Client money still with us */}
            <div className="stat-card stat-card--info">
              <div className="stat-card__label">
                <span>Client Money with Us</span>
                <Tooltip text={TOOLTIPS.client_money_still_with_us} />
              </div>
              <div className="stat-card__value" style={{ color: 'var(--color-primary-blue)' }}>
                {formatPKRShort(financials.client_money_with_us)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                Client cash unspent
              </span>
            </div>

            {/* Card 6: Spent from our own pocket */}
            <div className={`stat-card ${financials.spent_from_own_pocket > 0 ? 'stat-card--danger' : ''}`}>
              <div className="stat-card__label">
                <span>Spent from Own Pocket</span>
                <Tooltip text={TOOLTIPS.spent_from_own_pocket} />
              </div>
              <div className={`stat-card__value ${financials.spent_from_own_pocket > 0 ? 'text-danger' : ''}`}>
                {formatPKRShort(financials.spent_from_own_pocket)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                {financials.spent_from_own_pocket > 0 ? '⚠️ Out of pocket deployed' : 'No personal funds deployed'}
              </span>
            </div>

            {/* Card 7: Still to pay vendors */}
            <div
              className="stat-card stat-card--warning stat-card--tappable"
              onClick={() => setActiveTab('expenses')}
            >
              <div className="stat-card__label">
                <span>Still to Pay Vendors</span>
                <Tooltip text={TOOLTIPS.still_to_pay_vendors} />
              </div>
              <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
                {formatPKRShort(financials.outstanding_payables)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                Unpaid expense bills
              </span>
            </div>

            {/* Card 8: Client Balance on Contract */}
            <div
              className="stat-card stat-card--warning stat-card--tappable"
              onClick={() => setActiveTab('milestones')}
            >
              <div className="stat-card__label">
                <span>Client Still Owes</span>
                <Tooltip text={TOOLTIPS.client_still_owes} />
              </div>
              <div className="stat-card__value" style={{ color: 'var(--color-amber)' }}>
                {formatPKRShort(financials.client_balance_due)}
              </div>
              <span className="text-muted" style={{ fontSize: '0.71875rem', marginTop: '0.25rem' }}>
                Contract lump sum − paid
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="tabs no-print">
        <button
          type="button"
          className={`tab ${activeTab === 'overview' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'expenses' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          💸 Expenses ({expenses.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'payments' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          💰 Payments Received ({payments.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'milestones' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('milestones')}
        >
          📅 Payment Schedule ({milestones.length})
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'statement' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('statement')}
        >
          📄 Client Statement PDF
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'activity' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          📜 Activity Log
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'settings' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Project Settings
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: OVERVIEW */}
      {/* ============================================================ */}
      {activeTab === 'overview' && (
        <div>
          {/* Paid vs Spent Position Card */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-navy)' }}>
                  Cash Flow & Spend Status
                </span>
                <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.125rem' }}>
                  Comparing funds received from client against total site expenses
                </p>
              </div>
              <span className={`badge ${financials.net_position >= 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.875rem', padding: '0.35rem 0.75rem' }}>
                {financials.net_position >= 0 ? `🟢 Cash Surplus: +${formatPKR(financials.net_position)}` : `🔴 Cash Deficit: -${formatPKR(Math.abs(financials.net_position))}`}
              </span>
            </div>

            {/* Visual ratio bar */}
            <div style={{ margin: '1rem 0' }}>
              <div className="flex justify-between items-center" style={{ fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-navy)' }}>
                  Spent vs Received Ratio: {financials.total_received > 0 ? ((financials.total_expenses / financials.total_received) * 100).toFixed(1) : (financials.total_expenses > 0 ? '> 100' : '0')}%
                </span>
                <span className="text-muted">
                  {financials.total_expenses <= financials.total_received
                    ? `${formatPKR(financials.total_received - financials.total_expenses)} remaining of client funds`
                    : `⚠️ Spend exceeds client payments by ${formatPKR(financials.total_expenses - financials.total_received)}`
                  }
                </span>
              </div>
              <div className={`progress-bar progress-bar--${financials.total_expenses > financials.total_received ? 'danger' : 'success'}`} style={{ height: '12px' }}>
                <div
                  className="progress-bar__fill"
                  style={{ width: `${financials.total_received > 0 ? Math.min((financials.total_expenses / financials.total_received) * 100, 100) : (financials.total_expenses > 0 ? 100 : 0)}%` }}
                />
              </div>
            </div>

            <div className="grid-stats-3" style={{ marginTop: '1rem', gap: '0.75rem' }}>
              <div style={{ background: '#F4FAF7', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600 }}>TOTAL RECEIVED FROM CLIENT</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#065F46', marginTop: '0.25rem' }}>{formatPKR(financials.total_received)}</div>
                <div style={{ fontSize: '0.71875rem', color: '#047857', marginTop: '0.2rem' }}>{payments.length} payment(s) recorded</div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>TOTAL SPENT ON SITE</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginTop: '0.25rem' }}>{formatPKR(financials.total_expenses)}</div>
                <div style={{ fontSize: '0.71875rem', color: '#64748B', marginTop: '0.2rem' }}>{expenses.length} expense item(s)</div>
              </div>

              <div style={{ background: financials.net_position >= 0 ? '#EFF6FF' : '#FEF2F2', border: `1px solid ${financials.net_position >= 0 ? '#BFDBFE' : '#FECACA'}`, borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.75rem', color: financials.net_position >= 0 ? '#1E40AF' : '#991B1B', fontWeight: 600 }}>
                  {financials.net_position >= 0 ? 'CLIENT FUNDS IN HAND' : 'COMPANY OUT-OF-POCKET'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: financials.net_position >= 0 ? '#1E3A8A' : '#7F1D1D', marginTop: '0.25rem' }}>
                  {formatPKR(Math.abs(financials.net_position))}
                </div>
                <div style={{ fontSize: '0.71875rem', color: financials.net_position >= 0 ? '#2563EB' : '#DC2626', marginTop: '0.2rem' }}>
                  {financials.net_position >= 0 ? 'Surplus ready for site use' : 'Company funds currently deployed'}
                </div>
              </div>
            </div>
          </div>

          {/* Spend Channel & Status Breakdown */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.0625rem', marginBottom: '1rem', color: 'var(--color-navy)' }}>
              Site Spend Breakdown
            </h3>

            {expenses.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <div className="empty-state__icon">📊</div>
                <div className="empty-state__title">No expenses recorded yet</div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                  {/* Paid vs Unpaid */}
                  <div style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: '0.875rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Settlement Status
                    </div>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                      <span>✅ Paid Expenses</span>
                      <strong style={{ color: 'var(--color-green)' }}>{formatPKR(financials.total_paid_out)}</strong>
                    </div>
                    <div className="flex justify-between items-center" style={{ fontSize: '0.875rem' }}>
                      <span>⏳ Unpaid (Payables)</span>
                      <strong style={{ color: 'var(--color-amber)' }}>{formatPKR(financials.outstanding_payables)}</strong>
                    </div>
                  </div>

                  {/* Float vs Direct */}
                  <div style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: '0.875rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Disbursement Channel
                    </div>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                      <span>👷 Via Site Float</span>
                      <strong>{formatPKR(expenses.filter(e => e.paid_via === 'site_float').reduce((s, e) => s + Number(e.amount), 0))}</strong>
                    </div>
                    <div className="flex justify-between items-center" style={{ fontSize: '0.875rem' }}>
                      <span>🏢 Direct (Admin)</span>
                      <strong>{formatPKR(expenses.filter(e => e.paid_via === 'direct').reduce((s, e) => s + Number(e.amount), 0))}</strong>
                    </div>
                  </div>

                  {/* Contract Context (Reference) */}
                  <div style={{ border: '1px solid var(--color-line)', borderRadius: 'var(--radius-md)', padding: '0.875rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Contract (Lump Sum Reference)
                    </div>
                    <div className="flex justify-between items-center" style={{ marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                      <span>Total Lump Sum</span>
                      <strong>{formatPKR(project.contract_value)}</strong>
                    </div>
                    <div className="flex justify-between items-center" style={{ fontSize: '0.875rem' }}>
                      <span>Balance Due on Contract</span>
                      <strong style={{ color: 'var(--color-amber)' }}>{formatPKR(financials.client_balance_due)}</strong>
                    </div>
                  </div>
                </div>

                {/* Top / Recent Expenses list */}
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.75rem' }}>
                    Recent Site Expenses
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {expenses.slice(0, 5).map(exp => (
                      <div
                        key={exp.id}
                        onClick={() => setSelectedDetailExpense(exp)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.625rem 0.875rem',
                          background: 'var(--color-surface)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          border: '1px solid var(--color-line)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-navy)' }}>
                            #{exp.serial_no ?? '-'} · {exp.expense_name}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.125rem' }}>
                            {formatDate(exp.expense_date)} · {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{formatPKR(exp.amount)}</div>
                          <span className={`badge badge-${exp.payment_status === 'paid' ? 'success' : 'warning'}`} style={{ fontSize: '0.6875rem' }}>
                            {exp.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {expenses.length > 5 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setActiveTab('expenses')}
                        style={{ alignSelf: 'center', marginTop: '0.25rem' }}
                      >
                        View all {expenses.length} expenses →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: EXPENSES */}
      {/* ============================================================ */}
      {activeTab === 'expenses' && (
        <div>
          {/* Filters Bar */}
          <div
            className="card"
            style={{
              padding: '0.875rem 1rem',
              marginBottom: '1rem',
              background: 'var(--color-card-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div className="filter-bar-responsive flex items-center gap-xs flex-wrap">
              <input
                type="text"
                className="input"
                placeholder="Search description, payee..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px', width: '200px' }}
              />

              <select
                className="select"
                value={expenseStatusFilter}
                onChange={(e) => setExpenseStatusFilter(e.target.value)}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px' }}
              >
                <option value="">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid (Due)</option>
              </select>

              <select
                className="select"
                value={expensePaidViaFilter}
                onChange={(e) => setExpensePaidViaFilter(e.target.value)}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.6rem', height: '34px' }}
              >
                <option value="">All Channels</option>
                <option value="site_float">Site Float</option>
                <option value="direct">Direct (Admin)</option>
              </select>

              {(expenseStatusFilter || expensePaidViaFilter || expenseSearch) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setExpenseStatusFilter('');
                    setExpensePaidViaFilter('');
                    setExpenseSearch('');
                  }}
                >
                  Clear All
                </button>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <span className="text-muted" style={{ fontSize: '0.71875rem' }}>FILTERED TOTAL: </span>
              <span className="text-money" style={{ fontSize: '0.9375rem' }}>{formatPKR(filteredExpensesTotal)}</span>
            </div>
          </div>

          {/* Expenses Table */}
          {filteredExpenses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📝</div>
              <div className="empty-state__title">No matching expenses</div>
              <div className="empty-state__desc">Adjust filters or record a new expense.</div>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Paid Via / From</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((exp, idx) => (
                    <tr
                      key={exp.id}
                      id={`row-${exp.id}`}
                      onClick={() => setSelectedDetailExpense(exp)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{exp.serial_no ?? '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', fontWeight: 500 }}>
                        {formatDate(exp.expense_date)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{exp.expense_name}</div>
                        {exp.vendor_name && (
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>Payee: {exp.vendor_name}</div>
                        )}
                        {exp.purpose && (
                          <div className="text-muted" style={{ fontSize: '0.71875rem' }}>{exp.purpose}</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.75rem' }}>
                          <span className={`badge ${exp.paid_via === 'site_float' ? 'badge-info' : 'badge-neutral'}`}>
                            {exp.paid_via === 'site_float' ? 'Site Float' : 'Direct'}
                          </span>
                        </div>
                        {exp.is_reimbursable && (
                          <div className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.125rem' }}>
                            (Reimbursable)
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${exp.payment_status === 'paid' ? 'badge-success' : 'badge-danger'}`}>
                          {exp.payment_status === 'paid' ? 'Paid' : 'Unpaid (Due)'}
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
                            title="Move to trash"
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
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: PAYMENTS RECEIVED */}
      {/* ============================================================ */}
      {activeTab === 'payments' && (
        <div>
          <div className="flex justify-between items-center flex-wrap gap-sm" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.0625rem', color: 'var(--color-navy)', margin: 0 }}>
                Client Payments (Money In)
              </h3>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Total collected so far: <strong>{formatPKR(financials.total_received)}</strong>
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowPaymentModal(true)}
            >
              ➕ Record Client Payment
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">💰</div>
              <div className="empty-state__title">No payments received yet</div>
              <div className="empty-state__desc">Record the booking advance or milestone payment from client.</div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowPaymentModal(true)}
                style={{ marginTop: '1rem' }}
              >
                Record First Payment
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>Date Received</th>
                    <th>Payment Method</th>
                    <th>Reference / Transaction ID</th>
                    <th>Notes</th>
                    <th style={{ textAlign: 'right' }}>Amount Received</th>
                    <th style={{ width: '48px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, idx) => (
                    <tr key={p.id} id={`row-${p.id}`}>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{p.serial_no ?? '-'}</td>
                      <td style={{ fontWeight: 600 }}>{formatDate(p.payment_date)}</td>
                      <td>
                        <span className="badge badge-success">
                          {formatPaymentMethod(p.method)}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {p.reference_no || '-'}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>
                        {p.note || '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-money text-success" style={{ fontSize: '1rem' }}>
                          +{formatPKR(p.amount)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="flex justify-end gap-xs">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-info"
                            onClick={() => handleOpenEditPayment(p)}
                            title="Edit Payment"
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-danger"
                            onClick={() => handleDeletePayment(p.id)}
                            title="Move to Trash"
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
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
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 4: PAYMENT SCHEDULE / MILESTONES (PRD §4.2) */}
      {/* ============================================================ */}
      {activeTab === 'milestones' && (
        <div>
          <div className="flex justify-between items-center flex-wrap gap-sm" style={{ marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.0625rem', color: 'var(--color-navy)', margin: 0 }}>
                Payment Milestones Schedule
              </h3>
              <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                Planned stages and cash-flow milestones for this construction contract
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowMilestoneModal(true)}
            >
              ➕ Add Milestone
            </button>
          </div>

          {/* Soft warning if sum != contract_value (PRD §4.2) */}
          {milestones.length > 0 && milestoneDiff !== 0 && (
            <div className="alert-banner alert-banner--warning">
              <span>⚠️</span>
              <span style={{ fontSize: '0.8125rem' }}>
                <strong>Milestone Schedule Difference:</strong> Sum of planned milestones ({formatPKR(milestoneSum)}) differs from contract value ({formatPKR(project.contract_value)}) by {formatPKR(Math.abs(milestoneDiff))}.
              </span>
            </div>
          )}

          {milestones.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📅</div>
              <div className="empty-state__title">No payment schedule set</div>
              <div className="empty-state__desc">
                Set milestones (Advance, Foundation, Roof Slab, Grey Structure, Finishing) to track client payment dues.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowMilestoneModal(true)}
                style={{ marginTop: '1rem' }}
              >
                Add First Milestone
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Seq #</th>
                    <th>Milestone Name</th>
                    <th>Planned Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Planned Amount</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m, idx) => (
                    <tr key={m.id} id={`row-${m.id}`}>
                      <td style={{ fontWeight: 600 }}>{m.sequence_no || idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{m.name}</div>
                      </td>
                      <td>{m.planned_date ? formatDate(m.planned_date) : '-'}</td>
                      <td>
                        <span className={`badge badge-${m.status === 'received' ? 'success' : m.status === 'partially_received' ? 'info' : 'warning'}`}>
                          {formatStatus(m.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="text-money">{formatPKR(m.planned_amount)}</span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="flex justify-end gap-xs">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-info"
                            onClick={() => handleOpenEditMilestone(m)}
                            title="Edit Milestone"
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-danger"
                            onClick={() => handleDeleteMilestone(m.id)}
                            title="Delete Milestone"
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
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
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 5: CLIENT STATEMENT PDF & WHATSAPP (PRD §4.7 & §7) */}
      {/* ============================================================ */}
      {activeTab === 'statement' && (
        <div>
          {/* Controls Bar */}
          <div className="card no-print" style={{ padding: '1rem', marginBottom: '1.5rem', background: '#F0F5FA' }}>
            <div className="flex justify-between items-center flex-wrap gap-md">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={includeSpendInStatement}
                  onChange={(e) => setIncludeSpendInStatement(e.target.checked)}
                />
                Include Total Spent in statement
              </label>

              <div className="flex gap-sm flex-wrap">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => window.print()}
                >
                  🖨️ Print / Save PDF
                </button>
                {(() => {
                  const stmtMsg = `*Project Statement - ${project.name}*\nClient: ${project.client_name || ''}\n\nContract Value: ${formatPKR(project.contract_value)}\nTotal Received: ${formatPKR(financials.total_received)}\nBalance Due: ${formatPKR(financials.client_balance_due)}\n\nGenerated via Android Properties.`;
                  const waLink = getWhatsAppShareLink(project.client_phone, stmtMsg);
                  return (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-whatsapp"
                    >
                      💬 Share Statement on WhatsApp
                    </a>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Printable Statement Sheet */}
          <div
            className="card print-statement"
            style={{
              padding: 'clamp(1rem, 4vw, 2.5rem)',
              background: 'var(--color-white)',
              maxWidth: '800px',
              margin: '0 auto',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Statement Header */}
            <div className="flex justify-between items-start flex-wrap gap-sm" style={{ borderBottom: '2px solid var(--color-navy)', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <img
                  src="/logo.png"
                  alt="Android Properties"
                  style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid #1B75BC' }}
                />
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-navy)', margin: 0 }}>
                    ANDROID PROPERTIES
                  </h1>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)', marginTop: '0.25rem' }}>
                    Construction & Real Estate Developers
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-navy)', margin: 0 }}>
                  CLIENT STATEMENT OF ACCOUNT
                </h2>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)', marginTop: '0.25rem' }}>
                  Date: {formatDate(new Date().toISOString())}
                </div>
              </div>
            </div>

            {/* Project & Client Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>PROJECT DETAILS</div>
                <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '1rem' }}>{project.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>{project.address || 'Islamabad/Rawalpindi'}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>Type: {formatStatus(project.project_type)}</div>
              </div>
              <div>
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>CLIENT DETAILS</div>
                <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '1rem' }}>{project.client_name || 'Client'}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>Phone: {project.client_phone || '-'}</div>
              </div>
            </div>

            {/* Financial Summary Table */}
            <div style={{ marginBottom: '1.75rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-navy)' }}>
                Financial Summary
              </h3>
              <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                <table className="table" style={{ border: '1px solid var(--color-line)' }}>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Agreed Contract Value</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatPKR(project.contract_value)}</td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, color: 'var(--color-green)' }}>Total Payments Received</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-green)' }}>
                        −{formatPKR(financials.total_received)}
                      </td>
                    </tr>
                    <tr style={{ background: financials.client_balance_due > 0 ? '#FCF9F2' : '#F4FAF7' }}>
                      <td style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-navy)' }}>
                        Current Balance Due from Client
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.125rem', color: financials.client_balance_due > 0 ? 'var(--color-amber)' : 'var(--color-green)' }}>
                        {formatPKR(financials.client_balance_due)}
                      </td>
                    </tr>
                    {includeSpendInStatement && (
                      <tr>
                        <td style={{ color: 'var(--color-secondary-text)' }}>Total Expenses Incurred to Date</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-secondary-text)', fontWeight: 600 }}>
                          {formatPKR(financials.total_expenses)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Itemized Payment Milestones */}
            {milestones.length > 0 && (
              <div style={{ marginBottom: '1.75rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-navy)' }}>
                  Agreed Payment Schedule
                </h3>
                <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                  <table className="table" style={{ border: '1px solid var(--color-line)' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Milestone / Stage</th>
                        <th>Planned Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m, idx) => (
                        <tr key={m.id}>
                          <td>{m.sequence_no || idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td>{m.planned_date ? formatDate(m.planned_date) : 'On Stage Completion'}</td>
                          <td>
                            <span className={`badge badge-${getStatusVariant(m.status)}`}>
                              {formatStatus(m.status)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatPKR(m.planned_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Received Payments History */}
            <div style={{ marginBottom: '1.75rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--color-navy)' }}>
                Payments Received Breakdown
              </h3>
              {payments.length === 0 ? (
                <div className="text-muted" style={{ fontSize: '0.8125rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No payments have been recorded yet.
                </div>
              ) : (
                <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                  <table className="table" style={{ border: '1px solid var(--color-line)' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference / Trx ID</th>
                        <th style={{ textAlign: 'right' }}>Amount Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, idx) => (
                        <tr key={p.id}>
                          <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{p.serial_no ?? '-'}</td>
                          <td>{formatDate(p.payment_date)}</td>
                          <td>{formatPaymentMethod(p.method)}</td>
                          <td>{p.reference_no || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatPKR(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid var(--color-line)', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-secondary-text)' }}>
              <span>Android Properties Financial Statement</span>
              <span>Prepared for: {project.client_name || 'Client'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 6: ACTIVITY LOG (PRD §7) */}
      {/* ============================================================ */}
      {activeTab === 'activity' && (
        <div>
          <h3 style={{ fontSize: '1.0625rem', marginBottom: '1rem', color: 'var(--color-navy)' }}>
            📜 Project Activity & Audit Trail
          </h3>

          {auditLogs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__icon">📜</div>
              <div className="empty-state__title">No activity logged yet</div>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Changed By</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{idx + 1}</td>
                      <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {formatDate(log.changed_at)}
                      </td>
                      <td>
                        <span className={`badge ${log.action === 'INSERT' ? 'badge-success' : log.action === 'UPDATE' ? 'badge-info' : 'badge-danger'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                        {log.profiles?.full_name || 'System / Admin'}
                      </td>
                      <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        {JSON.stringify(log.new_row || log.old_row || {}).slice(0, 100)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 7: PROJECT SETTINGS & ARCHIVE & BURIED DELETE (PRD §4.8) */}
      {/* ============================================================ */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: '680px' }}>
          {/* Edit Project Details Section */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              ✏️ Edit Project Details
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
              Update construction site information, client contact, project type, and schedule.
            </p>

            {projDetailsSuccess && (
              <div className="alert-banner alert-banner--success" style={{ marginBottom: '1rem' }}>
                <span>✅</span>
                <span>Project details updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveProjectDetails}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-name">
                  Project Name <span className="required">*</span>
                </label>
                <input
                  id="edit-proj-name"
                  type="text"
                  className="input"
                  value={editProjName}
                  onChange={(e) => setEditProjName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-client">Client Name</label>
                  <input
                    id="edit-proj-client"
                    type="text"
                    className="input"
                    value={editProjClientName}
                    onChange={(e) => setEditProjClientName(e.target.value)}
                    placeholder="e.g. Tariq Mehmood"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-phone">Client Phone (WhatsApp)</label>
                  <input
                    id="edit-proj-phone"
                    type="tel"
                    className="input"
                    value={editProjClientPhone}
                    onChange={(e) => setEditProjClientPhone(e.target.value)}
                    placeholder="e.g. 03001234567"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-addr">Site Address / Location</label>
                <input
                  id="edit-proj-addr"
                  type="text"
                  className="input"
                  value={editProjAddress}
                  onChange={(e) => setEditProjAddress(e.target.value)}
                  placeholder="e.g. Plot 45, Street 8, Sector F, DHA Phase 5, Lahore"
                />
              </div>

              <div className="form-row-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-plot">Plot Size</label>
                  <input
                    id="edit-proj-plot"
                    type="text"
                    className="input"
                    value={editProjPlotSize}
                    onChange={(e) => setEditProjPlotSize(e.target.value)}
                    placeholder="e.g. 1 Kanal, 10 Marla"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-area">Covered Area (sq ft)</label>
                  <input
                    id="edit-proj-area"
                    type="number"
                    step="any"
                    className="input"
                    value={editProjCoveredArea}
                    onChange={(e) => setEditProjCoveredArea(e.target.value)}
                    placeholder="e.g. 4500"
                  />
                </div>
              </div>

              <div className="form-row-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-type">Project Contract Type</label>
                  <select
                    id="edit-proj-type"
                    className="select"
                    value={editProjType}
                    onChange={(e) => setEditProjType(e.target.value as ProjectType)}
                  >
                    <option value="turnkey">Turnkey (Material + Labour Fixed Rate)</option>
                    <option value="cost_plus">Cost Plus (Expenses + Supervision %)</option>
                    <option value="labour_only">Labour Only Contract</option>
                  </select>
                </div>

                {editProjType === 'cost_plus' ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="edit-proj-sup">Supervision Fee (%)</label>
                    <input
                      id="edit-proj-sup"
                      type="number"
                      step="0.1"
                      className="input"
                      value={editProjSupervisionPercent}
                      onChange={(e) => setEditProjSupervisionPercent(e.target.value)}
                      placeholder="e.g. 10"
                    />
                  </div>
                ) : (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="edit-proj-cval">Contract Value (PKR)</label>
                    <input
                      id="edit-proj-cval"
                      type="number"
                      className="input"
                      value={editProjContractValue}
                      onChange={(e) => setEditProjContractValue(e.target.value)}
                      placeholder="e.g. 25000000"
                    />
                  </div>
                )}
              </div>

              <div className="form-row-2" style={{ gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-start">Start Date</label>
                  <input
                    id="edit-proj-start"
                    type="date"
                    className="input"
                    value={editProjStartDate}
                    onChange={(e) => setEditProjStartDate(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-proj-end">Expected Completion</label>
                  <input
                    id="edit-proj-end"
                    type="date"
                    className="input"
                    value={editProjExpectedCompletion}
                    onChange={(e) => setEditProjExpectedCompletion(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-status">Project Status</label>
                <select
                  id="edit-proj-status"
                  className="select"
                  value={editProjStatus}
                  onChange={(e) => setEditProjStatus(e.target.value as ProjectStatus)}
                >
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-notes">Internal Notes & Scope Summary</label>
                <textarea
                  id="edit-proj-notes"
                  className="input"
                  rows={3}
                  value={editProjNotes}
                  onChange={(e) => setEditProjNotes(e.target.value)}
                  placeholder="Architect notes, milestone breakdown, specific terms..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div className="flex justify-end" style={{ marginTop: '1.25rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingProjDetails}
                >
                  {savingProjDetails ? 'Saving Project Details...' : '💾 Save Project Details'}
                </button>
              </div>
            </form>
          </div>

          {/* Assigned Supervisors */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              👥 Assigned Site Supervisors
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
              Check supervisors who are authorized to enter daily expenses for this construction site.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {allUsers.filter(u => u.role === 'site_manager').map(u => {
                const isAssigned = assignedUserIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.625rem 0.875rem',
                      background: isAssigned ? '#F0F7FF' : 'var(--color-white)',
                      border: '1px solid var(--color-line)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.full_name}</div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>{u.phone || u.email || ''}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={() => handleToggleAssignment(u.id)}
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Project Archive Section (PRD §4.8) */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              📦 Archive Project
            </h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
              Archiving removes the project from active dashboard totals and supervisor views, while keeping all expenses, payments, and history 100% intact and searchable.
            </p>
            <button
              type="button"
              className={`btn ${project.status === 'archived' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleArchive}
            >
              {project.status === 'archived' ? '🔄 Unarchive Project' : '📦 Archive This Project'}
            </button>
          </div>

          {/* BURIED DESTRUCTIVE SECTION FOR SOFT DELETE (PRD §4.8) */}
          <div
            className="card"
            style={{
              borderColor: 'var(--color-red)',
              background: '#FFF5F5',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1rem', color: 'var(--color-red)', marginBottom: '0.5rem' }}>
              ⚠️ Delete Project (Move to Trash)
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#7A1C1C', marginBottom: '0.75rem' }}>
              Deleting moves this project and all its {expenses.length} expenses, {payments.length} payments, and {milestones.length} milestones into Trash.
            </p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" htmlFor="del-conf-name" style={{ color: '#7A1C1C' }}>
                Type exact project name <strong>&ldquo;{project.name}&rdquo;</strong> to confirm:
              </label>
              <input
                id="del-conf-name"
                type="text"
                className="input"
                placeholder={project.name}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                style={{ borderColor: 'var(--color-red)' }}
              />
            </div>

            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteConfirmName.trim() !== project.name.trim() || deletingProject}
              onClick={handleDeleteProject}
            >
              {deletingProject ? 'Moving to Trash...' : 'Soft Delete Project to Trash'}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: REVISE CONTRACT (PRD §4.6) */}
      {/* ============================================================ */}
      {showRevisionModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">📝 Revise Project Contract Value</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowRevisionModal(false)}>✕</button>
            </div>

            <form onSubmit={handleReviseContract}>
              <div className="form-group">
                <label className="form-label" htmlFor="rev-new-val">
                  New Contract Value (PKR) <span className="required">*</span>
                </label>
                <input
                  id="rev-new-val"
                  type="number"
                  className="input"
                  value={newContractValue}
                  onChange={(e) => setNewContractValue(e.target.value)}
                  required
                  min={0}
                />
                <span className="form-helper">
                  Current Value: {formatPKR(project.contract_value)}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rev-reason">
                  Reason for Revision <span className="required">*</span>
                </label>
                <input
                  id="rev-reason"
                  type="text"
                  className="input"
                  placeholder="e.g. Added extra mumty and tile flooring in basement"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRevisionModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingRevision}>
                  {savingRevision ? 'Saving...' : 'Save Revision'}
                </button>
              </div>
            </form>

            {revisions.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-line)' }}>
                <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-navy)' }}>
                  Revision History
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {revisions.map(r => (
                    <div key={r.id} style={{ fontSize: '0.8125rem', background: '#F8FAFC', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                      <div className="flex justify-between">
                        <strong>{formatPKR(r.old_value)} → {formatPKR(r.new_value)}</strong>
                        <span className="text-muted">{formatDate(r.changed_at)}</span>
                      </div>
                      <div className="text-muted">{r.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD MILESTONE (PRD §4.2) */}
      {/* ============================================================ */}
      {showMilestoneModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">📅 Add Payment Milestone</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowMilestoneModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddMilestone}>
              <div className="form-group">
                <label className="form-label" htmlFor="ms-name">Milestone Stage <span className="required">*</span></label>
                <input
                  id="ms-name"
                  type="text"
                  className="input"
                  placeholder="e.g. Foundation / DPC / Roof Slab"
                  value={newMilestoneName}
                  onChange={(e) => setNewMilestoneName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ms-amt">Planned Amount (PKR) <span className="required">*</span></label>
                <input
                  id="ms-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. 1500000"
                  value={newMilestoneAmount}
                  onChange={(e) => setNewMilestoneAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ms-date">Planned Date (Optional)</label>
                <input
                  id="ms-date"
                  type="date"
                  className="input"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMilestoneModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingMilestone}>
                  {savingMilestone ? 'Saving...' : 'Add Milestone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RECORD PAYMENT */}
      {/* ============================================================ */}
      {showPaymentModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">💰 Record Client Payment Received</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPaymentModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddPayment}>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-amt-input">Amount Received (PKR) <span className="required">*</span></label>
                <input
                  id="pay-amt-input"
                  type="number"
                  className="input"
                  placeholder="e.g. 500000"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-date-input">Date Received <span className="required">*</span></label>
                <input
                  id="pay-date-input"
                  type="date"
                  className="input"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-method-input">Payment Method</label>
                <select
                  id="pay-method-input"
                  className="select"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cheque' | 'other')}
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Physical Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-ref-input">Cheque No. / Transaction ID</label>
                <input
                  id="pay-ref-input"
                  type="text"
                  className="input"
                  placeholder="e.g. FT26098234 or CHQ-00912"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                />
              </div>
              {milestones.length > 0 && (
                <div className="form-group">
                  <label className="form-label" htmlFor="pay-ms-select">Linked Milestone (Optional)</label>
                  <select
                    id="pay-ms-select"
                    className="select"
                    value={payMilestone}
                    onChange={(e) => setPayMilestone(e.target.value)}
                  >
                    <option value="">General Project Payment</option>
                    {milestones.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({formatPKRShort(m.planned_amount)})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="pay-note-input">Note</label>
                <input
                  id="pay-note-input"
                  type="text"
                  className="input"
                  placeholder="e.g. Received via Meezan Bank online transfer"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingPayment}>
                  {savingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT MILESTONE */}
      {/* ============================================================ */}
      {editingMilestone && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Payment Milestone</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingMilestone(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditMilestone}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-ms-name">
                  Milestone Stage <span className="required">*</span>
                </label>
                <input
                  id="edit-ms-name"
                  type="text"
                  className="input"
                  value={editMilestoneName}
                  onChange={(e) => setEditMilestoneName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-ms-amt">
                  Planned Amount (PKR) <span className="required">*</span>
                </label>
                <input
                  id="edit-ms-amt"
                  type="number"
                  className="input"
                  value={editMilestoneAmount}
                  onChange={(e) => setEditMilestoneAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-ms-date">Planned Date (Optional)</label>
                <input
                  id="edit-ms-date"
                  type="date"
                  className="input"
                  value={editMilestoneDate}
                  onChange={(e) => setEditMilestoneDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-ms-status">Milestone Status</label>
                <select
                  id="edit-ms-status"
                  className="select"
                  value={editMilestoneStatus}
                  onChange={(e) => setEditMilestoneStatus(e.target.value as MilestoneStatus)}
                >
                  <option value="pending">Pending</option>
                  <option value="partially_received">Partially Received</option>
                  <option value="received">Received</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingMilestone(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditMilestone}
                >
                  {savingEditMilestone ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT PAYMENT */}
      {/* ============================================================ */}
      {editingPayment && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Client Payment</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingPayment(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditPayment}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-amt-val">
                  Amount Received (PKR) <span className="required">*</span>
                </label>
                <input
                  id="edit-pay-amt-val"
                  type="number"
                  className="input"
                  value={editPayAmount}
                  onChange={(e) => setEditPayAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-date-val">
                  Date Received <span className="required">*</span>
                </label>
                <input
                  id="edit-pay-date-val"
                  type="date"
                  className="input"
                  value={editPayDate}
                  onChange={(e) => setEditPayDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-method-val">Payment Method</label>
                <select
                  id="edit-pay-method-val"
                  className="select"
                  value={editPayMethod}
                  onChange={(e) => setEditPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Physical Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-ref-val">Cheque No. / Transaction ID</label>
                <input
                  id="edit-pay-ref-val"
                  type="text"
                  className="input"
                  placeholder="e.g. FT26098234 or CHQ-00912"
                  value={editPayRef}
                  onChange={(e) => setEditPayRef(e.target.value)}
                />
              </div>
              {milestones.length > 0 && (
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-pay-ms-val">Linked Milestone (Optional)</label>
                  <select
                    id="edit-pay-ms-val"
                    className="select"
                    value={editPayMilestone}
                    onChange={(e) => setEditPayMilestone(e.target.value)}
                  >
                    <option value="">General Project Payment</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({formatPKRShort(m.planned_amount)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label" htmlFor="edit-pay-note-val">Notes</label>
                <input
                  id="edit-pay-note-val"
                  type="text"
                  className="input"
                  placeholder="e.g. Received via Meezan Bank online transfer"
                  value={editPayNote}
                  onChange={(e) => setEditPayNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditPayment}
                >
                  {savingEditPayment ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT EXPENSE */}
      {/* ============================================================ */}
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
                <label className="form-label" htmlFor="edit-proj-exp-site">Site / Project *</label>
                <select
                  id="edit-proj-exp-site"
                  className="select"
                  value={editExpProjectId}
                  onChange={(e) => setEditExpProjectId(e.target.value)}
                  required
                >
                  {allProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-exp-name">
                  Description *
                </label>
                <input
                  id="edit-proj-exp-name"
                  type="text"
                  className="input"
                  value={editExpName}
                  onChange={(e) => setEditExpName(e.target.value)}
                  required
                />
              </div>



              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-exp-amt">
                  Total Amount (PKR) *
                </label>
                <input
                  id="edit-proj-exp-amt"
                  type="number"
                  className="input"
                  value={editExpAmount}
                  onChange={(e) => setEditExpAmount(e.target.value)}
                  required
                  min={1}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-proj-exp-date">Expense Date *</label>
                <input
                  id="edit-proj-exp-date"
                  type="date"
                  className="input"
                  value={editExpDate}
                  onChange={(e) => setEditExpDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: editExpPaidVia === 'site_float' ? '0.75rem' : '1rem' }}>
                <label className="form-label" htmlFor="edit-proj-exp-via">Paid Via</label>
                <select
                  id="edit-proj-exp-via"
                  className="select"
                  value={editExpPaidVia}
                  onChange={(e) => {
                    const via = e.target.value as PaidVia;
                    setEditExpPaidVia(via);
                    if (via === 'site_float' && !editExpSupervisorId) {
                      const sup = allUsers.find(u => u.role === 'site_manager');
                      if (sup) setEditExpSupervisorId(sup.id);
                    }
                  }}
                >
                  <option value="direct">🏛️ Direct (Admin)</option>
                  <option value="site_float">💼 Site Float (Supervisor)</option>
                </select>
              </div>

              {/* Site Supervisor Picker - shown when Site Float is selected */}
              {editExpPaidVia === 'site_float' && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label" htmlFor="edit-proj-exp-supervisor">
                    Assigned Site Supervisor *
                  </label>
                  <select
                    id="edit-proj-exp-supervisor"
                    className="select"
                    value={editExpSupervisorId}
                    onChange={(e) => setEditExpSupervisorId(e.target.value)}
                    required
                  >
                    <option value="">Select supervisor...</option>
                    {allUsers
                      .filter(u => u.role === 'site_manager' && u.is_active !== false)
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
        expense={selectedDetailExpense ? { ...selectedDetailExpense, project_name: project?.name } : null}
        onClose={() => setSelectedDetailExpense(null)}
      />
    </div>
  );
}
