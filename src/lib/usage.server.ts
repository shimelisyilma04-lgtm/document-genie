/**
 * Server-only usage tracking + rate limiting helpers.
 *
 * `usage_events` is written with the service role because signed-in users must
 * not be able to forge or edit their own usage records (they can read them).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type UsageEventType = Database["public"]["Enums"]["usage_event_type"];
type AiEmployeeType = Database["public"]["Enums"]["ai_employee"];

export type UsageEventInput = {
  userId: string;
  eventType: UsageEventType;
  quantity?: number;
  promptTokens?: number;
  completionTokens?: number;
  documentId?: string | null;
  conversationId?: string | null;
  employeeType?: AiEmployeeType | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordUsage(event: UsageEventInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("usage_events").insert({
      user_id: event.userId,
      event_type: event.eventType,
      quantity: event.quantity ?? 1,
      prompt_tokens: event.promptTokens ?? 0,
      completion_tokens: event.completionTokens ?? 0,
      document_id: event.documentId ?? null,
      conversation_id: event.conversationId ?? null,
      employee_type: event.employeeType ?? null,
      model: event.model ?? null,
      metadata: (event.metadata ?? {}) as never,
    });
    if (error) console.error("recordUsage failed", error);
  } catch (error) {
    // Usage tracking must never break the user-facing action.
    console.error("recordUsage threw", error);
  }
}

/** Makes sure the user has a subscription row (free plan) — billing comes later. */
export async function ensureSubscription(userId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("subscriptions").upsert({ user_id: userId }, { onConflict: "user_id" });
  } catch (error) {
    console.error("ensureSubscription failed", error);
  }
}

export const AI_REQUESTS_PER_MINUTE = 12;
export const AI_REQUESTS_PER_DAY = 300;

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Sliding-window rate limit based on the user's own recorded usage events. */
export async function assertAiRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [minute, day] = await Promise.all([
    supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "ai_request")
      .gte("created_at", minuteAgo),
    supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "ai_request")
      .gte("created_at", dayAgo),
  ]);

  if ((minute.count ?? 0) >= AI_REQUESTS_PER_MINUTE) {
    throw new RateLimitError(
      `Rate limit reached (${AI_REQUESTS_PER_MINUTE} AI requests per minute). Please wait a moment.`,
    );
  }
  if ((day.count ?? 0) >= AI_REQUESTS_PER_DAY) {
    throw new RateLimitError(
      `Daily AI limit reached (${AI_REQUESTS_PER_DAY} requests). It resets on a rolling 24-hour window.`,
    );
  }
}
