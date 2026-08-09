import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getPlan, formatStorage } from '@/lib/plans';
import { formatNumber, timeAgo } from '@/lib/utils';
import type { Document, Conversation, UsageMonthly, Workspace } from '@/lib/types';
import { EmptyState } from '@/components/EmptyState';
import {
  FileText,
  MessageSquare,
  Brain,
  Users,
  TrendingUp,
  Upload,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface OutletCtx {
  currentWorkspace: Workspace;
  usage: UsageMonthly | null;
  refreshUsage: () => void;
}

export function Overview() {
  const { currentWorkspace, usage } = useOutletContext<OutletCtx>();
  const { user, planId } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace) return;
    setLoading(true);
    Promise.all([
      supabase
        .from('documents')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('conversations')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('updated_at', { ascending: false })
        .limit(5),
    ]).then(([docsRes, convsRes]) => {
      setDocuments((docsRes.data || []) as Document[]);
      setRecentConversations((convsRes.data || []) as Conversation[]);
      setLoading(false);
    });
  }, [currentWorkspace]);

  const plan = getPlan(planId);

  const stats: { label: string; value: number | string; max: number | string | undefined; icon: typeof FileText; color: string; bg: string }[] = [
    {
      label: 'Documents',
      value: usage?.documents_count ?? 0,
      max: plan.limits.documentsPerMonth,
      icon: FileText,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'AI Messages',
      value: usage?.ai_messages_count ?? 0,
      max: plan.limits.aiMessagesPerMonth,
      icon: MessageSquare,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
    {
      label: 'Pages Processed',
      value: usage?.pages_count ?? 0,
      max: undefined,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Storage Used',
      value: formatStorage((usage?.storage_bytes ?? 0) / (1024 * 1024)),
      max: formatStorage(plan.limits.storageMb),
      icon: Upload,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ];

  const quickActions = [
    { label: 'Upload Document', icon: Upload, path: '/app/documents', color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'AI Analyst', icon: MessageSquare, path: '/app/analyst', color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Company Brain', icon: Brain, path: '/app/brain', color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'AI Employees', icon: Users, path: '/app/employees', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.email?.split('@')[0] || 'there'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here's what's happening in {currentWorkspace.name}
        </p>
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="card flex items-center gap-3 p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${action.bg}`}>
              <action.icon className={`h-5 w-5 ${action.color}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{action.label}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300" />
          </button>
        ))}
      </div>

      {/* Usage stats */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Usage This Month</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                {stat.max != null && (
                  <span className="badge-gray">
                    {typeof stat.value === 'number'
                      ? `${formatNumber(stat.value)}/${formatNumber(typeof stat.max === 'number' ? stat.max : parseFloat(String(stat.max)) || 0)}`
                      : `${stat.value}/${stat.max}`}
                  </span>
                )}
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">
                {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
              </p>
              <p className="text-xs text-slate-500">{stat.label}</p>
              {stat.max != null && typeof stat.value === 'number' && (() => {
                const maxNum = typeof stat.max === 'number' ? stat.max : parseFloat(String(stat.max)) || 1;
                const ratio = stat.value / maxNum;
                return (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-blue-500'
                      }`
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* Recent documents + conversations */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Documents</h2>
            <button onClick={() => navigate('/app/documents')} className="text-xs font-medium text-blue-600 hover:text-blue-700">
              View all
            </button>
          </div>
          <div className="card divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload your first document to start analyzing"
                action={
                  <button onClick={() => navigate('/app/documents')} className="btn-primary text-xs">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </button>
                }
              />
            ) : (
              documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => navigate(`/app/documents/${doc.id}`)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <FileText className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{doc.original_name}</p>
                    <p className="text-xs text-slate-500">{timeAgo(doc.created_at)}</p>
                  </div>
                  <StatusBadge status={doc.status} />
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent Conversations</h2>
            <button onClick={() => navigate('/app/analyst')} className="text-xs font-medium text-blue-600 hover:text-blue-700">
              New chat
            </button>
          </div>
          <div className="card divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : recentConversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations yet"
                description="Start chatting with your documents"
                action={
                  <button onClick={() => navigate('/app/analyst')} className="btn-primary text-xs">
                    <MessageSquare className="h-3.5 w-3.5" /> Start
                  </button>
                }
              />
            ) : (
              recentConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/app/analyst?conv=${conv.id}`)}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cyan-50">
                    {conv.type === 'brain' ? (
                      <Brain className="h-4 w-4 text-cyan-600" />
                    ) : conv.type === 'employee' ? (
                      <Users className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-cyan-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{conv.title}</p>
                    <p className="text-xs text-slate-500">{timeAgo(conv.updated_at)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'ready':
      return <span className="badge-green"><CheckCircle2 className="h-3 w-3" /> Ready</span>;
    case 'processing':
      return <span className="badge-blue"><Loader2 className="h-3 w-3 animate-spin" /> Processing</span>;
    case 'error':
      return <span className="badge-red"><AlertCircle className="h-3 w-3" /> Error</span>;
    default:
      return <span className="badge-gray"><Clock className="h-3 w-3" /> Pending</span>;
  }
}
