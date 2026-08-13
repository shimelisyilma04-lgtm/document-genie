import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";

import { processDocument } from "@/lib/documents.functions";
import { detectKind, sanitizeFileName, validateFile } from "@/lib/documents/constants";
import { supabase } from "@/integrations/supabase/client";

export type UploadProgressItem = {
  id: string;
  name: string;
  size: number;
  state: "uploading" | "processing" | "done" | "error";
  message?: string;
};

/**
 * Uploads files to private storage, creates the document rows, and kicks off
 * server-side extraction. Progress is exposed for the upload panel UI.
 */
export function useDocumentUpload() {
  const queryClient = useQueryClient();
  const runProcess = useServerFn(processDocument);
  const [items, setItems] = useState<UploadProgressItem[]>([]);

  const patch = useCallback((id: string, values: Partial<UploadProgressItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  }, []);

  const mutation = useMutation({
    mutationFn: async ({
      files,
      workspaceId,
    }: {
      files: File[];
      workspaceId: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");

      // Check usage limits server-side (enforced in processDocument via limits.server.ts)
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      const plan = (sub?.plan ?? "free") as string;

      // Check workspace count for new workspaces (handled in upload flow)
      // File size check is done in validateFile in constants

      const queued: UploadProgressItem[] = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        state: "uploading",
      }));
      setItems((current) => [...queued, ...current]);

      const created: string[] = [];

      for (const [index, file] of files.entries()) {
        const tracker = queued[index]!;
        const invalid = validateFile(file);
        if (invalid) {
          patch(tracker.id, { state: "error", message: invalid });
          continue;
        }

        const kind = detectKind(file.name, file.type);
        const storagePath = `${user.id}/${tracker.id}-${sanitizeFileName(file.name)}`;

        try {
          const upload = await supabase.storage
            .from("documents")
            .upload(storagePath, file, {
              contentType: file.type || "application/octet-stream",
              upsert: false,
            });
          if (upload.error) throw new Error(upload.error.message);

          const inserted = await supabase
            .from("documents")
            .insert({
              user_id: user.id,
              workspace_id: workspaceId,
              name: file.name.replace(/\.[^.]+$/, "").slice(0, 160) || file.name,
              original_name: file.name,
              storage_path: storagePath,
              mime_type: file.type || "application/octet-stream",
              file_size: file.size,
              status: "processing",
              metadata: { kind },
            })
            .select("id")
            .single();
          if (inserted.error) throw new Error(inserted.error.message);

          created.push(inserted.data.id);
          patch(tracker.id, { state: "processing" });
          queryClient.invalidateQueries({ queryKey: ["documents"] });

          await runProcess({ data: { documentId: inserted.data.id } });
          patch(tracker.id, { state: "done" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed. Please try again.";
          patch(tracker.id, { state: "error", message });
        } finally {
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          queryClient.invalidateQueries({ queryKey: ["usage"] });
        }
      }

      return created;
    },
  });

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.state !== "done"));
  }, []);

  return { ...mutation, items, clearFinished };
}
