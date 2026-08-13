import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Bot, CornerDownLeft, Loader2, Quote, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { askEmployee } from "@/lib/employees.functions";
import {
  EMPLOYEE_CATALOG,
  type EmployeeType,
} from "@/lib/ai/employees.server";
import { useMessages } from "@/lib/queries";
import { cn } from "@/lib/utils";

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
      typeof item === "object" &&
      item !== null &&
      "documentId" in item &&
      "documentName" in item,
  );
}

const DEFAULT_EMPLOYEE: EmployeeType = "writing";

export function EmployeeChat() {
  const queryClient = useQueryClient();
  const ask = useServerFn(askEmployee);
  const [employeeType, setEmployeeType] = useState<EmployeeType>(DEFAULT_EMPLOYEE);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const messages = useMessages(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
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
          employeeType,
          conversationId,
        },
      });
      setConversationId(result.conversationId);
      await queryClient.invalidateQueries({
        queryKey: ["messages", result.conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The employee could not respond right now.",
      );
    } finally {
      setPending(false);
    }
  }

  const list = messages.data ?? [];
  const employee = EMPLOYEE_CATALOG.find((e) => e.type === employeeType);

  return (
    <div className="surface-panel flex h-[calc(100vh-13rem)] min-h-[520px] flex-col">
      {/* Header with employee selector */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <Bot className="size-4 text-gold" />
        <p className="text-sm font-semibold">AI Employee</p>
        <Select
          value={employeeType}
          onValueChange={(v) => {
            setEmployeeType(v as EmployeeType);
            setConversationId(null);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYEE_CATALOG.map((e) => (
              <SelectItem key={e.type} value={e.type}>
                <span className="flex items-center gap-2">
                  <span>{e.icon}</span>
                  {e.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          Company brain · all documents
        </span>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {list.length === 0 && employee && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{employee.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{employee.name}</p>
                  <p className="text-xs text-muted-foreground">{employee.tagline}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{employee.description}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Ask me anything about your documents — I&apos;ll search the company brain
              and answer based on what I find.
            </p>
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
                    {citations.map((citation) => (
                      <p
                        key={`${citation.documentId}-${citation.page ?? "x"}`}
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
            <Loader2 className="size-4 animate-spin text-gold" />
            Searching the company brain…
          </div>
        )}
      </div>

      {/* Input */}
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
            placeholder="Ask about anything in your documents…"
            className="min-h-[62px] resize-none"
          />
          <Button
            variant="gold"
            size="icon"
            className="size-[62px] shrink-0"
            disabled={pending || question.trim().length < 2}
            onClick={() => send(question)}
            aria-label="Send question"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CornerDownLeft className="size-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Answers are grounded in your uploaded documents and cite sources.
        </p>
      </div>
    </div>
  );
}
