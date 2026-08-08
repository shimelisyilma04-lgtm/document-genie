import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/* ------------------------------- profile -------------------------------- */

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () =>
      unwrap(await supabase.from("profiles").select("*").maybeSingle()) as Profile | null,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { full_name?: string; company?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in.");
      return unwrap(
        await supabase.from("profiles").update(values).eq("id", auth.user.id).select("*").single(),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () =>
      unwrap(await supabase.from("subscriptions").select("*").maybeSingle()) as Subscription | null,
  });
}

/* ------------------------------ workspaces ------------------------------ */

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("workspaces")
          .select("*")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true }),
      ) as Workspace[],
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; color?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in.");
      return unwrap(
        await supabase
          .from("workspaces")
          .insert({
            user_id: auth.user.id,
            name: values.name,
            description: values.description ?? null,
            color: values.color ?? "amber",
          })
          .select("*")
          .single(),
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; description?: string }) =>
      unwrap(await supabase.from("workspaces").update(values).eq("id", id).select("*").single()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workspaces").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

/* ------------------------------- documents ------------------------------ */

export function useDocuments(options: { workspaceId?: string | null; limit?: number } = {}) {
  const { workspaceId, limit } = options;
  return useQuery({
    queryKey: ["documents", workspaceId ?? "all", limit ?? "all"],
    queryFn: async () => {
      let query = supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (workspaceId) query = query.eq("workspace_id", workspaceId);
      if (limit) query = query.limit(limit);
      return unwrap(await query) as DocumentRow[];
    },
    refetchInterval: (query) => {
      const rows = query.state.data as DocumentRow[] | undefined;
      const pending = rows?.some((d) => d.status === "processing" || d.status === "uploading");
      return pending ? 3000 : false;
    },
  });
}

export function useDocument(documentId: string) {
  return useQuery({
    queryKey: ["document", documentId],
    queryFn: async () =>
      unwrap(
        await supabase.from("documents").select("*").eq("id", documentId).maybeSingle(),
      ) as DocumentRow | null,
    refetchInterval: (query) => {
      const row = query.state.data as DocumentRow | null | undefined;
      return row && (row.status === "processing" || row.status === "uploading") ? 2500 : false;
    },
  });
}

export function useDocumentChunks(documentId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["chunks", documentId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("document_chunks")
          .select("id, chunk_index, content, page_number, heading")
          .eq("document_id", documentId)
          .order("chunk_index", { ascending: true }),
      ),
  });
}

export function useSignedDocumentUrl(document: DocumentRow | null | undefined) {
  return useQuery({
    enabled: Boolean(document),
    queryKey: ["signed-url", document?.id],
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      if (!document) return null;
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.storage_path, 300);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
  });
}

/* ----------------------------- conversations ---------------------------- */

export function useConversations(limit?: number) {
  return useQuery({
    queryKey: ["conversations", limit ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      if (limit) query = query.limit(limit);
      return unwrap(await query) as Conversation[];
    },
  });
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () =>
      unwrap(
        await supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
      ) as Conversation | null,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    enabled: Boolean(conversationId),
    queryKey: ["messages", conversationId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId!)
          .order("created_at", { ascending: true }),
      ) as Message[],
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conversations").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

/* --------------------------------- usage -------------------------------- */

export type UsageSummary = {
  aiRequests: number;
  documentsProcessed: number;
  promptTokens: number;
  completionTokens: number;
  daily: { date: string; requests: number; tokens: number }[];
};

export function useUsageSummary(days = 30) {
  return useQuery({
    queryKey: ["usage", days],
    queryFn: async (): Promise<UsageSummary> => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const rows = unwrap(
        await supabase
          .from("usage_events")
          .select("event_type, quantity, prompt_tokens, completion_tokens, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: true }),
      );

      const summary: UsageSummary = {
        aiRequests: 0,
        documentsProcessed: 0,
        promptTokens: 0,
        completionTokens: 0,
        daily: [],
      };
      const byDay = new Map<string, { requests: number; tokens: number }>();

      for (const row of rows ?? []) {
        const date = row.created_at.slice(0, 10);
        const bucket = byDay.get(date) ?? { requests: 0, tokens: 0 };
        if (row.event_type === "ai_request") {
          summary.aiRequests += 1;
          bucket.requests += 1;
        }
        if (row.event_type === "document_processed") summary.documentsProcessed += 1;
        if (row.event_type === "tokens_consumed") {
          summary.promptTokens += row.prompt_tokens;
          summary.completionTokens += row.completion_tokens;
          bucket.tokens += row.prompt_tokens + row.completion_tokens;
        }
        byDay.set(date, bucket);
      }

      summary.daily = Array.from(byDay.entries()).map(([date, value]) => ({ date, ...value }));
      return summary;
    },
  });
}
