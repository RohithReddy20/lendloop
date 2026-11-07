import { preloadQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { Logo } from "@/components/logo";
import { AuthButtons, HeroCta, PublicToolList } from "./public-client";

// Rendered per request on the server with the public (unauthenticated) query,
// then kept live on the client.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const preloadedTools = await preloadQuery(api.tools.listPublic);
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
        <Logo />
        <AuthButtons />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-16 sm:py-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">Your neighborhood tool library</p>
          <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Borrow what you need.
            <br />
            <span className="text-accent">Lend what you don&apos;t.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">
            Most tools spend their lives sitting in a garage. LendLoop lets neighbors share ladders, tents and hedge
            trimmers, with requests, approvals and friendly return reminders built in.
          </p>
          <div className="mt-8">
            <HeroCta />
          </div>
        </section>

        <section className="pb-24">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold">Available right now</h2>
            <span className="text-sm text-muted">Sign in to see details and request</span>
          </div>
          <PublicToolList preloaded={preloadedTools} />
        </section>
      </main>

      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
        LendLoop is a demo project. Owner details are only shown to signed-in neighbors.
      </footer>
    </div>
  );
}
