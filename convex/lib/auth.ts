import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Authorization helpers. Every public query/mutation goes through one of these,
 * so access rules live in one place and are enforced server-side.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT";

export function appError(code: AppErrorCode, message: string): ConvexError<{
  code: AppErrorCode;
  message: string;
}> {
  return new ConvexError({ code, message });
}

type Ctx = QueryCtx | MutationCtx;

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw appError("UNAUTHENTICATED", "Your account is still being set up. Try again.");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
  return user;
}

export function isAdmin(user: Doc<"users">): boolean {
  return user.role === "admin";
}

/** Loads a live (not removed) tool or throws NOT_FOUND. */
export async function getLiveTool(ctx: Ctx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) throw appError("NOT_FOUND", "Tool not found.");
  return tool;
}

/** Owner-only access to a listing (admins do NOT get edit rights, only removal). */
export async function requireToolOwner(
  ctx: Ctx,
  user: Doc<"users">,
  toolId: Id<"tools">,
): Promise<Doc<"tools">> {
  const tool = await getLiveTool(ctx, toolId);
  if (tool.ownerId !== user._id) throw appError("FORBIDDEN", "You can only manage your own listings.");
  return tool;
}

export async function getLoanOrThrow(ctx: Ctx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "Request not found.");
  return loan;
}

export function requireLender(user: Doc<"users">, loan: Doc<"loans">): void {
  if (loan.lenderId !== user._id) throw appError("FORBIDDEN", "Only the tool's owner can do that.");
}

export function requireBorrower(user: Doc<"users">, loan: Doc<"loans">): void {
  if (loan.borrowerId !== user._id) throw appError("FORBIDDEN", "Only the borrower can do that.");
}

/** Public display name: first name only – no surnames or emails leave the backend. */
export function displayName(user: Doc<"users"> | null): string {
  if (!user) return "A neighbor";
  const first = user.name.trim().split(/\s+/)[0];
  return first || "A neighbor";
}
