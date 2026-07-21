"use client";

import { getFirebaseAuth } from "./client";

export async function establishSession(): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not signed in");
  }

  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to create session");
  }
}

export async function clearSession(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
