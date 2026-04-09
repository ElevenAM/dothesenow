"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedOrgContext } from "@/lib/auth-helpers";
import { updateOrg } from "@dothesenow/queries";

type UpdateResult = { success: true } | { error: string };

export async function updateOrgSettings(updates: {
  name: string;
  industry: string | null;
  budget_tier: string | null;
  timezone: string;
}): Promise<UpdateResult> {
  try {
    const { ctx } = await getAuthenticatedOrgContext(["owner", "admin"]);

    if (!updates.name || updates.name.length < 2) {
      return { error: "Organization name must be at least 2 characters." };
    }

    await updateOrg(ctx, {
      name: updates.name,
      industry: updates.industry,
      budget_tier: updates.budget_tier,
      timezone: updates.timezone,
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    console.error("Failed to update org settings:", err);
    return { error: "Failed to save settings. Please try again." };
  }
}
