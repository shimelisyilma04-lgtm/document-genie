import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, MessagesSquare, Quote, Trash2, User } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations, useDeleteConversation, useMessages } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({
    meta: [
      { title: "Conversations — OmniParse AI" },
      {
        name: "description",
        content: "Revisit every analyst conversation and the citations behind each answer.",
      },
      { property: "og:title", content: "Conversations — OmniParse AI" },
      { property: "og:description", content: "Your document Q&A history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConversationsPage,
});

type Citation = { documentName: string; page: number | null; heading: string | null };

function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Citation =>
      typeof item === "object" && item !== null && "documentName" in item,
  );
}

function ConversationsPage() {
  const conversations = useConversations();
  const deleteConversation = useDeleteConversation();
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? conversations.data?.[0]?.id ?? null;
  const messages = useMessages(activeId);

  return (
    <AppShell title="Conversations" description="Every question you've asked, with its sources.">
      {conversations.isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : conversations.data?.length === 0 ? (
        <div className="surface-panel p-10 text-center">
          <MessagesSquare className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No conversations yet. Open a ready document and ask the analyst something.
          </p>
          <Button asChild variant="gold" size="sm" className="mt-4">
            <Link to="/documents">Go to documents</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="surface-panel divide-y divide-border">
            {conversations.data?.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "flex items-start gap-2 p-4",
                  conversation.id === activeId && "bg-accent/60",
                )}
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelected(conversation.id)}
                >
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {conversation.document_ids.length} document
                    {conversation.document_ids.length === 1 ? "" : "s"} ·{" "}
                    {new Date(conversation.updated_at).toLocaleDateString()}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label="Delete conversation"
                  onClick={() => {
                    if (!window.confirm("Delete this conversation?")) return;
                    deleteConversation.mutate(conversation.id, {
                      onSuccess: () => {
                        toast.success("Conversation deleted.");
                        if (conversation.id === activeId) setSelected(null);
                      },
                      onError: (error) =>
                        toast.error(error instanceof Error ? error.message : "Delete failed."),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="surface-panel space-y-5 p-5">
            {messages.isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
            {messages.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">This conversation has no messages.</p>
            )}
            {messages.data?.map((message) => {
              const isUser = message.role === "user";
              const citations = parseCitations(message.citations);
              return (
                <div key={message.id} className={cn("flex gap-3", isUser && "justify-end")}>
                  {!isUser && (
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-ink text-gold">
                      <Bot className="size-4" />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                      isUser
                        ? "bg-ink text-ink-foreground"
                        : "border border-border bg-canvas text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {citations.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                        {citations.map((citation, index) => (
                          <p
                            key={`${citation.documentName}-${index}`}
                            className="flex items-start gap-1.5 text-xs text-muted-foreground"
                          >
                            <Quote className="mt-0.5 size-3 shrink-0 text-gold" />
                            <span>
                              {citation.documentName}
                              {citation.page ? ` · page ${citation.page}` : ""}
                              {citation.heading ? ` · ${citation.heading}` : ""}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {isUser && (
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <User className="size-4" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
