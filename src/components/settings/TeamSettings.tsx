import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Copy, RefreshCw, Crown, ShieldCheck, User, Trash2, Loader2, Plus, LogIn,
} from "lucide-react";

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3.5 w-3.5 text-amber-500" />,
  admin: <ShieldCheck className="h-3.5 w-3.5 text-primary" />,
  member: <User className="h-3.5 w-3.5 text-muted-foreground" />,
};

const roleBadgeColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  admin: "bg-primary/15 text-primary",
  member: "bg-secondary text-secondary-foreground",
};

interface TeamData {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles?: { display_name: string; email: string } | null;
}

const TeamSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  const fetchTeam = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get user's team membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      setMyRole(membership.role);

      const { data: teamData } = await supabase
        .from("teams")
        .select("*")
        .eq("id", membership.team_id)
        .single();

      if (teamData) setTeam(teamData as any);

      const { data: membersData } = await supabase
        .from("team_members")
        .select("*, profiles(display_name, email)")
        .eq("team_id", membership.team_id)
        .order("joined_at");

      if (membersData) setMembers(membersData as any);
    } else {
      setTeam(null);
      setMyRole(null);
      setMembers([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const createTeam = async () => {
    if (!teamName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "create_team", name: teamName.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Team created!" });
      setTeamName("");
      fetchTeam();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const joinTeam = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "join_team", invite_code: joinCode.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `Joined ${data.team?.name || "team"}!` });
      setJoinCode("");
      setShowJoinDialog(false);
      fetchTeam();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const copyInviteCode = () => {
    if (!team) return;
    navigator.clipboard.writeText(team.invite_code);
    toast({ title: "Invite code copied!" });
  };

  const regenerateCode = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "regenerate_invite" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "New invite code generated" });
      fetchTeam();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "update_role", member_id: memberId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Role updated" });
      fetchTeam();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "remove_member", member_id: memberId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Member removed" });
      fetchTeam();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const isAdminOrOwner = myRole === "owner" || myRole === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No team yet — show create/join
  if (!team) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Create a Team
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Team Name</Label>
              <Input
                placeholder="My Agency"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button onClick={createTeam} disabled={creating || !teamName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create Team
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LogIn className="h-4 w-4" /> Join a Team
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Invite Code</Label>
              <Input
                placeholder="Paste invite code..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="max-w-xs font-mono"
              />
            </div>
            <Button onClick={joinTeam} disabled={joining || !joinCode.trim()} variant="outline">
              {joining ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LogIn className="h-4 w-4 mr-1" />}
              Join Team
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> {team.name}
            <Badge className={`text-[10px] border-0 ml-2 ${roleBadgeColors[myRole || "member"]}`}>
              {myRole}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invite Code */}
          <div>
            <Label className="text-xs text-muted-foreground">Invite Code</Label>
            <div className="flex items-center gap-2 mt-1">
              <code className="px-3 py-1.5 rounded-md bg-muted text-sm font-mono tracking-wider">
                {team.invite_code}
              </code>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyInviteCode}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              {isAdminOrOwner && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={regenerateCode}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Share this code with teammates so they can join
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Team Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Member</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
                {isAdminOrOwner && <TableHead className="text-xs">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                        {roleIcons[m.role]}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {(m.profiles as any)?.display_name || "Unknown"}
                          {m.user_id === user?.id && (
                            <span className="text-xs text-muted-foreground ml-1">(you)</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {(m.profiles as any)?.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] border-0 ${roleBadgeColors[m.role]}`}>
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </TableCell>
                  {isAdminOrOwner && (
                    <TableCell>
                      {m.role !== "owner" && m.user_id !== user?.id && (
                        <div className="flex items-center gap-1">
                          <Select
                            value={m.role}
                            onValueChange={(v) => updateRole(m.id, v)}
                          >
                            <SelectTrigger className="h-7 w-[90px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeMember(m.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamSettings;
