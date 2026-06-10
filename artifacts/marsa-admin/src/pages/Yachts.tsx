import { useState } from "react";
import {
  useAdminListYachts, useAdminApproveYacht, useAdminRejectYacht,
  useAdminRequestYachtChanges, useAdminSuspendYacht,
  getAdminListYachtsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, AlertCircle, PauseCircle } from "lucide-react";

type YachtAction = "approve" | "reject" | "request-changes" | "suspend";

const statusColors: Record<string, string> = {
  draft: "text-muted-foreground border-muted/40",
  pending_review: "text-amber-400 border-amber-400/40",
  live: "text-green-400 border-green-400/40",
  rejected: "text-destructive border-destructive/40",
  changes_requested: "text-orange-400 border-orange-400/40",
  suspended: "text-red-400 border-red-400/40",
};

export default function Yachts() {
  const [dialog, setDialog] = useState<{ id: string; action: YachtAction } | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListYachts({
    query: { queryKey: getAdminListYachtsQueryKey() }
  });

  const onSuccess = (msg: string) => () => {
    toast({ title: msg });
    qc.invalidateQueries({ queryKey: getAdminListYachtsQueryKey() });
    setDialog(null); setReason("");
  };
  const onError = () => toast({ title: "Operation failed", variant: "destructive" });

  const approve = useAdminApproveYacht({ mutation: { onSuccess: onSuccess("Yacht approved"), onError } });
  const reject = useAdminRejectYacht({ mutation: { onSuccess: onSuccess("Yacht rejected"), onError } });
  const requestChanges = useAdminRequestYachtChanges({ mutation: { onSuccess: onSuccess("Changes requested"), onError } });
  const suspend = useAdminSuspendYacht({ mutation: { onSuccess: onSuccess("Yacht suspended"), onError } });

  const handleConfirm = () => {
    if (!dialog) return;
    if (dialog.action === "approve") approve.mutate({ id: dialog.id });
    else if (dialog.action === "reject") reject.mutate({ id: dialog.id, data: { reason: reason || undefined } });
    else if (dialog.action === "request-changes") requestChanges.mutate({ id: dialog.id, data: { reason: reason || "" } });
    else if (dialog.action === "suspend") suspend.mutate({ id: dialog.id, data: { reason: reason || undefined } });
  };

  const isPending = approve.isPending || reject.isPending || requestChanges.isPending || suspend.isPending;
  const yachts = (data as any)?.yachts ?? [];

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Yachts</h1>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : yachts.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No yachts found</div>
      ) : (
        <div className="space-y-2">
          {yachts.map((yacht: any) => (
            <Card key={yacht.id} data-testid={`card-yacht-${yacht.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{yacht.title}</span>
                    <Badge variant="outline" className={`text-xs ${statusColors[yacht.status] ?? ""}`}>
                      {yacht.status?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Capacity: {yacht.capacity} · EGP {Number(yacht.basePriceEgp ?? 0).toLocaleString()} · Host: {yacht.hostId?.slice(0, 8)}
                  </p>
                </div>
                <div className="flex gap-1 ml-4 shrink-0 flex-wrap justify-end">
                  {yacht.status === "pending_review" && (
                    <>
                      <Button size="sm" variant="outline" className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                        data-testid={`button-approve-yacht-${yacht.id}`}
                        onClick={() => setDialog({ id: yacht.id, action: "approve" })}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-orange-400 border-orange-400/40 hover:bg-orange-400/10"
                        data-testid={`button-changes-yacht-${yacht.id}`}
                        onClick={() => setDialog({ id: yacht.id, action: "request-changes" })}>
                        <AlertCircle className="w-3 h-3 mr-1" />Request Changes
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                        data-testid={`button-reject-yacht-${yacht.id}`}
                        onClick={() => setDialog({ id: yacht.id, action: "reject" })}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </>
                  )}
                  {yacht.status === "live" && (
                    <Button size="sm" variant="outline" className="text-amber-400 border-amber-400/40 hover:bg-amber-400/10"
                      data-testid={`button-suspend-yacht-${yacht.id}`}
                      onClick={() => setDialog({ id: yacht.id, action: "suspend" })}>
                      <PauseCircle className="w-3 h-3 mr-1" />Suspend
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{dialog?.action?.replace(/-/g, " ")} Yacht</DialogTitle>
          </DialogHeader>
          {dialog?.action !== "approve" && (
            <div className="space-y-2">
              <Label htmlFor="yacht-reason">
                Reason {dialog?.action === "request-changes" ? "(required)" : "(optional)"}
              </Label>
              <Textarea id="yacht-reason" data-testid="textarea-yacht-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Explain why..." />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setReason(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-yacht-action"
              variant={dialog?.action === "approve" ? "default" : "destructive"}
              disabled={isPending || (dialog?.action === "request-changes" && !reason.trim())}
              onClick={handleConfirm}
            >
              {isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
