import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { signPayload, verifySignature } from "../convex/lib/signing";
import { setup } from "./setup";

const SECRET = "test-inbound-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("N8N_TO_LENDLOOP_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function signedPost(t: ReturnType<typeof setup>["t"], path: string, body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  const { timestamp, signature } = await signPayload(secret, raw);
  return t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-LendLoop-Timestamp": timestamp, "X-LendLoop-Signature": signature },
    body: raw,
  });
}

/** Seeds an overdue loan directly (the public API won't let you book in the past). */
async function seedOverdue(t: ReturnType<typeof setup>["t"]) {
  return await t.run(async (ctx) => {
    const lender = await ctx.db.insert("users", { tokenIdentifier: "l", name: "Lena Lender", email: "lena@example.com", role: "user", trustedLender: false });
    const borrower = await ctx.db.insert("users", { tokenIdentifier: "b", name: "Ben Borrower", email: "ben@example.com", role: "user", trustedLender: false });
    const toolId = await ctx.db.insert("tools", { ownerId: lender, name: "Ladder", category: "ladders", condition: "good", description: "" });
    return await ctx.db.insert("loans", {
      toolId, borrowerId: borrower, lenderId: lender, startDate: "2020-01-01", endDate: "2020-01-05",
      status: "approved", reminderCount: 0,
    });
  });
}

describe("HMAC signing", () => {
  test("round trip, tampering and replay window", async () => {
    const body = JSON.stringify({ hello: "world" });
    const { timestamp, signature } = await signPayload("s3cret", body);
    expect(await verifySignature("s3cret", body, timestamp, signature)).toEqual({ ok: true });
    expect((await verifySignature("s3cret", body + " ", timestamp, signature)).ok).toBe(false);
    expect((await verifySignature("other", body, timestamp, signature)).ok).toBe(false);
    expect((await verifySignature("s3cret", body, timestamp, null)).ok).toBe(false);
    const old = await signPayload("s3cret", body, Math.floor(Date.now() / 1000) - 600);
    expect(await verifySignature("s3cret", body, old.timestamp, old.signature)).toEqual({
      ok: false,
      reason: "timestamp outside tolerance",
    });
  });
});

describe("n8n HTTP endpoints", () => {
  test("reject unsigned, wrongly signed and wrong-type requests", async () => {
    const { t } = setup();
    expect((await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await signedPost(t, "/n8n/overdue-loans", { type: "overdue.list" }, "wrong")).status).toBe(401);
    expect((await signedPost(t, "/n8n/overdue-loans", { type: "reminder.result" })).status).toBe(400);
  });

  test("overdue list is minimal and reminder write-back is idempotent", async () => {
    const { t } = setup();
    const loanId = await seedOverdue(t);

    const res = await signedPost(t, "/n8n/overdue-loans", { type: "overdue.list" });
    expect(res.status).toBe(200);
    const { loans } = await res.json();
    expect(loans).toHaveLength(1);
    expect(loans[0].borrower).toEqual({ name: "Ben", email: "ben@example.com" });
    expect(Object.keys(loans[0]).sort()).toEqual(
      ["borrower", "daysOverdue", "endDate", "lenderName", "loanId", "reminderKey", "toolName"],
    );

    const writeBack = { type: "reminder.result", loanId, reminderKey: loans[0].reminderKey, status: "sent" };
    expect(await (await signedPost(t, "/n8n/reminder-result", writeBack)).json()).toMatchObject({ duplicate: false });
    expect(await (await signedPost(t, "/n8n/reminder-result", writeBack)).json()).toMatchObject({ duplicate: true });

    const state = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      events: await ctx.db.query("automationEvents").collect(),
    }));
    expect(state.loan?.reminderCount).toBe(1);
    expect(state.events).toHaveLength(1);

    // Already reminded today -> excluded from the next run.
    const again = await (await signedPost(t, "/n8n/overdue-loans", { type: "overdue.list" })).json();
    expect(again.loans).toHaveLength(0);
  });

  test("reminder keys must belong to the loan", async () => {
    const { t } = setup();
    const loanId = await seedOverdue(t);
    const res = await signedPost(t, "/n8n/reminder-result", {
      type: "reminder.result", loanId, reminderKey: "reminder:someotherloan:2026-01-01", status: "sent",
    });
    expect(res.status).toBe(422);
  });

  test("workflow failures are recorded once per execution", async () => {
    const { t, cat } = setup();
    const body = { type: "workflow.failure", executionId: "42", workflowName: "Reminders", message: "boom" };
    await signedPost(t, "/n8n/workflow-failure", body);
    await signedPost(t, "/n8n/workflow-failure", body);
    await cat.mutation(api.users.store, {});
    await t.mutation(internal.users.setRole, { email: "cat@example.com", role: "admin" });
    const health = await cat.query(api.admin.automationHealth, {});
    expect(health.workflowFailures).toHaveLength(1);
  });
});

describe("notification outbox", () => {
  test("delivery failures retry with backoff, then surface as failed", async () => {
    const { t, ann, bob } = setup();
    await ann.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    const toolId = await ann.mutation(api.tools.create, { name: "Tent", category: "camping", condition: "good", description: "" });
    const today = new Date().toISOString().slice(0, 10);
    await bob.mutation(api.loans.request, { toolId, startDate: today, endDate: today });

    // No webhook URL configured: every attempt fails until MAX_ATTEMPTS.
    for (let i = 0; i < 6; i++) {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    const [event] = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(event.status).toBe("failed");
    expect(event.attempts).toBe(5);
    expect(event.lastError).toMatch(/not configured/);
  });

  test("payload sent to n8n is signed and minimal", async () => {
    vi.stubEnv("N8N_LOAN_EVENTS_WEBHOOK_URL", "https://n8n.test/webhook/x");
    vi.stubEnv("LENDLOOP_TO_N8N_SECRET", "outbound");
    const calls: { body: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push({ body: init.body as string, headers: new Headers(init.headers) });
      return new Response("{}", { status: 202 });
    });

    const { t, ann, bob } = setup();
    await ann.mutation(api.users.store, {});
    await bob.mutation(api.users.store, {});
    const toolId = await ann.mutation(api.tools.create, { name: "Tent", category: "camping", condition: "good", description: "" });
    const today = new Date().toISOString().slice(0, 10);
    await bob.mutation(api.loans.request, { toolId, startDate: today, endDate: today, message: "private note" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.unstubAllGlobals();

    expect(calls).toHaveLength(1);
    const { body, headers } = calls[0];
    const verdict = await verifySignature("outbound", body, headers.get("X-LendLoop-Timestamp"), headers.get("X-LendLoop-Signature"));
    expect(verdict.ok).toBe(true);
    const payload = JSON.parse(body);
    expect(payload.recipient).toEqual({ role: "lender", name: "Ann", email: "ann@example.com" });
    expect(payload.counterpartyName).toBe("Bob");
    expect(body).not.toContain("private note"); // free-text message never leaves Convex
    expect(body).not.toContain("bob@example.com"); // nor the other party's email

    const [event] = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(event.status).toBe("delivered");
  });
});
