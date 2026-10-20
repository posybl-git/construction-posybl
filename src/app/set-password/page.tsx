'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

export default function SetPasswordPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userProfile) {
        setProfile(userProfile as Profile);
      }
      setLoading(false);
    }
    loadUser();
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setSaving(true);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }

      setSuccess(true);
      setSaving(false);
      setTimeout(() => {
        router.push(profile?.role === 'admin' ? '/dashboard' : '/site');
      }, 2000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-secondary)' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg-secondary)' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '2rem', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img
            src="/logo.png"
            alt="Android Properties"
            style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 0.75rem', objectFit: 'cover', border: '2px solid #1B75BC' }}
          />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-navy)', margin: 0 }}>
            Set Account Password
          </h1>
          <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {profile ? `Logged in as ${profile.full_name}` : 'Update your credentials'}
          </p>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
            <h3 style={{ color: 'var(--color-navy)', marginBottom: '0.5rem' }}>Password Updated!</h3>
            <p className="text-muted" style={{ fontSize: '0.875rem' }}>
              Redirecting to your dashboard...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="page-new-pass">
                New Password (min 6 characters) *
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="page-new-pass"
                  type={showPasswordText ? 'text' : 'password'}
                  className="input"
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
              <label className="form-label" htmlFor="page-confirm-pass">
                Confirm New Password *
              </label>
              <input
                id="page-confirm-pass"
                type={showPasswordText ? 'text' : 'password'}
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="form-error" style={{ marginBottom: '1rem', fontSize: '0.8125rem' }}>
                ⚠️ {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={saving}
              style={{ marginTop: '0.5rem' }}
            >
              {saving ? 'Updating Password...' : 'Save Password & Continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
