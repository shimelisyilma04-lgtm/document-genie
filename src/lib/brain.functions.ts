import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanSendAiMessage } from "@/lib/usage/limits.server";

const askBrainSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  documentIds: z.array(z.string().uuid()).optional(),
  conversationId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
});

export const askCompanyBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => askBrainSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);

    const { askCompanyBrain: run } = await import("@/lib/ai/brain.server");
    try {
      return await run(context.supabase, context.userId, {
        question: data.question,
        documentIds: data.documentIds ?? [],
        conversationId: data.conversationId ?? null,
        workspaceId: data.workspaceId ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The Company Brain could not answer right now.";
      throw new Error(message);
    }
  });
