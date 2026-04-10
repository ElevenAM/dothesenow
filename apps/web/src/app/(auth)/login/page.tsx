"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmailConfirmation } from "@/components/auth/email-confirmation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [showDev, setShowDev] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") setShowDev(true);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      inputRef.current?.focus();
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/callback`,
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
        actionLabel="sign in"
        onReset={() => setIsSent(false)}
      />
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-foreground">Sign in</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter your email to receive a magic link
      </p>

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
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
          {isLoading ? "Sending..." : "Continue with email"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-[var(--accent-blue)] hover:underline"
        >
          Sign up
        </Link>
      </p>

      {showDev && (
        <Card className="mt-6 border-2 border-dashed bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dev Auto-Login
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="test@example.com"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                className="text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!devEmail}
                onClick={() => {
                  window.location.href = `/api/dev/login?email=${encodeURIComponent(devEmail)}`;
                }}
              >
                Go
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
