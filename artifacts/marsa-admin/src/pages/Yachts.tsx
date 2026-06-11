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
import { CheckCircle, XCircle, AlertCircle, PauseCircle, ChevronDown, ChevronRight, Anchor, Users, MapPin, Star } from "lucide-react";

type YachtAction = "approve" | "reject" | "request-changes" | "suspend";

const statusColors: Record<string, string> = {
  draft: "text-muted-foreground border-muted/40",
  pending_review: "text-amber-400 border-amber-400/40",
  live: "text-green-400 border-green-400/40",
  rejected: "text-destructive border-destructive/40",
  changes_requested: "text-orange-400 border-orange-400/40",
  suspended: "text-red-400 border-red-400/40",
};

function YachtDetail({ yacht }: { yacht: any }) {
  const amenities: string[] = typeof yacht.amenities === "string"
    ? JSON.parse(yacht.amenities || "[]")
    : yacht.amenities ?? [];

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />Capacity: {yacht.capacity}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Anchor className="w-3 h-3" />
              {yacht.type ?? "Yacht"}
            </span>
            {yacht.length && (
              <span className="text-xs text-muted-foreground">{yacht.length}m</span>
            )}
            {(yacht.avgRating > 0 || yacht.reviewCount > 0) && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Star className="w-3 h-3" />{yacht.avgRating ?? "—"} ({yacht.reviewCount ?? 0} reviews)
              </span>
            )}
          </div>
          {yacht.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />{yacht.location}
            </p>
          )}
          <p className="text-xs text-muted-foreground font-mono">Host: {yacht.hostId?.slice(0, 8)}</p>
          <p className="text-xs text-muted-foreground">
            Added: {new Date(yacht.createdAt).toLocaleDateString()}
          </p>
        </div>
        {yacht.description && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{yacht.description}</p>
          </div>
        )}
      </div>
      {amenities.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Amenities</p>
          <div className="flex flex-wrap gap-1">
            {amenities.map((a: string) => (
              <Badge key={a} variant="outline" className="text-xs text-muted-foreground border-muted/40">{a}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Yachts() {
  const [dialog, setDialog] = useState<{ id: string; action: YachtAction } | null>(null);
  const [reason, setReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    else if (dialog.action === "request-changes") requestChanges.mutate({ id: dialog.id, data: { feedback: reason || "" } });
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
          {yachts.map((yacht: any) => {
            const isExpanded = expandedId === yacht.id;
            return (
              <Card key={yacht.id} data-testid={`card-yacht-${yacht.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="min-w-0 text-left flex items-start gap-2 flex-1"
                      onClick={() => setExpandedId(isExpanded ? null : yacht.id)}
                      data-testid={`expand-yacht-${yacht.id}`}
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm truncate">{yacht.title}</span>
                          <Badge variant="outline" className={`text-xs ${statusColors[yacht.status] ?? ""}`}>
                            {yacht.status?.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {yacht.capacity} guests
                          {yacht.basePriceEgp && ` · EGP ${Number(yacht.basePriceEgp).toLocaleString()}`}
                          {yacht.location && ` · ${yacht.location}`}
                        </p>
                      </div>
                    </button>
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
                  </div>
                  {isExpanded && <YachtDetail yacht={yacht} />}
                </CardContent>
              </Card>
            );
          })}
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
