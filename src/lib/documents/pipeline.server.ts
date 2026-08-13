/**
 * Document processing pipeline (server-only).
 *
 * Uploading -> Processing -> Ready / Failed
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { chunkBlocks, countWords } from "./chunker";
import { ExtractionError, resolveExtractor } from "./extractors.server";
import { recordUsage } from "../usage.server";
import { assertCanUploadDocument, assertDocumentPageCount } from "../usage/limits.server";

export type ProcessResult = {
  documentId: string;
  status: "ready" | "failed";
  pageCount: number | null;
  chunkCount: number;
  wordCount: number;
  error?: string;
};

export async function processDocument(
  supabase: SupabaseClient<Database>,
  userId: string,
  documentId: string,
): Promise<ProcessResult> {
  const { data: document, error: loadError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!document) throw new Error("Document not found.");

  // Get user plan for limit enforcement
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  const plan = (sub?.plan ?? "free") as "free" | "starter" | "pro" | "business";

  await supabase
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", documentId);

  try {
    const download = await supabase.storage.from("documents").download(document.storage_path);
    if (download.error || !download.data) {
      throw new ExtractionError("The stored file could not be read.");
    }
    const bytes = new Uint8Array(await download.data.arrayBuffer());

    // Enforce usage limits before completing processing
    await assertCanUploadDocument(supabase, userId, plan, document.file_size);

    const extractor = resolveExtractor(document.original_name, document.mime_type);
    const extraction = await extractor.extract({
      bytes,
      name: document.original_name,
      mimeType: document.mime_type,
    });

    // Check page count limit
    if (extraction.pageCount !== null) {
      await assertDocumentPageCount(extraction.pageCount, plan);
    }

    const chunks = chunkBlocks(extraction.blocks);
    if (!chunks.length) {
      throw new ExtractionError("No readable text could be extracted from this document.");
    }

    const fullText = chunks.map((c) => c.content).join("\n\n");
    const headings = Array.from(
      new Set(chunks.map((c) => c.heading).filter((h): h is string => Boolean(h))),
    ).slice(0, 60);

    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    for (let i = 0; i < chunks.length; i += 100) {
      const batch = chunks.slice(i, i + 100).map((chunk) => ({
        document_id: documentId,
        user_id: userId,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        page_number: chunk.pageNumber,
        heading: chunk.heading,
        token_estimate: chunk.tokenEstimate,
      }));
      const { error: insertError } = await supabase.from("document_chunks").insert(batch);
      if (insertError) throw new Error(insertError.message);
    }

    const wordCount = countWords(fullText);

    await supabase
      .from("documents")
      .update({
        status: "ready",
        page_count: extraction.pageCount,
        chunk_count: chunks.length,
        char_count: fullText.length,
        word_count: wordCount,
        extractor: extraction.extractor,
        processed_at: new Date().toISOString(),
        error_message: null,
        metadata: { headings, hasOcr: extraction.extractor.includes("ocr") } as never,
      })
      .eq("id", documentId);

    await recordUsage({
      userId,
      eventType: "document_processed",
      documentId,
      promptTokens: extraction.promptTokens ?? 0,
      completionTokens: extraction.completionTokens ?? 0,
      model: extraction.model ?? null,
      metadata: { extractor: extraction.extractor, chunks: chunks.length },
    });

    return {
      documentId,
      status: "ready",
      pageCount: extraction.pageCount,
      chunkCount: chunks.length,
      wordCount,
    };
  } catch (error) {
    const message =
      error instanceof ExtractionError
        ? error.message
        : "Processing failed unexpectedly. Please try uploading the file again.";
    if (!(error instanceof ExtractionError)) console.error("processDocument failed", error);

    await supabase
      .from("documents")
      .update({ status: "failed", error_message: message })
      .eq("id", documentId);

    return { documentId, status: "failed", pageCount: null, chunkCount: 0, wordCount: 0, error: message };
  }
}

export async function deleteDocument(
  supabase: SupabaseClient<Database>,
  documentId: string,
): Promise<void> {
  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) return;

  await supabase.storage.from("documents").remove([document.storage_path]);
  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) throw new Error(error.message);
}
