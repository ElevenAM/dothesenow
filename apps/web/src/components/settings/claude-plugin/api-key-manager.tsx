"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Copy, Check, Key } from "lucide-react";
import { generateApiKey, revokeApiKeyAction } from "@/lib/integrations/api-key-actions";
import type { OrgApiKey } from "@dothesenow/queries";
import { formatDistanceToNow } from "date-fns";

interface ApiKeyManagerProps {
  initialKeys: OrgApiKey[];
}

export function ApiKeyManager({ initialKeys }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState(initialKeys);
  const [isPending, startTransition] = useTransition();
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateApiKey(keyLabel || "Default");
      setNewKeyValue(result.key);
      setKeys((prev) => [result.apiKey, ...prev]);
      setKeyLabel("");
    });
  }

  function handleRevoke(keyId: string) {
    startTransition(async () => {
      await revokeApiKeyAction(keyId);
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      setRevokeId(null);
    });
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">API Keys</h3>
          <p className="text-xs text-[var(--fgColor-muted)]">
            Generate keys to connect Claude Code or Claude Desktop to your org.
          </p>
        </div>

        <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="default" size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Generate New Key
              </Button>
            }
          />
          <DialogPortal>
            <DialogOverlay />
            <DialogContent>
              {newKeyValue ? (
                <>
                  <DialogTitle>Your API Key</DialogTitle>
                  <DialogDescription>
                    Copy this key now — it will not be shown again.
                  </DialogDescription>
                  <div className="mt-4 rounded-md border border-[var(--borderColor-default)] bg-[var(--bgColor-muted)] p-3 font-mono text-xs break-all">
                    {newKeyValue}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(newKeyValue)}
                    >
                      {copied ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy Key"}
                    </Button>
                    <DialogClose
                      render={
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setNewKeyValue(null);
                            setGenerateDialogOpen(false);
                          }}
                        >
                          Done
                        </Button>
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <DialogTitle>Generate API Key</DialogTitle>
                  <DialogDescription>
                    Give this key a label so you can identify it later.
                  </DialogDescription>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="key-label">Label</Label>
                    <Input
                      id="key-label"
                      placeholder="e.g. Liam's MacBook"
                      value={keyLabel}
                      onChange={(e) => setKeyLabel(e.target.value)}
                    />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <DialogClose
                      render={<Button variant="outline" size="sm">Cancel</Button>}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isPending}
                    >
                      <Key className="mr-1.5 h-3.5 w-3.5" />
                      {isPending ? "Generating..." : "Generate"}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </DialogPortal>
        </Dialog>
      </div>

      {keys.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--borderColor-default)] p-6 text-center text-sm text-[var(--fgColor-muted)]">
          No API keys yet. Generate one to get started.
        </div>
      ) : (
        <div className="rounded-md border border-[var(--borderColor-default)] divide-y divide-[var(--borderColor-default)]">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-[var(--fgColor-muted)]">
                    {key.key_prefix}
                  </code>
                  {key.label && (
                    <span className="text-sm font-medium">{key.label}</span>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    MCP
                  </Badge>
                </div>
                <div className="text-xs text-[var(--fgColor-muted)]">
                  Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}
                  {key.last_used_at && (
                    <span className="ml-3">
                      Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>

              <Dialog
                open={revokeId === key.id}
                onOpenChange={(open) => setRevokeId(open ? key.id : null)}
              >
                <DialogTrigger
                  render={
                    <Button variant="ghost" size="sm" className="text-[var(--fgColor-danger)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
                <DialogPortal>
                  <DialogOverlay />
                  <DialogContent>
                    <DialogTitle>Revoke API Key</DialogTitle>
                    <DialogDescription>
                      This will immediately disconnect any Claude instances using
                      this key. This action cannot be undone.
                    </DialogDescription>
                    <div className="mt-4 flex justify-end gap-2">
                      <DialogClose
                        render={<Button variant="outline" size="sm">Cancel</Button>}
                      />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                        disabled={isPending}
                      >
                        {isPending ? "Revoking..." : "Revoke Key"}
                      </Button>
                    </div>
                  </DialogContent>
                </DialogPortal>
              </Dialog>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--fgColor-muted)]">
        To rotate a key: generate a new one first, update your Claude config,
        then revoke the old key.
      </p>
    </div>
  );
}
