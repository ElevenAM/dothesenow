"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmailConfirmation } from "@/components/auth/email-confirmation";
import Link from "next/link";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback?signup=true`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    setIsSent(true);
    setIsLoading(false);
  }

  if (isSent) {
    return (
      <EmailConfirmation
        email={email}
        actionLabel="create your account"
        onReset={() => setIsSent(false)}
      />
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-foreground">
        Create your account
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Get started with DoTheseNow for free
      </p>

      <form onSubmit={handleSignup} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            ref={inputRef}
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? "Sending..." : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--accent-blue)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
