import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Skip middleware for API routes, static files, and clear-cookies page
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/clear-cookies'
  ) {
    return NextResponse.next();
  }

  // Check if cookies are too large (431 error prevention)
  // If cookies are too large, we can't process them, so skip middleware
  try {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader && cookieHeader.length > 8000) {
      // Cookies are too large - skip middleware processing and redirect to clear-cookies
      // But first, try to create a response without processing cookies
      const response = NextResponse.next();
      // Set a header to indicate cookies need clearing
      response.headers.set('X-Clear-Cookies', 'true');
      // For landing page, allow it but with a flag
      if (pathname === '/landing') {
        return response;
      }
      // For other pages, redirect to clear-cookies
      return NextResponse.redirect(new URL('/clear-cookies', request.url));
    }
  } catch (error) {
    // If we can't even read cookies, skip middleware
    console.error('Error reading cookies:', error);
    if (pathname !== '/landing' && pathname !== '/clear-cookies') {
      return NextResponse.redirect(new URL('/clear-cookies', request.url));
    }
    return NextResponse.next();
  }

  // Create a response object
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  try {
    // Create Supabase client with proper cookie handling
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Update request cookies
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
            // Update response cookies
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // Refresh session - this is important for keeping sessions alive
    await supabase.auth.getSession();

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;
    const isAuthenticated = !!user;

    // Public routes that don't require authentication
    const publicRoutes = ['/landing', '/signup', '/signin', '/clear-cookies'];
    const isPublicRoute = publicRoutes.includes(pathname);

    // Handle root path redirect
    if (pathname === '/') {
      const redirectUrl = isAuthenticated ? '/chat' : '/landing';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    // Redirect authenticated users away from auth pages
    if (isAuthenticated && (pathname === '/signup' || pathname === '/signin')) {
      return NextResponse.redirect(new URL('/chat', request.url));
    }

    // Redirect unauthenticated users from protected routes to landing
    if (!isAuthenticated && !isPublicRoute) {
      return NextResponse.redirect(new URL('/landing', request.url));
    }

    // Return response with updated cookies
    return response;
  } catch (error) {
    // Log error but don't break the app
    console.error('Middleware error:', error);
    
    const pathname = request.nextUrl.pathname;
    const publicRoutes = ['/landing', '/signup', '/signin', '/clear-cookies'];
    
    // If it's a public route, allow it
    if (publicRoutes.includes(pathname)) {
      return response;
    }
    
    // For other routes, redirect to landing
    if (pathname !== '/') {
      return NextResponse.redirect(new URL('/landing', request.url));
    }
    
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
