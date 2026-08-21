import { useState } from "react";
import {
  useAdminListHosts,
  useAdminVerifyHost,
  getAdminListHostsQueryKey,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAdminSectionSeen } from "@/hooks/useAdminSectionSeen";
import { CheckCircle, XCircle, Clock } from "lucide-react";

const statusBadge: Record<string, React.ReactNode> = {
  pending: (
    <Badge variant="outline" className="text-amber-400 border-amber-400/40">
      <Clock className="w-3 h-3 mr-1" />
      Pending
    </Badge>
  ),
  verified: (
    <Badge variant="outline" className="text-green-400 border-green-400/40">
      <CheckCircle className="w-3 h-3 mr-1" />
      Verified
    </Badge>
  ),
  rejected: (
    <Badge variant="outline" className="text-destructive border-destructive/40">
      <XCircle className="w-3 h-3 mr-1" />
      Rejected
    </Badge>
  ),
};

export default function Hosts() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [dialog, setDialog] = useState<{
    id: string;
    action: "verified" | "rejected";
  } | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = statusFilter !== "all" ? { status: statusFilter as any } : {};
  const { data, isLoading, isSuccess } = useAdminListHosts(params, {
    query: { queryKey: getAdminListHostsQueryKey(params) },
  });
  useAdminSectionSeen("hosts", isSuccess);

  const verify = useAdminVerifyHost({
    mutation: {
      onSuccess: () => {
        toast({ title: "Host updated successfully" });
        qc.invalidateQueries({ queryKey: getAdminListHostsQueryKey() });
        setDialog(null);
        setReason("");
      },
      onError: () =>
        toast({ title: "Failed to update host", variant: "destructive" }),
    },
  });

  const hosts = (data as any)?.hosts ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Host Verification</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-host-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : hosts.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No hosts found
        </div>
      ) : (
        <div className="space-y-2">
          {hosts.map((host: any) => (
            <Card key={host.id} data-testid={`card-host-${host.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">
                      {host.displayName || host.businessName || host.id}
                    </span>
                    {statusBadge[host.verificationStatus]}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {host.city} · {host.country} ·{" "}
                    {new Date(host.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {host.verificationStatus === "pending" && (
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                      data-testid={`button-approve-host-${host.id}`}
                      onClick={() =>
                        setDialog({ id: host.id, action: "verified" })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/40 hover:bg-destructive/10"
                      data-testid={`button-reject-host-${host.id}`}
                      onClick={() =>
                        setDialog({ id: host.id, action: "rejected" })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!dialog}
        onOpenChange={() => {
          setDialog(null);
          setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "verified" ? "Approve Host" : "Reject Host"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              data-testid="textarea-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a note for the host..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialog(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-action"
              variant={
                dialog?.action === "verified" ? "default" : "destructive"
              }
              disabled={verify.isPending}
              onClick={() =>
                dialog &&
                verify.mutate({
                  id: dialog.id,
                  data: { status: dialog.action, reason: reason || undefined },
                })
              }
            >
              {verify.isPending
                ? "Processing..."
                : dialog?.action === "verified"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
