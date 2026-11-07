import { internalMutation } from "./_generated/server";
import { addDays, todayUtc } from "./lib/dates";

/**
 * DEV ONLY – demo data, including an overdue loan to exercise the reminder workflow.
 *   npx convex env set ALLOW_DEMO_SEED true
 *   npx convex run seed:demo
 * Internal: only callable by someone with deploy access, and refuses to run unless
 * ALLOW_DEMO_SEED=true is set on the deployment.
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_DEMO_SEED !== "true") {
      throw new Error("Refusing to seed: set ALLOW_DEMO_SEED=true on this deployment first.");
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "demo|alex"))
      .unique();
    if (existing) return "already seeded";

    const alex = await ctx.db.insert("users", {
      tokenIdentifier: "demo|alex",
      name: "Alex Rivera",
      email: "alex@example.com",
      role: "user",
      trustedLender: true,
    });
    const sam = await ctx.db.insert("users", {
      tokenIdentifier: "demo|sam",
      name: "Sam Chen",
      email: "sam@example.com",
      role: "user",
      trustedLender: false,
    });

    const tools = [
      { ownerId: alex, name: "Cordless drill (18V)", category: "power_tools", condition: "good", description: "Two batteries and a charger included." },
      { ownerId: alex, name: "Extension ladder", category: "ladders", condition: "fair", description: "Reaches about 6 m. Heavy, bring a friend." },
      { ownerId: alex, name: "4-person tent", category: "camping", condition: "like_new", description: "Used twice. Rain fly included." },
      { ownerId: sam, name: "Hedge trimmer", category: "garden", condition: "good", description: "Electric, 50 cm blade." },
      { ownerId: sam, name: "Stand mixer", category: "kitchen", condition: "like_new", description: "With dough hook and whisk." },
      { ownerId: sam, name: "Pressure washer", category: "cleaning", condition: "well_used", description: "Works fine, a bit loud." },
    ] as const;
    const ids = [];
    for (const t of tools) ids.push(await ctx.db.insert("tools", { ...t }));

    const today = todayUtc();
    // Sam borrowed Alex's ladder and is 3 days late returning it.
    await ctx.db.insert("loans", {
      toolId: ids[1],
      borrowerId: sam,
      lenderId: alex,
      startDate: addDays(today, -7),
      endDate: addDays(today, -3),
      status: "approved",
      decidedAt: Date.now(),
      reminderCount: 0,
    });
    return "seeded";
  },
});
