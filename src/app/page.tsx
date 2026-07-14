import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">PageMind</h1>
        <p className="text-muted-foreground">
          AI-powered PDF, EPUB, and TXT reader
        </p>
      </div>
      <div className="flex gap-3">
        <Button render={<Link href="/auth/login" />}>Sign in</Button>
        <Button variant="outline" render={<Link href="/auth/sign-up" />}>
          Create account
        </Button>
      </div>
    </main>
  );
}
