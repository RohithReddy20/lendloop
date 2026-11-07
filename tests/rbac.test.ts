import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { isoDay, setup } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "" } as const;

async function world() {
  const ctx = setup();
  for (const u of [ctx.ann, ctx.bob, ctx.cat]) await u.mutation(api.users.store, {});
  const toolId = await ctx.ann.mutation(api.tools.create, drill);
  return { ...ctx, toolId };
}

describe("authentication", () => {
  test("anonymous users cannot write or read private data", async () => {
    const { t, toolId } = await world();
    await expect(t.mutation(api.tools.create, drill)).rejects.toThrow(/sign in/i);
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/i);
    await expect(
      t.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) }),
    ).rejects.toThrow(/sign in/i);
  });

  test("public list exposes only name and category", async () => {
    const { t } = await world();
    const tools = await t.query(api.tools.listPublic, {});
    expect(tools).toHaveLength(1);
    expect(Object.keys(tools[0]).sort()).toEqual(["category", "id", "name"]);
  });

  test("the client cannot choose its own role", async () => {
    const { t } = setup();
    const mallory = t.withIdentity({ subject: "m", name: "Mallory", email: "m@example.com" });
    await mallory.mutation(api.users.store, {});
    expect((await mallory.query(api.users.me, {}))?.role).toBe("user");
    await expect(mallory.query(api.admin.allLoans, {})).rejects.toThrow(/admins only/i);
  });
});

describe("listings", () => {
  test("only the owner can edit or delete a listing", async () => {
    const { ann, bob, toolId } = await world();
    await expect(bob.mutation(api.tools.update, { toolId, ...drill, name: "hacked" })).rejects.toThrow(/own listings/);
    await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/own listings/);
    await ann.mutation(api.tools.update, { toolId, ...drill, name: "Drill v2" });
    await ann.mutation(api.tools.remove, { toolId });
    expect(await ann.query(api.tools.mine, {})).toHaveLength(0);
  });

  test("admins can remove any listing but not edit it", async () => {
    const { t, cat, toolId } = await world();
    await t.mutation(internal.users.setRole, { email: "cat@example.com", role: "admin" });
    await expect(cat.mutation(api.tools.update, { toolId, ...drill, name: "x" })).rejects.toThrow(/own listings/);
    await cat.mutation(api.tools.remove, { toolId });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
  });

  test("input is validated server-side", async () => {
    const { ann } = await world();
    await expect(ann.mutation(api.tools.create, { ...drill, name: "x" })).rejects.toThrow(/Name must be/);
    await expect(
      ann.mutation(api.tools.create, { ...drill, description: "a".repeat(501) }),
    ).rejects.toThrow(/Description/);
  });
});

describe("loans", () => {
  test("full lifecycle with correct actors", async () => {
    const { ann, bob, toolId } = await world();
    await expect(
      ann.mutation(api.loans.request, { toolId, startDate: isoDay(0), endDate: isoDay(2) }),
    ).rejects.toThrow(/your own tool/);

    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(0), endDate: isoDay(2) });
    await expect(bob.mutation(api.loans.approve, { loanId })).rejects.toThrow(/owner/);
    await expect(ann.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/borrower/);

    await ann.mutation(api.loans.approve, { loanId });
    await expect(bob.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/owner/);
    await ann.mutation(api.loans.markReturned, { loanId });

    const [loan] = await bob.query(api.loans.myRequests, {});
    expect(loan.status).toBe("returned");
    expect(loan.borrowerName).toBe("Bob");
    // Each status change queued exactly one notification.
    expect(loan.activity.map((a) => a.eventType).sort()).toEqual([
      "loan.approved",
      "loan.requested",
      "loan.returned",
    ]);
  });

  test("users only see loans they are part of", async () => {
    const { ann, bob, cat, toolId } = await world();
    await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) });
    expect(await cat.query(api.loans.incoming, {})).toHaveLength(0);
    expect(await cat.query(api.loans.myRequests, {})).toHaveLength(0);
    expect(await ann.query(api.loans.incoming, {})).toHaveLength(1);
  });

  test("approving declines overlapping pending requests; overlapping bookings are rejected", async () => {
    const { ann, bob, cat, toolId } = await world();
    const bobs = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(3) });
    const cats = await cat.mutation(api.loans.request, { toolId, startDate: isoDay(2), endDate: isoDay(4) });
    await ann.mutation(api.loans.approve, { loanId: bobs });

    const incoming = await ann.query(api.loans.incoming, {});
    expect(incoming.find((l) => l._id === cats)?.status).toBe("declined");
    await expect(
      cat.mutation(api.loans.request, { toolId, startDate: isoDay(3), endDate: isoDay(5) }),
    ).rejects.toThrow(/Already booked/);
  });

  test("date rules are enforced", async () => {
    const { bob, toolId } = await world();
    const req = (startDate: string, endDate: string) => bob.mutation(api.loans.request, { toolId, startDate, endDate });
    await expect(req(isoDay(-1), isoDay(1))).rejects.toThrow(/past/);
    await expect(req(isoDay(3), isoDay(1))).rejects.toThrow(/on or after/);
    await expect(req(isoDay(0), isoDay(40))).rejects.toThrow(/at most 30 days/);
    await expect(req("2026-02-30", "2026-03-01")).rejects.toThrow(/valid/);
  });
});

describe("admin", () => {
  test("trusted lender flag is admin-only", async () => {
    const { t, ann, cat } = await world();
    const annId = (await ann.query(api.users.me, {}))!._id;
    await expect(ann.mutation(api.admin.setTrustedLender, { userId: annId, trusted: true })).rejects.toThrow(/admins only/i);
    await t.mutation(internal.users.setRole, { email: "cat@example.com", role: "admin" });
    await cat.mutation(api.admin.setTrustedLender, { userId: annId, trusted: true });
    const [tool] = await cat.query(api.tools.list, {});
    expect(tool.ownerTrusted).toBe(true);
  });
});

describe("data minimization", () => {
  test("admins don't see the private note between neighbors", async () => {
    const { t, bob, cat, toolId } = await world();
    await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2), message: "gate code 1234" });
    await t.mutation(internal.users.setRole, { email: "cat@example.com", role: "admin" });
    const [loan] = await cat.query(api.admin.allLoans, {});
    expect(loan.message).toBeNull();
    expect(JSON.stringify(loan)).not.toContain("@example.com");
  });
});
