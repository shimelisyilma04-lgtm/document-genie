import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Brain, CornerDownLeft, Loader2, Quote, Search } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSubscription } from "@/lib/queries";
import { cn } from "@/lib/utils";

type BrainResult = {
  id: string;
  document_id: string;
  document_name: string;
  chunk_index: number;
  content: string;
  page_number: number | null;
  heading: string | null;
  rank: number;
};

export const Route = createFileRoute("/_authenticated/brain")({
  head: () => ({
    meta: [
      { title: "Company Brain — OmniParse AI" },
      {
        name: "description",
        content: "Search across all your documents at once.",
      },
      { property: "og:title", content: "Company Brain — OmniParse AI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrainPage,
});

function BrainPage() {
  const subscription = useSubscription();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrainResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const plan = subscription.data?.plan ?? "free";
  const isPaid = plan === "starter" || plan === "pro" || plan === "business";

  async function handleSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearched(false);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in.");

      const { data, error } = await supabase.rpc("search_company_brain", {
        _user_id: auth.user.id,
        _query: trimmed,
        _limit: 20,
      });
      if (error) throw error;
      setResults((data as BrainResult[]) ?? []);
      setSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <AppShell
      title="Company Brain"
      description="Search across all your documents at once."
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Search bar */}
        <div className="surface-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="size-5 text-gold" />
            <p className="text-sm font-semibold">Universal search</p>
            {!isPaid && (
              <span className="ml-auto rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">
                Starter+
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Searches every document you&apos;ve uploaded — no need to pick a specific file.
          </p>
          <div className="flex items-end gap-2">
            <Textarea
              value={query}
              maxLength={500}
              rows={2}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch(query);
                }
              }}
              placeholder="e.g. What are our payment terms? Who signed the NDA?"
              className="resize-none"
            />
            <Button
              variant="gold"
              size="icon"
              className="size-[68px] shrink-0"
              disabled={!query.trim() || searching}
              onClick={() => handleSearch(query)}
              aria-label="Search"
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CornerDownLeft className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Results */}
        {searched && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {results.length > 0
                ? `${results.length} result${results.length === 1 ? "" : "s"} found`
                : "No results found for this query."}
            </p>
            {results.map((result, i) => (
              <div key={result.id} className="surface-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{result.document_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.page_number ? `Page ${result.page_number}` : `Section ${result.chunk_index + 1}`}
                      {result.heading ? ` · ${result.heading}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      result.rank > 0.5
                        ? "bg-gold/10 text-gold"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {Math.round(result.rank * 100)}% match
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {result.content.slice(0, 400)}
                  {result.content.length > 400 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {!searched && (
          <div className="surface-panel p-8 text-center">
            <Search className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Enter a query above to search across all your documents.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
