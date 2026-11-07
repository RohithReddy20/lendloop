"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { LoanCard } from "@/components/loan-card";
import { EmptyState, PageHeader, PageLoader, SectionTitle } from "@/components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);

  if (loans === undefined) return <PageLoader />;
  const active = loans.filter((l) => l.status === "pending" || l.status === "approved");
  const past = loans.filter((l) => l.status !== "pending" && l.status !== "approved");

  return (
    <>
      <PageHeader title="My requests" description="Things you've asked to borrow." />
      {loans.length === 0 ? (
        <EmptyState title="No requests yet">
          Browse <Link href="/board" className="text-accent underline">all tools</Link> to borrow something.
        </EmptyState>
      ) : (
        <>
          <SectionTitle count={active.length}>Active</SectionTitle>
          {active.length === 0 ? (
            <p className="text-sm text-muted">Nothing active right now.</p>
          ) : (
            <ul className="space-y-3">
              {active.map((loan) => (
                <li key={loan._id}>
                  <LoanCard loan={loan} perspective="borrower" />
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <SectionTitle count={past.length}>History</SectionTitle>
              <ul className="space-y-3">
                {past.map((loan) => (
                  <li key={loan._id}>
                    <LoanCard loan={loan} perspective="borrower" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}
