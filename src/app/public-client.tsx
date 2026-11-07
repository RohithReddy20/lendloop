"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated, usePreloadedQuery, type Preloaded } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { CATEGORIES, CATEGORY_ICONS, CATEGORY_LABELS, type Category } from "@/lib/labels";

export function AuthButtons() {
  return (
    <div className="flex items-center gap-3">
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/board">
          <Button variant="secondary" size="sm">
            Sign in
          </Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/board" className="text-sm font-medium text-accent hover:underline">
          Open the board →
        </Link>
        <UserButton />
      </Authenticated>
    </div>
  );
}

export function HeroCta() {
  return (
    <>
      <AuthLoading>
        <div className="h-12 w-64 animate-pulse rounded-lg bg-ink/10" aria-hidden />
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/board">
          <Button className="h-12 px-6 text-base">Sign in to lend or borrow</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/board">
          <Button className="h-12 px-6 text-base">Go to the lending board</Button>
        </Link>
      </Authenticated>
    </>
  );
}

/** Read-only, public: name + category only (that's all the public query returns). */
export function PublicToolList({ preloaded }: { preloaded: Preloaded<typeof api.tools.listPublic> }) {
  const tools = usePreloadedQuery(preloaded);
  const [category, setCategory] = useState<Category | null>(null);

  if (tools.length === 0) {
    return <EmptyState title="Nothing listed yet">Be the first to lend something to your neighbors.</EmptyState>;
  }

  const present = CATEGORIES.filter((c) => tools.some((t) => t.category === c));
  const visible = category ? tools.filter((t) => t.category === category) : tools;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip active={category === null} onClick={() => setCategory(null)}>
          All · {tools.length}
        </FilterChip>
        {present.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((tool) => (
          <li key={tool.id} className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-line">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-paper text-xl" aria-hidden>
              {CATEGORY_ICONS[tool.category]}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{tool.name}</p>
              <Badge>{CATEGORY_LABELS[tool.category]}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 rounded-full px-3 text-sm transition-colors ${
        active ? "bg-ink text-paper" : "bg-card text-muted ring-1 ring-line hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
