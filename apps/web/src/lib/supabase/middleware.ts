import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // If a Supabase auth code arrives on the wrong page (redirect_to fallback),
  // forward it to /callback where it can be exchanged for a session.
  // Exclude /api routes — they receive OAuth codes from third-party providers
  // (Slack, HubSpot, Google Analytics) that must reach their own handlers.
  const code = request.nextUrl.searchParams.get("code");
  const path = request.nextUrl.pathname;
  if (code && !path.startsWith("/callback") && !path.startsWith("/api")) {
    const url = request.nextUrl.clone();
    url.pathname = "/callback";
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except auth pages, API routes,
  // the OAuth consent page, .well-known routes, and the landing page)
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/callback");
  const isApiRoute = path.startsWith("/api");
  const isOAuthConsent = path.startsWith("/oauth");
  const isWellKnown = path.startsWith("/.well-known");
  const isLandingPage = path === "/";

  if (!user && !isAuthPage && !isApiRoute && !isOAuthConsent && !isWellKnown && !isLandingPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
