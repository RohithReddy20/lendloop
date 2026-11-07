import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Signed-out visitors are redirected to sign in before any app page renders.
// This is a UX convenience only: every Convex function enforces auth and roles itself.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <AppShell>{children}</AppShell>;
}
