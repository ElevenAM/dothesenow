"use client";

import { Badge } from "@/components/ui/badge";
import type { OutreachEntry } from "@/lib/contacts/actions";
import { Mail, Phone, Globe, MessageSquare, ArrowUpRight, ArrowDownLeft } from "lucide-react";

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  email: Mail,
  linkedin: Globe,
  phone: Phone,
  reddit: MessageSquare,
  twitter: Globe,
  tiktok: Globe,
  instagram: Globe,
  in_person: Phone,
  other: Globe,
};

const STATUS_COLORS: Record<string, string> = {
  drafted: "bg-[var(--label-default-bg)] text-[var(--label-default-fg)]",
  sent: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  delivered: "bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]",
  opened: "bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]",
  replied: "bg-[var(--label-green-bg)] text-[var(--label-green-fg)]",
  bounced: "bg-[var(--label-red-bg)] text-[var(--label-red-fg)]",
  no_response: "bg-[var(--label-yellow-bg)] text-[var(--label-yellow-fg)]",
};

interface OutreachTimelineProps {
  entries: OutreachEntry[];
}

export function OutreachTimeline({ entries }: OutreachTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No outreach history yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const Icon = CHANNEL_ICONS[entry.channel] || Globe;
        const DirectionIcon = entry.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
        return (
          <div key={entry.id} className="flex gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="rounded-full p-1.5 bg-muted">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="w-px flex-1 bg-border" />
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium capitalize">{entry.channel}</span>
                <DirectionIcon className="h-3 w-3 text-muted-foreground" />
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${entry.status ? STATUS_COLORS[entry.status] || "" : ""}`}
                >
                  {(entry.status ?? "unknown").replace("_", " ")}
                </span>
                {entry.persona_used && (
                  <Badge variant="outline" className="text-[10px]">
                    {entry.persona_used}
                  </Badge>
                )}
              </div>
              {entry.subject && (
                <p className="font-medium mt-0.5">{entry.subject}</p>
              )}
              {entry.content && (
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{entry.content}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(entry.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
