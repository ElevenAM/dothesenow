import { createClient } from "@/lib/supabase/server";

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
  return data?.id ?? null;
}
