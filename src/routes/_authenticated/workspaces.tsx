import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useDocuments,
  useWorkspaces,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/workspaces")({
  head: () => ({
    meta: [
      { title: "Workspaces — OmniParse AI" },
      {
        name: "description",
        content: "Group documents by client, matter or project inside OmniParse AI.",
      },
      { property: "og:title", content: "Workspaces — OmniParse AI" },
      { property: "og:description", content: "Organise your document collections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const workspaces = useWorkspaces();
  const documents = useDocuments();
  const createWorkspace = useCreateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Give the workspace a name of at least 2 characters.");
      return;
    }
    createWorkspace.mutate(
      { name: trimmed.slice(0, 80), description: description.trim().slice(0, 300) || undefined },
      {
        onSuccess: () => {
          toast.success("Workspace created.");
          setOpen(false);
          setName("");
          setDescription("");
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Could not create workspace."),
      },
    );
  }

  function countFor(workspaceId: string) {
    return (documents.data ?? []).filter((d) => d.workspace_id === workspaceId).length;
  }

  return (
    <AppShell
      title="Workspaces"
      description="Keep unrelated documents apart and question them as sets."
      actions={
        <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New workspace
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {workspaces.isLoading &&
          [0, 1, 2].map((key) => <Skeleton key={key} className="h-32 w-full rounded-xl" />)}
        {workspaces.data?.map((workspace) => (
          <div key={workspace.id} className="surface-panel flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FolderKanban className="size-5" />
              </span>
              {!workspace.is_default && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${workspace.name}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete "${workspace.name}"? Documents inside it stay in your library but lose this grouping.`,
                      )
                    )
                      return;
                    deleteWorkspace.mutate(workspace.id, {
                      onSuccess: () => toast.success("Workspace deleted."),
                      onError: (error) =>
                        toast.error(
                          error instanceof Error ? error.message : "Could not delete workspace.",
                        ),
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {workspace.name}
                {workspace.is_default && (
                  <span className="ml-2 rounded bg-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                    Default
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {workspace.description ?? "No description."}
              </p>
            </div>
            <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground">
              {countFor(workspace.id)} document{countFor(workspace.id) === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep client or project documents separate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Corp — 2026 renewals"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-description">Description (optional)</Label>
              <Textarea
                id="ws-description"
                value={description}
                maxLength={300}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What belongs in this workspace?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={handleCreate} disabled={createWorkspace.isPending}>
              {createWorkspace.isPending && <Loader2 className="size-4 animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </AppShell>
  );
}
