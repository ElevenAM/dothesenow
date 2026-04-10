import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with service_role key.
 * Bypasses RLS — use only in server-side contexts (webhooks, admin operations).
 * Never import this from client components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
