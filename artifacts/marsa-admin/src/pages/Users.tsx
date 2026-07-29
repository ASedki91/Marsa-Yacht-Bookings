import { useState } from "react";
import {
  useAdminListUsers,
  useAdminSetUserRole,
  getAdminListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAdminSectionSeen } from "@/hooks/useAdminSectionSeen";

const roleBadge: Record<string, string> = {
  guest: "text-muted-foreground border-muted/40",
  host: "text-blue-400 border-blue-400/40",
  admin: "text-amber-400 border-amber-400/40",
};

export default function Users() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [dialog, setDialog] = useState<{
    id: string;
    currentRole: string;
    name: string;
  } | null>(null);
  const [newRole, setNewRole] = useState<string>("guest");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params: any = {};
  if (roleFilter !== "all") params.role = roleFilter;

  const { data, isLoading, isSuccess } = useAdminListUsers(params, {
    query: { queryKey: getAdminListUsersQueryKey(params) },
  });
  useAdminSectionSeen("users", isSuccess);

  const setRole = useAdminSetUserRole({
    mutation: {
      onSuccess: () => {
        toast({ title: "Role updated" });
        qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        setDialog(null);
      },
      onError: () =>
        toast({ title: "Failed to update role", variant: "destructive" }),
    },
  });

  const users = (data as any)?.users ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Users</h1>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-32" data-testid="select-role-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
            <SelectItem value="host">Host</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No users found
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u: any) => (
            <Card key={u.id} data-testid={`card-user-${u.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">
                      {u.fullName || u.email}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${roleBadge[u.role] ?? ""}`}
                    >
                      {u.role}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {u.email} · {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-4 shrink-0 text-xs"
                  data-testid={`button-role-user-${u.id}`}
                  onClick={() => {
                    setDialog({
                      id: u.id,
                      currentRole: u.role,
                      name: u.fullName || u.email,
                    });
                    setNewRole(u.role);
                  }}
                >
                  Change Role
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Role — {dialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger data-testid="select-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-role"
              disabled={setRole.isPending || newRole === dialog?.currentRole}
              onClick={() =>
                dialog &&
                setRole.mutate({
                  id: dialog.id,
                  data: { role: newRole as any },
                })
              }
            >
              {setRole.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
