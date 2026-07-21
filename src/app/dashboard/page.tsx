import { BrandMark } from "@/components/brand-mark";
import { LibrarySection } from "@/components/library-section";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const email = user.email ?? "";
  const displayName = email.includes("@") ? email.split("@")[0] : email || "Reader";
  const initial = (email.charAt(0) || "P").toUpperCase();

  return (
    <div className="relative z-10 flex min-h-svh flex-col">
      <div className="pm-orb pm-orb--1 opacity-20" aria-hidden />
      <div className="pm-orb pm-orb--2 opacity-20" aria-hidden />

      <header className="sticky top-0 z-100 flex h-16 items-center justify-between border-b border-border bg-white/88 px-4 shadow-[0_1px_6px_rgba(27,54,93,0.06)] backdrop-blur-[14px] sm:px-8">
        <BrandMark showTag={false} />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border-[1.5px] border-border bg-white py-1 pr-3 pl-1 text-[0.82rem] font-medium">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-[0.72rem] font-bold text-white">
              {initial}
            </span>
            <span className="hidden max-w-40 truncate sm:inline">{displayName}</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 pt-10 pb-16 sm:px-10">
        <LibrarySection />
      </main>
    </div>
  );
}
