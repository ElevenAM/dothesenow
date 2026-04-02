import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const isSignup = searchParams.get("signup") === "true";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Check for active org memberships
        const { data: memberships } = await supabase
          .from("dtn_memberships")
          .select("org_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1);

        const hasOrg = memberships && memberships.length > 0;

        if (!hasOrg && user.email) {
          // Check for pending invites via admin client (pending invites have user_id=null)
          const admin = createAdminClient();
          const { data: pendingInvites } = await admin
            .from("dtn_memberships")
            .select("id")
            .eq("invited_email", user.email.toLowerCase())
            .is("user_id", null)
            .limit(1);

          if (pendingInvites && pendingInvites.length > 0) {
            return NextResponse.redirect(`${origin}/invites`);
          }
        }

        if (!hasOrg) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(origin);
    }
  }

  // Auth error — redirect to login
  return NextResponse.redirect(`${origin}/login`);
}
