"use client";

import type { ActivityItem } from "@convex/lib/activity";
import { relativeTime } from "@/lib/time";

const EVENT_NOUN: Record<string, string> = {
  "loan.requested": "the new request",
  "loan.approved": "the approval",
  "loan.declined": "the decline",
  "loan.cancelled": "the cancellation",
  "loan.returned": "the return",
};

function describe(item: ActivityItem): { text: string; tone: "ok" | "pending" | "bad" } {
  const who = item.recipientRole === "lender" ? "Lender" : "Borrower";
  const when = relativeTime(item.at);
  if (item.kind === "overdue_reminder") {
    return item.status === "sent"
      ? { text: `Reminder sent ${when}`, tone: "ok" }
      : { text: `Reminder failed ${when}, will retry on the next run`, tone: "bad" };
  }
  const noun = EVENT_NOUN[item.eventType] ?? "an update";
  switch (item.status) {
    case "sent":
      return { text: `${who} notified about ${noun} ${when}`, tone: "ok" };
    case "delivered":
      return { text: `Notifying the ${who.toLowerCase()} about ${noun}…`, tone: "pending" };
    case "pending":
      return { text: `Queued: ${who.toLowerCase()} notification about ${noun}`, tone: "pending" };
    case "failed":
      return { text: `Couldn't notify the ${who.toLowerCase()} about ${noun} (${when})`, tone: "bad" };
  }
}

/** Recent automation activity on a loan, e.g. "Reminder sent 2 days ago". */
export function ActivityList({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-line pt-3">
      {items.map((item) => {
        const { text, tone } = describe(item);
        return (
          <li key={item.id} className="flex items-center gap-2 text-xs text-muted">
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                tone === "ok" ? "bg-accent" : tone === "bad" ? "bg-danger" : "bg-warn"
              }`}
            />
            <span className={tone === "bad" ? "text-danger" : undefined}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
