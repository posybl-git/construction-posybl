'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface UserProfileMenuProps {
  profile: Profile | null;
  compact?: boolean; // If true, displays compact avatar + badge for mobile topbar
}

export function UserProfileMenu({ profile, compact = false }: UserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const isSupervisor = profile?.role === 'site_manager';
  const roleLabel = isSupervisor ? 'Supervisor' : 'Admin';
  const roleBadgeClass = isSupervisor ? 'badge-neutral' : 'badge-success';

  const initials = profile?.full_name
    ?.split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || (isSupervisor ? 'SM' : 'AD');

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onPointerDown);
    }
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError('');
    setPassSuccess(false);

    if (!newPassword || newPassword.length < 6) {
      setPassError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match. Please re-enter.');
      return;
    }

    setPassLoading(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setPassError(updateErr.message);
        setPassLoading(false);
        return;
      }

      setPassSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setPassLoading(false);
      setTimeout(() => {
        setShowPassModal(false);
        setPassSuccess(false);
      }, 2000);
    } catch {
      setPassError('An unexpected error occurred. Please try again.');
      setPassLoading(false);
    }
  }

  return (
    <>
      <div ref={menuRef} className="user-profile-menu-container">
        {/* ── Profile Trigger Button (Clean Circle Icon) ── */}
        <button
          ref={btnRef}
          type="button"
          className={`user-profile-btn ${open ? 'user-profile-btn--active' : ''}`}
          onClick={() => setOpen(prev => !prev)}
          aria-label={`Account menu for ${profile?.full_name || 'User'}`}
          aria-expanded={open}
          title={profile?.full_name || 'User Account'}
        >
          <div className="user-profile-circle-avatar">
            {initials}
          </div>
        </button>

        {/* ── Google-Style Profile Dropdown Popover ── */}
        {open && (
          <div
            className="google-profile-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Account details"
          >
            {/* Top User Info Section */}
            <div className="google-profile-header">
              <div className="google-profile-avatar-large">
                {initials}
              </div>

              <div className="google-profile-name">
                {profile?.full_name || 'Site User'}
              </div>

              <div className="google-profile-role-pill">
                <span className={`badge ${roleBadgeClass}`}>
                  {isSupervisor ? 'Site Supervisor' : 'Owner / Administrator'}
                </span>
              </div>

              {profile?.phone && (
                <div className="google-profile-meta">
                  <span>📱 {profile.phone}</span>
                </div>
              )}
              {profile?.email && (
                <div className="google-profile-meta">
                  <span>✉️ {profile.email}</span>
                </div>
              )}
            </div>

            {/* Quick Actions List (Google style) */}
            <div className="google-profile-actions">
              {isSupervisor ? (
                <>
                  {profile?.id && (
                    <Link
                      href={`/users/${profile.id}`}
                      className="google-profile-action-item"
                      onClick={() => setOpen(false)}
                    >
                      <span className="google-profile-action-icon">📖</span>
                      <div className="google-profile-action-text">
                        <span className="google-profile-action-title">My Cash Passbook</span>
                        <span className="google-profile-action-sub">View site float & expense ledger</span>
                      </div>
                    </Link>
                  )}
                  <Link
                    href="/expenses/add"
                    className="google-profile-action-item"
                    onClick={() => setOpen(false)}
                  >
                    <span className="google-profile-action-icon">➕</span>
                    <div className="google-profile-action-text">
                      <span className="google-profile-action-title">Record Expense</span>
                      <span className="google-profile-action-sub">Add materials or labour receipt</span>
                    </div>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/settings"
                    className="google-profile-action-item"
                    onClick={() => setOpen(false)}
                  >
                    <span className="google-profile-action-icon">⚙️</span>
                    <div className="google-profile-action-text">
                      <span className="google-profile-action-title">Company Settings</span>
                      <span className="google-profile-action-sub">Categories, vendors & audit logs</span>
                    </div>
                  </Link>
                  <Link
                    href="/users"
                    className="google-profile-action-item"
                    onClick={() => setOpen(false)}
                  >
                    <span className="google-profile-action-icon">👥</span>
                    <div className="google-profile-action-text">
                      <span className="google-profile-action-title">Staff & Float</span>
                      <span className="google-profile-action-sub">Manage supervisor cash balances</span>
                    </div>
                  </Link>
                </>
              )}

              {/* Universal Change Password Action */}
              <button
                type="button"
                className="google-profile-action-item"
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  setOpen(false);
                  setShowPassModal(true);
                }}
              >
                <span className="google-profile-action-icon">🔑</span>
                <div className="google-profile-action-text">
                  <span className="google-profile-action-title">Change Password</span>
                  <span className="google-profile-action-sub">Update your account login password</span>
                </div>
              </button>
            </div>

            {/* Sign Out Footer Button */}
            <div className="google-profile-footer">
              <button
                type="button"
                className="google-profile-signout-btn"
                onClick={handleLogout}
              >
                <span style={{ fontSize: '1rem' }}>🚪</span>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Change Password Modal ── */}
      {showPassModal && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-navy)' }}>
                🔑 Change Your Password
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowPassModal(false);
                  setPassError('');
                  setPassSuccess(false);
                }}
              >
                ✕
              </button>
            </div>

            {passSuccess ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                <h3 style={{ color: 'var(--color-navy)', marginBottom: '0.25rem' }}>Password Updated!</h3>
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>
                  Your new password is now active for future logins.
                </p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword}>
                <div className="form-group">
                  <label className="form-label" htmlFor="new-password-input">
                    New Password (min 6 characters) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="new-password-input"
                      type={showPasswordText ? 'text' : 'password'}
                      className="form-input"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new strong password"
                      required
                      minLength={6}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
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
                      {showPasswordText ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="confirm-password-input">
                    Confirm New Password *
                  </label>
                  <input
                    id="confirm-password-input"
                    type={showPasswordText ? 'text' : 'password'}
                    className="form-input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    required
                    minLength={6}
                  />
                </div>

                {passError && (
                  <p className="form-error" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                    ⚠️ {passError}
                  </p>
                )}

                <div className="flex justify-end gap-sm" style={{ marginTop: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowPassModal(false);
                      setPassError('');
                    }}
                    disabled={passLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={passLoading}
                  >
                    {passLoading ? 'Updating...' : 'Save New Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
