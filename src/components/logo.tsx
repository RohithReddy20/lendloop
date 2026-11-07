import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-7 text-accent" aria-hidden>
        <circle cx="12" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3.2" />
        <circle cx="20" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3.2" opacity="0.55" />
      </svg>
      LendLoop
    </Link>
  );
}
