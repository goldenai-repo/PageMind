import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LibraryWorkspace } from "@/components/library-workspace";
import { getCurrentUser } from "@/lib/firebase/auth-server";

export default async function LibraryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const email = user.email ?? "";
  const name = email.includes("@") ? email.split("@")[0]! : email || "Reader";

  return (
    <>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
          </div>
        }
      >
        <LibraryWorkspace
          userId={user.uid}
          user={{ name, email }}
        />
      </Suspense>
      {children}
    </>
  );
}
