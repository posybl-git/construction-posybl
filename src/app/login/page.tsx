'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { normalizeLoginIdentifier } from '@/lib/format';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [signupRole, setSignupRole] = useState<'admin' | 'site_manager'>('admin');
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // If already authenticated, redirect based on role in database or metadata
  useEffect(() => {
    // Check if redirected due to deactivation
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('deactivated') === '1') {
        setShowDeactivatedModal(true);
      }
    }

    async function checkSession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_active')
          .eq('id', user.id)
          .single();

        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          setShowDeactivatedModal(true);
          return;
        }

        if (profile && profile.is_active !== false) {
          router.push(profile.role === 'admin' ? '/dashboard' : '/site');
        } else if (!profile) {
          const fallbackRole = (user.user_metadata?.role as string) || 'admin';
          router.push(fallbackRole === 'admin' ? '/dashboard' : '/site');
        }
      }
    }
    checkSession();
  }, [router, supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailToUse = normalizeLoginIdentifier(identifier);
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Invalid phone/email or password. Please verify credentials.'
            : authError.message
        );
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_active')
          .eq('id', data.user.id)
          .single();

        if (profile?.is_active === false) {
          await supabase.auth.signOut();
          setShowDeactivatedModal(true);
          setLoading(false);
          return;
        }

        // Record last_login_at
        await supabase
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', data.user.id);

        const effectiveRole = profile?.role || (data.user.user_metadata?.role as string) || 'admin';
        const redirectTo = effectiveRole === 'admin' ? '/dashboard' : '/site';
        router.push(redirectTo);
      }
    } catch {
      setError('An unexpected error occurred during sign in');
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const emailToUse = normalizeLoginIdentifier(identifier);
      const isPakMobile = !!identifier.trim().match(/^(\+92|03|92)\d{9,10}$/);
      const rawPhone = isPakMobile ? identifier.trim() : undefined;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: emailToUse,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: signupRole,
          },
        },
      });

      if (signUpError) {
        // If already exists, try signing in directly
        const { data: directSignIn, error: directSignInErr } = await supabase.auth.signInWithPassword({
          email: emailToUse,
          password,
        });

        if (!directSignInErr && directSignIn?.user) {
          // Upsert profile to guarantee role is recorded
          await supabase
            .from('profiles')
            .upsert({
              id: directSignIn.user.id,
              full_name: fullName.trim(),
              role: signupRole,
              phone: rawPhone,
              is_active: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

          const redirectTo = signupRole === 'admin' ? '/dashboard' : '/site';
          router.push(redirectTo);
          return;
        }

        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Auto sign in
      const { data: signInData } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      const authedUser = signInData?.user || data?.user;

      if (authedUser) {
        // Guarantee profile row is created/updated in profiles table
        await supabase
          .from('profiles')
          .upsert({
            id: authedUser.id,
            full_name: fullName.trim(),
            role: signupRole,
            phone: rawPhone,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        router.push(signupRole === 'admin' ? '/dashboard' : '/site');
      } else {
        router.push(signupRole === 'admin' ? '/dashboard' : '/site');
      }
    } catch {
      setError('An unexpected error occurred during account creation');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #F0F5FA 0%, #E2ECF7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '2.25rem',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-white)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src="/logo.png"
            alt="Android Properties"
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              margin: '0 auto 0.75rem',
              objectFit: 'cover',
              border: '3px solid #1B75BC',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)'
            }}
          />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-navy)', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            Android Properties
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-secondary-text)' }}>
            Construction Expense & Financial Tracker
          </p>
        </div>

        {/* Tab switch for Sign In / Sign Up */}
        <div
          style={{
            display: 'flex',
            background: '#F0F5FA',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            border: '1px solid var(--color-line)',
          }}
        >
          <button
            type="button"
            onClick={() => { setAuthMode('signin'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.45rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: authMode === 'signin' ? 'var(--color-white)' : 'transparent',
              color: authMode === 'signin' ? 'var(--color-navy)' : 'var(--color-secondary-text)',
              boxShadow: authMode === 'signin' ? 'var(--shadow-xs)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('signup'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.45rem',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: authMode === 'signup' ? 'var(--color-white)' : 'transparent',
              color: authMode === 'signup' ? 'var(--color-navy)' : 'var(--color-secondary-text)',
              boxShadow: authMode === 'signup' ? 'var(--shadow-xs)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
          >
            New Account
          </button>
        </div>

        {error && (
          <div className="alert-banner alert-banner--danger" style={{ marginBottom: '1.25rem' }}>
            <span>⚠️</span>
            <span style={{ fontSize: '0.8125rem' }}>{error}</span>
          </div>
        )}

        {authMode === 'signin' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-id">
                Mobile Number or Email <span className="required">*</span>
              </label>
              <input
                id="login-id"
                type="text"
                className="input"
                placeholder="03001234567 or email@address.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
              />
              <span className="form-helper">
                Accepts Pakistani mobile (+92) or email address
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label" htmlFor="login-password">
                Password <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-secondary-text)',
                    fontSize: '0.875rem',
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
              style={{ marginTop: '1.25rem' }}
            >
              {loading ? 'Signing In...' : 'Sign In →'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignUp}>
            {/* Account Role Selection Buttons */}
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ marginBottom: '0.375rem' }}>
                Account Role <span className="required">*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                <button
                  type="button"
                  onClick={() => setSignupRole('admin')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.75rem 0.5rem',
                    gap: '0.25rem',
                    borderRadius: 'var(--radius-lg)',
                    border: signupRole === 'admin' ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-line)',
                    background: signupRole === 'admin' ? '#EBF3FA' : 'var(--color-white)',
                    color: signupRole === 'admin' ? 'var(--color-primary-blue)' : 'var(--color-navy)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    boxShadow: signupRole === 'admin' ? '0 0 0 1px var(--color-primary-blue)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>👑</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>Admin / Owner</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-secondary-text)' }}>Full Company Access</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSignupRole('site_manager')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.75rem 0.5rem',
                    gap: '0.25rem',
                    borderRadius: 'var(--radius-lg)',
                    border: signupRole === 'site_manager' ? '2px solid var(--color-primary-blue)' : '1px solid var(--color-line)',
                    background: signupRole === 'site_manager' ? '#EBF3FA' : 'var(--color-white)',
                    color: signupRole === 'site_manager' ? 'var(--color-primary-blue)' : 'var(--color-navy)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    boxShadow: signupRole === 'site_manager' ? '0 0 0 1px var(--color-primary-blue)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>👷</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>Site Supervisor</span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-secondary-text)' }}>Daily Site Entries</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-name">
                Full Name <span className="required">*</span>
              </label>
              <input
                id="reg-name"
                type="text"
                className="input"
                placeholder="Muhammad Wakeel"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-id">
                Mobile Number or Email <span className="required">*</span>
              </label>
              <input
                id="reg-id"
                type="text"
                className="input"
                placeholder="03001234567 or email@address.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
              <span className="form-helper">Will be your login identifier</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-pass">
                Password <span className="required">*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="reg-pass"
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-secondary-text)',
                    fontSize: '0.875rem',
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="reg-confirm-pass">
                Confirm Password <span className="required">*</span>
              </label>
              <input
                id="reg-confirm-pass"
                type={showPassword ? 'text' : 'password'}
                className="input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account & Enter →'}
            </button>
          </form>
        )}
      </div>

      {/* Account Deactivated Modal Popup */}
      {showDeactivatedModal && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div
            className="modal"
            style={{
              maxWidth: '420px',
              textAlign: 'center',
              padding: '2rem 1.5rem',
              borderRadius: 'var(--radius-xl)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--color-danger, #EF4444)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
                margin: '0 auto 1.25rem',
              }}
            >
              🔒
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: '0.5rem' }}>
              Account Deactivated
            </h2>
            <p className="text-muted" style={{ fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Your Android Properties account has been deactivated by an administrator. You cannot log in or record entries at this time. Please contact the company administrator for assistance.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              onClick={() => {
                setShowDeactivatedModal(false);
                if (typeof window !== 'undefined' && window.location.search) {
                  window.history.replaceState({}, '', window.location.pathname);
                }
              }}
            >
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
