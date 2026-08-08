import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  FileText,
  FileType2,
  Loader2,
} from "lucide-react";

import { formatBytes } from "@/lib/documents/constants";
import type { DocumentRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function DocumentIcon({ document, className }: { document: DocumentRow; className?: string }) {
  const mime = document.mime_type;
  const Icon = mime.startsWith("image/")
    ? FileImage
    : mime === "application/pdf"
      ? FileText
      : FileType2;
  return <Icon className={cn("size-5", className)} />;
}

export function DocumentStatus({ document }: { document: DocumentRow }) {
  if (document.status === "ready") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5" /> Ready
      </span>
    );
  }
  if (document.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {document.status === "uploading" ? "Uploading" : "Processing"}
    </span>
  );
}

export function DocumentCard({ document }: { document: DocumentRow }) {
  return (
    <Link
      to="/documents/$documentId"
      params={{ documentId: document.id }}
      className="surface-panel group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <DocumentIcon document={document} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold group-hover:text-gold">{document.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{document.original_name}</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <DocumentStatus document={document} />
        <span className="text-xs text-muted-foreground">
          {formatBytes(document.file_size)}
          {document.page_count ? ` · ${document.page_count}p` : ""}
        </span>
      </div>
      {document.status === "failed" && document.error_message && (
        <p className="text-xs leading-relaxed text-destructive">{document.error_message}</p>
      )}
    </Link>
  );
}
