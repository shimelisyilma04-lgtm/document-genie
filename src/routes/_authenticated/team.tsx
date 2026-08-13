import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Mail, Trash2, Users } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  useInviteTeamMember,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateTeamMemberRole,
  useWorkspaces,
} from "@/lib/queries";
import type { TeamMember } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team — OmniParse AI" },
      { name: "description", content: "Invite collaborators to your OmniParse workspaces." },
      { property: "og:title", content: "Team — OmniParse AI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function TeamPage() {
  const workspaces = useWorkspaces();
  const defaultWs = workspaces.data?.find((w) => w.is_default) ?? workspaces.data?.[0];
  const [selectedWsId, setSelectedWsId] = useState<string | null>(defaultWs?.id ?? null);
  const members = useTeamMembers(selectedWsId);
  const invite = useInviteTeamMember();
  const remove = useRemoveTeamMember();
  const updateRole = useUpdateTeamMemberRole();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  function handleInvite() {
    if (!selectedWsId || !inviteEmail.trim()) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    invite.mutate(
      { workspaceId: selectedWsId, email, role: inviteRole },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${email}.`);
          setInviteOpen(false);
          setInviteEmail("");
          setInviteRole("member");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Could not send invitation."),
      },
    );
  }

  return (
    <AppShell
      title="Team"
      description="Invite collaborators to your workspaces. Business plan only."
      actions={
        <Button
          size="sm"
          variant="gold"
          onClick={() => setInviteOpen(true)}
          disabled={!selectedWsId}
        >
          <Mail className="size-4" /> Invite member
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Workspace selector */}
        <div className="surface-panel p-5 space-y-2">
          <Label>Workspace</Label>
          <Select
            value={selectedWsId ?? ""}
            onValueChange={(v) => setSelectedWsId(v)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a workspace" />
            </SelectTrigger>
            <SelectContent>
              {workspaces.data?.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Members list */}
        {selectedWsId ? (
          members.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : members.data?.length === 0 ? (
            <div className="surface-panel p-8 text-center">
              <Users className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No team members yet. Invite someone to get started.
              </p>
            </div>
          ) : (
            <div className="surface-panel divide-y divide-border">
              {members.data?.map((member: TeamMember) => (
                <div key={member.id} className="flex items-center gap-4 p-4">
                  <div className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Users className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{member.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited {new Date(member.invited_at).toLocaleDateString()}
                      {member.joined_at && ` · Joined ${new Date(member.joined_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      updateRole.mutate(
                        { id: member.id, role: role as TeamMember["role"], workspaceId: selectedWsId },
                        {
                          onSuccess: () => toast.success("Role updated."),
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Could not update role."),
                        },
                      )
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["admin", "member", "viewer"] as const).map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove team member"
                    onClick={() => {
                      if (!window.confirm(`Remove ${member.email} from this workspace?`)) return;
                      remove.mutate(
                        { id: member.id, workspaceId: selectedWsId },
                        {
                          onSuccess: () => toast.success("Member removed."),
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Could not remove member."),
                        },
                      );
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="surface-panel p-8 text-center">
            <Users className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Select a workspace to manage its team members.
            </p>
          </div>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              They&apos;ll receive an email to join this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — can manage members</SelectItem>
                  <SelectItem value="member">Member — can view and upload</SelectItem>
                  <SelectItem value="viewer">Viewer — read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={handleInvite}
              disabled={invite.isPending || !inviteEmail.trim()}
            >
              {invite.isPending && <Loader2 className="size-4 animate-spin" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
