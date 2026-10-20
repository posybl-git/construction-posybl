import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : 'https://placeholder.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Skip auth checks if running against placeholder config
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session - this is important for server components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes that don't require auth
  const publicPaths = ['/login', '/auth/callback'];
  const isPublicPath = publicPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && !isPublicPath) {
    // Not authenticated - redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (profile && profile.is_active === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('deactivated', '1');
      return NextResponse.redirect(url);
    }

    if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = profile?.role === 'admin' ? '/dashboard' : '/site';
      return NextResponse.redirect(url);
    }

    const adminOnlyPaths = ['/dashboard', '/payments', '/payables', '/settings', '/projects/new'];
    const isUserList = request.nextUrl.pathname === '/users';
    const isExpenseAdd = request.nextUrl.pathname === '/expenses/add';
    const isExpenses = request.nextUrl.pathname.startsWith('/expenses') && !isExpenseAdd;
    const isAdminPath = adminOnlyPaths.some(path =>
      request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + '/')
    ) || isUserList || isExpenses;

    if (isAdminPath && profile?.role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/site';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
