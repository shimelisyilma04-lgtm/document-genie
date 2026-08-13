/**
 * Billing service — provider-independent abstraction.
 *
 * All payment logic lives here. To swap providers, implement BillingProvider
 * and update getBillingProvider(). No other file needs to change.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PlanId } from "@/lib/plans";

// ------------------------------------------------------------------ //
// Provider interface                                                   //
// ------------------------------------------------------------------ //

export interface BillingProvider {
  /** Create or retrieve a customer record. */
  getOrCreateCustomer(userId: string, email: string): Promise<string>; // returns customerId

  /** Start a new subscription. */
  createSubscription(customerId: string, priceId: string, userId: string): Promise<SubscriptionResult>;

  /** Change the active plan for an existing subscription. */
  changePlan(subscriptionId: string, newPriceId: string): Promise<void>;

  /** Cancel at period end (no immediate termination). */
  cancel(subscriptionId: string): Promise<void>;

  /** Re-activate a canceled subscription. */
  reactivate(subscriptionId: string): Promise<void>;

  /** Fetch the current external subscription status. */
  fetchSubscriptionStatus(subscriptionId: string): Promise<ExternalSubscriptionStatus>;
}

export interface SubscriptionResult {
  providerSubscriptionId: string;
  providerCustomerId: string;
  checkoutUrl?: string;
}

export interface ExternalSubscriptionStatus {
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "paused";
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

// ------------------------------------------------------------------ //
// Stub provider (no real payments yet — swap with Stripe, LemonSqueezy, etc.) //
// ------------------------------------------------------------------ //

/**
 * NOOP provider for development / early phases.
 * Replace .env vars with real provider credentials when ready.
 */
class NoopBillingProvider implements BillingProvider {
  async getOrCreateCustomer(_userId: string, _email: string): Promise<string> {
    return `cus_noop_${_userId}`;
  }

  async createSubscription(
    _customerId: string,
    _priceId: string,
    userId: string,
  ): Promise<SubscriptionResult> {
    const id = `sub_noop_${userId}`;
    return { providerSubscriptionId: id, providerCustomerId: _customerId };
  }

  async changePlan(_subscriptionId: string, _newPriceId: string): Promise<void> {
    // noop
  }

  async cancel(_subscriptionId: string): Promise<void> {
    // noop
  }

  async reactivate(_subscriptionId: string): Promise<void> {
    // noop
  }

  async fetchSubscriptionStatus(
    _subscriptionId: string,
  ): Promise<ExternalSubscriptionStatus> {
    return {
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      cancelAtPeriodEnd: false,
    };
  }
}

// ------------------------------------------------------------------ //
// Provider registry                                                    //
// ------------------------------------------------------------------ //

let _provider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (!_provider) {
    const providerType = process.env["BILLING_PROVIDER"] ?? "noop";
    if (providerType === "noop" || !process.env["BILLING_SECRET_KEY"]) {
      _provider = new NoopBillingProvider();
    } else if (providerType === "stripe") {
      // Dynamic import to avoid hard dependency when not configured
      throw new Error("Stripe billing not yet configured. Set BILLING_PROVIDER=stripe and BILLING_SECRET_KEY.");
    } else {
      throw new Error(`Unknown BILLING_PROVIDER: ${providerType}`);
    }
  }
  return _provider;
}

// ------------------------------------------------------------------ //
// Database helpers                                                    //
// ------------------------------------------------------------------ //

export type SubscriptionRecord = Database["public"]["Tables"]["subscriptions"]["Row"];

export async function getSubscription(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SubscriptionRecord | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data as SubscriptionRecord | null;
}

export async function updateSubscription(
  supabase: SupabaseClient<Database>,
  userId: string,
  updates: Partial<Pick<SubscriptionRecord, "plan" | "status" | "provider" | "provider_customer_id" | "provider_subscription_id" | "cancel_at_period_end" | "canceled_at">>,
): Promise<void> {
  const { error } = await supabase
    .from("subscriptions")
    .update(updates as never)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------ //
// Webhook handler                                                     //
// ------------------------------------------------------------------ //

export type WebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

/**
 * Handle a webhook event from the billing provider.
 * Route by event type — add new cases as providers are added.
 */
export async function handleBillingWebhook(
  supabase: SupabaseClient<Database>,
  event: WebhookEvent,
): Promise<void> {
  // TODO: verify webhook signature before processing
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data as {
        id: string;
        customer: string;
        status: string;
        cancel_at_period_end: boolean;
        current_period_end: number;
      };
      const { error } = await supabase
        .from("subscriptions")
        .update({
          provider_subscription_id: sub.id,
          provider_customer_id: sub.customer,
          status: mapExternalStatus(sub.status),
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        } as never)
        .eq("provider_customer_id", sub.customer);
      if (error) console.error("Webhook: failed to update subscription", error);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data as { id: string };
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "canceled" as never })
        .eq("provider_subscription_id", sub.id);
      if (error) console.error("Webhook: failed to cancel subscription", error);
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data as { customer: string };
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "past_due" as never })
        .eq("provider_customer_id", inv.customer);
      if (error) console.error("Webhook: invoice.payment_failed update failed", error);
      break;
    }
    default:
      console.log(`Webhook: unhandled event type ${event.type}`);
  }
}

function mapExternalStatus(
  s: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "paused",
): Database["public"]["Enums"]["subscription_status"] {
  const map: Record<string, Database["public"]["Enums"]["subscription_status"]> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    paused: "past_due",
  };
  return map[s] ?? "incomplete";
}

// ------------------------------------------------------------------ //
// Price ID mapping (provider-agnostic — swap keys for real IDs)       //
// ------------------------------------------------------------------ //

const PRICE_IDS: Record<PlanId, string> = {
  free:     process.env["BILLING_PRICE_FREE"]     ?? "price_free",
  starter:  process.env["BILLING_PRICE_STARTER"]  ?? "price_starter",
  pro:      process.env["BILLING_PRICE_PRO"]       ?? "price_pro",
  business: process.env["BILLING_PRICE_BUSINESS"]   ?? "price_business",
};

export function getPriceId(plan: PlanId): string {
  return PRICE_IDS[plan];
}

export function getPlanFromPriceId(priceId: string): PlanId | null {
  const entry = Object.entries(PRICE_IDS).find(([, id]) => id === priceId);
  return entry ? (entry[0] as PlanId) : null;
}
