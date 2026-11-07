"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { AvailabilityBadge } from "@/components/availability";
import { LoanCard } from "@/components/loan-card";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ConfirmModal, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/time";

const TABS = ["Automation health", "Listings", "Loans", "Lenders"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("Automation health");

  if (me === undefined) return <PageLoader />;
  // The UI check is cosmetic: every admin query/mutation calls requireAdmin() in Convex.
  if (me?.role !== "admin") {
    return <EmptyState title="Admins only">You don&apos;t have access to this page.</EmptyState>;
  }

  return (
    <>
      <PageHeader title="Admin" description="Moderate listings, oversee loans and keep an eye on automations." />
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-ink/5 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
              tab === t ? "bg-card font-medium shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Automation health" && <AutomationHealth />}
      {tab === "Listings" && <Listings />}
      {tab === "Loans" && <Loans />}
      {tab === "Lenders" && <Lenders />}
    </>
  );
}

function AutomationHealth() {
  const health = useQuery(api.admin.automationHealth);
  const retry = useMutation(api.admin.retryNotification);
  const toast = useToast();
  if (health === undefined) return <PageLoader />;

  const healthy = health.failedEvents.length === 0 && health.workflowFailures.length === 0;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Queued / retrying" value={health.pendingCount} tone={health.pendingCount ? "warn" : "neutral"} />
        <Stat label="Failed notifications" value={health.failedEvents.length} tone={health.failedEvents.length ? "danger" : "neutral"} />
        <Stat label="Failed n8n runs" value={health.workflowFailures.length} tone={health.workflowFailures.length ? "danger" : "neutral"} />
      </div>
      {healthy && <EmptyState title="All automations healthy">No failed notifications, reminders or workflow runs.</EmptyState>}

      {health.failedEvents.length > 0 && (
        <Card>
          <h3 className="mb-3 font-medium">Failed notifications &amp; reminders</h3>
          <ul className="divide-y divide-line">
            {health.failedEvents.map((e) => (
              <li key={e._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p>
                    <Badge tone="danger">{e.kind === "overdue_reminder" ? "reminder" : e.eventType}</Badge>{" "}
                    <span className="font-medium">{e.toolName}</span>{" "}
                    <span className="text-muted">
                      · {e.attempts} attempt{e.attempts === 1 ? "" : "s"} · {relativeTime(e.at)}
                    </span>
                  </p>
                  {e.lastError && <p className="mt-1 truncate font-mono text-xs text-muted">{e.lastError}</p>}
                </div>
                {e.kind === "request_notification" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      retry({ eventId: e._id }).then(() => toast.success("Re-queued"), (err) => toast.error(err))
                    }
                  >
                    Retry
                  </Button>
                ) : (
                  <span className="text-xs text-muted">Retried by the next daily run</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {health.workflowFailures.length > 0 && (
        <Card>
          <h3 className="mb-3 font-medium">Failed n8n executions</h3>
          <ul className="divide-y divide-line">
            {health.workflowFailures.map((f) => (
              <li key={f._id} className="py-3 text-sm">
                <p>
                  <span className="font-medium">{f.workflowName}</span>
                  {f.nodeName && <span className="text-muted"> · node “{f.nodeName}”</span>}
                  <span className="text-muted">
                    {" "}
                    · execution {f.executionId} · {relativeTime(f.at)}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs text-danger">{f.message}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warn" | "danger" }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : ""}`}>
        {value}
      </p>
    </Card>
  );
}

type Listing = FunctionReturnType<typeof api.admin.allListings>[number];

function Listings() {
  const listings = useQuery(api.admin.allListings);
  const removeTool = useMutation(api.tools.remove);
  const toast = useToast();
  const [removing, setRemoving] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  if (listings === undefined) return <PageLoader />;
  if (listings.length === 0) return <EmptyState title="No listings" />;

  async function confirm() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeTool({ toolId: removing._id });
      toast.success(`Removed “${removing.name}”`);
      setRemoving(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="p-0">
        <ul className="divide-y divide-line">
          {listings.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span aria-hidden>{CATEGORY_ICONS[t.category]}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted">
                  {CATEGORY_LABELS[t.category]} · by {t.ownerName} {t.ownerTrusted && "✓"}
                </p>
              </div>
              <AvailabilityBadge availability={t.availability} />
              <Button size="sm" variant="danger" onClick={() => setRemoving(t)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirm}
        loading={busy}
        title="Remove this listing?"
        confirmLabel="Remove listing"
        body={
          <>
            <strong>{removing?.name}</strong> by {removing?.ownerName} will be removed from the board. Pending requests and
            upcoming bookings are cancelled and borrowers notified.
          </>
        }
      />
    </>
  );
}

function Loans() {
  const loans = useQuery(api.admin.allLoans);
  const [filter, setFilter] = useState<"all" | "overdue" | "active">("all");
  if (loans === undefined) return <PageLoader />;
  const visible = loans.filter((l) =>
    filter === "overdue" ? l.isOverdue : filter === "active" ? l.status === "approved" || l.status === "pending" : true,
  );
  return (
    <>
      <div className="mb-4 flex gap-2 text-sm">
        {(["all", "active", "overdue"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="No loans here" />
      ) : (
        <ul className="space-y-3">
          {visible.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} perspective="admin" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Lenders() {
  const lenders = useQuery(api.admin.lenders);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const toast = useToast();
  if (lenders === undefined) return <PageLoader />;
  if (lenders.length === 0) return <EmptyState title="No lenders yet" />;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">
        {lenders.map((u) => (
          <li key={u._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {u.name}
                {u.role === "admin" && <Badge>admin</Badge>}
                {u.trustedLender && <Badge tone="info">✓ Trusted Lender</Badge>}
              </p>
              <p className="text-xs text-muted">
                {u.email ?? "no email"} · {u.listings} listing{u.listings === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              size="sm"
              variant={u.trustedLender ? "secondary" : "primary"}
              onClick={() =>
                setTrusted({ userId: u._id, trusted: !u.trustedLender }).then(
                  () => toast.success(u.trustedLender ? "Trusted badge removed" : `${u.name} is now a Trusted Lender`),
                  (err) => toast.error(err),
                )
              }
            >
              {u.trustedLender ? "Remove trusted" : "Mark trusted"}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
