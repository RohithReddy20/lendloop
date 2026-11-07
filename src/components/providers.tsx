"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { ToastProvider } from "./toast";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set (run `npx convex dev`).");
const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <ToastProvider>{children}</ToastProvider>
    </ConvexProviderWithClerk>
  );
}
