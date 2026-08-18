"use client";

import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { LibrarySection } from "@/components/library-section";
import type { LibraryShelf } from "@/lib/books";
import { parseLibraryShelf } from "@/lib/library-path";

const SHELF_META: Record<LibraryShelf, { title: string; description: string }> =
  {
    home: { title: "Home", description: "Browse" },
    mine: { title: "My Books", description: "My Library" },
    favorite: { title: "Favorite", description: "My Library" },
    want: { title: "Want to Read", description: "My Library" },
    finished: { title: "Finished", description: "My Library" },
  };

export function LibraryWorkspace({
  userId,
  user,
}: {
  userId: string;
  user: { name: string; email: string };
}) {
  const searchParams = useSearchParams();
  const shelf = parseLibraryShelf(searchParams.get("shelf"));
  const meta = SHELF_META[shelf];

  return (
    <AppShell
      user={user}
      title={meta.title}
      description={meta.description}
    >
      <LibrarySection userId={userId} shelf={shelf} />
    </AppShell>
  );
}
