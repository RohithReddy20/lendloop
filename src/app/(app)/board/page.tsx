"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { FilterChip } from "@/app/public-client";
import { AvailabilityBadge } from "@/components/availability";
import { RequestDialog } from "@/components/request-dialog";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, ConfirmModal, EmptyState, Input, PageHeader, PageLoader } from "@/components/ui";
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS, type Category } from "@/lib/labels";

type Tool = FunctionReturnType<typeof api.tools.list>[number];

export default function BoardPage() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Tool | null>(null);
  const [removing, setRemoving] = useState<Tool | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const removeTool = useMutation(api.tools.remove);
  const toast = useToast();
  const isAdmin = me?.role === "admin";

  const q = search.trim().toLowerCase();
  const visible = tools?.filter(
    (t) =>
      (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) &&
      (!onlyAvailable || t.availability.state === "available"),
  );

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await removeTool({ toolId: removing._id });
      toast.success(`Removed “${removing.name}”`);
      setRemoving(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="All tools" description="Everything your neighbors are willing to lend." />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={category === undefined} onClick={() => setCategory(undefined)}>
            All
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Input
            type="search"
            placeholder="Search tools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            aria-label="Search tools"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Available now only
          </label>
        </div>
      </div>

      {visible === undefined ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <EmptyState title="No tools match">Try another category, or list one of your own.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {visible.map((tool) => (
            <li key={tool._id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-paper text-2xl" aria-hidden>
                    {CATEGORY_ICONS[tool.category]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tool.name}</p>
                    <p className="text-xs text-muted">
                      {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} condition
                    </p>
                  </div>
                </div>
                {tool.description && <p className="mt-3 text-sm text-ink/80">{tool.description}</p>}
                <div className="mt-3">
                  <AvailabilityBadge availability={tool.availability} />
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    {tool.isMine ? "Your listing" : <>Lent by {tool.ownerName}</>}
                    {tool.ownerTrusted && <Badge tone="info">✓ Trusted Lender</Badge>}
                  </span>
                  <div className="flex gap-2">
                    {isAdmin && !tool.isMine && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(tool)}>
                        Remove
                      </Button>
                    )}
                    {!tool.isMine &&
                      (tool.hasPendingRequest ? (
                        <Badge tone="warn">Request pending</Badge>
                      ) : (
                        <Button size="sm" onClick={() => setRequesting(tool)}>
                          Request
                        </Button>
                      ))}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <RequestDialog tool={requesting} onClose={() => setRequesting(null)} />
      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={removeBusy}
        title="Remove this listing?"
        confirmLabel="Remove listing"
        body={
          <>
            As an admin you&apos;re removing <strong>{removing?.name}</strong> (owned by {removing?.ownerName}). Pending
            requests and upcoming bookings will be cancelled and the borrowers notified.
          </>
        }
      />
    </>
  );
}
