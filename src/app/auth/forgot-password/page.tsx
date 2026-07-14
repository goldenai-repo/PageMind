import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function Page() {
  return (
    <AuthShell>
      <div className="px-8 py-10 sm:px-11">
        <ForgotPasswordForm />
      </div>
    </AuthShell>
  );
}
