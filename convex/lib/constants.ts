import { v } from "convex/values";

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "ladders",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ["like_new", "good", "fair", "well_used"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export const LOAN_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];

export const categoryValidator = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const conditionValidator = v.union(...CONDITIONS.map((c) => v.literal(c)));
export const roleValidator = v.union(...ROLES.map((r) => v.literal(r)));
export const loanStatusValidator = v.union(
  ...LOAN_STATUSES.map((s) => v.literal(s)),
);

export const automationKindValidator = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);
export const automationStatusValidator = v.union(
  v.literal("pending"), // queued / retrying
  v.literal("delivered"), // n8n accepted the webhook
  v.literal("sent"), // n8n confirmed the reminder went out
  v.literal("failed"), // gave up after retries, or n8n reported failure
);

export const LIMITS = {
  toolName: { min: 2, max: 80 },
  description: { min: 0, max: 500 },
  requestMessage: { max: 300 },
  maxLoanDays: 30,
  maxBookAheadDays: 90,
  maxPendingRequestsPerBorrower: 10,
} as const;
