'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RootHomePage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkUserAndRoute() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', user.id)
        .single();

      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        router.replace('/login?deactivated=1');
        return;
      }

      const role = profile?.role || (user.user_metadata?.role as string) || 'admin';
      if (role === 'site_manager') {
        router.replace('/site');
      } else {
        router.replace('/dashboard');
      }
    }

    checkUserAndRoute();
  }, [router, supabase]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a', color: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src="/logo.png"
          alt="Android Properties"
          style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 1rem', objectFit: 'cover', border: '2px solid #1B75BC' }}
        />
        <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>Loading Android Properties...</div>
      </div>
    </div>
  );
}
