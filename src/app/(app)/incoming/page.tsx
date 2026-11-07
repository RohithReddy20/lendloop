"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { LoanCard, type Loan } from "@/components/loan-card";
import { EmptyState, PageHeader, PageLoader, SectionTitle } from "@/components/ui";

function Section({ title, loans }: { title: string; loans: Loan[] }) {
  if (loans.length === 0) return null;
  return (
    <>
      <SectionTitle count={loans.length}>{title}</SectionTitle>
      <ul className="space-y-3">
        {loans.map((loan) => (
          <li key={loan._id}>
            <LoanCard loan={loan} perspective="lender" />
          </li>
        ))}
      </ul>
    </>
  );
}

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  if (loans === undefined) return <PageLoader />;

  const pending = loans.filter((l) => l.status === "pending");
  const out = loans
    .filter((l) => l.status === "approved")
    .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || a.endDate.localeCompare(b.endDate));
  const past = loans.filter((l) => l.status !== "pending" && l.status !== "approved");

  return (
    <>
      <PageHeader title="Incoming requests" description="Neighbors who want to borrow your tools." />
      {loans.length === 0 ? (
        <EmptyState title="No requests for your tools yet">When someone asks to borrow one, it shows up here.</EmptyState>
      ) : (
        <>
          <Section title="Needs your answer" loans={pending} />
          <Section title="Lent out" loans={out} />
          <Section title="History" loans={past} />
        </>
      )}
    </>
  );
}
