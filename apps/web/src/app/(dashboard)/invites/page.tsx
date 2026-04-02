import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPendingInvitesForUser } from "@/lib/team/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteActions } from "@/components/team/invite-actions";

export default async function InvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) redirect("/login");

  const pendingInvites = await getPendingInvitesForUser(user.email);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pending Invites</h1>
        <p className="text-gray-500">
          You&apos;ve been invited to join these organizations.
        </p>
      </div>

      {pendingInvites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No pending invites.
          </CardContent>
        </Card>
      ) : (
        pendingInvites.map((invite) => {
          const org = invite.dtn_organizations as unknown as {
            id: string;
            name: string;
            slug: string;
          } | null;

          return (
            <Card key={invite.id}>
              <CardHeader>
                <CardTitle>{org?.name ?? "Unknown organization"}</CardTitle>
                <CardDescription>
                  Invited as <Badge variant="outline">{invite.role}</Badge>
                  {invite.invited_at && (
                    <span className="ml-2">
                      on {new Date(invite.invited_at).toLocaleDateString()}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InviteActions membershipId={invite.id} />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
