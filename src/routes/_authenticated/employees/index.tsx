import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Briefcase,
  FileText,
  GraduationCap,
  Hammer,
  Loader2,
  Scale,
  Send,
  Users,
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
import { Textarea } from "@/components/ui/textarea";
import { askEmployee } from "@/lib/employees.functions";
import { useDocuments } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { EmployeeType } from "@/lib/ai/employees/service.server";

export const Route = createFileRoute("/_authenticated/employees/")({
  head: () => ({
    meta: [
      { title: "AI Employees — OmniParse AI" },
      { name: "description", content: "Put specialized AI employees to work on your documents." },
    ],
  }),
  component: EmployeesPage,
});

// ------------------------------------------------------------------ //
// Employee definitions                                                  //
// ------------------------------------------------------------------ //

type EmployeeDef = {
  id: EmployeeType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  sampleTasks: string[];
};

const EMPLOYEES: EmployeeDef[] = [
  {
    id: "writing",
    name: "Writing Employee",
    description: "Create emails, reports, proposals, SOPs, policies, and professional rewrites.",
    icon: FileText,
    color: "text-blue-500",
    sampleTasks: [
      "Write a formal proposal based on the uploaded documents",
      "Create a professional email to the client",
      "Rewrite this contract clause in plain language",
      "Draft an SOP for the process described in these documents",
    ],
  },
  {
    id: "business_analyst",
    name: "Business Analyst",
    description: "Executive summaries, SWOT analysis, business insights, and action plans.",
    icon: Briefcase,
    color: "text-purple-500",
    sampleTasks: [
      "Produce an executive summary of this business report",
      "Create a SWOT analysis from these documents",
      "Generate an action plan with key milestones",
      "What are the key business risks in this contract?",
    ],
  },
  {
    id: "hr",
    name: "HR Employee",
    description: "HR policy analysis, onboarding documents, training materials, interview questions.",
    icon: Users,
    color: "text-green-500",
    sampleTasks: [
      "Analyze the HR policies in these documents",
      "Create onboarding documents for new employees",
      "Generate interview questions for the role described",
      "Create training material from these documents",
    ],
  },
  {
    id: "sales",
    name: "Sales Employee",
    description: "Client document analysis, proposals, sales emails, and presentation outlines.",
    icon: Hammer,
    color: "text-orange-500",
    sampleTasks: [
      "Analyze the client's requirements from these documents",
      "Create a proposal based on the client's needs",
      "Write a follow-up sales email after our meeting",
      "Outline a presentation for this prospect",
    ],
  },
  {
    id: "training",
    name: "Training Employee",
    description: "Quizzes, flashcards, training guides, and study questions from documents.",
    icon: GraduationCap,
    color: "text-teal-500",
    sampleTasks: [
      "Create a 10-question quiz from this training document",
      "Generate flashcards for the key concepts",
      "Build a training guide with clear steps",
      "Create study questions from this policy document",
    ],
  },
  {
    id: "legal",
    name: "Legal Document Assistant",
    description: "Contract comparison, clause finding, date extraction, plain-language explanations.",
    icon: Scale,
    color: "text-red-500",
    sampleTasks: [
      "Compare these two contract versions and highlight differences",
      "Find all indemnification clauses in this agreement",
      "Identify all deadlines and important dates",
      "Explain this clause in plain language",
    ],
  },
];

// ------------------------------------------------------------------ //
// Page component                                                        //
// ------------------------------------------------------------------ //

function EmployeesPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeDef | null>(null);
  const [task, setTask] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ask = useServerFn(askEmployee);
  const documents = useDocuments({ limit: 100 });
  const readyDocs = (documents.data ?? []).filter((d) => d.status === "ready");

  async function handleSubmit() {
    if (!selectedEmployee || !task.trim() || readyDocs.length === 0) return;
    setPending(true);
    setResult(null);
    try {
      const res = await ask({
        data: {
          employeeType: selectedEmployee.id,
          task: task.trim(),
          documentIds: readyDocs.map((d) => d.id),
        },
      });
      setResult(res.answer);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The employee could not complete this task.");
    } finally {
      setPending(false);
    }
  }

  function useSample(sampleTask: string) {
    setTask(sampleTask);
  }

  return (
    <AppShell
      title="AI Employees"
      description="Specialized AI assistants that work with your documents."
    >
      <div className="space-y-6">
        {/* Employee grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EMPLOYEES.map((emp) => {
            const Icon = emp.icon;
            return (
              <button
                key={emp.id}
                onClick={() => {
                  setSelectedEmployee(emp);
                  setResult(null);
                  setTask("");
                }}
                className="surface-panel flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                    <Icon className={cn("size-5", emp.color)} />
                  </div>
                </div>
                <div>
                  <p className="font-semibold">{emp.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{emp.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty state */}
        {documents.data && readyDocs.length === 0 && (
          <div className="surface-panel p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Upload and process documents first before using AI Employees.
            </p>
            <Button asChild variant="gold" size="sm" className="mt-4">
              <Link to="/documents">Go to documents</Link>
            </Button>
          </div>
        )}

        {/* Selected employee dialog */}
        <Dialog
          open={selectedEmployee !== null}
          onOpenChange={(open) => { if (!open) setSelectedEmployee(null); }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedEmployee && (
                  <>
                    <selectedEmployee.icon className={cn("size-5", selectedEmployee.color)} />
                    {selectedEmployee.name}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {selectedEmployee?.description}
                {selectedEmployee?.id === "legal" && (
                  <span className="mt-1 block text-xs text-amber-600">
                    Note: This assistant does not provide legal advice.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {readyDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ready documents. Upload and process documents first.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Will use {readyDocs.length} ready document{readyDocs.length === 1 ? "" : "s"}
                </p>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Task</label>
                  <Textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder={
                      selectedEmployee
                        ? `Describe what you want the ${selectedEmployee.name} to do…`
                        : ""
                    }
                    rows={4}
                    maxLength={4000}
                  />
                </div>

                {selectedEmployee && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Try one of these:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmployee.sampleTasks.slice(0, 3).map((sample) => (
                        <button
                          key={sample}
                          onClick={() => useSample(sample)}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground"
                        >
                          {sample}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {result && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Result</p>
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(result)}>
                      Copy result
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedEmployee(null)}>
                Close
              </Button>
              {readyDocs.length > 0 && (
                <Button
                  variant="gold"
                  onClick={handleSubmit}
                  disabled={pending || !task.trim()}
                >
                  {pending && <Loader2 className="size-4 animate-spin" />}
                  <Send className="size-4" />
                  Run {selectedEmployee?.name}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
