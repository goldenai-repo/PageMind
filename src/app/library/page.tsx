import { AppShell } from "@/components/app-shell";
import { LibrarySection } from "@/components/library-section";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import type { BookStatus } from "@/lib/books";
import { redirect } from "next/navigation";

const SHELF_TITLES: Record<"all" | BookStatus, string> = {
  all: "All",
  want: "Want to Read",
  finished: "Finished",
};

function parseShelf(value: string | undefined): "all" | BookStatus {
  if (value === "want" || value === "finished") return value;
  return "all";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ shelf?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const params = await searchParams;
  const shelf = parseShelf(params.shelf);
  const email = user.email ?? "";
  const name = email.includes("@") ? email.split("@")[0]! : email || "Reader";

  return (
    <AppShell
      user={{ name, email }}
      title={SHELF_TITLES[shelf]}
      description="Your book collection"
    >
      <LibrarySection userId={user.uid} shelf={shelf} />
    </AppShell>
  );
}
