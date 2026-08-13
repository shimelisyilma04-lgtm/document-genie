import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanSendAiMessage } from "@/lib/usage/limits.server";

const rewriteSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(5),
  instruction: z.string().trim().min(2).max(2000),
});

const translateSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(5),
  targetLanguage: z.enum(["english", "amharic", "french", "spanish", "arabic"]),
});

const faqSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(5),
});

const quizSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(5),
  questionCount: z.number().int().min(3).max(30).optional().default(10),
});

export const rewriteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rewriteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);
    const { rewriteDocument: run } = await import("@/lib/ai/actions.server");
    try {
      return await run({
        userId: context.userId,
        supabase: context.supabase,
        documentIds: data.documentIds,
        instruction: data.instruction,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Rewrite failed.");
    }
  });

export const translateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => translateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);
    const { translateDocument: run } = await import("@/lib/ai/actions.server");
    try {
      return await run({
        userId: context.userId,
        supabase: context.supabase,
        documentIds: data.documentIds,
        targetLanguage: data.targetLanguage,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Translation failed.");
    }
  });

export const generateFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => faqSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);
    const { generateFaq: run } = await import("@/lib/ai/actions.server");
    try {
      return await run({ userId: context.userId, supabase: context.supabase, documentIds: data.documentIds });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "FAQ generation failed.");
    }
  });

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => quizSchema.parse(input))
  .handler(async ({ data, context }) => {
    const plan = (context.subscription?.plan as "free" | "starter" | "pro" | "business") ?? "free";
    await assertCanSendAiMessage(context.supabase, context.userId, plan);
    const { generateQuiz: run } = await import("@/lib/ai/actions.server");
    try {
      return await run({
        userId: context.userId,
        supabase: context.supabase,
        documentIds: data.documentIds,
        questionCount: data.questionCount,
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Quiz generation failed.");
    }
  });
