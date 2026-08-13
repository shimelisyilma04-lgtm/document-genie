/**
 * AI Employees — server-only.
 *
 * Each employee type has a specialist system prompt and searches the user's
 * entire document corpus (the "company brain") rather than a single document.
 * Conversations are stored in the existing conversations/messages tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { getAiProvider, type ChatMessage } from "./provider.server";
import { recordUsage } from "../usage.server";
import { assertAiRateLimit } from "../usage.server";

export type AiEmployeeType = Database["public"]["Enums"]["ai_employee"];
export type { AiEmployeeType as EmployeeType };

export const EMPLOYEE_TYPES = [
  "writing",
  "business_analyst",
  "hr",
  "sales",
  "training",
  "legal",
] as const;

export type EmployeeCard = {
  type: AiEmployeeType;
  name: string;
  tagline: string;
  description: string;
  icon: string;
};

export const EMPLOYEE_CATALOG: EmployeeCard[] = [
  {
    type: "writing",
    name: "Writing Assistant",
    tagline: "Drafts, rewrites, and polishes.",
    description:
      "Helps you write emails, reports, proposals, and documentation. Refines tone, structure, and clarity.",
    icon: "✍️",
  },
  {
    type: "business_analyst",
    name: "Business Analyst",
    tagline: "Insights from your data.",
    description:
      "Reviews contracts, financial documents, and business reports. Surfaces risks, opportunities, and key metrics.",
    icon: "📊",
  },
  {
    type: "hr",
    name: "HR Advisor",
    tagline: "Policy, compliance, and people.",
    description:
      "Helps with job descriptions, performance reviews, policy drafts, and HR compliance questions.",
    icon: "👥",
  },
  {
    type: "sales",
    name: "Sales Coach",
    tagline: "Pitch, proposal, and close.",
    description:
      "Assists with sales scripts, client proposals, objection handling, and CRM note summarization.",
    icon: "🤝",
  },
  {
    type: "training",
    name: "Training Designer",
    tagline: "Courses, guides, and quizzes.",
    description:
      "Builds training materials, onboarding guides, quizzes, and presentation outlines from your documents.",
    icon: "🎓",
  },
  {
    type: "legal",
    name: "Legal Reviewer",
    tagline: "Contracts, clauses, and risk.",
    description:
      "Reviews legal documents, highlights concerning clauses, summarises obligations, and flags missing sections.",
    icon: "⚖️",
  },
];

export const EMPLOYEE_NAMES: Record<AiEmployeeType, string> = {
  writing: "Writing Assistant",
  business_analyst: "Business Analyst",
  hr: "HR Advisor",
  sales: "Sales Coach",
  training: "Training Designer",
  legal: "Legal Reviewer",
};

const SYSTEM_PROMPT_TEMPLATE = `You are **{{NAME}}**, a specialist AI employee working inside OmniParse.

Your role: {{ROLE}}

Rules you must always follow:
1. Answer ONLY from the supplied document excerpts. Never use outside knowledge or guess.
2. If the excerpts do not contain the answer, say plainly: "I couldn't find that in your documents." Suggest what to search for instead. Never invent facts, names, numbers, or dates.
3. Cite your sources using document titles and page numbers when available, e.g. [Contract p.3].
4. Be clear, concise, and businesslike. Use bullet points and bold labels where helpful.
5. When several excerpts are relevant, make clear which document each point comes from.
6. If a user asks something outside your specialty, politely redirect to what you can help with based on the available documents.`;

const ROLE_INSTRUCTIONS: Record<AiEmployeeType, string> = {
  writing:
    "Focus on language quality, tone, structure, and clarity. Offer concrete rewrites and alternatives. Flag if the source document doesn't contain enough context for a full draft.",
  business_analyst:
    "Prioritise numbers, trends, obligations, risks, and deadlines. Present findings in structured lists. Flag uncertainty and missing data explicitly.",
  hr:
    "Focus on policy compliance, employee relations, job design, and documentation quality. Flag any potential legal or ethical concerns.",
  sales:
    "Focus on client value propositions, competitive positioning, deal blockers, and next steps. Help turn notes into actionable follow-ups.",
  training:
    "Structure content for learning: clear objectives, step-by-step sections, practical examples, and knowledge-check questions. Flag if source material is too sparse to build a full course.",
  legal:
    "Flag any clause that introduces risk, obligation, or unusual commitment. Use plain language to explain legal implications. Never provide legal advice — frame observations as review notes.",
};

const MAX_CONTEXT_CHUNKS = 12;
const MAX_CONTEXT_CHARS = 20_000;

type BrainChunk = {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
  rank: number;
};

export type EmployeeAnswer = {
  conversationId: string;
  answer: string;
  citations: EmployeeCitation[];
  promptTokens: number;
  completionTokens: number;
  model: string;
};

export type EmployeeCitation = {
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
};

async function searchBrain(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: string,
): Promise<BrainChunk[]> {
  const { data, error } = await supabase.rpc("search_company_brain", {
    _user_id: userId,
    _query: query.slice(0, 400),
    _limit: MAX_CONTEXT_CHUNKS,
  });
  if (error) {
    console.error("company brain search failed", error);
    return [];
  }
  return (data as BrainChunk[]) ?? [];
}

async function ensureConversation(
  supabase: SupabaseClient<Database>,
  userId: string,
  employeeType: AiEmployeeType,
  question: string,
): Promise<string> {
  const title = question.slice(0, 60) + (question.length > 60 ? "…" : "");

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title,
      document_ids: [],
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
    .filter((m: { role: string; content: string }) => m.role !== "system")
    .map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content.slice(0, 4000),
    }));
}

function buildSystemPrompt(employeeType: AiEmployeeType): string {
  const name = EMPLOYEE_NAMES[employeeType];
  return SYSTEM_PROMPT_TEMPLATE
    .replace("{{NAME}}", name)
    .replace("{{ROLE}}", ROLE_INSTRUCTIONS[employeeType]);
}

function buildContextBlocks(chunks: BrainChunk[]): { blocks: string[]; citations: EmployeeCitation[] } {
  const blocks: string[] = [];
  const citations: EmployeeCitation[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const block = `[${chunk.document_name}${chunk.page_number ? ` p.${chunk.page_number}` : ""}${chunk.heading ? ` — ${chunk.heading}` : ""}]\n${chunk.content}`;
    if (usedChars + block.length > MAX_CONTEXT_CHARS) break;
    usedChars += block.length;
    blocks.push(block);
    citations.push({
      documentId: chunk.document_id,
      documentName: chunk.document_name,
      page: chunk.page_number,
      heading: chunk.heading,
    });
  }

  return { blocks, citations };
}

export async function askEmployee(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    question: string;
    employeeType: AiEmployeeType;
    conversationId?: string | null;
  },
): Promise<EmployeeAnswer> {
  await assertAiRateLimit(supabase, userId);

  const chunks = await searchBrain(supabase, userId, input.question);

  const conversationId = input.conversationId
    ? input.conversationId
    : await ensureConversation(supabase, userId, input.employeeType, input.question);

  const history = await loadHistory(supabase, conversationId);

  const { blocks, citations } = buildContextBlocks(chunks);

  const contextIntro =
    chunks.length > 0
      ? `Relevant excerpts from the company brain (${chunks.length} section${chunks.length === 1 ? "" : "s"}):\n\n${blocks.join("\n\n---\n\n")}`
      : "No relevant documents were found for this query.";

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(input.employeeType) },
    { role: "system", content: contextIntro },
    ...history,
    { role: "user", content: input.question },
  ];

  const provider = getAiProvider();
  const result = await provider.chat({ messages });

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    content: input.question,
  });

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "assistant",
    content: result.text,
    citations: citations as never,
    model: result.model,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
  });
  if (msgError) throw new Error(msgError.message);

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  await recordUsage({
    userId,
    eventType: "ai_request",
    conversationId,
    employeeType: input.employeeType,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
    metadata: { employeeType: input.employeeType, chunks: blocks.length },
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
    citations: citations.slice(0, 10),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    model: result.model,
  };
}
