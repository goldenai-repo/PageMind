"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";

import { Button } from "@/components/ui/button";
import { clearSession } from "@/lib/firebase/auth-client";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await clearSession();
    await signOut(getFirebaseAuth());
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={logout}
      className="h-[34px] rounded-[6px] border-[1.5px] px-3.5 text-[0.82rem] font-medium text-muted-foreground hover:border-navy hover:text-navy"
    >
      Sign out
    </Button>
  );
}
