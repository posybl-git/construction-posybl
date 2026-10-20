'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  formatPKR,
  formatPKRShort,
  formatDate,
  generateTempPassword,
  getWhatsAppShareLink,
  normalizeLoginIdentifier,
} from '@/lib/format';
import { Tooltip } from '@/components/Tooltip';
import { TOOLTIPS } from '@/lib/tooltips';
import Link from 'next/link';
import type { Profile, Project, CashIssuance } from '@/types/database';

interface UserWithFloat extends Profile {
  float_issued: number;
  float_spent: number;
  float_balance: number;
  last_issuance_date: string | null;
  last_issuance_amount: number | null;
  last_issuance_id?: string | null;
  assigned_projects_count: number;
  assigned_project_ids: string[];
}

export default function UsersManagementPage() {
  const [activeUsers, setActiveUsers] = useState<UserWithFloat[]>([]);
  const [deactivatedUsers, setDeactivatedUsers] = useState<UserWithFloat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showIssueCashModal, setShowIssueCashModal] = useState(false);
  const [selectedUserForCash, setSelectedUserForCash] = useState<UserWithFloat | null>(null);
  const [showResetPassModal, setShowResetPassModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<UserWithFloat | null>(null);
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
  const [showDeactivatedSection, setShowDeactivatedSection] = useState(false);

  // Add user form state
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<'site_manager' | 'admin'>('site_manager');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newAssignedProjects, setNewAssignedProjects] = useState<string[]>([]);
  const [submittingUser, setSubmittingUser] = useState(false);

  // Edit user state
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithFloat | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'site_manager' | 'admin'>('site_manager');
  const [editIdentifier, setEditIdentifier] = useState('');
  const [editAssignedProjects, setEditAssignedProjects] = useState<string[]>([]);
  const [updatingUser, setUpdatingUser] = useState(false);

  // Issue cash form state
  const [cashAmount, setCashAmount] = useState('');
  const [cashDate, setCashDate] = useState(new Date().toISOString().split('T')[0]);
  const [cashProject, setCashProject] = useState('');
  const [cashFunding, setCashFunding] = useState<'own_funds'>('own_funds');
  const [cashMethod, setCashMethod] = useState<'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cheque' | 'other'>('cash');
  const [cashNote, setCashNote] = useState('');
  const [issuingCash, setIssuingCash] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadUsers(true);
  }, []);

  async function loadUsers(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    // 1. Fetch profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    // 2. Fetch projects
    const { data: projectsData } = await supabase
      .from('projects')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    setProjects((projectsData || []) as Project[]);

    // 4. Fetch project assignments
    const { data: assignmentsData } = await supabase
      .from('project_assignments')
      .select('*');

    // 5. Fetch float balances via server-side RPC to avoid Supabase row limit
    const { data: floatBalances } = await supabase.rpc('get_all_float_balances');
    const floatMap = new Map<string, { issued: number; spent: number; balance: number }>(
      (floatBalances || []).map((f: { user_id: string; total_issued: number; total_spent: number; float_balance: number }) => [
        f.user_id,
        { issued: Number(f.total_issued), spent: Number(f.total_spent), balance: Number(f.float_balance) },
      ])
    );

    // 6. Fetch last cash issuance per user (for display only, not for balance calc)
    const { data: issuancesData } = await supabase
      .from('cash_issuances')
      .select('*')
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });

    const profiles = (profilesData || []) as Profile[];
    const assignments = (assignmentsData || []) as { project_id: string; user_id: string }[];
    const issuances = (issuancesData || []) as CashIssuance[];

    const enrichedUsers: UserWithFloat[] = profiles.map(p => {
      const userFloat = floatMap.get(p.id) || { issued: 0, spent: 0, balance: 0 };
      const userIssuances = issuances.filter(i => i.user_id === p.id);

      const positiveIssuances = userIssuances.filter(i => Number(i.amount) > 0 && !i.is_adjustment);
      const lastIssuance = positiveIssuances[0] || null;
      const userAssignments = assignments.filter(a => a.user_id === p.id).map(a => a.project_id);

      return {
        ...p,
        float_issued: userFloat.issued,
        float_spent: userFloat.spent,
        float_balance: userFloat.balance,
        last_issuance_date: lastIssuance ? lastIssuance.issue_date : null,
        last_issuance_amount: lastIssuance ? Number(lastIssuance.amount) : null,
        last_issuance_id: lastIssuance ? lastIssuance.id : null,
        assigned_projects_count: userAssignments.length,
        assigned_project_ids: userAssignments,
      };
    });

    setActiveUsers(enrichedUsers.filter(u => u.is_active !== false));
    setDeactivatedUsers(enrichedUsers.filter(u => u.is_active === false));
    setLoading(false);
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newFullName.trim() || !newIdentifier.trim()) return;
    setSubmittingUser(true);

    const tempPassword = generateTempPassword();
    const normalizedEmail = normalizeLoginIdentifier(newIdentifier);
    const isPhone = !newIdentifier.includes('@');
    const rawPhone = isPhone ? newIdentifier.trim() : null;

    try {
      // 1. Create auth user with temp password
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: tempPassword,
        options: {
          data: {
            full_name: newFullName.trim(),
            role: newRole,
          },
        },
      });

      if (authError) {
        alert(`Error creating user: ${authError.message}`);
        setSubmittingUser(false);
        return;
      }

      const newUserId = authData.user?.id;

      if (newUserId) {
        // 2. Update profile fields (phone, role, is_active)
        await supabase
          .from('profiles')
          .update({
            full_name: newFullName.trim(),
            phone: rawPhone,
            role: newRole,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', newUserId);

        // 3. Assign selected projects
        if (newAssignedProjects.length > 0) {
          const assignmentRows = newAssignedProjects.map(projId => ({
            project_id: projId,
            user_id: newUserId,
          }));
          await supabase.from('project_assignments').insert(assignmentRows);
        }
      }

      // Show credentials once
      setCredentialsData({
        name: newFullName.trim(),
        loginId: newIdentifier.trim(),
        tempPass: tempPassword,
        phone: rawPhone || undefined,
      });

      setShowAddModal(false);
      setShowCredentialsModal(true);
      setNewFullName('');
      setNewIdentifier('');
      setNewAssignedProjects([]);
      setSubmittingUser(false);
      loadUsers();
    } catch {
      alert('An unexpected error occurred while adding user');
      setSubmittingUser(false);
    }
  }

  async function handleToggleDeactivate(user: UserWithFloat) {
    if (user.id === currentUserId) {
      alert('You cannot deactivate your own account.');
      return;
    }

    const activeAdmins = activeUsers.filter(u => u.role === 'admin' && u.id !== user.id);
    if (user.role === 'admin' && activeAdmins.length === 0) {
      alert('Cannot deactivate the last remaining active admin.');
      return;
    }

    const nextState = !user.is_active;
    const confirmMsg = nextState
      ? `Reactivate ${user.full_name}? They will be able to log in again.`
      : `Deactivate ${user.full_name}? They will be blocked from logging in immediately, but all historical entries will remain intact.`;

    if (!confirm(confirmMsg)) return;

    const prevScrollY = window.scrollY;
    await supabase
      .from('profiles')
      .update({
        is_active: nextState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    await loadUsers(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Edit Staff Member
  function handleOpenEditUser(user: UserWithFloat) {
    setEditingUser(user);
    setEditFullName(user.full_name);
    setEditRole((user.role as 'site_manager' | 'admin') || 'site_manager');
    setEditIdentifier(user.phone || user.email || '');
    setEditAssignedProjects(user.assigned_project_ids || []);
    setShowEditUserModal(true);
  }

  async function handleSaveEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser || !editFullName.trim() || !editIdentifier.trim()) return;
    setUpdatingUser(true);

    const updatedId = editingUser.id;
    const isPhone = !editIdentifier.includes('@');
    const phone = isPhone ? editIdentifier.trim() : null;
    const email = isPhone ? null : editIdentifier.trim();

    const { error: profErr } = await supabase
      .from('profiles')
      .update({
        full_name: editFullName.trim(),
        role: editRole,
        phone: phone || null,
        email: email || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingUser.id);

    if (profErr) {
      console.error('Error updating profile:', profErr);
      alert('Failed to update staff member: ' + profErr.message);
      setUpdatingUser(false);
      return;
    }

    // Sync project assignments
    await supabase.from('project_assignments').delete().eq('user_id', editingUser.id);
    if (editRole !== 'admin' && editAssignedProjects.length > 0) {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const rows = editAssignedProjects.map(pid => ({
        project_id: pid,
        user_id: editingUser.id,
        created_by: currentUser?.id,
      }));
      await supabase.from('project_assignments').insert(rows);
    }

    setUpdatingUser(false);
    setShowEditUserModal(false);
    setEditingUser(null);
    await loadUsers(false);
    setTimeout(() => {
      const el = document.getElementById(`row-${updatedId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), 2500);
      }
    }, 50);
  }

  // Delete Staff Member
  async function handleDeleteStaff(user: UserWithFloat) {
    if (user.id === currentUserId) {
      alert('You cannot delete your own admin account.');
      return;
    }

    if (!confirm(`Are you sure you want to delete staff member "${user.full_name}"?`)) return;
    const prevScrollY = window.scrollY;

    // Delete assignments
    await supabase.from('project_assignments').delete().eq('user_id', user.id);

    // Try deleting profile
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id);

    if (delErr) {
      // Foreign key constraint: user has linked expenses or issuances
      const confirmDeactivate = confirm(
        `"${user.full_name}" has recorded financial transactions (expenses or float issuances) so their account cannot be completely deleted without breaking financial records.\n\nWould you like to deactivate their account instead?`
      );
      if (confirmDeactivate) {
        await supabase.from('profiles').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', user.id);
        await loadUsers(false);
        setTimeout(() => {
          window.scrollTo({ top: prevScrollY, behavior: 'instant' });
        }, 50);
      }
      return;
    }

    await loadUsers(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  // Delete Last Issuance
  async function handleDeleteLastIssuance(user: UserWithFloat) {
    if (!user.last_issuance_id) return;
    if (!confirm(`Move last cash issuance of ${formatPKR(user.last_issuance_amount || 0)} for "${user.full_name}" to trash? The float balance will update immediately.`)) return;
    const prevScrollY = window.scrollY;

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('cash_issuances')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: currentUser?.id,
      })
      .eq('id', user.last_issuance_id);

    if (error) {
      console.error('Error deleting issuance:', error);
      alert('Failed to delete issuance: ' + error.message);
      return;
    }

    await loadUsers(false);
    setTimeout(() => {
      window.scrollTo({ top: prevScrollY, behavior: 'instant' });
    }, 50);
  }

  async function handleIssueCash(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserForCash || !cashAmount) return;
    setIssuingCash(true);

    const targetUserId = selectedUserForCash.id;
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('cash_issuances').insert({
      user_id: selectedUserForCash.id,
      project_id: cashProject || null,
      issue_date: cashDate,
      amount: Number(cashAmount),
      funding_source: cashFunding,
      method: cashMethod,
      note: cashNote || null,
      created_by: user?.id,
    });

    setShowIssueCashModal(false);
    setSelectedUserForCash(null);
    setCashAmount('');
    setCashNote('');
    setIssuingCash(false);
    await loadUsers(false);
    setTimeout(() => {
      const el = document.getElementById(`row-${targetUserId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('row-highlight');
        setTimeout(() => el.classList.remove('row-highlight'), 2500);
      }
    }, 50);
  }

  async function handleResetSupervisorPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserForPassword) return;
    setPasswordError('');

    const passToSet = customPassword.trim();
    if (!passToSet || passToSet.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }

    setUpdatingPassword(true);

    try {
      const { error: rpcError } = await supabase.rpc('admin_update_user_password', {
        target_user_id: selectedUserForPassword.id,
        new_password: passToSet,
      });

      if (rpcError) {
        setPasswordError(rpcError.message);
        setUpdatingPassword(false);
        return;
      }

      setCredentialsData({
        name: selectedUserForPassword.full_name,
        loginId: selectedUserForPassword.phone || selectedUserForPassword.email || selectedUserForPassword.full_name,
        tempPass: passToSet,
        phone: selectedUserForPassword.phone || undefined,
      });

      setShowResetPassModal(false);
      setSelectedUserForPassword(null);
      setCustomPassword('');
      setUpdatingPassword(false);
      setShowCredentialsModal(true);
    } catch {
      setPasswordError('An unexpected error occurred while updating password.');
      setUpdatingPassword(false);
    }
  }

  const totalStaffFloat = activeUsers
    .filter(u => u.role === 'site_manager')
    .reduce((sum, u) => sum + u.float_balance, 0);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
        <span className="text-muted">Loading staff & float balances...</span>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Staff & Float Management</h1>
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>
            Manage site supervisors, cash float balances and project assignments
          </p>
        </div>
        <div className="flex gap-sm">
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            ➕ Add New User
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid-stats" style={{ marginBottom: '1.5rem' }}>
        <div className={`stat-card ${totalStaffFloat < 0 ? 'stat-card--danger' : 'stat-card--info'}`}>
          <div className="stat-card__label">
            <span>Total Cash with Staff</span>
            <Tooltip text={TOOLTIPS.cash_with_staff_admin} />
          </div>
          <div className={`stat-card__value ${totalStaffFloat < 0 ? 'text-danger' : ''}`}>
            {formatPKR(totalStaffFloat)}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Total active float across {activeUsers.length} staff members
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">Active Supervisors</div>
          <div className="stat-card__value">
            {activeUsers.filter(u => u.role === 'site_manager').length}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Site supervisors entering daily expenses
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__label">Active Admins</div>
          <div className="stat-card__value">
            {activeUsers.filter(u => u.role === 'admin').length}
          </div>
          <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Full system control & financials
          </span>
        </div>
      </div>

      {/* Active Users Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-line)',
            background: 'var(--color-card-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0 }}>
            Active Staff & Float Balances ({activeUsers.length})
          </h2>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                <th>User / Name</th>
                <th>Role</th>
                <th>Login Identifier</th>
                <th>Assigned Sites</th>
                <th>Float Balance</th>
                <th>Last Issued</th>
                <th style={{ textAlign: 'right', width: '240px', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((user, idx) => {
                const isNegative = user.float_balance < 0;
                return (
                  <tr key={user.id} id={`row-${user.id}`}>
                    <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{user.serial_no ?? '-'}</td>
                    <td>
                      <Link href={`/users/${user.id}`} style={{ fontWeight: 700, color: 'var(--color-navy)' }}>
                        {user.full_name}
                      </Link>
                      {user.id === currentUserId && (
                        <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>
                          You
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${user.role === 'admin' ? 'badge-success' : 'badge-neutral'}`}>
                        {user.role === 'admin' ? 'Admin / Owner' : 'Site Manager'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                        {user.phone || user.email || '-'}
                      </span>
                    </td>
                    <td>
                      {user.role === 'admin' ? (
                        <span className="text-muted" style={{ fontSize: '0.8125rem' }}>All Sites (Admin)</span>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                          {user.assigned_projects_count} {user.assigned_projects_count === 1 ? 'Site' : 'Sites'}
                        </span>
                      )}
                    </td>
                    <td>
                      {user.role === 'admin' ? (
                        <span className="text-muted" style={{ fontSize: '0.8125rem' }}>- (Admin)</span>
                      ) : (
                        <>
                          <div className={`text-money ${isNegative ? 'text-danger' : 'text-success'}`}>
                            {isNegative ? `Company owes Rs ${Math.abs(user.float_balance).toLocaleString('en-IN')}` : formatPKR(user.float_balance)}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.71875rem' }}>
                            Spent: {formatPKRShort(user.float_spent)}
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      {user.role === 'admin' ? (
                        <span className="text-faint" style={{ fontSize: '0.75rem' }}>-</span>
                      ) : user.last_issuance_date ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
                          <div>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                              {formatDate(user.last_issuance_date)}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.71875rem' }}>
                              {formatPKRShort(user.last_issuance_amount)}
                            </div>
                          </div>
                          {user.last_issuance_id && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-danger"
                              onClick={() => handleDeleteLastIssuance(user)}
                              title="Delete last issuance (move to trash)"
                              style={{ padding: '0.15rem 0.35rem', fontSize: '0.75rem' }}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-faint" style={{ fontSize: '0.75rem' }}>No issuances</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', width: '320px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.375rem', flexWrap: 'nowrap' }}>
                        <Link href={`/users/${user.id}`} className="btn btn-secondary btn-sm" title="View Cash Ledger" style={{ minWidth: '68px' }}>
                          📖 Ledger
                        </Link>
                        {user.role === 'site_manager' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setSelectedUserForCash(user);
                              setShowIssueCashModal(true);
                            }}
                            title="Hand over cash to this staff member"
                            style={{ minWidth: '92px' }}
                          >
                            💵 Issue Cash
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleOpenEditUser(user)}
                          title="Edit staff details"
                          style={{ minWidth: '32px', padding: '0.375rem 0.5rem' }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedUserForPassword(user);
                            setCustomPassword(generateTempPassword());
                            setPasswordError('');
                            setShowResetPassModal(true);
                          }}
                          title="Set / Reset password for this staff member"
                          style={{ minWidth: '70px' }}
                        >
                          🔑 Pass
                        </button>
                        {user.id !== currentUserId && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleToggleDeactivate(user)}
                              title="Deactivate login"
                              style={{ minWidth: '32px', padding: '0.375rem 0.5rem' }}
                            >
                              🚫
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-danger"
                              onClick={() => handleDeleteStaff(user)}
                              title="Delete staff member"
                              style={{ minWidth: '32px', padding: '0.375rem 0.5rem' }}
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deactivated Users Section (PRD §2.5 Collapsed by default) */}
      {deactivatedUsers.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem', background: '#F8FAFC' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
            onClick={() => setShowDeactivatedSection(!showDeactivatedSection)}
          >
            <div className="flex items-center gap-sm">
              <span style={{ fontSize: '1rem' }}>{showDeactivatedSection ? '▼' : '▶'}</span>
              <h3 style={{ fontSize: '0.9375rem', color: 'var(--color-secondary-text)', margin: 0 }}>
                Deactivated Staff ({deactivatedUsers.length}) - Login Blocked
              </h3>
            </div>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              Historical expenses remain fully preserved
            </span>
          </div>

          {showDeactivatedSection && (
            <div className="table-container" style={{ marginTop: '1rem', border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', color: 'var(--color-muted)', fontWeight: 500 }}>#</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Identifier</th>
                    <th>Float Balance</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deactivatedUsers.map((user, idx) => (
                    <tr key={user.id} id={`row-${user.id}`}>
                      <td style={{ color: 'var(--color-muted)', fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap' }}>#{user.serial_no ?? '-'}</td>
                      <td style={{ fontWeight: 600 }}>{user.full_name}</td>
                      <td>{user.role}</td>
                      <td>{user.phone || user.email || '-'}</td>
                      <td>{formatPKR(user.float_balance)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex gap-xs justify-end">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedUserForPassword(user);
                              setCustomPassword(generateTempPassword());
                              setPasswordError('');
                              setShowResetPassModal(true);
                            }}
                          >
                            🔑 Set Pass
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleToggleDeactivate(user)}
                          >
                            🔄 Reactivate
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
      {/* MODAL: RESET USER PASSWORD */}
      {/* ============================================================ */}
      {showResetPassModal && selectedUserForPassword && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-navy)' }}>
                🔑 Set Password for {selectedUserForPassword.full_name}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowResetPassModal(false);
                  setSelectedUserForPassword(null);
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
                <div><strong>Staff Member:</strong> {selectedUserForPassword.full_name}</div>
                <div><strong>Login ID:</strong> {selectedUserForPassword.phone || selectedUserForPassword.email || 'N/A'}</div>
                <div><strong>Role:</strong> {selectedUserForPassword.role === 'admin' ? 'Admin' : 'Site Supervisor'}</div>
              </div>

              <div className="form-group">
                <div className="flex justify-between items-center" style={{ marginBottom: '0.25rem' }}>
                  <label className="form-label" htmlFor="reset-custom-pass" style={{ marginBottom: 0 }}>
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
                    id="reset-custom-pass"
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
                    setSelectedUserForPassword(null);
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
      {/* MODAL: ADD USER (PRD §2.1) */}
      {/* ============================================================ */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Staff Member / User</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddUser}>
              <div className="form-group">
                <label className="form-label" htmlFor="user-fullname">
                  Full Name <span className="required">*</span>
                </label>
                <input
                  id="user-fullname"
                  type="text"
                  className="input"
                  placeholder="e.g. Ahsan Khan"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-role">
                  Role <span className="required">*</span>
                </label>
                <select
                  id="user-role"
                  className="select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'site_manager' | 'admin')}
                >
                  <option value="site_manager">Site Manager (Enters site expenses daily, views own float only)</option>
                  <option value="admin">Admin / Owner (Full access, sees all money figures & reports)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="user-ident">
                  Mobile Number or Email <span className="required">*</span>
                </label>
                <input
                  id="user-ident"
                  type="text"
                  className="input"
                  placeholder="03001234567 or supervisor@domain.com"
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value)}
                  required
                />
                <span className="form-helper">
                  Pakistani mobile (+92) or email used for logging in
                </span>
              </div>

              {newRole === 'site_manager' && (
                <div className="form-group">
                  <label className="form-label">
                    Assign Construction Projects
                  </label>
                  <div
                    style={{
                      maxHeight: '140px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-line)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.5rem',
                      background: 'var(--color-white)',
                    }}
                  >
                    {projects.length === 0 ? (
                      <span className="text-muted" style={{ fontSize: '0.8125rem' }}>No active projects</span>
                    ) : (
                      projects.map(p => {
                        const isChecked = newAssignedProjects.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.25rem 0',
                              fontSize: '0.8125rem',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewAssignedProjects([...newAssignedProjects, p.id]);
                                } else {
                                  setNewAssignedProjects(newAssignedProjects.filter(id => id !== p.id));
                                }
                              }}
                            />
                            <span>{p.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <span className="form-helper">
                    Site manager will only see expenses for checked projects
                  </span>
                </div>
              )}

              <div className="alert-banner alert-banner--info" style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem' }}>
                  💡 An 8-character password will be generated automatically and displayed on screen with a WhatsApp share link.
                </span>
              </div>

              <div className="flex justify-end gap-sm">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingUser}
                >
                  {submittingUser ? 'Generating User...' : 'Create User & Generate Credentials'}
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
                🔑 User Credentials Generated
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCredentialsModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="alert-banner alert-banner--warning" style={{ marginBottom: '1.25rem' }}>
              <span>⚠️</span>
              <span style={{ fontSize: '0.8125rem' }}>
                <strong>Shown once on screen.</strong> Copy or share with the staff member now.
              </span>
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
                <div className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 600 }}>PASSWORD</div>
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
                const message = `Assalam-o-Alaikum ${credentialsData.name},\n\nHere are your login credentials for Android Properties:\n\n📱 Login: ${credentialsData.loginId}\n🔑 Password: ${credentialsData.tempPass}\n\nPlease log in here: ${window.location.origin}/login`;
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
                          `Android Properties Login\nUser: ${credentialsData.loginId}\nPassword: ${credentialsData.tempPass}\nLink: ${window.location.origin}/login`
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
      {/* MODAL: ISSUE CASH (PRD §4.7) */}
      {/* ============================================================ */}
      {showIssueCashModal && selectedUserForCash && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">
                💵 Hand Over Cash to {selectedUserForCash.full_name}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowIssueCashModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIssueCash}>
              <div className="form-group">
                <label className="form-label" htmlFor="issue-amt">
                  Cash Amount (PKR) <span className="required">*</span>
                </label>
                <input
                  id="issue-amt"
                  type="number"
                  className="input"
                  placeholder="e.g. 50000"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  required
                  min={1}
                />
                <span className="form-helper">
                  Positive number increases supervisor&apos;s cash in hand
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="issue-date">
                  Date Handed Over <span className="required">*</span>
                </label>
                <input
                  id="issue-date"
                  type="date"
                  className="input"
                  value={cashDate}
                  onChange={(e) => setCashDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="issue-proj">
                  Project (Optional - General float allowed)
                </label>
                <select
                  id="issue-proj"
                  className="select"
                  value={cashProject}
                  onChange={(e) => setCashProject(e.target.value)}
                >
                  <option value="">General Site Float (Not tied to one site)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="issue-meth">
                  Handover Method
                </label>
                <select
                  id="issue-meth"
                  className="select"
                  value={cashMethod}
                  onChange={(e) => setCashMethod(e.target.value as 'cash' | 'bank_transfer' | 'easypaisa' | 'jazzcash' | 'cheque' | 'other')}
                >
                  <option value="cash">Physical Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="issue-note">
                  Note / Purpose
                </label>
                <input
                  id="issue-note"
                  type="text"
                  className="input"
                  placeholder="e.g. For weekly labour dihari and bricks"
                  value={cashNote}
                  onChange={(e) => setCashNote(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowIssueCashModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={issuingCash}
                >
                  {issuingCash ? 'Recording Handover...' : 'Record Cash Issuance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT STAFF MEMBER */}
      {/* ============================================================ */}
      {showEditUserModal && editingUser && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">✏️ Edit Staff Member: {editingUser.full_name}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowEditUserModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditUser}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-user-name">
                  Full Name <span className="required">*</span>
                </label>
                <input
                  id="edit-user-name"
                  type="text"
                  className="input"
                  placeholder="e.g. Muhammad Tariq"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role <span className="required">*</span></label>
                <div className="flex gap-md" style={{ marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="edit-user-role"
                      value="site_manager"
                      checked={editRole === 'site_manager'}
                      onChange={() => setEditRole('site_manager')}
                    />
                    <span>Site Manager (Supervisor)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="edit-user-role"
                      value="admin"
                      checked={editRole === 'admin'}
                      onChange={() => setEditRole('admin')}
                    />
                    <span>Admin / Owner</span>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-user-ident">
                  Mobile Number or Email <span className="required">*</span>
                </label>
                <input
                  id="edit-user-ident"
                  type="text"
                  className="input"
                  placeholder="03001234567 or supervisor@domain.com"
                  value={editIdentifier}
                  onChange={(e) => setEditIdentifier(e.target.value)}
                  required
                />
                <span className="form-helper">
                  Pakistani mobile (+92) or email used for logging in
                </span>
              </div>

              {editRole === 'site_manager' && (
                <div className="form-group">
                  <label className="form-label">
                    Assign Construction Projects
                  </label>
                  <div
                    style={{
                      maxHeight: '140px',
                      overflowY: 'auto',
                      border: '1px solid var(--color-line)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.5rem',
                      background: 'var(--color-white)',
                    }}
                  >
                    {projects.length === 0 ? (
                      <span className="text-muted" style={{ fontSize: '0.8125rem' }}>No active projects</span>
                    ) : (
                      projects.map(p => {
                        const isChecked = editAssignedProjects.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.25rem 0',
                              fontSize: '0.8125rem',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditAssignedProjects([...editAssignedProjects, p.id]);
                                } else {
                                  setEditAssignedProjects(editAssignedProjects.filter(id => id !== p.id));
                                }
                              }}
                            />
                            <span>{p.name}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <span className="form-helper">
                    Site manager will only see expenses for checked projects
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditUserModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updatingUser}
                >
                  {updatingUser ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
