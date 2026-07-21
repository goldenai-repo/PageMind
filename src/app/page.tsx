import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/firebase/auth-server";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/library");
  }

  redirect("/auth/login");
}
