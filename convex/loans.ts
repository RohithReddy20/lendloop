import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { loanActivity } from "./lib/activity";
import {
  appError,
  displayName,
  getLiveTool,
  getLoanOrThrow,
  requireBorrower,
  requireLender,
  requireUser,
} from "./lib/auth";
import { approvedLoans } from "./lib/availability";
import { LIMITS } from "./lib/constants";
import { addDays, daysBetween, isValidDate, rangesOverlap, todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./notifications";

const MAX_LIST = 200;

/**
 * Shape returned to the client for a loan: first names only, no emails or user ids.
 * The borrower's free-text note is only included for the two parties of the loan.
 */
export async function presentLoan(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  today = todayUtc(),
  { includeMessage = true }: { includeMessage?: boolean } = {},
) {
  const [tool, borrower, lender] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.borrowerId),
    ctx.db.get(loan.lenderId),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    toolId: loan.toolId,
    toolName: tool?.name ?? "Removed tool",
    toolCategory: tool?.category ?? null,
    toolRemoved: !tool || tool.removedAt !== undefined,
    borrowerName: displayName(borrower),
    lenderName: displayName(lender),
    lenderTrusted: lender?.trustedLender ?? false,
    startDate: loan.startDate,
    endDate: loan.endDate,
    message: includeMessage ? (loan.message ?? null) : null,
    status: loan.status,
    isOverdue: loan.status === "approved" && loan.endDate < today,
    returnedAt: loan.returnedAt ?? null,
    lastReminderAt: loan.lastReminderAt ?? null,
    reminderCount: loan.reminderCount,
    activity: await loanActivity(ctx, loan),
  };
}

function sortForDisplay<T extends { status: string; _creationTime: number }>(rows: T[]): T[] {
  const rank: Record<string, number> = { pending: 0, approved: 1, returned: 2, declined: 3, cancelled: 4 };
  return rows.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b._creationTime - a._creationTime);
}

async function assertNoApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  startDate: string,
  endDate: string,
  ignore?: Id<"loans">,
) {
  const clash = (await approvedLoans(ctx, toolId)).find(
    (l) => l._id !== ignore && rangesOverlap(startDate, endDate, l.startDate, l.endDate),
  );
  if (clash) {
    throw appError("CONFLICT", `Already booked ${clash.startDate} → ${clash.endDate}.`);
  }
}

// ---------------------------------------------------------------- queries

/** "My requests": loans where I am the borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .take(MAX_LIST);
    const today = todayUtc();
    return sortForDisplay(await Promise.all(loans.map((l) => presentLoan(ctx, l, today))));
  },
});

/** "Incoming requests": loans for tools I own. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .take(MAX_LIST);
    const today = todayUtc();
    return sortForDisplay(await Promise.all(loans.map((l) => presentLoan(ctx, l, today))));
  },
});

// ---------------------------------------------------------------- mutations

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, { toolId, startDate, endDate, message }) => {
    const user = await requireUser(ctx);
    const tool = await getLiveTool(ctx, toolId);
    if (tool.ownerId === user._id) throw appError("FORBIDDEN", "You can't borrow your own tool.");

    const today = todayUtc();
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      throw appError("INVALID_INPUT", "Dates must be valid (YYYY-MM-DD).");
    }
    if (startDate < today) throw appError("INVALID_INPUT", "Start date can't be in the past.");
    if (endDate < startDate) throw appError("INVALID_INPUT", "End date must be on or after the start date.");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      throw appError("INVALID_INPUT", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
    }
    if (startDate > addDays(today, LIMITS.maxBookAheadDays)) {
      throw appError("INVALID_INPUT", `You can book at most ${LIMITS.maxBookAheadDays} days ahead.`);
    }
    const note = message?.trim() || undefined;
    if (note && note.length > LIMITS.requestMessage.max) {
      throw appError("INVALID_INPUT", `Message must be at most ${LIMITS.requestMessage.max} characters.`);
    }

    const myPending = (
      await ctx.db
        .query("loans")
        .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
        .collect()
    ).filter((l) => l.status === "pending");
    if (myPending.some((l) => l.toolId === toolId)) {
      throw appError("CONFLICT", "You already have a pending request for this tool.");
    }
    if (myPending.length >= LIMITS.maxPendingRequestsPerBorrower) {
      throw appError("CONFLICT", "You have too many pending requests. Wait for some to be answered.");
    }
    await assertNoApprovedOverlap(ctx, toolId, startDate, endDate);

    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      message: note,
      status: "pending",
      reminderCount: 0,
    });
    await enqueueLoanEvent(ctx, loanId, "loan.requested", tool.ownerId);
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    requireLender(user, loan);
    if (loan.status !== "pending") throw appError("CONFLICT", `This request is already ${loan.status}.`);
    await getLiveTool(ctx, loan.toolId);
    if (loan.endDate < todayUtc()) {
      throw appError("CONFLICT", "The requested dates have already passed. Decline it instead.");
    }
    await assertNoApprovedOverlap(ctx, loan.toolId, loan.startDate, loan.endDate, loan._id);

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueLoanEvent(ctx, loanId, "loan.approved", loan.borrowerId);

    // Other pending requests for overlapping dates can no longer be satisfied.
    const competing = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "pending"))
      .collect();
    for (const other of competing) {
      if (other._id === loanId) continue;
      if (!rangesOverlap(loan.startDate, loan.endDate, other.startDate, other.endDate)) continue;
      await ctx.db.patch(other._id, { status: "declined", decidedAt: now });
      await enqueueLoanEvent(ctx, other._id, "loan.declined", other.borrowerId);
    }
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    requireLender(user, loan);
    if (loan.status !== "pending") throw appError("CONFLICT", `This request is already ${loan.status}.`);
    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan.declined", loan.borrowerId);
  },
});

/** Borrower withdraws a pending request or an approved booking that hasn't started. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    requireBorrower(user, loan);
    const cancellable =
      loan.status === "pending" || (loan.status === "approved" && loan.startDate > todayUtc());
    if (!cancellable) throw appError("CONFLICT", "Only pending or upcoming bookings can be cancelled.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan.cancelled", loan.lenderId);
  },
});

/** The lender confirms they got the tool back. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const user = await requireUser(ctx);
    const loan = await getLoanOrThrow(ctx, loanId);
    requireLender(user, loan);
    if (loan.status !== "approved") throw appError("CONFLICT", "Only active loans can be marked as returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan.returned", loan.borrowerId);
  },
});
