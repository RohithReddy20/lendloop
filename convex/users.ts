import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { appError, getCurrentUser } from "./lib/auth";
import { roleValidator } from "./lib/constants";

const MAX_NAME = 80;

/**
 * Upserts the signed-in Clerk user into Convex. Called once per session by the client.
 * The client cannot pass a role or any other field – everything comes from the verified JWT.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");

    const name = (
      identity.name ??
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ??
      ""
    )
      .trim()
      .slice(0, MAX_NAME) || identity.email?.split("@")[0] || "Neighbor";
    const email = identity.email?.toLowerCase();

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch(existing._id, { name, email });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The current user's own profile (only fields the UI needs). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/**
 * Role changes are an operator action, deliberately NOT exposed to any client:
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!user) throw new Error(`No user with email ${email}. Sign in once first.`);
    await ctx.db.patch(user._id, { role });
    console.log(`[audit] role of user ${user._id} set to ${role} via internal function`);
    return { userId: user._id, role };
  },
});
