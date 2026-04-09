import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_DEPARTMENTS: Record<string, { name: string; icon: string }> = {
  marketing: { name: "Marketing", icon: "megaphone" },
};

export async function getDepartmentId(
  orgId: string,
  deptSlug: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dtn_departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", deptSlug)
    .single();

  if (data?.id) return data.id;

  // Auto-create known default departments that are missing (self-healing for
  // orgs created before department creation was made fatal).
  const defaults = DEFAULT_DEPARTMENTS[deptSlug];
  if (!defaults) return null;

  const admin = createAdminClient();
  const { data: created } = await admin
    .from("dtn_departments")
    .insert({ org_id: orgId, slug: deptSlug, name: defaults.name, icon: defaults.icon })
    .select("id")
    .single();

  return created?.id ?? null;
}
