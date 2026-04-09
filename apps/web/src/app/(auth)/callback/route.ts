import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;
  // Collect cookies set by the Supabase client during exchange —
  // we apply them directly to the redirect response below.
  const cookiesToSet: { name: string; value: string; options: any }[] = [];

  if (code) {
    // Inline client: the callback needs request-based cookies for the PKCE
    // code_verifier exchange and must set session cookies directly on the
    // redirect response. The shared createClient() from server.ts uses
    // cookies() from next/headers, which doesn't reliably propagate
    // Set-Cookie headers onto NextResponse.redirect() in Next.js 16.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies) {
            cookiesToSet.push(...cookies);
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let redirectPath = "/";

      if (user) {
        const { data: memberships } = await supabase
          .from("dtn_memberships")
          .select("org_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1);

        const hasOrg = memberships && memberships.length > 0;

        if (!hasOrg && user.email) {
          const admin = createAdminClient();
          const { data: pendingInvites } = await admin
            .from("dtn_memberships")
            .select("id")
            .eq("invited_email", user.email.toLowerCase())
            .is("user_id", null)
            .limit(1);

          if (pendingInvites && pendingInvites.length > 0) {
            redirectPath = "/invites";
          }
        }

        if (!hasOrg && redirectPath === "/") {
          redirectPath = "/onboarding";
        }
      }

      const response = NextResponse.redirect(new URL(redirectPath, origin));
      cookiesToSet.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options)
      );
      return response;
    }

    console.error("[auth callback] code exchange failed:", error.message);
  } else {
    console.error("[auth callback] no code parameter in URL");
  }

  // Error or no code — redirect to login
  const response = NextResponse.redirect(new URL("/login", origin));
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
}
