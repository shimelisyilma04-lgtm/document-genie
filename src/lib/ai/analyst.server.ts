/**
 * AI Document Analyst (server-only).
 *
 * Retrieval-first: only the chunks relevant to the question are sent to the
 * model, with page/section labels so answers can cite their source.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { getAiProvider, type ChatMessage } from "./provider.server";
import { assertAiRateLimit, recordUsage } from "../usage.server";

import { type AnalystMode } from "./modes";

export type { AnalystMode };

export type Citation = {
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
  chunkIndex: number;
};

export type AnalystAnswer = {
  conversationId: string;
  answer: string;
  citations: Citation[];
  promptTokens: number;
  completionTokens: number;
  model: string;
};

const MAX_CONTEXT_CHUNKS = 14;
const MAX_CONTEXT_CHARS = 22_000;

const SYSTEM_PROMPT = `You are the OmniParse AI Document Analyst, a precise business document assistant.

Rules you must always follow:
1. Answer ONLY from the supplied document excerpts. Never use outside knowledge or guesses.
2. If the excerpts do not contain the answer, say plainly: "I couldn't find that in the documents provided." Then suggest what to look for or upload. Never invent facts, numbers, names or dates.
3. Cite your sources inline using the excerpt labels exactly as given, e.g. [D1 p.4]. Cite after each claim that comes from a document.
4. Be concise and businesslike. Use short paragraphs, bullet lists and bold labels where it helps scanning.
5. Quote exact figures, names and dates verbatim from the excerpts.
6. When several documents are supplied, make clear which document each finding comes from.`;

const MODE_INSTRUCTIONS: Record<AnalystMode, string> = {
  chat: "",
  summarize:
    "Produce an executive summary: a 2-3 sentence overview, then bulleted key points grouped by theme, then any obligations, risks or deadlines you can see. Cite pages.",
  key_info:
    "Extract the important structured information you can find: parties and names, organisations, dates and deadlines, monetary amounts and numbers, identifiers/references, and key terms. Present it as grouped bullet lists with citations. Omit any group you cannot find rather than guessing.",
  action_items:
    "Produce a checklist of concrete action items with, where stated, the responsible party and the due date. Use '- [ ] ' prefixes. Add a short 'Open questions' list for anything the document leaves unclear. Cite pages.",
  explain:
    "Explain the requested part in plain language for a non-specialist: what it says, what it means in practice, and why it matters. Keep the original wording as a short quote where useful. Cite pages.",
};

const MODE_FALLBACK_QUERY: Record<AnalystMode, string> = {
  chat: "",
  summarize: "summary overview purpose scope parties terms obligations dates",
  key_info: "name date amount total number reference party address deadline",
  action_items: "must shall required deadline responsible deliver submit payment",
  explain: "definition clause meaning terms conditions",
};

type ChunkRow = {
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
};

export async function askAnalyst(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    question: string;
    documentIds: string[];
    conversationId?: string | null;
    workspaceId?: string | null;
    mode?: AnalystMode;
  },
): Promise<AnalystAnswer> {
  const mode: AnalystMode = input.mode ?? "chat";
  await assertAiRateLimit(supabase, userId);

  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select("id, name, status, page_count")
    .in("id", input.documentIds);

  if (docError) throw new Error(docError.message);
  const readyDocuments = (documents ?? []).filter((d) => d.status === "ready");
  if (!readyDocuments.length) {
    throw new Error("No processed documents are available for this question yet.");
  }

  const documentIds = readyDocuments.map((d) => d.id);
  const labelOf = new Map<string, string>();
  readyDocuments.forEach((doc, index) => labelOf.set(doc.id, `D${index + 1}`));

  const chunks = await retrieveChunks(supabase, documentIds, input.question, mode);
  if (!chunks.length) {
    throw new Error("These documents contain no extracted text to search.");
  }

  const contextBlocks: string[] = [];
  const citations: Citation[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const doc = readyDocuments.find((d) => d.id === chunk.document_id);
    if (!doc) continue;
    const label = `${labelOf.get(chunk.document_id)}${chunk.page_number ? ` p.${chunk.page_number}` : ""}`;
    const header = `[${label}] ${doc.name}${chunk.heading ? ` — ${chunk.heading}` : ""}`;
    const block = `${header}\n${chunk.content}`;
    if (usedChars + block.length > MAX_CONTEXT_CHARS) break;
    usedChars += block.length;
    contextBlocks.push(block);
    citations.push({
      documentId: chunk.document_id,
      documentName: doc.name,
      page: chunk.page_number,
      heading: chunk.heading,
      chunkIndex: chunk.chunk_index,
    });
  }

  const documentIndex = readyDocuments
    .map((doc) => `${labelOf.get(doc.id)} = "${doc.name}"${doc.page_count ? ` (${doc.page_count} pages)` : ""}`)
    .join("\n");

  const conversationId = await ensureConversation(supabase, userId, input, mode);
  const history = await loadHistory(supabase, conversationId);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `Documents in scope:\n${documentIndex}\n\nRelevant excerpts:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
    ...history,
    {
      role: "user",
      content: MODE_INSTRUCTIONS[mode]
        ? `${input.question}\n\nTask style: ${MODE_INSTRUCTIONS[mode]}`
        : input.question,
    },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content: input.question,
  });

  const { data: assistantMessage, error: messageError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: result.text,
      citations: dedupeCitations(citations) as never,
      model: result.model,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
    })
    .select("id")
    .single();

  if (messageError) throw new Error(messageError.message);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), document_ids: documentIds })
    .eq("id", conversationId);

  await recordUsage({
    userId,
    eventType: "ai_request",
    conversationId,
    documentId: documentIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { mode, chunks: contextBlocks.length, messageId: assistantMessage.id },
  });

  await recordUsage({
    userId,
    eventType: "tokens_consumed",
    conversationId,
    quantity: result.promptTokens + result.completionTokens,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  });

  return {
    conversationId,
    answer: result.text,
    citations: dedupeCitations(citations),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  };
}

async function retrieveChunks(
  supabase: SupabaseClient<Database>,
  documentIds: string[],
  question: string,
  mode: AnalystMode,
): Promise<ChunkRow[]> {
  const query = [question, MODE_FALLBACK_QUERY[mode]].filter(Boolean).join(" ").slice(0, 400);

  if (query.trim()) {
    const { data, error } = await supabase.rpc("search_document_chunks", {
      _document_ids: documentIds,
      _query: query,
      _limit: MAX_CONTEXT_CHUNKS,
    });
    if (error) console.error("chunk search failed", error);
    if (data && data.length) {
      return [...data]
        .sort((a, b) => a.document_id.localeCompare(b.document_id) || a.chunk_index - b.chunk_index)
        .map(toChunkRow);
    }
  }

  // Fallback: the opening chunks of each document (covers vague prompts and
  // documents whose wording does not match the question keywords).
  const perDocument = Math.max(2, Math.floor(MAX_CONTEXT_CHUNKS / documentIds.length));
  const collected: ChunkRow[] = [];
  for (const documentId of documentIds) {
    const { data } = await supabase
      .from("document_chunks")
      .select("document_id, chunk_index, content, page_number, heading")
      .eq("document_id", documentId)
      .order("chunk_index", { ascending: true })
      .limit(perDocument);
    collected.push(...(data ?? []).map(toChunkRow));
  }
  return collected;
}

function toChunkRow(row: {
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
}): ChunkRow {
  return {
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    content: row.content,
    page_number: row.page_number,
    heading: row.heading,
  };
}

async function ensureConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { conversationId?: string | null; workspaceId?: string | null; question: string; documentIds: string[] },
  mode: AnalystMode,
): Promise<string> {
  if (input.conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (data) return data.id;
  }

  const title =
    mode === "chat"
      ? input.question.slice(0, 70) + (input.question.length > 70 ? "…" : "")
      : `${mode.replace("_", " ")} · ${new Date().toLocaleDateString()}`;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      workspace_id: input.workspaceId ?? null,
      title,
      document_ids: input.documentIds,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

async function loadHistory(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(6);

  return (data ?? [])
    .reverse()
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content.slice(0, 4000),
    }));
}

function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.documentId}:${citation.page ?? "-"}:${citation.heading ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out.slice(0, 10);
}
