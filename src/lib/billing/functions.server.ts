import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getBillingProvider,
  getPriceId,
  updateSubscription,
} from "@/lib/billing/service.server";

const selectPlanSchema = z.object({
  plan: z.enum(["free", "starter", "pro", "business"]),
});

export const selectPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => selectPlanSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.plan === "free") {
      // Downgrade to free immediately
      await updateSubscription(supabase, userId, {
        plan: "free",
        status: "active",
        provider: null,
        provider_subscription_id: null,
        provider_customer_id: null,
      });
      return { ok: true, plan: "free" } as const;
    }

    const billing = getBillingProvider();
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    const email = profile?.email ?? "";
    const customerId = await billing.getOrCreateCustomer(userId, email);
    const priceId = getPriceId(data.plan);

    const result = await billing.createSubscription(customerId, priceId, userId);

    await updateSubscription(supabase, userId, {
      plan: data.plan,
      status: "active",
      provider: process.env["BILLING_PROVIDER"] ?? "noop",
      provider_customer_id: result.providerCustomerId,
      provider_subscription_id: result.providerSubscriptionId,
    });

    return { ok: true, plan: data.plan, checkoutUrl: result.checkoutUrl } as const;
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("provider_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub?.provider_subscription_id) {
      // Free plan or no external subscription — just update DB
      await updateSubscription(supabase, userId, {
        status: "canceled",
        canceled_at: new Date().toISOString(),
      });
      return { ok: true } as const;
    }

    const billing = getBillingProvider();
    await billing.cancel(sub.provider_subscription_id);

    // Mark as canceling (cancel_at_period_end = true)
    await updateSubscription(supabase, userId, { cancel_at_period_end: true });

    return { ok: true } as const;
  });

export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("provider_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (sub?.provider_subscription_id) {
      const billing = getBillingProvider();
      await billing.reactivate(sub.provider_subscription_id);
    }

    await updateSubscription(supabase, userId, {
      status: "active",
      cancel_at_period_end: false,
    });

    return { ok: true } as const;
  });
