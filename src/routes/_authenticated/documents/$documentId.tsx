import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, RefreshCcw, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { DocumentChat } from "@/components/documents/DocumentChat";
import { DocumentStatus } from "@/components/documents/DocumentCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteDocument, processDocument } from "@/lib/documents.functions";
import { formatBytes } from "@/lib/documents/constants";
import { useDocument, useDocumentChunks, useSignedDocumentUrl } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Document analyst — OmniParse AI" },
      {
        name: "description",
        content: "Read the extracted document and question it with the OmniParse AI analyst.",
      },
      { property: "og:title", content: "Document analyst — OmniParse AI" },
      { property: "og:description", content: "Chat with your document, with citations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentDetailPage,
});

function DocumentDetailPage() {
  const { documentId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const documentQuery = useDocument(documentId);
  const document = documentQuery.data;
  const chunks = useDocumentChunks(documentId, document?.status === "ready");
  const signedUrl = useSignedDocumentUrl(document);
  const runProcess = useServerFn(processDocument);
  const runDelete = useServerFn(deleteDocument);
  const [busy, setBusy] = useState(false);

  async function handleReprocess() {
    setBusy(true);
    try {
      await runProcess({ data: { documentId } });
      toast.success("Document reprocessed.");
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["chunks", documentId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Processing failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this document, its extracted text and its conversations?")) return;
    setBusy(true);
    try {
      await runDelete({ data: { documentId } });
      toast.success("Document deleted.");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate({ to: "/documents" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
      setBusy(false);
    }
  }

  if (documentQuery.isLoading) {
    return (
      <AppShell title="Document">
        <Skeleton className="h-[520px] w-full rounded-xl" />
      </AppShell>
    );
  }

  if (!document) {
    return (
      <AppShell title="Document not found">
        <div className="surface-panel p-8 text-center">
          <p className="text-sm text-muted-foreground">
            This document no longer exists or isn't yours.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/documents">Back to documents</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={document.name}
      description={`${document.original_name} · ${formatBytes(document.file_size)}${
        document.page_count ? ` · ${document.page_count} pages` : ""
      }`}
      actions={
        <>
          <Button asChild variant="ghost" size="sm">
            <Link to="/documents">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReprocess} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
            Reprocess
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={busy}
            aria-label="Delete document"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-4">
          <div className="surface-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DocumentStatus document={document} />
              {signedUrl.data && (
                <a
                  href={signedUrl.data}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
                >
                  Open original <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
              {[
                { label: "Sections", value: document.chunk_count },
                { label: "Words", value: document.word_count ?? "—" },
                { label: "Pages", value: document.page_count ?? "—" },
                { label: "Extractor", value: document.extractor ?? "—" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 font-display text-sm font-semibold">{String(item.value)}</dd>
                </div>
              ))}
            </dl>
            {document.status === "failed" && document.error_message && (
              <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
                {document.error_message}
              </p>
            )}
          </div>

          <div className="surface-panel flex max-h-[calc(100vh-24rem)] min-h-[280px] flex-col">
            <p className="border-b border-border px-5 py-3.5 text-sm font-semibold">
              Extracted text
            </p>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {document.status !== "ready" && (
                <p className="text-sm text-muted-foreground">
                  Text appears here once processing finishes.
                </p>
              )}
              {chunks.data?.map((chunk) => (
                <div key={chunk.id}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">
                    {chunk.heading ?? `Section ${chunk.chunk_index + 1}`}
                    {chunk.page_number ? ` · page ${chunk.page_number}` : ""}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DocumentChat document={document} />
      </div>
    </AppShell>
  );
}
