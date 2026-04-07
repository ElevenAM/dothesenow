import type { OrgContext } from "./context.js";
import { QueryError } from "./errors.js";

// ─── Reserve / Confirm / Refund ──────────────────────────────

/**
 * Reserve credits before executing an AI task.
 * Calls the atomic `reserve_credits` RPC which locks the org row,
 * checks balance, decrements, and inserts a ledger entry.
 * @returns ledger entry ID
 * @throws QueryError if insufficient credits or org not found
 */
export async function reserveCredits(
  ctx: OrgContext,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<string> {
  const { data, error } = await ctx.client.rpc("reserve_credits", {
    p_org_id: ctx.orgId,
    p_amount: amount,
    p_reason: reason,
    p_reference_id: referenceId ?? null,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_credit_ledger",
      "reserveCredits",
      ctx.orgId,
      error,
    );
  }

  return data as string;
}

/**
 * Confirm a previously reserved credit charge.
 * Transitions ledger entry from reserved → confirmed.
 * Idempotent: confirming an already-confirmed entry is a no-op.
 */
export async function confirmCredits(
  ctx: OrgContext,
  ledgerId: string,
): Promise<void> {
  const { error } = await ctx.client.rpc("confirm_credits", {
    p_ledger_id: ledgerId,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_credit_ledger",
      "confirmCredits",
      ctx.orgId,
      error,
    );
  }
}

/**
 * Refund a previously reserved credit charge.
 * Transitions ledger entry to refunded and restores the org balance.
 * Idempotent: refunding an already-refunded entry is a no-op.
 */
export async function refundCredits(
  ctx: OrgContext,
  ledgerId: string,
): Promise<void> {
  const { error } = await ctx.client.rpc("refund_credits", {
    p_ledger_id: ledgerId,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_credit_ledger",
      "refundCredits",
      ctx.orgId,
      error,
    );
  }
}

/**
 * Refund all reserved entries for a given reference (e.g., task_id).
 * Used by Inngest's onFailure handler which has taskId but not ledgerId.
 * @returns number of entries refunded
 */
export async function refundByReference(
  ctx: OrgContext,
  referenceId: string,
): Promise<number> {
  const { data, error } = await ctx.client.rpc("refund_credits_by_reference", {
    p_org_id: ctx.orgId,
    p_reference_id: referenceId,
  });

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_credit_ledger",
      "refundByReference",
      ctx.orgId,
      error,
    );
  }

  return (data as number) ?? 0;
}

// ─── Read queries ────────────────────────────────────────────

/**
 * Get the current credit balance for an org.
 */
export async function getCreditBalance(
  ctx: OrgContext,
): Promise<{ remaining: number; resetAt: string | null }> {
  const { data, error } = await ctx.client
    .from("dtn_organizations")
    .select("ai_credits_remaining, ai_credits_reset_at")
    .eq("id", ctx.orgId)
    .single();

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_organizations",
      "getCreditBalance",
      ctx.orgId,
      error,
    );
  }

  if (!data) {
    throw new QueryError(
      "Organization not found",
      "dtn_organizations",
      "getCreditBalance",
      ctx.orgId,
    );
  }

  return {
    remaining: data.ai_credits_remaining,
    resetAt: data.ai_credits_reset_at,
  };
}

/**
 * Get paginated credit history for an org.
 */
export async function getCreditHistory(
  ctx: OrgContext,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ entries: CreditLedgerRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const { data, error, count } = await ctx.client
    .from("dtn_credit_ledger")
    .select("*", { count: "exact" })
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new QueryError(
      error.message,
      "dtn_credit_ledger",
      "getCreditHistory",
      ctx.orgId,
      error,
    );
  }

  return {
    entries: (data ?? []) as CreditLedgerRow[],
    total: count ?? 0,
  };
}

/** Row shape returned by getCreditHistory */
export interface CreditLedgerRow {
  id: string;
  org_id: string;
  amount: number;
  balance_after: number;
  reason: string;
  status: "reserved" | "confirmed" | "refunded";
  reference_id: string | null;
  created_at: string;
  updated_at: string;
}
