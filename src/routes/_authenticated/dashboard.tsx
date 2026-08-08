import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { ArrowRight, Files, FolderKanban, MessagesSquare, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { UploadPanel } from "@/components/documents/UploadPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { bootstrapAccount } from "@/lib/account.functions";
import {
  useConversations,
  useDocuments,
  useUsageSummary,
  useWorkspaces,
} from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — OmniParse AI" },
      { name: "description", content: "Upload documents and review your OmniParse AI activity." },
      { property: "og:title", content: "Dashboard — OmniParse AI" },
      { property: "og:description", content: "Your document intelligence workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const queryClient = useQueryClient();
  const bootstrap = useServerFn(bootstrapAccount);
  const workspaces = useWorkspaces();
  const documents = useDocuments({ limit: 6 });
  const conversations = useConversations(5);
  const usage = useUsageSummary(30);

  useEffect(() => {
    let cancelled = false;
    bootstrap({})
      .then(() => {
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
      })
      .catch(() => {
        /* bootstrap is idempotent; transient failures retry on next load */
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap, queryClient]);

  const defaultWorkspace = workspaces.data?.find((w) => w.is_default) ?? workspaces.data?.[0];

  const stats = [
    { label: "Documents", value: documents.data?.length ?? 0, icon: Files, to: "/documents" },
    {
      label: "Workspaces",
      value: workspaces.data?.length ?? 0,
      icon: FolderKanban,
      to: "/workspaces",
    },
    {
      label: "Conversations",
      value: conversations.data?.length ?? 0,
      icon: MessagesSquare,
      to: "/conversations",
    },
    {
      label: "AI requests (30d)",
      value: usage.data?.aiRequests ?? 0,
      icon: Sparkles,
      to: "/usage",
    },
  ] as const;

  return (
    <AppShell
      title="Overview"
      description="Upload a document, then put the analyst to work."
      actions={
        <Button asChild size="sm" variant="gold">
          <Link to="/documents">
            All documents <ArrowRight className="size-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, to }) => (
            <Link key={label} to={to} className="surface-panel p-5 hover:shadow-lift">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <Icon className="size-4 text-gold" />
              </div>
              <p className="font-display mt-3 text-3xl font-semibold">{value}</p>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <section>
            <h2 className="font-display text-lg font-semibold">Add documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Files land in {defaultWorkspace?.name ?? "your workspace"} and are processed
              immediately.
            </p>
            <div className="mt-4">
              <UploadPanel workspaceId={defaultWorkspace?.id ?? null} />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Recent documents</h2>
              <Link to="/documents" className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {documents.isLoading &&
                [0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full rounded-xl" />)}
              {documents.data?.length === 0 && (
                <div className="surface-panel p-6 text-sm text-muted-foreground">
                  No documents yet. Upload your first file to get started.
                </div>
              )}
              {documents.data?.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </div>
          </section>
        </div>

        <section>
          <h2 className="font-display text-lg font-semibold">Recent conversations</h2>
          <div className="surface-panel mt-4 divide-y divide-border">
            {conversations.data?.length === 0 && (
              <p className="p-6 text-sm text-muted-foreground">
                No conversations yet — open a ready document and ask a question.
              </p>
            )}
            {conversations.data?.map((conversation) => (
              <Link
                key={conversation.id}
                to="/conversations"
                className="flex items-center justify-between gap-4 p-4 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(conversation.updated_at).toLocaleString()}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
