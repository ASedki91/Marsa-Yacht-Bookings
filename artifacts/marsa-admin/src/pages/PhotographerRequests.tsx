import { useState } from "react";
import {
  useAdminListPhotographerRequests, useAdminUpdatePhotographerRequest,
  getAdminListPhotographerRequestsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  pending: "text-amber-400 border-amber-400/40",
  scheduled: "text-blue-400 border-blue-400/40",
  completed: "text-green-400 border-green-400/40",
  cancelled: "text-muted-foreground border-muted/40",
};

export default function PhotographerRequests() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [dialog, setDialog] = useState<{ id: string; currentStatus: string } | null>(null);
  const [newStatus, setNewStatus] = useState("scheduled");
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = statusFilter !== "all" ? { status: statusFilter } : {};
  const { data, isLoading } = useAdminListPhotographerRequests(params as any, {
    query: { queryKey: getAdminListPhotographerRequestsQueryKey(params as any) }
  });

  const update = useAdminUpdatePhotographerRequest({
    mutation: {
      onSuccess: () => {
        toast({ title: "Request updated" });
        qc.invalidateQueries({ queryKey: getAdminListPhotographerRequestsQueryKey() });
        setDialog(null);
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    }
  });

  const requests = (data as any)?.requests ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Photographer Requests</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-photo-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : requests.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No requests found</div>
      ) : (
        <div className="space-y-2">
          {requests.map((r: any) => (
            <Card key={r.id} data-testid={`card-photo-req-${r.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{r.yachtId?.slice(0, 8)}</span>
                    <Badge variant="outline" className={`text-xs ${statusColors[r.status] ?? ""}`}>{r.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Requested: {new Date(r.createdAt).toLocaleDateString()}
                    {r.preferredDate && ` · Preferred: ${r.preferredDate}`}
                    {r.notes && ` · ${r.notes}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="ml-4 shrink-0 text-xs"
                  data-testid={`button-update-photo-req-${r.id}`}
                  onClick={() => { setDialog({ id: r.id, currentStatus: r.status }); setNewStatus(r.status); }}>
                  Update Status
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Request Status</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger data-testid="select-new-photo-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button data-testid="button-confirm-photo-status" disabled={update.isPending || newStatus === dialog?.currentStatus}
              onClick={() => dialog && update.mutate({ id: dialog.id, data: { status: newStatus } })}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
