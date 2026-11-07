import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  appError,
  displayName,
  getLiveTool,
  isAdmin,
  requireToolOwner,
  requireUser,
} from "./lib/auth";
import { getAvailability } from "./lib/availability";
import { categoryValidator, conditionValidator, LIMITS } from "./lib/constants";
import { todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./notifications";

const MAX_LIST = 300;

function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  if (name.length < LIMITS.toolName.min || name.length > LIMITS.toolName.max) {
    throw appError("INVALID_INPUT", `Name must be ${LIMITS.toolName.min}–${LIMITS.toolName.max} characters.`);
  }
  if (description.length > LIMITS.description.max) {
    throw appError("INVALID_INPUT", `Description must be at most ${LIMITS.description.max} characters.`);
  }
  return { name, description };
}

async function liveTools(ctx: Parameters<typeof getAvailability>[0]): Promise<Doc<"tools">[]> {
  const tools = await ctx.db.query("tools").order("desc").take(MAX_LIST);
  return tools.filter((t) => t.removedAt === undefined);
}

/**
 * PUBLIC (no auth). Returns only tools available right now, and only their
 * name + category. No owner, description or loan data leaves the backend here.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const result: { id: string; name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of await liveTools(ctx)) {
      const availability = await getAvailability(ctx, tool._id, today);
      if (availability.state === "available") {
        result.push({ id: tool._id, name: tool.name, category: tool.category });
      }
    }
    return result;
  },
});

/** Signed-in board: all live tools with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const viewer = await requireUser(ctx);
    const today = todayUtc();
    const tools = category
      ? (
          await ctx.db
            .query("tools")
            .withIndex("by_category", (q) => q.eq("category", category))
            .order("desc")
            .take(MAX_LIST)
        ).filter((t) => t.removedAt === undefined)
      : await liveTools(ctx);

    const myPending = new Set(
      (
        await ctx.db
          .query("loans")
          .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
          .collect()
      )
        .filter((l) => l.status === "pending")
        .map((l) => l.toolId),
    );

    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          ownerName: displayName(owner),
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: tool.ownerId === viewer._id,
          hasPendingRequest: myPending.has(tool._id),
          availability: await getAvailability(ctx, tool._id, today),
        };
      }),
    );
  },
});

/** "My listings" with availability and number of pending requests. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const today = todayUtc();
    const tools = (
      await ctx.db
        .query("tools")
        .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
        .order("desc")
        .collect()
    ).filter((t) => t.removedAt === undefined);

    return await Promise.all(
      tools.map(async (tool) => {
        const pending = await ctx.db
          .query("loans")
          .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
          .collect();
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          pendingRequests: pending.length,
          availability: await getAvailability(ctx, tool._id, today),
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { name, description } = cleanToolInput(args);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, { toolId, ...args }) => {
    const user = await requireUser(ctx);
    await requireToolOwner(ctx, user, toolId);
    const { name, description } = cleanToolInput(args);
    await ctx.db.patch(toolId, {
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

/**
 * Owners can remove their own listings; admins can remove any listing.
 * Soft delete: pending requests and not-yet-started bookings are cancelled (and
 * the other party notified). A loan already in progress stays open so it can
 * still be marked as returned.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const user = await requireUser(ctx);
    const tool = await getLiveTool(ctx, toolId);
    const asAdmin = tool.ownerId !== user._id;
    if (asAdmin && !isAdmin(user)) {
      throw appError("FORBIDDEN", "You can only remove your own listings.");
    }

    const today = todayUtc();
    const loans = [
      ...(await ctx.db
        .query("loans")
        .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
        .collect()),
      ...(await ctx.db
        .query("loans")
        .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
        .collect()),
    ];
    for (const loan of loans) {
      if (loan.status === "approved" && loan.startDate <= today) continue; // in progress
      await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: Date.now() });
      await enqueueLoanEvent(ctx, loan._id, "loan.cancelled", loan.borrowerId);
    }

    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: user._id });
    if (asAdmin) {
      console.log(`[audit] admin ${user._id} removed tool ${toolId} owned by ${tool.ownerId}`);
    }
  },
});
