import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function proxy(request) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  const url = new URL(request.nextUrl.pathname, request.url);

  // Protected paths
  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');
  const isStudentPath = request.nextUrl.pathname.startsWith('/student');
  const isAuthPath = ['/login', '/register'].includes(request.nextUrl.pathname);

  if (user) {
    const role = user.user_metadata?.role || 'STUDENT';

    if (isAuthPath) {
      // Redirect authenticated users to their dashboard
      if (role === 'ADMIN') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      } else {
        return NextResponse.redirect(new URL('/student/dashboard', request.url));
      }
    }

    if (isAdminPath && role !== 'ADMIN') {
      // Redirect students trying to access admin pages
      return NextResponse.redirect(new URL('/student/dashboard', request.url));
    }

    if (isStudentPath && role !== 'STUDENT') {
      // Redirect admins trying to access student pages
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
  } else {
    // Guest users
    if (isAdminPath || isStudentPath) {
      // Redirect guests trying to access protected dashboards
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes - we handle auth check inside API routes)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
};
