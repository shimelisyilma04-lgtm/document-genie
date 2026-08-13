import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Languages,
  Loader2,
  RefreshCw,
  BookOpen,
  HelpCircle,
} from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rewriteDocument,
  translateDocument,
  generateFaq,
  generateQuiz,
} from "@/lib/actions.functions";
import { useDocuments } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { TranslationLanguage } from "@/lib/ai/actions.server";
import { TRANSLATION_LANGUAGES } from "@/lib/ai/actions.server";

export const Route = createFileRoute("/_authenticated/documents/actions")({
  head: () => ({
    meta: [
      { title: "Document Actions — OmniParse AI" },
      { name: "description", content: "Translate, rewrite, and generate content from your documents." },
    ],
  }),
  component: DocumentActionsPage,
});

type Action = {
  id: "rewrite" | "translate" | "faq" | "quiz";
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const ACTIONS: Action[] = [
  {
    id: "rewrite",
    label: "Rewrite Document",
    description: "Rephrase or simplify document content while keeping facts intact.",
    icon: RefreshCw,
    color: "text-blue-500",
  },
  {
    id: "translate",
    label: "Translate",
    description: "Translate document content to Amharic, French, Spanish, Arabic, or English.",
    icon: Languages,
    color: "text-green-500",
  },
  {
    id: "faq",
    label: "Generate FAQ",
    description: "Create a frequently asked questions document from your content.",
    icon: HelpCircle,
    color: "text-purple-500",
  },
  {
    id: "quiz",
    label: "Generate Quiz",
    description: "Create a quiz with multiple choice, true/false, and short answer questions.",
    icon: BookOpen,
    color: "text-orange-500",
  },
];

function DocumentActionsPage() {
  const documents = useDocuments({ limit: 200 });
  const readyDocs = (documents.data ?? []).filter((d) => d.status === "ready");

  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Rewrite state
  const [rewriteInstruction, setRewriteInstruction] = useState("Make this more formal and professional");

  // Translate state
  const [targetLang, setTargetLang] = useState<TranslationLanguage>("english");

  // Quiz state
  const [questionCount, setQuestionCount] = useState(10);

  const runRewrite = useServerFn(rewriteDocument);
  const runTranslate = useServerFn(translateDocument);
  const runFaq = useServerFn(generateFaq);
  const runQuiz = useServerFn(generateQuiz);

  const docIds = readyDocs.map((d) => d.id);

  async function handleRun() {
    if (!selectedAction || readyDocs.length === 0) return;
    setPending(true);
    setResult(null);
    try {
      let output: string;
      if (selectedAction.id === "rewrite") {
        output = await runRewrite({
          data: { documentIds: docIds, instruction: rewriteInstruction },
        });
      } else if (selectedAction.id === "translate") {
        output = await runTranslate({
          data: { documentIds: docIds, targetLanguage: targetLang },
        });
      } else if (selectedAction.id === "faq") {
        output = await runFaq({ data: { documentIds: docIds } });
      } else {
        output = await runQuiz({
          data: { documentIds: docIds, questionCount },
        });
      }
      setResult(output);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  function handleExport(format: "txt" | "markdown") {
    if (!result) return;
    const blob = new Blob(
      [format === "markdown" ? `# ${selectedAction?.label}\n\n${result}` : result],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedAction?.label ?? "document"}-${Date.now()}.${format === "markdown" ? "md" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Document Actions"
      description="Transform and generate content from your documents."
    >
      <div className="space-y-8">
        {readyDocs.length === 0 && (
          <div className="surface-panel p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Upload and process documents first.
            </p>
            <Button asChild variant="gold" size="sm" className="mt-3">
              <Link to="/documents">Go to documents</Link>
            </Button>
          </div>
        )}

        {readyDocs.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">
              Will use {readyDocs.length} ready document{readyDocs.length === 1 ? "" : "s"}
            </p>

            {/* Action cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => { setSelectedAction(action); setResult(null); }}
                    className={cn(
                      "surface-panel flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-lift",
                      selectedAction?.id === action.id && "ring-2 ring-gold",
                    )}
                  >
                    <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                      <Icon className={cn("size-5", action.color)} />
                    </div>
                    <div>
                      <p className="font-semibold">{action.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Action panel */}
            {selectedAction && (
              <div className="surface-panel p-6">
                <div className="flex items-center gap-3">
                  <selectedAction.icon className={cn("size-5", selectedAction.color)} />
                  <h2 className="font-display text-lg font-semibold">{selectedAction.label}</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{selectedAction.description}</p>

                {/* Rewrite options */}
                {selectedAction.id === "rewrite" && (
                  <div className="mt-4 space-y-2">
                    <Label>Instruction</Label>
                    <Input
                      value={rewriteInstruction}
                      onChange={(e) => setRewriteInstruction(e.target.value)}
                      placeholder="e.g. Make it more formal, simplify language…"
                      maxLength={2000}
                    />
                  </div>
                )}

                {/* Translate options */}
                {selectedAction.id === "translate" && (
                  <div className="mt-4 space-y-2">
                    <Label>Target language</Label>
                    <Select value={targetLang} onValueChange={(v) => setTargetLang(v as TranslationLanguage)}>
                      <SelectTrigger className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRANSLATION_LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quiz options */}
                {selectedAction.id === "quiz" && (
                  <div className="mt-4 space-y-2">
                    <Label>Number of questions ({questionCount})</Label>
                    <input
                      type="range"
                      min={3}
                      max={30}
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  <Button variant="gold" disabled={pending} onClick={handleRun}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    <FileText className="size-4" />
                    Run {selectedAction.label}
                  </Button>
                </div>

                {result && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">Result</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleExport("txt")}>
                          <Download className="size-4" /> TXT
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport("markdown")}>
                          <Download className="size-4" /> Markdown
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed">{result}</pre>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(result)}>
                      Copy to clipboard
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
