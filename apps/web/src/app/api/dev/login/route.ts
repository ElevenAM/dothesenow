import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return new NextResponse("Missing email parameter", { status: 400 });
  }

  const admin = createAdminClient();

  // Generate a magic link token server-side (no email sent)
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError) {
    return new NextResponse(`Failed to generate link: ${linkError.message}`, {
      status: 500,
    });
  }

  const tokenHash = linkData.properties.hashed_token;

  // Verify the token to establish a cookie-based session
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (verifyError) {
    return new NextResponse(`Failed to verify OTP: ${verifyError.message}`, {
      status: 500,
    });
  }

  // Run the same post-auth checks as /callback
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: memberships } = await supabase
      .from("dtn_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1);

    const hasOrg = memberships && memberships.length > 0;

    if (!hasOrg && user.email) {
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
