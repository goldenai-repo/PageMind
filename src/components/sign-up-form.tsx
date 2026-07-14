"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function scorePassword(pw: string) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, Math.max(1, Math.ceil(score / 1.25)));
}

const STRENGTH = [
  { label: "", color: "transparent", width: "0%" },
  { label: "Weak", color: "#d94f4f", width: "25%" },
  { label: "Fair", color: "#e68a2e", width: "50%" },
  { label: "Good", color: "#b8c62b", width: "75%" },
  { label: "Strong", color: "#27a96c", width: "100%" },
] as const;

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const strength = useMemo(() => STRENGTH[scorePassword(password)], [password]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("px-8 py-10 sm:px-11", className)} {...props}>
      <div className="mb-7">
        <h1 className="text-[1.6rem] font-bold tracking-tight text-navy">
          Create account
        </h1>
        <p className="mt-1 text-[0.88rem] text-muted-foreground">
          Start your AI reading journey today
        </p>
      </div>

      <form onSubmit={handleSignUp} className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-[0.82rem] font-semibold">
            Email address
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-[6px] border-[1.5px] pl-10"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-[0.82rem] font-semibold">
            Password
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-[6px] border-[1.5px] pr-10 pl-10"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-navy"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: strength.width, background: strength.color }}
              />
            </div>
            <span
              className="min-w-11 text-right text-[0.75rem] font-semibold"
              style={{ color: strength.color }}
            >
              {strength.label}
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label
            htmlFor="repeat-password"
            className="text-[0.82rem] font-semibold"
          >
            Confirm password
          </Label>
          <div className="relative">
            <Shield className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="repeat-password"
              type="password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              className="h-11 rounded-[6px] border-[1.5px] pl-10"
            />
          </div>
        </div>

        {error ? (
          <p className="text-[0.78rem] font-medium text-destructive">{error}</p>
        ) : null}

        <Button
          type="submit"
          disabled={isLoading}
          className="mt-1 h-12 w-full rounded-[6px] text-[0.93rem] font-semibold shadow-[var(--shadow-btn)] hover:-translate-y-px"
        >
          {isLoading ? "Creating account…" : "Create Account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[0.875rem] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-semibold text-navy hover:underline"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
