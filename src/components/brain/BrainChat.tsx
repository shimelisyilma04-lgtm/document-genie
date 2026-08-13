import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Bot, CornerDownLeft, Loader2, Quote, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askCompanyBrain } from "@/lib/brain.functions";
import { useMessages } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/queries";

type Citation = {
  documentId: string;
  documentName: string;
  page: number | null;
  heading: string | null;
};

function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Citation =>
      typeof item === "object" && item !== null && "documentId" in item && "documentName" in item,
  );
}

const QUICK_QUESTIONS = [
  "Find all dates and deadlines mentioned",
  "Summarise the key points across all documents",
  "What risks or concerns are mentioned?",
  "Extract all names and contact details",
];

interface BrainChatProps {
  documentIds?: string[];
  workspaceId?: string | null;
}

export function BrainChat({ documentIds = [], workspaceId }: BrainChatProps) {
  const queryClient = useQueryClient();
  const ask = useServerFn(askCompanyBrain);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const messages = useMessages(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || pending) return;
    setPending(true);
    setQuestion("");
    try {
      const result = await ask({
        data: {
          question: trimmed,
          documentIds: documentIds.length > 0 ? documentIds : [],
          conversationId,
          workspaceId: workspaceId ?? null,
        },
      });
      setConversationId(result.conversationId);
      await queryClient.invalidateQueries({ queryKey: ["messages", result.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The Company Brain could not answer right now.",
      );
    } finally {
      setPending(false);
    }
  }

  const list: Message[] = messages.data ?? [];

  return (
    <div className="surface-panel flex h-[calc(100vh-13rem)] min-h-[520px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <Bot className="size-4 text-gold" />
        <p className="text-sm font-semibold">Company Brain</p>
        <span className="ml-auto text-xs text-muted-foreground">
          Searching across {documentIds.length > 0 ? `${documentIds.length} documents` : "all your documents"}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {list.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask anything across your documents — dates, comparisons, summaries, insights.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  disabled={pending}
                  onClick={() => send(q)}
                  className="rounded-lg border border-border bg-surface p-3 text-left text-sm transition-colors hover:border-gold/50 hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {list.map((message) => {
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
                  "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                  isUser
                    ? "bg-ink text-ink-foreground"
                    : "border border-border bg-surface text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {citations.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Sources
                    </p>
                    {citations.map((citation, i) => (
                      <p
                        key={`${citation.documentId}-${i}`}
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

        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-gold" /> Searching across your documents…
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={question}
            disabled={pending}
            maxLength={4000}
            rows={2}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(question);
              }
            }}
            placeholder="Ask about any topic across your documents…"
            className="min-h-[62px] resize-none"
          />
          <Button
            variant="gold"
            size="icon"
            className="size-[62px] shrink-0"
            disabled={pending || question.trim().length < 2}
            onClick={() => send(question)}
            aria-label="Ask question"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Searches across all your processed documents and cites each source.
        </p>
      </div>
    </div>
  );
}
