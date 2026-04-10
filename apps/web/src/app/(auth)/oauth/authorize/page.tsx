"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authorizeAction, getConsentData } from "./actions";

interface OrgOption {
  id: string;
  name: string;
  slug: string;
}

export default function OAuthConsentPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [scope, setScope] = useState("mcp");
  const [redirectUri, setRedirectUri] = useState("");
  const [state, setState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const result = await getConsentData();

      if (result.error === "not_authenticated") {
        // Store return cookie and redirect to login — handled by the server action
        router.push("/login");
        return;
      }

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      setOrgs(result.orgs ?? []);
      setSelectedOrgId(result.orgs?.[0]?.id ?? "");
      setScope(result.scope ?? "mcp");
      setRedirectUri(result.redirectUri ?? "");
      setState(result.state ?? "");
      setIsLoading(false);
    }
    load();
  }, [router]);

  async function handleAuthorize() {
    setIsSubmitting(true);
    setError("");

    const result = await authorizeAction(selectedOrgId);

    if (result.redirect) {
      window.location.href = result.redirect;
    } else if (result.error) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      if (state) url.searchParams.set("state", state);
      window.location.href = url.toString();
    } else {
      router.push("/");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Authorize</h2>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error && !orgs.length) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Authorization Error</h2>
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">
          Authorize Claude
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Claude Cowork wants to access your DoTheseNow workspace via MCP.
        </p>
      </div>

      <div className="rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          This will allow Claude to:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
          <li>Manage tasks and daily to-dos</li>
          <li>Query and update your CRM contacts</li>
          <li>Read and refine strategy documents</li>
          <li>Create and manage campaigns</li>
          <li>View and process approvals</li>
        </ul>
      </div>

      {orgs.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Workspace
          </label>
          <Select value={selectedOrgId} onValueChange={(v) => v && setSelectedOrgId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select workspace" />
            </SelectTrigger>
            <SelectContent>
              {orgs.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {orgs.length === 1 && (
        <p className="text-sm text-muted-foreground">
          Workspace: <span className="font-medium text-foreground">{orgs[0].name}</span>
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleAuthorize}
          disabled={isSubmitting || !selectedOrgId}
        >
          {isSubmitting ? "Authorizing..." : "Authorize"}
        </Button>
      </div>
    </div>
  );
}
