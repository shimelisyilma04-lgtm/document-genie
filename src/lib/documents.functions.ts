import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const documentIdSchema = z.object({ documentId: z.string().uuid() });

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { processDocument: run } = await import("@/lib/documents/pipeline.server");
    return run(context.supabase, context.userId, data.documentId);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { deleteDocument: run } = await import("@/lib/documents/pipeline.server");
    await run(context.supabase, data.documentId);
    return { ok: true } as const;
  });
