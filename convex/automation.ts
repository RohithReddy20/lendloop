import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { displayName } from "./lib/auth";
import { daysBetween, todayUtc } from "./lib/dates";

/**
 * Internal functions behind the signed HTTP endpoints that n8n calls (see http.ts).
 * They are not callable from the browser.
 */

const REMINDER_KEY_RE = /^reminder:([a-z0-9]+):(\d{4}-\d{2}-\d{2})$/;

export function reminderKey(loanId: Id<"loans">, date: string): string {
  return `reminder:${loanId}:${date}`;
}

/**
 * Overdue = approved (not returned) and end date before today (UTC).
 * Loans already reminded today are excluded, so re-running the workflow the same
 * day never sends a second reminder.
 */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(500);

    const result = [];
    for (const loan of loans) {
      const key = reminderKey(loan._id, today);
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("eventKey", key))
        .unique();
      if (existing?.status === "sent") continue;

      const [borrower, lender, tool] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.lenderId),
        ctx.db.get(loan.toolId),
      ]);
      // Data minimization: only what a reminder needs.
      result.push({
        loanId: loan._id,
        reminderKey: key,
        borrower: { name: displayName(borrower), email: borrower?.email ?? null },
        lenderName: displayName(lender),
        toolName: tool?.name ?? "a borrowed tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
    }
    return { asOf: today, loans: result };
  },
});

/** Idempotent write-back of a reminder outcome, keyed by reminderKey. */
export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    reminderKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    const match = REMINDER_KEY_RE.exec(args.reminderKey);
    if (!loanId || !match || match[1] !== args.loanId) {
      return { ok: false as const, error: "invalid loanId/reminderKey" };
    }
    const loan = await ctx.db.get(loanId);
    if (!loan) return { ok: false as const, error: "loan not found" };

    const now = Date.now();
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("eventKey", args.reminderKey))
      .unique();

    if (existing?.status === "sent") {
      return { ok: true as const, duplicate: true };
    }

    const error = args.error?.slice(0, 300);
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        attempts: existing.attempts + 1,
        lastError: args.status === "failed" ? error : undefined,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("automationEvents", {
        loanId,
        kind: "overdue_reminder",
        eventKey: args.reminderKey,
        eventType: "loan.overdue_reminder",
        recipientId: loan.borrowerId,
        status: args.status,
        attempts: 1,
        lastError: args.status === "failed" ? error : undefined,
        completedAt: now,
      });
    }
    if (args.status === "sent") {
      await ctx.db.patch(loanId, { lastReminderAt: now, reminderCount: loan.reminderCount + 1 });
    }
    return { ok: true as const, duplicate: false };
  },
});

/** n8n confirms (or reports failure of) the notification it sent for a loan event. */
export const recordNotificationResult = internalMutation({
  args: {
    eventId: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const eventId = ctx.db.normalizeId("automationEvents", args.eventId);
    const event = eventId ? await ctx.db.get(eventId) : null;
    if (!eventId || !event || event.kind !== "request_notification") {
      return { ok: false as const, error: "unknown eventId" };
    }
    if (event.status === "sent") return { ok: true as const, duplicate: true };
    await ctx.db.patch(eventId, {
      status: args.status,
      lastError: args.status === "failed" ? args.error?.slice(0, 300) : undefined,
      completedAt: Date.now(),
      nextAttemptAt: undefined,
    });
    return { ok: true as const, duplicate: false };
  },
});

/** Called by the n8n error workflow; de-duplicated by execution id. */
export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowFailures")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .unique();
    if (existing) return { ok: true as const, duplicate: true };
    await ctx.db.insert("workflowFailures", {
      executionId: args.executionId.slice(0, 64),
      workflowName: args.workflowName.slice(0, 120),
      nodeName: args.nodeName?.slice(0, 120),
      message: args.message.slice(0, 500),
      occurredAt: Date.now(),
    });
    console.error(`[n8n] workflow "${args.workflowName}" failed (execution ${args.executionId})`);
    return { ok: true as const, duplicate: false };
  },
});
