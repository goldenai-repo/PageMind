import { AppShell } from "@/components/app-shell";
import { UploadSection } from "@/components/upload-section";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import { redirect } from "next/navigation";

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const email = user.email ?? "";
  const name = email.includes("@") ? email.split("@")[0]! : email || "Reader";

  return (
    <AppShell
      user={{ name, email }}
      title="Upload"
      description="Add PDF, EPUB, or TXT files"
    >
      <UploadSection userId={user.uid} />
    </AppShell>
  );
}
