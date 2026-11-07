"use client";

import { ConvexError } from "convex/values";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; tone: "success" | "error"; message: string };
type ToastApi = { success: (m: string) => void; error: (e: unknown) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Extracts the user-facing message from a ConvexError({ code, message }). */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string;
    return typeof data === "string" ? data : (data.message ?? "Something went wrong.");
  }
  return "Something went wrong. Please try again.";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (e) => push("error", errorMessage(e)),
  };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg px-4 py-2.5 text-sm shadow-lg ring-1 ${
              t.tone === "success"
                ? "bg-ink text-paper ring-ink/10"
                : "bg-danger-soft text-danger ring-danger/20"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
