import { AppShell } from "@/components/app-shell";
import { LibrarySection } from "@/components/library-section";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import type { LibraryShelf } from "@/lib/books";
import { redirect } from "next/navigation";

const SHELF_META: Record<LibraryShelf, { title: string; description: string }> =
  {
    home: { title: "Home", description: "Browse" },
    mine: { title: "My Books", description: "My Library" },
    favorite: { title: "Favorite", description: "My Library" },
    want: { title: "Want to Read", description: "My Library" },
    finished: { title: "Finished", description: "My Library" },
  };

function parseShelf(value: string | undefined): LibraryShelf {
  if (
    value === "mine" ||
    value === "favorite" ||
    value === "want" ||
    value === "finished"
  ) {
    return value;
  }
  // Accept legacy ?shelf=store links as Home.
  return "home";
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
  const meta = SHELF_META[shelf];

  return (
    <AppShell
      user={{ name, email }}
      title={meta.title}
      description={meta.description}
    >
      <LibrarySection userId={user.uid} shelf={shelf} />
    </AppShell>
  );
}
