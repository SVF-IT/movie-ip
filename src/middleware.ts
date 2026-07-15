import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require authentication
const publicRoutes = ["/login"];

// Routes that require admin role
const adminRoutes = ["/admin", "/audit-log"];
//deploy commit
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // Get user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Check if route is public (no auth required)
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // If user is not logged in and trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Validate redirect path to prevent open redirects
    if (isValidRedirect(pathname)) {
      url.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access login page, redirect to dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // For all authenticated users, fetch profile to enforce role/state checks
  if (user) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, is_active, must_change_password")
      .eq("id", user.id)
      .single();

    // If user is not active, sign them out
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const mustChange = profile?.must_change_password ?? false;
    const role = profile?.role;

    // ── /change-password: only when must_change_password=true ─────────────
    if (pathname.startsWith("/change-password")) {
      if (!mustChange) {
        // Password already set — redirect to dashboard
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }
      // OK to access change-password
      return supabaseResponse;
    }

    // ── Force password change before accessing any other page ─────────────
    if (mustChange) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      url.searchParams.set("first", "true");
      return NextResponse.redirect(url);
    }

    // ── Admin-only routes ──────────────────────────────────────────────────
    if (adminRoutes.some((route) => pathname.startsWith(route))) {
      if (role !== "admin") {
        return redirectToAccessDenied(request, "admin", pathname);
      }
    }

    // ── Legal-only routes (legal + admin) ─────────────────────────────────
    if (pathname.startsWith("/legal-approvals")) {
      if (role !== "legal" && role !== "admin") {
        return redirectToAccessDenied(request, "legal", pathname);
      }
    }

    // ── Editor-only routes ────────────────────────────────────────────────
    if (pathname.startsWith("/my-submissions")) {
      if (role !== "editor") {
        return redirectToAccessDenied(request, "editor", pathname);
      }
    }
  }

  return supabaseResponse;
}

function isValidRedirect(path: string): boolean {
  // Must start with exactly one slash, no protocol, no double slashes
  return /^\/[^/]/.test(path) && !path.includes("://");
}

function redirectToAccessDenied(request: NextRequest, reason: string, from: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/access-denied";
  url.search = "";
  url.searchParams.set("reason", reason);
  if (isValidRedirect(from)) url.searchParams.set("from", from);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes)
     * - public static assets (images, svgs, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mp4|webm|ogg|mp3|wav|flac|aac|woff2?|eot|ttf|otf|css|js)$).*)",
  ],
};
