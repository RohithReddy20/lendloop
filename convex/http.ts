import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "./lib/signing";

/**
 * Endpoints called by n8n. Every request must be signed with N8N_TO_LENDLOOP_SECRET
 * (HMAC-SHA256 over `${timestamp}.${rawBody}`, see lib/signing.ts).
 *
 * All endpoints are POST with a JSON body whose `type` must match the endpoint,
 * so a signature captured for one operation can't be replayed against another.
 */

const MAX_BODY_BYTES = 16 * 1024;

type Json = Record<string, unknown>;

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

function signedEndpoint(expectedType: string, handler: (ctx: ActionCtx, body: Json) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_LENDLOOP_SECRET;
    if (!secret) {
      console.error("[http] N8N_TO_LENDLOOP_SECRET is not configured");
      return json(503, { error: "not configured" });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "payload too large" });

    const verdict = await verifySignature(
      secret,
      raw,
      request.headers.get(TIMESTAMP_HEADER),
      request.headers.get(SIGNATURE_HEADER),
    );
    if (!verdict.ok) {
      // Log the reason server-side; never tell the caller which check failed.
      console.warn(`[http] rejected ${new URL(request.url).pathname}: ${verdict.reason}`);
      return json(401, { error: "invalid signature" });
    }

    let body: Json;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Json;
    } catch {
      return json(400, { error: "invalid JSON" });
    }
    if (body.type !== expectedType) return json(400, { error: `type must be "${expectedType}"` });
    return handler(ctx, body);
  });
}

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signedEndpoint("overdue.list", async (ctx) => {
    const result = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json(200, result);
  }),
});

http.route({
  path: "/n8n/reminder-result",
  method: "POST",
  handler: signedEndpoint("reminder.result", async (ctx, body) => {
    const loanId = str(body.loanId, 64);
    const reminderKey = str(body.reminderKey, 128);
    const status = body.status === "sent" || body.status === "failed" ? body.status : undefined;
    if (!loanId || !reminderKey || !status) return json(400, { error: "loanId, reminderKey, status required" });
    const result = await ctx.runMutation(internal.automation.recordReminder, {
      loanId,
      reminderKey,
      status,
      error: str(body.error, 1000),
    });
    return json(result.ok ? 200 : 422, result);
  }),
});

http.route({
  path: "/n8n/notification-result",
  method: "POST",
  handler: signedEndpoint("notification.result", async (ctx, body) => {
    const eventId = str(body.eventId, 64);
    const status = body.status === "sent" || body.status === "failed" ? body.status : undefined;
    if (!eventId || !status) return json(400, { error: "eventId, status required" });
    const result = await ctx.runMutation(internal.automation.recordNotificationResult, {
      eventId,
      status,
      error: str(body.error, 1000),
    });
    return json(result.ok ? 200 : 422, result);
  }),
});

http.route({
  path: "/n8n/workflow-failure",
  method: "POST",
  handler: signedEndpoint("workflow.failure", async (ctx, body) => {
    const executionId = str(body.executionId, 64);
    const workflowName = str(body.workflowName, 200);
    const message = typeof body.message === "string" ? body.message.slice(0, 1000) : undefined;
    if (!executionId || !workflowName || !message) {
      return json(400, { error: "executionId, workflowName, message required" });
    }
    const result = await ctx.runMutation(internal.automation.recordWorkflowFailure, {
      executionId,
      workflowName,
      nodeName: str(body.nodeName, 200),
      message,
    });
    return json(200, result);
  }),
});

export default http;
