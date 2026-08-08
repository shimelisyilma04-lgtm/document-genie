import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscription, useUsageSummary } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/usage")({
  head: () => ({
    meta: [
      { title: "Usage — OmniParse AI" },
      {
        name: "description",
        content: "Track AI requests, tokens and processed documents on your OmniParse AI plan.",
      },
      { property: "og:title", content: "Usage — OmniParse AI" },
      { property: "og:description", content: "Your document and AI usage at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsagePage,
});

function UsagePage() {
  const usage = useUsageSummary(30);
  const subscription = useSubscription();

  const totals = [
    { label: "AI requests", value: usage.data?.aiRequests ?? 0 },
    { label: "Documents processed", value: usage.data?.documentsProcessed ?? 0 },
    { label: "Prompt tokens", value: usage.data?.promptTokens ?? 0 },
    { label: "Completion tokens", value: usage.data?.completionTokens ?? 0 },
  ];

  const daily = usage.data?.daily ?? [];
  const peak = Math.max(1, ...daily.map((day) => day.requests));

  return (
    <AppShell title="Usage" description="Last 30 days of document and analyst activity.">
      {usage.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <div className="space-y-8">
          <div className="surface-panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Current plan
              </p>
              <p className="font-display mt-1 text-lg font-semibold capitalize">
                {subscription.data?.plan ?? "free"}
              </p>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Requests are rate-limited per account to keep the analyst responsive. Usage counters
              reset on a rolling 30-day window.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {totals.map((item) => (
              <div key={item.label} className="surface-panel p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="font-display mt-3 text-3xl font-semibold">
                  {item.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          <div className="surface-panel p-5">
            <p className="text-sm font-semibold">Daily AI requests</p>
            {daily.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No activity recorded yet — ask the analyst a question to start tracking.
              </p>
            ) : (
              <div className="mt-6 flex h-40 items-end gap-1.5">
                {daily.map((day) => (
                  <div key={day.date} className="group flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t bg-gold/70 transition-colors group-hover:bg-gold"
                      style={{ height: `${Math.max(4, (day.requests / peak) * 100)}%` }}
                      title={`${day.date}: ${day.requests} requests, ${day.tokens.toLocaleString()} tokens`}
                    />
                    <span className="text-[10px] text-muted-foreground">{day.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
