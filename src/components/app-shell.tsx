"use client";

import { UserButton } from "@clerk/nextjs";
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Logo } from "./logo";
import { Badge, PageLoader } from "./ui";

const NAV = [
  { href: "/board", label: "All tools" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
];

const UserReady = createContext(false);

/**
 * Upserts the Clerk user into Convex once per session. Everything that queries
 * user-scoped data renders only after this, so first-time users never hit
 * "account not set up" errors.
 */
function EnsureUser({ children }: { children: ReactNode }) {
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    store()
      .then(() => setReady(true))
      .catch(() => setFailed(true));
  }, [store]);
  if (failed) {
    return <p className="py-20 text-center text-sm text-danger">We couldn&apos;t load your account. Please refresh the page.</p>;
  }
  return <UserReady.Provider value={ready}>{children}</UserReady.Provider>;
}

function WhenReady({ children }: { children: ReactNode }) {
  return useContext(UserReady) ? <>{children}</> : <PageLoader />;
}

function Nav() {
  if (!useContext(UserReady)) return null;
  return <NavLinks />;
}

function NavLinks() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);
  const incoming = useQuery(api.loans.incoming);
  const pendingIncoming = incoming?.filter((l) => l.status === "pending").length ?? 0;
  const items = me?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Main">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
              active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {item.label}
            {item.href === "/incoming" && pendingIncoming > 0 && <Badge tone="warn">{pendingIncoming}</Badge>}
          </Link>
        );
      })}
    </nav>
  );
}

function Shell({ nav, children }: { nav: boolean; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex h-14 items-center justify-between">
            <Logo href="/board" />
            <UserButton />
          </div>
          {nav && <Nav />}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>
        <EnsureUser>
          <Shell nav>
            <WhenReady>{children}</WhenReady>
          </Shell>
        </EnsureUser>
      </Authenticated>
      <AuthLoading>
        <Shell nav={false}>
          <PageLoader />
        </Shell>
      </AuthLoading>
      <Unauthenticated>
        <Shell nav={false}>
          <div className="py-20 text-center">
            <p className="mb-4">You need to sign in to see this page.</p>
            <Link href="/" className="text-accent underline">
              Back to LendLoop
            </Link>
          </div>
        </Shell>
      </Unauthenticated>
    </>
  );
}
