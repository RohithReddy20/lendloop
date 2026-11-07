"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { useState } from "react";
import { CATEGORY_ICONS } from "@/lib/labels";
import { formatDay, formatRange, relativeTime, todayIso } from "@/lib/time";
import { ActivityList } from "./activity";
import { useToast } from "./toast";
import { Badge, Button, Card } from "./ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];
type Perspective = "borrower" | "lender" | "admin";

function StatusBadge({ loan }: { loan: Loan }) {
  const today = todayIso();
  switch (loan.status) {
    case "pending":
      return <Badge tone="warn">Awaiting answer</Badge>;
    case "approved":
      if (loan.isOverdue) return <Badge tone="danger">Overdue since {formatDay(loan.endDate)}</Badge>;
      return loan.startDate <= today ? <Badge tone="accent">On loan</Badge> : <Badge tone="accent">Approved</Badge>;
    case "returned":
      return <Badge tone="info">Returned</Badge>;
    case "declined":
      return <Badge>Declined</Badge>;
    case "cancelled":
      return <Badge>Cancelled</Badge>;
  }
}

export function LoanCard({ loan, perspective }: { loan: Loan; perspective: Perspective }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>, success: string) {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  }

  const today = todayIso();
  const canCancel =
    perspective === "borrower" &&
    (loan.status === "pending" || (loan.status === "approved" && loan.startDate > today));

  return (
    <Card className={loan.isOverdue ? "ring-danger/40" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden>{loan.toolCategory ? CATEGORY_ICONS[loan.toolCategory] : "📦"}</span>
            <span className="font-medium">{loan.toolName}</span>
            {loan.toolRemoved && <Badge>listing removed</Badge>}
            <StatusBadge loan={loan} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatRange(loan.startDate, loan.endDate)}
            {" · "}
            {perspective === "borrower" && (
              <>
                from {loan.lenderName}
                {loan.lenderTrusted && " ✓"}
              </>
            )}
            {perspective === "lender" && <>requested by {loan.borrowerName}</>}
            {perspective === "admin" && (
              <>
                {loan.borrowerName} borrowing from {loan.lenderName}
              </>
            )}
            {" · "}
            <span title={new Date(loan._creationTime).toLocaleString()}>{relativeTime(loan._creationTime)}</span>
          </p>
          {loan.message && perspective !== "admin" && (
            <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm italic text-ink/80">“{loan.message}”</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {perspective === "lender" && loan.status === "pending" && (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "decline"}
                disabled={busy !== null}
                onClick={() => run("decline", () => decline({ loanId: loan._id }), "Request declined")}
              >
                Decline
              </Button>
              <Button
                size="sm"
                loading={busy === "approve"}
                disabled={busy !== null}
                onClick={() => run("approve", () => approve({ loanId: loan._id }), `Approved. ${loan.borrowerName} will be notified.`)}
              >
                Approve
              </Button>
            </>
          )}
          {perspective === "lender" && loan.status === "approved" && (
            <Button
              size="sm"
              variant={loan.isOverdue ? "primary" : "secondary"}
              loading={busy === "return"}
              onClick={() => run("return", () => markReturned({ loanId: loan._id }), "Marked as returned")}
            >
              Mark returned
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === "cancel"}
              onClick={() => run("cancel", () => cancel({ loanId: loan._id }), "Request cancelled")}
            >
              {loan.status === "pending" ? "Withdraw" : "Cancel booking"}
            </Button>
          )}
        </div>
      </div>
      <ActivityList items={loan.activity} />
    </Card>
  );
}
