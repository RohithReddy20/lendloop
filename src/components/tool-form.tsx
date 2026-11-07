"use client";

import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/lib/constants";
import { useState, type FormEvent } from "react";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS, type Category, type Condition } from "@/lib/labels";
import { useToast } from "./toast";
import { Button, Field, Input, Select, Textarea } from "./ui";

export type ToolDraft = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolDraft = { name: "", category: "power_tools", condition: "good", description: "" };

export function ToolForm({
  toolId,
  initial,
  onDone,
}: {
  toolId?: Id<"tools">;
  initial?: ToolDraft;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ToolDraft>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (toolId) {
        await update({ toolId, ...draft });
        toast.success("Listing updated");
      } else {
        await create(draft);
        toast.success("Tool listed. Neighbors can now request it.");
      }
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Name">
        <Input
          required
          autoFocus
          minLength={LIMITS.toolName.min}
          maxLength={LIMITS.toolName.max}
          placeholder="e.g. Cordless drill"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Condition">
          <Select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value as Condition })}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Short description"
        hint={`${draft.description.length}/${LIMITS.description.max} · Visible to signed-in neighbors only. Don't include your address or phone number.`}
      >
        <Textarea
          maxLength={LIMITS.description.max}
          placeholder="What's included, any quirks…"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          {toolId ? "Save changes" : "List tool"}
        </Button>
      </div>
    </form>
  );
}
