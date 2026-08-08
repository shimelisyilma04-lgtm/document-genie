import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  documentIds: z.array(z.string().uuid()).min(1).max(10),
  conversationId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  mode: z.enum(["chat", "summarize", "key_info", "action_items", "explain"]).optional(),
});

export const askAnalyst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => askSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { askAnalyst: run } = await import("@/lib/ai/analyst.server");
    try {
      return await run(context.supabase, context.userId, {
        question: data.question,
        documentIds: data.documentIds,
        conversationId: data.conversationId ?? null,
        workspaceId: data.workspaceId ?? null,
        ...(data.mode ? { mode: data.mode } : {}),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The AI analyst could not answer right now.";
      throw new Error(message);
    }
  });
