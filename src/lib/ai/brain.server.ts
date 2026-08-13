/**
 * Company Brain — cross-document AI search and analysis.
 *
 * Allows users to:
 * - Search across all their documents (company brain search)
 * - Ask questions across multiple documents
 * - Compare documents to find differences
 * - Extract dates, numbers, names from all documents
 * - Generate insights from multiple documents
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ChatMessage } from "@/lib/ai/provider.server";
import { getAiProvider } from "@/lib/ai/provider.server";
import { recordUsage } from "@/lib/usage.server";
import { assertAiRateLimit } from "@/lib/usage.server";

export type BrainSearchResult = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  heading: string | null;
  rank: number;
};

const MAX_CONTEXT_CHARS = 22_000;

export async function searchCompanyBrain(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string,
  limit = 12,
): Promise<BrainSearchResult[]> {
  const { data, error } = await supabase.rpc("search_company_brain", {
    _user_id: userId,
    _query: query.slice(0, 400),
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BrainSearchResult[];
}

export async function askCompanyBrain(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    question: string;
    documentIds?: string[];       // if empty, searches all user docs
    conversationId?: string | null;
    workspaceId?: string | null;
  },
): Promise<{
  answer: string;
  citations: BrainCitation[];
  conversationId: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}> {
  await assertAiRateLimit(supabase, userId);

  const { question, documentIds, conversationId, workspaceId } = input;

  // Get all ready docs for this user (or specific docs if provided)
  let query = supabase
    .from("documents")
    .select("id, name, status, page_count, workspace_id")
    .eq("status", "ready");

  if (documentIds?.length) {
    query = query.in("id", documentIds);
  }

  const { data: docs } = await query;
  const readyDocs = (docs ?? []).filter((d) => d.status === "ready");
  if (!readyDocs.length) {
    throw new Error("No processed documents available for this question.");
  }

  const docIds = readyDocs.map((d) => d.id);

  // Search for relevant chunks
  const searchResults = await searchCompanyBrain(supabase, userId, question, 14);

  // Fallback to opening chunks
  let contextBlocks: string[] = [];
  let citations: BrainCitation[] = [];
  let usedChars = 0;

  if (searchResults.length) {
    const labelOf = new Map<string, string>();
    readyDocs.forEach((d, i) => labelOf.set(d.id, `D${i + 1}`));

    for (const chunk of searchResults) {
      const doc = readyDocs.find((d) => d.id === chunk.documentId);
      if (!doc) continue;
      const label = `${labelOf.get(chunk.documentId)}${chunk.pageNumber ? ` p.${chunk.pageNumber}` : ""}`;
      const header = `[${label}] ${doc.name}${chunk.heading ? ` — ${chunk.heading}` : ""}`;
      const block = `${header}\n${chunk.content}`;
      if (usedChars + block.length > MAX_CONTEXT_CHARS) break;
      usedChars += block.length;
      contextBlocks.push(block);
      citations.push({
        documentId: chunk.documentId,
        documentName: doc.name,
        page: chunk.pageNumber,
        heading: chunk.heading,
      });
    }
  }

  // Fallback: opening chunks
  if (!contextBlocks.length) {
    const labelOf = new Map<string, string>();
    readyDocs.forEach((d, i) => labelOf.set(d.id, `D${i + 1}`));

    for (const doc of readyDocs) {
      const { data: chunks } = await supabase
        .from("document_chunks")
        .select("document_id, chunk_index, content, page_number, heading")
        .eq("document_id", doc.id)
        .order("chunk_index", { ascending: true })
        .limit(3);
      for (const chunk of chunks ?? []) {
        const label = `${labelOf.get(doc.id)}${chunk.page_number ? ` p.${chunk.page_number}` : ""}`;
        const header = `[${label}] ${doc.name}`;
        const block = `${header}\n${chunk.content}`;
        if (usedChars + block.length > MAX_CONTEXT_CHARS) break;
        usedChars += block.length;
        contextBlocks.push(block);
        citations.push({
          documentId: doc.id,
          documentName: doc.name,
          page: chunk.page_number,
          heading: chunk.heading,
        });
      }
    }
  }

  const docIndex = readyDocs
    .map((d, i) => `D${i + 1} = "${d.name}"${d.page_count ? ` (${d.page_count} pages)` : ""}`)
    .join("\n");

  // Ensure conversation
  const convId = await ensureConversation(supabase, userId, {
    conversationId,
    workspaceId,
    question,
    documentIds: docIds,
  });

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are OmniParse Company Brain — an AI assistant that searches across multiple documents in a workspace to answer questions comprehensively.

Rules:
1. Answer ONLY from the supplied document excerpts. Never use outside knowledge.
2. If the information is not in any document, say so clearly and suggest what documents might contain it.
3. Cite sources using the [D# p.N] format. Cite after each factual claim.
4. When comparing documents or finding differences, be explicit about what differs and quote relevant text.
5. When asked for dates, numbers, or names, list them all with citations.
6. Be thorough — search the full context before answering.`,
    },
    {
      role: "system",
      content: `Documents in scope:\n${docIndex}\n\nRelevant excerpts:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
    { role: "user", content: question },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  // Save messages
  await supabase.from("messages").insert({
    conversation_id: convId,
    user_id: userId,
    role: "user",
    content: question,
  });
  await supabase.from("messages").insert({
    conversation_id: convId,
    user_id: userId,
    role: "assistant",
    content: result.text,
    citations: dedupeCitations(citations) as never,
    model: result.model,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), document_ids: docIds })
    .eq("id", convId);

  await recordUsage({
    userId,
    eventType: "ai_request",
    conversationId: convId,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { mode: "company_brain", chunks: contextBlocks.length },
  });

  await recordUsage({
    userId,
    eventType: "tokens_consumed",
    quantity: result.promptTokens + result.completionTokens,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  });

  return {
    answer: result.text,
    citations: dedupeCitations(citations),
    conversationId: convId,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  };
}

export type BrainCitation = {
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
};

async function ensureConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    conversationId?: string | null;
    workspaceId?: string | null;
    question: string;
    documentIds: string[];
  },
): Promise<string> {
  if (input.conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (data) return data.id;
  }

  const title = input.question.slice(0, 70) + (input.question.length > 70 ? "…" : "");
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

function dedupeCitations(citations: BrainCitation[]): BrainCitation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = `${c.documentId}:${c.page ?? "-"}:${c.heading ?? "-"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}
