import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getDocuments } from '@/lib/documents';
import { runEmployeeTask } from '@/lib/ai/service';
import { EMPLOYEE_LIST, EMPLOYEE_DEFINITIONS } from '@/lib/ai/prompts';
import { Markdown } from '@/components/Markdown';
import { Spinner } from '@/components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { downloadFile } from '@/lib/utils';
import type { Document, AIEmployeeRun, UsageMonthly, Workspace, EmployeeType } from '@/lib/types';
import * as Icons from 'lucide-react';
import {
  ArrowLeft,
  Download,
  AlertCircle,
  Loader2,
  FileText,
  CheckSquare,
  Square,
  Sparkles,
  Clock,
} from 'lucide-react';

interface OutletCtx {
  currentWorkspace: Workspace;
  usage: UsageMonthly | null;
  refreshUsage: () => void;
}

export function AIEmployees() {
  const { currentWorkspace, refreshUsage } = useOutletContext<OutletCtx>();
  const { user } = useAuth();
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeType | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentRuns, setRecentRuns] = useState<AIEmployeeRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocuments(currentWorkspace.id).then((docs) => {
      setDocuments(docs.filter((d) => d.status === 'ready'));
      setLoading(false);
    });
    loadRecentRuns();
  }, [currentWorkspace]);

  async function loadRecentRuns() {
    const { data } = await supabase
      .from('ai_employee_runs')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentRuns((data || []) as AIEmployeeRun[]);
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Spinner className="h-6 w-6 text-slate-400" /></div>;
  }

  if (selectedEmployee) {
    return (
      <EmployeeWorkbench
        employeeType={selectedEmployee}
        onBack={() => setSelectedEmployee(null)}
        documents={documents}
        workspace={currentWorkspace}
        userId={user!.id}
        onRunComplete={() => { loadRecentRuns(); refreshUsage(); }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">AI Employees</h1>
        <p className="mt-1 text-sm text-slate-500">Deploy specialized AI assistants to work with your documents</p>
      </div>

      {/* Employee grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EMPLOYEE_LIST.map((emp) => {
          const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[emp.icon] || Icons.Bot;
          return (
            <button
              key={emp.type}
              onClick={() => setSelectedEmployee(emp.type)}
              className="card p-5 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50">
                <Icon className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{emp.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{emp.tagline}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {emp.tasks.slice(0, 3).map((t) => (
                  <span key={t.id} className="badge-gray text-[10px]">{t.label}</span>
                ))}
                {emp.tasks.length > 3 && <span className="badge-gray text-[10px]">+{emp.tasks.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent Outputs</h2>
          <div className="card divide-y divide-slate-100">
            {recentRuns.map((run) => {
              const emp = EMPLOYEE_DEFINITIONS[run.employee_type];
              const Icon = emp ? (Icons as unknown as Record<string, Icons.LucideIcon>)[emp.icon] || Icons.Bot : Icons.Bot;
              return (
                <div key={run.id} className="flex items-center gap-3 p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Icon className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{run.title}</p>
                    <p className="text-xs text-slate-500">{emp?.name} · {run.task_type}</p>
                  </div>
                  {run.output_content && (
                    <button
                      onClick={() => downloadFile(run.output_content!, `${run.title}.md`, 'text/markdown')}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface WorkbenchProps {
  employeeType: EmployeeType;
  onBack: () => void;
  documents: Document[];
  workspace: Workspace;
  userId: string;
  onRunComplete: () => void;
}

function EmployeeWorkbench({ employeeType, onBack, documents, workspace, userId, onRunComplete }: WorkbenchProps) {
  const def = EMPLOYEE_DEFINITIONS[employeeType];
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[def.icon] || Icons.Bot;
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    if (!selectedTask || running) return;
    setRunning(true);
    setError(null);
    setOutput(null);

    const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));
    const docsToUse = selectedDocs.length > 0 ? selectedDocs : documents;

    const result = await runEmployeeTask(employeeType, selectedTask, userInput, docsToUse);

    if (result.error) {
      setError(result.error);
    } else {
      setOutput(result.text);
      // Save run
      const task = def.tasks.find((t) => t.id === selectedTask);
      await supabase.from('ai_employee_runs').insert({
        workspace_id: workspace.id,
        user_id: userId,
        employee_type: employeeType,
        task_type: selectedTask,
        title: task?.label || selectedTask,
        input_context: { userInput, docIds: selectedDocIds },
        output_content: result.text,
        output_format: 'markdown',
        source_document_ids: selectedDocIds,
        tokens_used: result.tokensUsed,
      });
      onRunComplete();
    }
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{def.name}</h1>
          <p className="text-sm text-slate-500">{def.description}</p>
        </div>
      </div>

      {/* Legal disclaimer */}
      {employeeType === 'legal' && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Disclaimer:</strong> The Legal Document Assistant does not provide legal advice. It helps identify, compare, and explain language in documents. Always consult a qualified attorney for legal matters.
        </div>
      )}

      {/* Task selection */}
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">Select a task</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {def.tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => { setSelectedTask(task.id); setOutput(null); setError(null); }}
              className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                selectedTask === task.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 ${selectedTask === task.id ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
              <div>
                <p className="text-sm font-medium text-slate-900">{task.label}</p>
                <p className="text-xs text-slate-500">{task.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Input field */}
      {selectedTask && (() => {
        const task = def.tasks.find((t) => t.id === selectedTask);
        if (!task || !task.needsInput) return null;
        return (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{task.inputLabel}</label>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={task.inputPlaceholder}
              className="textarea"
              rows={3}
            />
          </div>
        );
      })()}

      {/* Document picker */}
      <div className="mb-4">
        <button
          onClick={() => setShowDocPicker(!showDocPicker)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <FileText className="h-3.5 w-3.5" />
          {selectedDocIds.length > 0 ? `${selectedDocIds.length} document(s) selected as context` : 'Select documents for context (optional)'}
        </button>
        {showDocPicker && (
          <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-40 overflow-y-auto scrollbar-thin">
            {documents.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-slate-400">No ready documents available.</p>
            ) : (
              documents.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white cursor-pointer">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      if (selectedDocIds.includes(doc.id)) setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.id));
                      else setSelectedDocIds([...selectedDocIds, doc.id]);
                    }}
                  >
                    {selectedDocIds.includes(doc.id) ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" /> : <Square className="h-3.5 w-3.5 text-slate-400" />}
                  </button>
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate text-xs text-slate-700">{doc.original_name}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={!selectedTask || running}
        className="btn-primary mb-6"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {running ? 'Generating...' : 'Generate'}
      </button>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Output</h3>
            <div className="flex gap-1">
              <button onClick={() => downloadFile(output, `${def.name}-output.md`, 'text/markdown')} className="btn-ghost text-xs">
                <Download className="h-3.5 w-3.5" /> MD
              </button>
              <button onClick={() => downloadFile(output, `${def.name}-output.txt`, 'text/plain')} className="btn-ghost text-xs">
                <Download className="h-3.5 w-3.5" /> TXT
              </button>
            </div>
          </div>
          <Markdown content={output} />
        </div>
      )}
    </div>
  );
}
