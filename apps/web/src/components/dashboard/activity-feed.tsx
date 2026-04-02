import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, FileText, UserPlus, ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface ActivityItem {
  id: string;
  type: "outreach" | "strategy" | "contact";
  title: string;
  subtitle: string;
  timestamp: string;
}

interface ActivityFeedProps {
  orgId: string;
}

export async function ActivityFeed({ orgId }: ActivityFeedProps) {
  const supabase = await createClient();

  const [outreachResult, strategyResult, contactResult] = await Promise.all([
    supabase
      .from("mktg_outreach_log")
      .select("id, channel, direction, subject, created_at, mktg_contacts(first_name, last_name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("mktg_strategy_docs")
      .select("id, title, doc_type, changed_by, updated_at")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("mktg_contacts")
      .select("id, first_name, last_name, contact_type, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items: ActivityItem[] = [];

  for (const row of outreachResult.data ?? []) {
    const contact = row.mktg_contacts as unknown as { first_name: string; last_name: string } | null;
    const name = contact ? `${contact.first_name} ${contact.last_name || ""}`.trim() : "Unknown";
    items.push({
      id: `outreach-${row.id}`,
      type: "outreach",
      title: `${row.direction === "inbound" ? "Received" : "Sent"} ${row.channel} ${row.direction === "inbound" ? "from" : "to"} ${name}`,
      subtitle: row.subject || "",
      timestamp: row.created_at,
    });
  }

  for (const row of strategyResult.data ?? []) {
    items.push({
      id: `strategy-${row.id}`,
      type: "strategy",
      title: `${row.changed_by === "claude" ? "Claude" : "User"} updated "${row.title}"`,
      subtitle: row.doc_type.replace("_", " "),
      timestamp: row.updated_at,
    });
  }

  for (const row of contactResult.data ?? []) {
    items.push({
      id: `contact-${row.id}`,
      type: "contact",
      title: `Added ${row.first_name} ${row.last_name || ""}`.trim(),
      subtitle: row.contact_type,
      timestamp: row.created_at,
    });
  }

  // Sort by timestamp desc, take 10
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recentItems = items.slice(0, 10);

  const ICONS = {
    outreach: Mail,
    strategy: FileText,
    contact: UserPlus,
  };

  const COLORS = {
    outreach: "text-blue-600 bg-blue-50",
    strategy: "text-purple-600 bg-purple-50",
    contact: "text-green-600 bg-green-50",
  };

  if (recentItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No activity yet. Start by adding contacts or creating strategy documents.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentItems.map((item) => {
          const Icon = ICONS[item.type];
          const colorClass = COLORS[item.type];
          return (
            <div key={item.id} className="flex items-start gap-3">
              <div className={`rounded-full p-1.5 ${colorClass}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-tight">{item.title}</p>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground capitalize">
                    {item.subtitle}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
