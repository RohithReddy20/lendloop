import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { displayName } from "./lib/auth";
import { signPayload, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/signing";

/**
 * Convex -> n8n "request notification" pipeline (transactional outbox).
 *
 * 1. A mutation that changes a loan's status calls `enqueueLoanEvent` in the SAME
 *    transaction, so an event is recorded iff the status change commits.
 * 2. `deliver` (action) signs a minimal payload and POSTs it to the n8n webhook.
 * 3. Failures are retried with exponential backoff; after MAX_ATTEMPTS the event
 *    is marked `failed` and shows up in the admin "Automation health" panel.
 * 4. A cron sweeps events whose delivery was lost (e.g. action crashed).
 *
 * n8n de-duplicates on `dedupeKey` (event id + generation), so a retry after a
 * lost response never notifies anyone twice.
 */

export type LoanEventType =
  | "loan.requested"
  | "loan.approved"
  | "loan.declined"
  | "loan.cancelled"
  | "loan.returned";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000; // an in-flight attempt "owns" the event this long
const BASE_BACKOFF_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  eventType: LoanEventType,
  recipientId: Id<"users">,
): Promise<void> {
  // Each status transition happens at most once per loan, so this key is unique.
  const eventKey = `loan:${loanId}:${eventType}`;
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_key", (q) => q.eq("eventKey", eventKey))
    .unique();
  if (existing) return;

  const eventId = await ctx.db.insert("automationEvents", {
    loanId,
    kind: "request_notification",
    eventKey,
    eventType,
    recipientId,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { eventId });
}

/** Claims the next attempt and builds the payload. Returns null if nothing to do. */
export const beginAttempt = internalMutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.status !== "pending") return null;

    const loan = await ctx.db.get(event.loanId);
    if (!loan) return null;
    const [tool, recipient] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(event.recipientId),
    ]);
    const recipientRole = event.recipientId === loan.lenderId ? "lender" : "borrower";
    const counterparty = await ctx.db.get(
      recipientRole === "lender" ? loan.borrowerId : loan.lenderId,
    );

    const attempt = event.attempts + 1;
    await ctx.db.patch(eventId, { attempts: attempt, nextAttemptAt: Date.now() + LEASE_MS });

    // Data minimization: only what the notification needs. First names only,
    // only the recipient's own email, no ids of other users, no free-text message.
    const payload = {
      eventId,
      dedupeKey: `${eventId}:${event.generation ?? 0}`,
      type: event.eventType,
      occurredAt: new Date(event._creationTime).toISOString(),
      attempt,
      recipient: {
        role: recipientRole,
        name: displayName(recipient),
        email: recipient?.email ?? null,
      },
      counterpartyName: displayName(counterparty),
      loan: {
        toolName: tool?.name ?? "a tool",
        startDate: loan.startDate,
        endDate: loan.endDate,
        status: loan.status,
      },
      link: process.env.SITE_URL
        ? `${process.env.SITE_URL}/${recipientRole === "lender" ? "incoming" : "requests"}`
        : null,
    };
    return { attempt, payload };
  },
});

export const deliver = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const claim = await ctx.runMutation(internal.notifications.beginAttempt, { eventId });
    if (!claim) return;

    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.notifications.recordFailure, {
        eventId,
        error: "n8n webhook not configured (N8N_LOAN_EVENTS_WEBHOOK_URL / LENDLOOP_TO_N8N_SECRET)",
      });
      return;
    }

    const body = JSON.stringify(claim.payload);
    const { timestamp, signature } = await signPayload(secret, body);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
          "Idempotency-Key": eventId,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        await ctx.runMutation(internal.notifications.markDelivered, { eventId });
      } else {
        const text = (await res.text()).slice(0, 200);
        await ctx.runMutation(internal.notifications.recordFailure, {
          eventId,
          error: `n8n responded ${res.status}: ${text}`,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.notifications.recordFailure, {
        eventId,
        error: `request failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
      });
    }
  },
});

export const markDelivered = internalMutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    // n8n may already have written back "sent"/"failed" before we got here.
    if (!event || event.status !== "pending") return;
    await ctx.db.patch(eventId, {
      status: "delivered",
      completedAt: Date.now(),
      nextAttemptAt: undefined,
      lastError: undefined,
    });
  },
});

export const recordFailure = internalMutation({
  args: { eventId: v.id("automationEvents"), error: v.string() },
  handler: async (ctx, { eventId, error }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.status !== "pending") return;
    console.warn(`[notifications] event ${eventId} attempt ${event.attempts} failed: ${error}`);

    if (event.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(eventId, {
        status: "failed",
        lastError: error,
        nextAttemptAt: undefined,
        completedAt: Date.now(),
      });
      console.error(`[notifications] event ${eventId} gave up after ${event.attempts} attempts`);
      return;
    }
    // 30s, 60s, 2m, 4m (+ up to 20% jitter)
    const backoff = BASE_BACKOFF_MS * 2 ** (event.attempts - 1);
    const delay = Math.round(backoff * (1 + Math.random() * 0.2));
    await ctx.db.patch(eventId, { lastError: error, nextAttemptAt: Date.now() + delay });
    await ctx.scheduler.runAfter(delay, internal.notifications.deliver, { eventId });
  },
});

/** Cron: re-schedule pending events whose delivery attempt was lost. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("automationEvents")
      .withIndex("by_status_next", (q) =>
        q.eq("status", "pending").lt("nextAttemptAt", Date.now() - 60_000),
      )
      .take(50);
    for (const event of stale) {
      await ctx.db.patch(event._id, { nextAttemptAt: Date.now() + LEASE_MS });
      await ctx.scheduler.runAfter(0, internal.notifications.deliver, { eventId: event._id });
    }
    if (stale.length) console.warn(`[notifications] swept ${stale.length} stalled event(s)`);
  },
});

/** Admin "retry now" for an event that exhausted its retries. */
export const requeue = internalMutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.kind !== "request_notification" || event.status !== "failed") return false;
    await ctx.db.patch(eventId, {
      status: "pending",
      attempts: 0,
      generation: (event.generation ?? 0) + 1,
      lastError: undefined,
      nextAttemptAt: Date.now(),
      completedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { eventId });
    return true;
  },
});
