import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type ActivityItem = {
  id: Id<"automationEvents">;
  kind: Doc<"automationEvents">["kind"];
  eventType: string;
  status: Doc<"automationEvents">["status"];
  recipientRole: "lender" | "borrower";
  at: number;
};

/** Most recent automation events for a loan (no payloads, no error details). */
export async function loanActivity(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  limit = 4,
): Promise<ActivityItem[]> {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .order("desc")
    .take(limit);
  return events.map((e) => ({
    id: e._id,
    kind: e.kind,
    eventType: e.eventType,
    status: e.status,
    recipientRole: e.recipientId === loan.lenderId ? "lender" : "borrower",
    at: e.completedAt ?? e._creationTime,
  }));
}
