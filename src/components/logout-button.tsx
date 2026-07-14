"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
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
