import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationKindValidator,
  automationStatusValidator,
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/constants";

export default defineSchema({
  users: defineTable({
    // Stable identity from Clerk (issuer + subject). Never trust client-supplied ids.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    // Role lives in Convex (source of truth for authorization), not in the UI.
    // Only changeable via an internal function (CLI / dashboard), never from the client.
    role: roleValidator,
    trustedLender: v.boolean(),
    trustedLenderUpdatedBy: v.optional(v.id("users")),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    // Soft delete keeps loan history intact and leaves an audit trail.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    // Denormalized at request time so authorization checks are a single read.
    lenderId: v.id("users"),
    // Calendar dates (YYYY-MM-DD, UTC) – compared lexicographically.
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    lastReminderAt: v.optional(v.number()),
    reminderCount: v.number(),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "endDate"]),

  // Outbox + audit log for every automation touching a loan.
  // `eventKey` is the idempotency key shared with n8n.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: automationKindValidator,
    eventKey: v.string(),
    // e.g. "loan.requested", "loan.approved", "reminder"
    eventType: v.string(),
    recipientId: v.id("users"),
    status: automationStatusValidator,
    attempts: v.number(),
    // Bumped when an admin re-queues a failed event, so n8n's de-duplication
    // (keyed on eventId:generation) treats the manual retry as a new delivery.
    generation: v.optional(v.number()),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index("by_key", ["eventKey"])
    .index("by_loan", ["loanId"])
    .index("by_status_next", ["status", "nextAttemptAt"]),

  // Failed n8n executions reported by the n8n error workflow.
  workflowFailures: defineTable({
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.optional(v.string()),
    message: v.string(),
    occurredAt: v.number(),
  }).index("by_execution", ["executionId"]),
});
