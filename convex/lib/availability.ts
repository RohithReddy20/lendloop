import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { todayUtc } from "./dates";

export type Availability =
  | { state: "available"; nextBooking: { startDate: string; endDate: string } | null }
  | { state: "on_loan"; until: string }
  | { state: "overdue"; since: string };

/** Approved, not-yet-returned loans for a tool. */
export async function approvedLoans(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

export async function getAvailability(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today: string = todayUtc(),
): Promise<Availability> {
  const loans = await approvedLoans(ctx, toolId);
  const active = loans.find((l) => l.startDate <= today);
  if (active) {
    return active.endDate < today
      ? { state: "overdue", since: active.endDate }
      : { state: "on_loan", until: active.endDate };
  }
  const upcoming = loans.sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return {
    state: "available",
    nextBooking: upcoming ? { startDate: upcoming.startDate, endDate: upcoming.endDate } : null,
  };
}
