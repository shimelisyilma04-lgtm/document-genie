import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

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
import { useSubscription } from "@/lib/queries";
import { cancelSubscription, reactivateSubscription, selectPlan } from "@/lib/billing/functions.server";
import { PLANS, formatBytes, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pricing/")({
  head: () => ({
    meta: [
      { title: "Pricing — OmniParse AI" },
      { name: "description", content: "Choose the plan that fits your document workflow." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const subscription = useSubscription();
  const select = useServerFn(selectPlan);
  const cancel = useServerFn(cancelSubscription);
  const reactivate = useServerFn(reactivateSubscription);

  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [pending, setPending] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);

  const currentPlan = (subscription.data?.plan ?? "free") as PlanId;
  const isActive = subscription.data?.status === "active";

  async function handleSelectPlan() {
    if (!selectedPlan) return;
    setPending(true);
    try {
      const result = await select({ data: { plan: selectedPlan } });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast.success(`Switched to ${PLANS[selectedPlan].name} plan.`);
      }
      subscription.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change plan.");
    } finally {
      setPending(false);
      setSelectedPlan(null);
    }
  }

  async function handleCancel() {
    setPending(true);
    try {
      await cancel({});
      toast.success("Subscription canceled. You'll keep access until the end of the billing period.");
      setShowCancel(false);
      subscription.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel.");
    } finally {
      setPending(false);
    }
  }

  async function handleReactivate() {
    setPending(true);
    try {
      await reactivate({});
      toast.success("Subscription reactivated.");
      setShowReactivate(false);
      subscription.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reactivate.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell title="Pricing" description="Choose the right plan for your document workflow.">
      <div className="space-y-8">
        {/* Current plan banner */}
        {isActive && currentPlan !== "free" && (
          <div className="surface-panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm font-semibold">
                Currently on{" "}
                <span className="text-gold">{PLANS[currentPlan].name}</span> plan
              </p>
              {subscription.data?.cancel_at_period_end && (
                <p className="mt-1 text-sm text-destructive">
                  Cancellation scheduled — access ends{" "}
                  {subscription.data?.current_period_end
                    ? new Date(subscription.data.current_period_end).toLocaleDateString()
                    : "end of billing period"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {subscription.data?.cancel_at_period_end ? (
                <Button variant="gold" size="sm" onClick={() => setShowReactivate(true)}>
                  Reactivate
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setShowCancel(true)}>
                  Cancel subscription
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(PLANS) as PlanId[]).map((planId) => {
            const plan = PLANS[planId];
            const isCurrent = currentPlan === planId;
            return (
              <div
                key={planId}
                className={cn(
                  "surface-panel flex flex-col gap-4 p-6",
                  isCurrent && "border-gold/50",
                  planId === "pro" && "ring-2 ring-gold",
                )}
              >
                {planId === "pro" && (
                  <span className="text-xs font-semibold uppercase tracking-wide text-gold">Most popular</span>
                )}
                <div>
                  <p className="font-display text-xl font-semibold">{plan.name}</p>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-semibold">
                      {plan.monthlyPrice === 0 ? "Free" : `$${(plan.monthlyPrice / 100).toFixed(0)}`}
                    </span>
                    {plan.monthlyPrice > 0 && (
                      <span className="text-sm text-muted-foreground">/month</span>
                    )}
                  </div>
                </div>

                <ul className="flex-1 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isCurrent ? "outline" : planId === "pro" ? "gold" : "default"}
                  disabled={isCurrent}
                  onClick={() => setSelectedPlan(planId)}
                  className="w-full"
                >
                  {isCurrent ? "Current plan" : planId === "free" ? "Downgrade" : "Upgrade"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Usage summary */}
        <div className="surface-panel p-5">
          <p className="text-sm font-semibold">Plan limits</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Documents/month",
                value: PLANS[currentPlan].documentsPerMonth,
              },
              {
                label: "Pages/document",
                value: PLANS[currentPlan].pagesPerDocument,
              },
              {
                label: "AI messages/month",
                value: PLANS[currentPlan].aiMessagesPerMonth,
              },
              {
                label: "Storage",
                value: formatBytes(PLANS[currentPlan].storageBytes),
              },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-display text-lg font-semibold">{item.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm plan change dialog */}
      <Dialog open={selectedPlan !== null} onOpenChange={(o) => !o && setSelectedPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>
              {selectedPlan && selectedPlan !== "free"
                ? `Upgrade to ${PLANS[selectedPlan].name} — $${(PLANS[selectedPlan].monthlyPrice / 100).toFixed(0)}/month`
                : selectedPlan === "free"
                ? "Downgrade to the Free plan."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPlan(null)}>Cancel</Button>
            <Button
              variant={selectedPlan === "pro" ? "gold" : "default"}
              disabled={pending}
              onClick={handleSelectPlan}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {selectedPlan === "free" ? "Downgrade to Free" : "Confirm upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={showCancel} onOpenChange={(o) => !o && setShowCancel(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription</DialogTitle>
            <DialogDescription>
              You'll keep access until the end of your billing period. You can reactivate anytime before then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Keep subscription</Button>
            <Button variant="destructive" disabled={pending} onClick={handleCancel}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Cancel subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog open={showReactivate} onOpenChange={(o) => !o && setShowReactivate(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate subscription</DialogTitle>
            <DialogDescription>
              Your subscription will continue as normal. You'll keep all your documents and history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReactivate(false)}>Cancel</Button>
            <Button variant="gold" disabled={pending} onClick={handleReactivate}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
