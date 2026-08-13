/**
 * AI Employees — shared service layer.
 *
 * All 6 employee types (Writing, Business Analyst, HR, Sales, Training, Legal)
 * share this service. Each employee is defined by:
 *   - A system prompt describing their role
 *   - A list of document context modes (what content to pull from documents)
 *   - Specific output format instructions
 *
 * This avoids duplicating retrieval logic, AI calls, and usage tracking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ChatMessage } from "@/lib/ai/provider.server";
import { getAiProvider } from "@/lib/ai/provider.server";
import { recordUsage } from "@/lib/usage.server";
import { assertAiRateLimit } from "@/lib/usage.server";

export type EmployeeType =
  | "writing"
  | "business_analyst"
  | "hr"
  | "sales"
  | "training"
  | "legal";

export type EmployeeResult = {
  answer: string;
  citations: EmployeeCitation[];
  promptTokens: number;
  completionTokens: number;
  model: string;
  conversationId?: string;
};

export type EmployeeCitation = {
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
};

// ------------------------------------------------------------------ //
// Employee definitions                                                //
// ------------------------------------------------------------------ //

const MAX_CONTEXT_CHARS = 24_000;

const EMPLOYEE_SYSTEM_PROMPTS: Record<EmployeeType, string> = {
  writing: `You are OmniParse Writing Employee — an expert business writer.
You help users create professional documents by drawing from their uploaded files for context, tone, and content.
Rules:
1. Answer ONLY from the supplied document excerpts. Never invent facts, names, or figures.
2. If the excerpts do not contain the information needed, say plainly what you need and suggest uploading relevant documents.
3. Cite sources inline after each factual claim using the format [DocName p.N].
4. Output clean, professionally formatted text. Use headings, bullet points, and numbered lists where appropriate.
5. When rewriting existing content, preserve the original meaning and improve clarity and professionalism.
6. Clearly separate sections with headers.`,
  business_analyst: `You are OmniParse Business Analyst Employee — an expert at synthesising business documents into actionable intelligence.
You produce executive summaries, SWOT analyses, strategic insights, and action plans from uploaded documents.
Rules:
1. Answer ONLY from the supplied document excerpts. Never invent business data.
2. Cite sources using [DocName p.N] after each factual claim.
3. Be concise and direct. Executives prefer bullet points over paragraphs.
4. Structure SWOT as: Strengths, Weaknesses, Opportunities, Threats — with specific evidence from documents.
5. Action plans must have numbered steps with owners and deadlines where stated.`,
  hr: `You are OmniParse HR Employee — an expert in human resources documents, onboarding, and people operations.
You help analyse HR policies, create onboarding materials, training guides, and interview questions.
Rules:
1. Answer ONLY from the supplied HR document excerpts. Never invent company policies or procedures.
2. Cite sources using [DocName p.N] after each factual claim.
3. Be clear, inclusive, and professional. HR content affects people directly.
4. For interview questions, provide a mix of behavioural and situational questions.
5. Training guides should have clear steps, be easy to follow, and include key dates/responsibilities where available.`,
  sales: `You are OmniParse Sales Employee — an expert at analysing client documents, creating proposals, and generating sales communications.
You help create proposals, meeting summaries, sales emails, and presentation outlines from client documents.
Rules:
1. Answer ONLY from the supplied client document excerpts. Never invent client details or requirements.
2. Cite sources using [DocName p.N] after each factual claim.
3. Be persuasive but honest. Don't overstate what the client needs or what you can deliver.
4. Proposals should be structured with: situation, solution, pricing (if available), timeline, next steps.
5. Sales emails should be concise, personalised, and have a clear call to action.`,
  training: `You are OmniParse Training Employee — an expert at creating educational materials from documents.
You produce quizzes, flashcards, training guides, and study questions.
Rules:
1. Answer ONLY from the supplied document excerpts. Never invent content for quizzes.
2. Cite sources using [DocName p.N] after each quiz question's answer.
3. Quizzes should cover key concepts, important facts, and actionable items from the source material.
4. Flashcards should have a clear question/stimulus on one side and the answer on the other.
5. Training guides should break complex processes into clear, numbered steps.
6. Vary question types: multiple choice, true/false, short answer.`,
  legal: `You are OmniParse Legal Document Assistant — an expert at analysing contracts and legal documents.
IMPORTANT DISCLAIMER: You do NOT provide legal advice. You explain what documents say in plain language and help find relevant clauses, dates, and terms. Consult a qualified attorney for legal decisions.
Tasks you help with:
- Comparing contract versions
- Finding important clauses
- Identifying key dates and deadlines
- Explaining contract language in plain terms
Rules:
1. Answer ONLY from the supplied document excerpts. Never interpret or advise beyond what the document says.
2. Always include the disclaimer when providing explanations: "I am not a lawyer and this does not constitute legal advice."
3. Cite sources using [DocName p.N] after each clause or term you reference.
4. Be precise. Legal language matters — preserve the original wording where relevant.
5. Clearly flag missing information: if a deadline, party, or term is not in the document, say so explicitly.`,
};

const EMPLOYEE_TASK_PROMPTS: Record<EmployeeType, string> = {
  writing: "Create the requested document based on the context provided. Use the uploaded documents as your source material for facts, figures, names, and tone.",
  business_analyst: "Produce the requested analysis based on the uploaded business documents.",
  hr: "Create the requested HR material based on the uploaded HR or company documents.",
  sales: "Create the requested sales document based on the uploaded client documents.",
  training: "Create the requested training material based on the uploaded source documents.",
  legal: "Complete the requested legal document task based on the uploaded contract or legal document.",
};

// ------------------------------------------------------------------ //
// Context retrieval                                                    //
// ------------------------------------------------------------------ //

type ChunkRow = {
  document_id: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
};

async function retrieveContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  documentIds: string[],
  query: string,
  mode: EmployeeType,
  pageCountLimit: number,
): Promise<{ contextBlocks: string[]; citations: EmployeeCitation[] }> {
  // Try semantic search first
  const searchResults = await supabase.rpc("search_document_chunks", {
    _document_ids: documentIds,
    _query: query.slice(0, 400),
    _limit: 14,
  });

  let chunks: ChunkRow[] = [];
  if (!searchResults.error && searchResults.data?.length) {
    chunks = searchResults.data;
  }

  // Fallback to opening chunks
  if (!chunks.length) {
    for (const docId of documentIds) {
      const { data } = await supabase
        .from("document_chunks")
        .select("document_id, chunk_index, content, page_number, heading")
        .eq("document_id", docId)
        .order("chunk_index", { ascending: true })
        .limit(4);
      chunks.push(...(data ?? []).map((r) => ({
        document_id: r.document_id,
        chunk_index: r.chunk_index,
        content: r.content,
        page_number: r.page_number,
        heading: r.heading,
      })));
    }
  }

  // Fetch document names
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, page_count")
    .in("id", documentIds);

  const docMap = new Map((docs ?? []).map((d) => [d.id, d]));
  const labelOf = new Map<string, string>();
  documentIds.forEach((id, i) => labelOf.set(id, `D${i + 1}`));

  const contextBlocks: string[] = [];
  const citations: EmployeeCitation[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const doc = docMap.get(chunk.document_id);
    if (!doc) continue;

    // Skip if over page limit
    if (pageCountLimit && doc.page_count && doc.page_count > pageCountLimit) continue;

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
    });
  }

  return { contextBlocks, citations };
}

// ------------------------------------------------------------------ //
// Main employee handler                                               //
// ------------------------------------------------------------------ //

export type AskEmployeeInput = {
  userId: string;
  supabase: SupabaseClient<Database>;
  employeeType: EmployeeType;
  task: string; // e.g. "Write a formal email to the client" or "Create a SWOT analysis"
  documentIds: string[];
  conversationId?: string | null;
  workspaceId?: string | null;
};

export async function askEmployee(input: AskEmployeeInput): Promise<EmployeeResult> {
  const { userId, supabase, employeeType, task, documentIds, conversationId: existingConvId, workspaceId } = input;
  await assertAiRateLimit(supabase, userId);

  // Get plan for page limit enforcement
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  const plan = (sub?.plan ?? "free") as string;
  const pageLimits: Record<string, number> = { free: 20, starter: 50, pro: 200, business: 500 };
  const pageCountLimit = pageLimits[plan] ?? 20;

  // Verify documents exist and are ready
  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, status, page_count")
    .in("id", documentIds);
  const readyDocs = (docs ?? []).filter((d) => d.status === "ready");
  if (!readyDocs.length) {
    throw new Error("No processed documents are available for this task.");
  }

  const readyDocIds = readyDocs.map((d) => d.id);
  const docIndex = readyDocs
    .map((d, i) => `D${i + 1} = "${d.name}"${d.page_count ? ` (${d.page_count} pages)` : ""}`)
    .join("\n");

  const { contextBlocks, citations } = await retrieveContext(
    supabase,
    userId,
    readyDocIds,
    task,
    employeeType,
    pageCountLimit,
  );

  if (!contextBlocks.length) {
    throw new Error("No readable content found in the selected documents.");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: EMPLOYEE_SYSTEM_PROMPTS[employeeType] },
    {
      role: "system",
      content: `Documents in scope:\n${docIndex}\n\nRelevant excerpts:\n\n${contextBlocks.join("\n\n---\n\n")}`,
    },
    {
      role: "user",
      content: `${EMPLOYEE_TASK_PROMPTS[employeeType]}\n\nTask: ${task}`,
    },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  // Ensure conversation
  const convId = await ensureEmployeeConversation(supabase, userId, {
    conversationId: existingConvId,
    workspaceId,
    title: task.slice(0, 70) + (task.length > 70 ? "…" : ""),
    documentIds: readyDocIds,
  });

  // Save messages
  await supabase.from("messages").insert({
    conversation_id: convId,
    user_id: userId,
    role: "user",
    content: task,
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
    .update({ last_message_at: new Date().toISOString(), document_ids: readyDocIds })
    .eq("id", convId);

  // Track usage
  await recordUsage({
    userId,
    eventType: "ai_request",
    conversationId: convId,
    documentId: readyDocIds[0] ?? null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { employeeType, messageId: task.slice(0, 80) },
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
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    conversationId: convId,
  };
}

async function ensureEmployeeConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    conversationId?: string | null;
    workspaceId?: string | null;
    title: string;
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

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      workspace_id: input.workspaceId ?? null,
      title: input.title,
      document_ids: input.documentIds,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

function dedupeCitations(citations: EmployeeCitation[]): EmployeeCitation[] {
  const seen = new Set<string>();
  const out: EmployeeCitation[] = [];
  for (const c of citations) {
    const key = `${c.documentId}:${c.page ?? "-"}:${c.heading ?? "-"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, 10);
}
