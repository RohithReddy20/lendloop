"use client";

import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/lib/constants";
import { useState, type FormEvent } from "react";
import { addDaysIso, todayIso } from "@/lib/time";
import { useToast } from "./toast";
import { Button, Field, Input, Modal, Textarea } from "./ui";

export function RequestDialog({
  tool,
  onClose,
}: {
  tool: { _id: Id<"tools">; name: string; ownerName: string } | null;
  onClose: () => void;
}) {
  const today = todayIso();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDaysIso(today, 2));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const request = useMutation(api.loans.request);
  const toast = useToast();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!tool) return;
    setSaving(true);
    try {
      await request({ toolId: tool._id, startDate: start, endDate: end, message: message || undefined });
      toast.success(`Request sent to ${tool.ownerName}`);
      setMessage("");
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={tool !== null} onClose={onClose} title={tool ? `Borrow: ${tool.name}` : ""}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input
              type="date"
              required
              min={today}
              max={addDaysIso(today, LIMITS.maxBookAheadDays)}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
            />
          </Field>
          <Field label="Until">
            <Input
              type="date"
              required
              min={start}
              max={addDaysIso(start, LIMITS.maxLoanDays - 1)}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note to the owner (optional)" hint={`Up to ${LIMITS.maxLoanDays} days. Only the owner sees this note.`}>
          <Textarea
            maxLength={LIMITS.requestMessage.max}
            placeholder="What's it for? When can you pick it up?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Send request
          </Button>
        </div>
      </form>
    </Modal>
  );
}
