/**
 * Usage enforcement — server-side plan limit checking.
 *
 * Called before every paid action (upload, AI request, workspace creation, etc.)
 * to ensure the user has not exceeded their plan quota.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PlanId } from "@/lib/plans";
import { PLANS } from "@/lib/plans";

export class PlanLimitError extends Error {
  readonly code: "document_limit" | "page_limit" | "message_limit" | "storage_limit" | "workspace_limit";
  readonly upgradeTo: PlanId;

  constructor(
    code: PlanLimitError["code"],
    message: string,
    upgradeTo: PlanId = "starter",
  ) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.upgradeTo = upgradeTo;
  }
}

type UsageCounts = {
  documentsThisMonth: number;
  aiMessagesThisMonth: number;
  workspaceCount: number;
  storageUsedBytes: number;
};

type PlanLimits = {
  documentsPerMonth: number;
  pagesPerDocument: number;
  aiMessagesPerMonth: number;
  storageBytes: number;
  maxWorkspaces: number;
};

async function getUsageCounts(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UsageCounts> {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const [docResult, msgResult, wsResult, storageResult] = await Promise.all([
    // Documents this month
    supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "document_processed")
      .gte("created_at", periodStart.toISOString()),
    // AI messages this month
    supabase
      .from("usage_events")
      .select("quantity", { count: "exact" })
      .eq("user_id", userId)
      .eq("event_type", "ai_request")
      .gte("created_at", periodStart.toISOString()),
    // Workspace count
    supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    // Storage used
    supabase
      .from("storage_usage")
      .select("bytes_used")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    documentsThisMonth: docResult.count ?? 0,
    aiMessagesThisMonth: msgResult.data?.reduce((s, r) => s + (r.quantity ?? 0), 0) ?? 0,
    workspaceCount: wsResult.count ?? 0,
    storageUsedBytes: storageResult?.data?.bytes_used ?? 0,
  };
}

function getLimits(plan: PlanId): PlanLimits {
  const p = PLANS[plan];
  return {
    documentsPerMonth: p.documentsPerMonth,
    pagesPerDocument: p.pagesPerDocument,
    aiMessagesPerMonth: p.aiMessagesPerMonth,
    storageBytes: p.storageBytes,
    maxWorkspaces: p.maxWorkspaces,
  };
}

function suggestUpgrade(current: PlanId): PlanId {
  const order: PlanId[] = ["free", "starter", "pro", "business"];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : "business";
}

/** Check whether a new document upload should be allowed. */
export async function assertCanUploadDocument(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: PlanId,
  fileSizeBytes: number,
): Promise<void> {
  const [usage, limits] = await Promise.all([
    getUsageCounts(supabase, userId),
    Promise.resolve(getLimits(plan)),
  ]);

  if (usage.documentsThisMonth >= limits.documentsPerMonth) {
    const next = suggestUpgrade(plan);
    throw new PlanLimitError(
      "document_limit",
      `Your ${plan} plan allows ${limits.documentsPerMonth} document uploads per month. You've reached that limit.`,
      next,
    );
  }

  if (usage.storageUsedBytes + fileSizeBytes > limits.storageBytes) {
    const next = suggestUpgrade(plan);
    throw new PlanLimitError(
      "storage_limit",
      `Uploading this file would exceed your ${plan} plan storage limit (${Math.round(limits.storageBytes / (1024 * 1024 * 1024))} GB).`,
      next,
    );
  }
}

/** Check whether an AI message should be allowed. */
export async function assertCanSendAiMessage(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: PlanId,
): Promise<void> {
  const [usage, limits] = await Promise.all([
    getUsageCounts(supabase, userId),
    Promise.resolve(getLimits(plan)),
  ]);

  if (usage.aiMessagesThisMonth >= limits.aiMessagesPerMonth) {
    const next = suggestUpgrade(plan);
    throw new PlanLimitError(
      "message_limit",
      `Your ${plan} plan allows ${limits.aiMessagesPerMonth} AI messages per month. You've reached that limit.`,
      next,
    );
  }
}

/** Check whether a new workspace should be allowed. */
export async function assertCanCreateWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: PlanId,
): Promise<void> {
  const [usage, limits] = await Promise.all([
    getUsageCounts(supabase, userId),
    Promise.resolve(getLimits(plan)),
  ]);

  if (limits.maxWorkspaces === -1) return; // unlimited
  if (usage.workspaceCount >= limits.maxWorkspaces) {
    const next = suggestUpgrade(plan);
    throw new PlanLimitError(
      "workspace_limit",
      `Your ${plan} plan allows ${limits.maxWorkspaces} workspace${limits.maxWorkspaces === 1 ? "" : "s"}. You've reached that limit.`,
      next,
    );
  }
}

/** Check whether a document's page count is within plan limits. */
export async function assertDocumentPageCount(
  pageCount: number | null,
  plan: PlanId,
): Promise<void> {
  const limits = getLimits(plan);
  if (pageCount !== null && pageCount > limits.pagesPerDocument) {
    const next = suggestUpgrade(plan);
    throw new PlanLimitError(
      "page_limit",
      `Your ${plan} plan allows documents up to ${limits.pagesPerDocument} pages. This document has ${pageCount} pages.`,
      next,
    );
  }
}

/** Get current usage summary for a user (for UI display). */
export async function getUserUsageSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: PlanId,
): Promise<{
  documentsThisMonth: number;
  documentsLimit: number;
  aiMessagesThisMonth: number;
  aiMessagesLimit: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  workspaceCount: number;
  workspaceLimit: number;
}> {
  const [usage, limits] = await Promise.all([
    getUsageCounts(supabase, userId),
    Promise.resolve(getLimits(plan)),
  ]);

  return {
    documentsThisMonth: usage.documentsThisMonth,
    documentsLimit: limits.documentsPerMonth,
    aiMessagesThisMonth: usage.aiMessagesThisMonth,
    aiMessagesLimit: limits.aiMessagesPerMonth,
    storageUsedBytes: usage.storageUsedBytes,
    storageLimitBytes: limits.storageBytes,
    workspaceCount: usage.workspaceCount,
    workspaceLimit: limits.maxWorkspaces,
  };
}
