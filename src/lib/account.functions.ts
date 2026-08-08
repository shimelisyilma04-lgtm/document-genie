import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Creates the signed-in user's profile, default workspace and free-plan record
 * if they do not exist yet. Idempotent — safe to call on every app load.
 */
export const bootstrapAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("bootstrap_account");
    if (error) throw new Error(error.message);

    const { ensureSubscription } = await import("@/lib/usage.server");
    await ensureSubscription(context.userId);
    return { ok: true } as const;
  });
