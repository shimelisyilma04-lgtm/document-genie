import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanSendAiMessage } from "@/lib/usage/limits.server";

const askEmployeeSchema = z.object({
  employeeType: z.enum(["writing", "business_analyst", "hr", "sales", "training", "legal"]),
  task: z.string().trim().min(2).max(4000),
  documentIds: z.array(z.string().uuid()).min(1).max(20),
  conversationId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
});

export const askEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => askEmployeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);

    const { askEmployee: run } = await import("@/lib/ai/employees/service.server");
    try {
      return await run({
        userId: context.userId,
        supabase: context.supabase,
        employeeType: data.employeeType,
        task: data.task,
        documentIds: data.documentIds,
        conversationId: data.conversationId ?? null,
        workspaceId: data.workspaceId ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The AI employee could not complete this task.";
      throw new Error(message);
    }
  });
