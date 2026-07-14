import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";

export default function Page() {
  return (
    <AuthShell>
      <div className="px-8 py-10 text-center sm:px-11">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-navy/10">
          <div className="flex size-12 items-center justify-center rounded-full bg-navy text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <h1 className="text-[1.6rem] font-bold tracking-tight text-navy">
          You&apos;re all set!
        </h1>
        <p className="mt-2 mb-8 text-[0.88rem] text-muted-foreground">
          Your account has been created successfully. Welcome to PageMind.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex h-12 w-full items-center justify-center rounded-[6px] bg-primary text-[0.93rem] font-semibold text-primary-foreground shadow-[var(--shadow-btn)] transition hover:bg-navy-light hover:-translate-y-px"
        >
          Go to Sign In
        </Link>
      </div>
    </AuthShell>
  );
}
