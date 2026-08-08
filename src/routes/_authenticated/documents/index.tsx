import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/app/AppShell";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { UploadPanel } from "@/components/documents/UploadPanel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocuments, useWorkspaces } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/documents/")({
  head: () => ({
    meta: [
      { title: "Documents — OmniParse AI" },
      {
        name: "description",
        content: "Upload, process and browse every document in your OmniParse AI workspaces.",
      },
      { property: "og:title", content: "Documents — OmniParse AI" },
      { property: "og:description", content: "Your processed document library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const workspaces = useWorkspaces();
  const [workspaceId, setWorkspaceId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const documents = useDocuments(workspaceId === "all" ? {} : { workspaceId });

  const uploadTarget =
    workspaceId === "all"
      ? (workspaces.data?.find((w) => w.is_default)?.id ?? workspaces.data?.[0]?.id ?? null)
      : workspaceId;

  const filtered = (documents.data ?? []).filter((document) =>
    `${document.name} ${document.original_name}`.toLowerCase().includes(search.toLowerCase().trim()),
  );

  return (
    <AppShell title="Documents" description="Everything you've uploaded, ready to question.">
      <div className="space-y-8">
        <UploadPanel workspaceId={uploadTarget} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents…"
            maxLength={120}
            className="sm:max-w-xs"
          />
          <Select value={workspaceId} onValueChange={setWorkspaceId}>
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="All workspaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workspaces</SelectItem>
              {workspaces.data?.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            {filtered.length} document{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {documents.isLoading &&
            [0, 1, 2].map((key) => <Skeleton key={key} className="h-32 w-full rounded-xl" />)}
          {!documents.isLoading && filtered.length === 0 && (
            <div className="surface-panel col-span-full p-8 text-center text-sm text-muted-foreground">
              No documents match this view yet.
            </div>
          )}
          {filtered.map((document) => (
            <DocumentCard key={document.id} document={document} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
