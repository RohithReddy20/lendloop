"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { AvailabilityBadge } from "@/components/availability";
import { useToast } from "@/components/toast";
import { ToolForm } from "@/components/tool-form";
import { Badge, Button, Card, ConfirmModal, EmptyState, Modal, PageHeader, PageLoader } from "@/components/ui";
import { CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";

type MyTool = FunctionReturnType<typeof api.tools.mine>[number];

export default function ListingsPage() {
  const tools = useQuery(api.tools.mine);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MyTool | null>(null);
  const [deleting, setDeleting] = useState<MyTool | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const removeTool = useMutation(api.tools.remove);
  const toast = useToast();

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await removeTool({ toolId: deleting._id });
      toast.success(`Deleted “${deleting.name}”`);
      setDeleting(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="My listings"
        description="Tools you're willing to lend."
        action={<Button onClick={() => setCreating(true)}>+ List a tool</Button>}
      />

      {tools === undefined ? (
        <PageLoader />
      ) : tools.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">
          Got a ladder or a tent gathering dust?{" "}
          <button className="text-accent underline" onClick={() => setCreating(true)}>
            List it
          </button>
          .
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card className="flex flex-wrap items-center gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-paper text-2xl" aria-hidden>
                  {CATEGORY_ICONS[tool.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{tool.name}</p>
                  <p className="text-xs text-muted">
                    {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} condition
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AvailabilityBadge availability={tool.availability} />
                    {tool.pendingRequests > 0 && (
                      <Link href="/incoming">
                        <Badge tone="warn">
                          {tool.pendingRequests} pending request{tool.pendingRequests > 1 ? "s" : ""} →
                        </Badge>
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(tool)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(tool)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="List a tool">
        <ToolForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit listing">
        {editing && (
          <ToolForm
            key={editing._id}
            toolId={editing._id}
            initial={{
              name: editing.name,
              category: editing.category,
              condition: editing.condition,
              description: editing.description,
            }}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        title="Delete this listing?"
        confirmLabel="Delete"
        body={
          <>
            <strong>{deleting?.name}</strong> will disappear from the board. Pending requests and upcoming bookings will be
            cancelled and the borrowers notified. A loan that has already started stays open so you can mark it returned.
          </>
        }
      />
    </>
  );
}
