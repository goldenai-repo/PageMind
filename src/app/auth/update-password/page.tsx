import { AuthShell } from "@/components/auth-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <AuthShell>
      <div className="px-8 py-10 sm:px-11">
        <UpdatePasswordForm />
      </div>
    </AuthShell>
  );
}
