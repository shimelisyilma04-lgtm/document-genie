import { useRef, useState } from "react";
import { CloudUpload, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILES_PER_UPLOAD,
  formatBytes,
  MAX_FILE_BYTES,
} from "@/lib/documents/constants";
import { useDocumentUpload } from "@/lib/upload";
import { cn } from "@/lib/utils";

export function UploadPanel({ workspaceId }: { workspaceId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { mutate, isPending, items, clearFinished } = useDocumentUpload();

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_FILES_PER_UPLOAD);
    if (fileList.length > MAX_FILES_PER_UPLOAD) {
      toast.info(`Only the first ${MAX_FILES_PER_UPLOAD} files were queued.`);
    }
    mutate(
      { files, workspaceId },
      {
        onSuccess: (created) => {
          if (created.length > 0) {
            toast.success(
              created.length === 1
                ? "Document processed and ready to question."
                : `${created.length} documents processed.`,
            );
          }
        },
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Upload failed."),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "surface-panel flex flex-col items-center justify-center gap-3 border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-gold bg-gold/5" : "border-border",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          {isPending ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <CloudUpload className="size-6" />
          )}
        </span>
        <div>
          <p className="text-sm font-semibold">Drop documents here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, DOCX, TXT/MD/CSV or PNG/JPG/WEBP scans · up to{" "}
            {formatBytes(MAX_FILE_BYTES)} each
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="surface-panel divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Upload queue
            </p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={clearFinished}
            >
              <X className="mr-1 inline size-3" /> Clear finished
            </button>
          </div>
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatBytes(item.size)}
                  {item.message ? ` · ${item.message}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "text-xs font-medium capitalize",
                  item.state === "error"
                    ? "text-destructive"
                    : item.state === "done"
                      ? "text-success"
                      : "text-muted-foreground",
                )}
              >
                {item.state === "done" ? "Ready" : item.state}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
