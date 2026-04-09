import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrgMembers, getPendingInvites, getMemberCount } from "@/lib/team/queries";
import { getPlanLimits } from "@/lib/stripe/config";
import type { PlanId } from "@/lib/stripe/config";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteForm } from "@/components/team/invite-form";
import { MemberActions } from "@/components/team/member-actions";
import { CancelInviteButton } from "@/components/team/cancel-invite-button";
import { getActiveOrgId } from "@/lib/org-context";

const roleBadgeVariant: Record<string, "purple" | "blue" | "default"> = {
  owner: "purple",
  admin: "blue",
  member: "default",
};

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Determine current org from cookie or first membership
  const currentOrgId = await getActiveOrgId();

  let membershipQuery = supabase
    .from("dtn_memberships")
    .select("id, org_id, role, dtn_organizations(id, name, plan, plan_status)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (currentOrgId) {
    membershipQuery = membershipQuery.eq("org_id", currentOrgId);
  }

  const { data: membership } = await membershipQuery.limit(1).single();

  if (!membership) redirect("/onboarding");

  const org = membership.dtn_organizations as unknown as {
    id: string;
    name: string;
    plan: string;
    plan_status: string;
  };

  // Role gate: members can't manage team
  if (membership.role === "member") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          You don&apos;t have permission to manage team members. Contact your
          organization owner or admin.
        </p>
      </div>
    );
  }

  const [members, pendingInvites, memberCount] = await Promise.all([
    getOrgMembers(org.id),
    getPendingInvites(org.id),
    getMemberCount(org.id),
  ]);

  const limits = getPlanLimits(org.plan as PlanId);
  const memberLimit = limits.members;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-muted-foreground">
          Manage members and invitations for {org.name}.
          {memberLimit > 0 && (
            <span className="ml-1">
              ({memberCount}/{memberLimit} members used)
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a member</CardTitle>
          <CardDescription>
            They&apos;ll see the invite when they log in to DoTheseNow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm memberCount={memberCount} memberLimit={memberLimit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={roleBadgeVariant[m.role] ?? "outline"}>
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.accepted_at
                      ? new Date(m.accepted_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <MemberActions
                      membershipId={m.id}
                      currentRole={m.role}
                      callerRole={membership.role}
                      isSelf={m.user_id === user.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites ({pendingInvites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">
                      {inv.invited_email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={roleBadgeVariant[inv.role] ?? "default"}>
                      {inv.role}
                    </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {inv.invited_at
                        ? new Date(inv.invited_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <CancelInviteButton membershipId={inv.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
