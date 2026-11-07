import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { appError, displayName, requireAdmin } from "./lib/auth";
import { getAvailability } from "./lib/availability";
import { todayUtc } from "./lib/dates";
import { presentLoan } from "./loans";

/** Every query/mutation in this file starts with requireAdmin(). */

function maskEmail(email: string | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export const allLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const today = todayUtc();
    const loans = await ctx.db.query("loans").order("desc").take(200);
    // Admins oversee loans but don't need the private note between neighbors.
    return await Promise.all(loans.map((l) => presentLoan(ctx, l, today, { includeMessage: false })));
  },
});

export const allListings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const today = todayUtc();
    const tools = (await ctx.db.query("tools").order("desc").take(300)).filter(
      (t) => t.removedAt === undefined,
    );
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          ownerName: displayName(owner),
          ownerTrusted: owner?.trustedLender ?? false,
          availability: await getAvailability(ctx, t._id, today),
        };
      }),
    );
  },
});

/** Users who have listed at least one tool, for the Trusted Lender toggle. */
export const lenders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(500);
    const rows = await Promise.all(
      users.map(async (u) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id))
          .collect();
        return {
          _id: u._id,
          name: u.name,
          email: maskEmail(u.email),
          role: u.role,
          trustedLender: u.trustedLender,
          listings: tools.filter((t) => t.removedAt === undefined).length,
        };
      }),
    );
    return rows.filter((r) => r.listings > 0 || r.trustedLender);
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted, trustedLenderUpdatedBy: admin._id });
    console.log(`[audit] admin ${admin._id} set trustedLender=${trusted} on ${userId}`);
  },
});

/** Failed notifications/reminders and failed n8n executions. */
export const automationHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const failedEvents = await ctx.db
      .query("automationEvents")
      .withIndex("by_status_next", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(25);
    const retrying = await ctx.db
      .query("automationEvents")
      .withIndex("by_status_next", (q) => q.eq("status", "pending"))
      .take(100);
    const workflowFailures = await ctx.db.query("workflowFailures").order("desc").take(25);
    return {
      pendingCount: retrying.length,
      failedEvents: await Promise.all(
        failedEvents.map(async (e) => {
          const loan = await ctx.db.get(e.loanId);
          const tool = loan ? await ctx.db.get(loan.toolId) : null;
          return {
            _id: e._id,
            kind: e.kind,
            eventType: e.eventType,
            attempts: e.attempts,
            lastError: e.lastError ?? null,
            toolName: tool?.name ?? "—",
            at: e.completedAt ?? e._creationTime,
          };
        }),
      ),
      workflowFailures: workflowFailures.map((f) => ({
        _id: f._id,
        workflowName: f.workflowName,
        nodeName: f.nodeName ?? null,
        message: f.message,
        executionId: f.executionId,
        at: f.occurredAt,
      })),
    };
  },
});

export const retryNotification = mutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const admin = await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.notifications.requeue, { eventId });
    console.log(`[audit] admin ${admin._id} requeued notification ${eventId}`);
  },
});
