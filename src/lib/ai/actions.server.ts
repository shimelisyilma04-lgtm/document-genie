/**
 * Document actions — rewrite, translate, export.
 *
 * These transform existing document content using Gemini AI.
 * All use document chunks as context (never the full document at once).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ChatMessage } from "@/lib/ai/provider.server";
import { getAiProvider } from "@/lib/ai/provider.server";
import { assertAiRateLimit } from "@/lib/usage.server";
import { recordUsage } from "@/lib/usage.server";

export type TranslationLanguage =
  | "english"
  | "amharic"
  | "french"
  | "spanish"
  | "arabic";

export const TRANSLATION_LANGUAGES: { value: TranslationLanguage; label: string }[] = [
  { value: "english", label: "English" },
  { value: "amharic", label: "Amharic" },
  { value: "french", label: "French" },
  { value: "spanish", label: "Spanish" },
  { value: "arabic", label: "Arabic" },
];

const MAX_CHARS = 20_000;

// ------------------------------------------------------------------ //
// Rewrite                                                              //
// ------------------------------------------------------------------ //

export type RewriteInput = {
  userId: string;
  supabase: SupabaseClient<Database>;
  documentIds: string[];
  instruction: string; // e.g. "Make it more formal" or "Simplify the language"
};

export async function rewriteDocument(input: RewriteInput): Promise<string> {
  const { userId, supabase, documentIds, instruction } = input;
  await assertAiRateLimit(supabase, userId);

  const { contextBlocks, docs } = await getDocumentContext(supabase, documentIds, "rewrite content");
  if (!contextBlocks.length) throw new Error("No readable content found.");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a professional document editor. Rewrite the provided document content according to the user's instruction.
Rules:
1. Keep all factual information, names, dates, and figures exactly as they appear.
2. Only change the wording, tone, and structure as instructed.
3. Preserve the document's structure with headings and sections.
4. Output ONLY the rewritten text — no preamble or explanation.`,
    },
    {
      role: "system",
      content: `Document content to rewrite:\n\n${contextBlocks.join("\n\n---\n\n")}\n\nUser instruction: ${instruction}`,
    },
    { role: "user", content: `Please rewrite this document. Instruction: ${instruction}` },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await recordUsage({
    userId,
    eventType: "ai_request",
    documentId: documentIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { action: "rewrite", instruction },
  });

  return result.text;
}

// ------------------------------------------------------------------ //
// Translation                                                          //
// ------------------------------------------------------------------ //

export type TranslateInput = {
  userId: string;
  supabase: SupabaseClient<Database>;
  documentIds: string[];
  targetLanguage: TranslationLanguage;
};

const TRANSLATION_SYSTEM_PROMPTS: Record<TranslationLanguage, string> = {
  english:
    "You are a professional translator. Translate the provided document into English. Preserve all headings, structure, and formatting. Preserve factual content exactly. Output only the translation.",
  amharic:
    "You are a professional translator. Translate the provided document into Amharic. Preserve all headings, structure, and formatting. Preserve factual content exactly. Output only the translation.",
  french:
    "You are a professional translator. Translate the provided document into French. Preserve all headings, structure, and formatting. Preserve factual content exactly. Output only the translation.",
  spanish:
    "You are a professional translator. Translate the provided document into Spanish. Preserve all headings, structure, and formatting. Preserve factual content exactly. Output only the translation.",
  arabic:
    "You are a professional translator. Translate the provided document into Arabic. Preserve all headings, structure, and formatting. Preserve factual content exactly. Output only the translation.",
};

export async function translateDocument(input: TranslateInput): Promise<string> {
  const { userId, supabase, documentIds, targetLanguage } = input;
  await assertAiRateLimit(supabase, userId);

  const { contextBlocks, docs } = await getDocumentContext(supabase, documentIds, "translate content");
  if (!contextBlocks.length) throw new Error("No readable content found.");

  const messages: ChatMessage[] = [
    { role: "system", content: TRANSLATION_SYSTEM_PROMPTS[targetLanguage] },
    {
      role: "user",
      content: `Translate the following document into ${targetLanguage}:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await recordUsage({
    userId,
    eventType: "ai_request",
    documentId: documentIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { action: "translate", targetLanguage },
  });

  return result.text;
}

// ------------------------------------------------------------------ //
// FAQ generation                                                       //
// ------------------------------------------------------------------ //

export type GenerateFaqInput = {
  userId: string;
  supabase: SupabaseClient<Database>;
  documentIds: string[];
};

export async function generateFaq(input: GenerateFaqInput): Promise<string> {
  const { userId, supabase, documentIds } = input;
  await assertAiRateLimit(supabase, userId);

  const { contextBlocks } = await getDocumentContext(supabase, documentIds, "generate FAQ questions");
  if (!contextBlocks.length) throw new Error("No readable content found.");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are an expert at creating clear FAQs from documents.
Rules:
1. Create questions a reader would actually ask, based only on the document content.
2. Provide clear, concise answers drawn directly from the document.
3. Cite the source page after each answer using [DocName p.N].
4. Format as: Q: ... / A: ... with a blank line between entries.
5. Group related questions under headings if appropriate.`,
    },
    {
      role: "user",
      content: `Generate an FAQ from the following document content:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await recordUsage({
    userId,
    eventType: "ai_request",
    documentId: documentIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { action: "faq" },
  });

  return result.text;
}

// ------------------------------------------------------------------ //
// Quiz generation                                                      //
// ------------------------------------------------------------------ //

export type GenerateQuizInput = {
  userId: string;
  supabase: SupabaseClient<Database>;
  documentIds: string[];
  questionCount?: number;
};

export async function generateQuiz(input: GenerateQuizInput): Promise<string> {
  const { userId, supabase, documentIds, questionCount = 10 } = input;
  await assertAiRateLimit(supabase, userId);

  const { contextBlocks } = await getDocumentContext(supabase, documentIds, "generate quiz questions");
  if (!contextBlocks.length) throw new Error("No readable content found.");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are an expert at creating educational quizzes from documents.
Rules:
1. Create exactly ${questionCount} questions based ONLY on the document content.
2. Include a mix of: multiple choice, true/false, and short answer questions.
3. Each question must have an answer key at the end.
4. Cite the source using [DocName p.N] after each correct answer.
5. Format clearly with numbered questions.`,
    },
    {
      role: "user",
      content: `Create a ${questionCount}-question quiz from the following document:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await recordUsage({
    userId,
    eventType: "ai_request",
    documentId: documentIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { action: "quiz", questionCount },
  });

  return result.text;
}

// ------------------------------------------------------------------ //
// Helpers                                                              //
// ------------------------------------------------------------------ //

async function getDocumentContext(
  supabase: SupabaseClient<Database>,
  documentIds: string[],
  query: string,
): Promise<{ contextBlocks: string[]; docs: Array<{ id: string; name: string }> }> {
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name")
    .in("id", documentIds)
    .eq("status", "ready");

  const readyDocs = docs ?? [];
  if (!readyDocs.length) return { contextBlocks: [], docs: [] };

  const docIds = readyDocs.map((d) => d.id);
  const { data: searchData } = await supabase.rpc("search_document_chunks", {
    _document_ids: docIds,
    _query: query.slice(0, 300),
    _limit: 12,
  });

  let chunks: Array<{
    document_id: string;
    content: string;
    page_number: number | null;
    heading: string | null;
  }> = [];

  if (searchData?.length) {
    chunks = searchData;
  } else {
    for (const docId of docIds) {
      const { data } = await supabase
        .from("document_chunks")
        .select("document_id, content, page_number, heading")
        .eq("document_id", docId)
        .order("chunk_index", { ascending: true })
        .limit(8);
      chunks.push(...(data ?? []));
    }
  }

  const labelOf = new Map<string, string>();
  readyDocs.forEach((d, i) => labelOf.set(d.id, `D${i + 1}`));

  const contextBlocks: string[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const doc = readyDocs.find((d) => d.id === chunk.document_id);
    if (!doc) continue;
    const label = `${labelOf.get(chunk.document_id)}${chunk.page_number ? ` p.${chunk.page_number}` : ""}`;
    const block = `[${label}] ${doc.name}${chunk.heading ? ` — ${chunk.heading}` : ""}\n${chunk.content}`;
    if (usedChars + block.length > MAX_CHARS) break;
    usedChars += block.length;
    contextBlocks.push(block);
  }

  return { contextBlocks, docs: readyDocs };
}

// ------------------------------------------------------------------ //
// Export helpers                                                       //
// ------------------------------------------------------------------ //

export function exportAsTxt(text: string, filename: string): string {
  return text;
}

export function exportAsMarkdown(text: string, title: string): string {
  return `# ${title}\n\n${text}`;
}

export function formatExportContent(
  text: string,
  format: "txt" | "markdown" | "pdf",
  filename: string,
): { content: string; mimeType: string } {
  switch (format) {
    case "txt":
      return { content: text, mimeType: "text/plain" };
    case "markdown":
      return { content: exportAsMarkdown(text, filename), mimeType: "text/markdown" };
    case "pdf":
      // PDF generation would require a library; return as text for now
      // The UI will handle PDF generation client-side or via API
      return { content: text, mimeType: "text/plain" };
    default:
      return { content: text, mimeType: "text/plain" };
  }
}
