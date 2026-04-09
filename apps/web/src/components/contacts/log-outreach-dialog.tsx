"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { logContactOutreach } from "@/lib/contacts/actions";

const CHANNELS = [
  "email", "linkedin", "phone", "reddit", "twitter",
  "tiktok", "instagram", "in_person", "other",
] as const;

const DIRECTIONS = ["outbound", "inbound"] as const;

const STATUSES = [
  "drafted", "sent", "delivered", "opened",
  "replied", "bounced", "no_response",
] as const;

interface LogOutreachDialogProps {
  contactId: string;
}

export function LogOutreachDialog({ contactId }: LogOutreachDialogProps) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<string>("email");
  const [direction, setDirection] = useState<string>("outbound");
  const [status, setStatus] = useState<string>("sent");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setChannel("email");
    setDirection("outbound");
    setStatus("sent");
    setSubject("");
    setContent("");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        await logContactOutreach(contactId, {
          channel: channel as (typeof CHANNELS)[number],
          direction: direction as (typeof DIRECTIONS)[number],
          status: status as (typeof STATUSES)[number],
          subject: subject || null,
          content: content || null,
        });
        resetForm();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to log outreach");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <Plus className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Outreach</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => v && setChannel(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => v && setDirection(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outreach-subject">Subject (optional)</Label>
            <Input
              id="outreach-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject or message title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outreach-content">Content (optional)</Label>
            <Textarea
              id="outreach-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Message content or notes..."
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Log Touchpoint
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
