import { BrandMark } from "@/components/brand-mark";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-x-hidden">
      <div className="pm-orb pm-orb--1" aria-hidden />
      <div className="pm-orb pm-orb--2" aria-hidden />

      <div className="relative z-10 flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-8">
        <BrandMark />
        <div className="pm-panel-in w-full max-w-[468px] overflow-hidden rounded-[20px] bg-card shadow-[var(--shadow-card)]">
          {children}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} PageMind Inc. — All rights reserved.
        </p>
      </div>
    </div>
  );
}
