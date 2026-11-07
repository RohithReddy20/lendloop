"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-accent text-accent-ink hover:bg-accent-hover",
        variant === "secondary" && "bg-card text-ink ring-1 ring-line hover:bg-paper",
        variant === "ghost" && "text-muted hover:bg-ink/5 hover:text-ink",
        variant === "danger" && "bg-card text-danger ring-1 ring-danger/30 hover:bg-danger-soft",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className ?? "size-5")}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-20 text-muted">
      <Spinner />
    </div>
  );
}

type Tone = "neutral" | "accent" | "warn" | "danger" | "info";
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-ink/5 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-info-soft text-info",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl bg-card p-4 ring-1 ring-line", className)}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted first:mt-0">
      {children}
      {count !== undefined && <span className="rounded-full bg-ink/5 px-2 text-xs">{count}</span>}
    </h2>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-line placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "h-10", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-20", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "h-10", props.className)} />;
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-card p-0 text-ink shadow-2xl ring-1 ring-line"
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:text-ink" aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-muted">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
