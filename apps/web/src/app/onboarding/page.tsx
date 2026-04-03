"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    // Generate slug from org name
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Create org
    const { data: org, error: orgError } = await supabase
      .from("dtn_organizations")
      .insert({ name: orgName, slug })
      .select()
      .single();

    if (orgError) {
      if (orgError.code === "23505") {
        setError("An organization with this name already exists. Try a different name.");
      } else {
        setError(orgError.message);
      }
      setLoading(false);
      return;
    }

    // Create membership (owner)
    const { error: memberError } = await supabase
      .from("dtn_memberships")
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: "owner",
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    // Seed Marketing department
    const { error: deptError } = await supabase
      .from("dtn_departments")
      .insert({
        org_id: org.id,
        slug: "marketing",
        name: "Marketing",
        icon: "megaphone",
      });

    if (deptError) {
      setError(deptError.message);
      setLoading(false);
      return;
    }

    router.push("/marketing");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to DoTheseNow</CardTitle>
          <CardDescription>
            Create your organization to get started. You can invite team members
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateOrg} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                placeholder="Acme Marketing"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                minLength={2}
              />
              <p className="text-xs text-gray-500">
                This is your company or team name
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
