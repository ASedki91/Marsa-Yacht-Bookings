import { useState } from "react";
import {
  customFetch,
  useAdminListBookings,
  getAdminListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, XCircle, Clock, History } from "lucide-react";

const CANCELLATION_FEE_PCT = 5;
const EARLY_CANCEL_HOURS = 24;

function formatEgp(v: string | number | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
}

function hoursSince(dateStr: string) {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function cancellationFee(booking: any): number {
  const total = parseFloat(booking.totalAmountEgp ?? "0");
  const hrs = hoursSince(booking.createdAt);
  return hrs < EARLY_CANCEL_HOURS ? total * (CANCELLATION_FEE_PCT / 100) : 0;
}

export default function Cancellations() {
  const [tab, setTab] = useState<"requests" | "history">("requests");
  const [dialog, setDialog] = useState<{ id: string; action: "approve" | "reject"; booking: any } | null>(null);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const requestsQuery = useAdminListBookings(
    { status: "cancel_requested" },
    { query: { queryKey: getAdminListBookingsQueryKey({ status: "cancel_requested" }) } }
  );
  const historyQuery = useAdminListBookings(
    { status: "cancelled" },
    { query: { queryKey: getAdminListBookingsQueryKey({ status: "cancelled" }) } }
  );

  const processCancellation = useMutation({
    mutationFn: async ({ id, action, notes: n }: { id: string; action: "approve" | "reject"; notes?: string }) => {
      return customFetch<any>(`/api/admin/bookings/${id}/process-cancellation`, {
        method: "POST",
        body: JSON.stringify({ action, notes: n }),
      });
    },
    onSuccess: () => {
      toast({ title: dialog?.action === "approve" ? "Cancellation approved" : "Cancellation rejected" });
      qc.invalidateQueries({ queryKey: getAdminListBookingsQueryKey() });
      setDialog(null);
      setNotes("");
    },
    onError: () => toast({ title: "Failed to process cancellation", variant: "destructive" }),
  });

  const requests: any[] = (requestsQuery.data as any)?.bookings ?? [];
  const cancelled: any[] = (historyQuery.data as any)?.bookings ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Cancellations &amp; Refunds</h1>
      </div>

      <div className="mb-3 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5 text-xs text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Cancellation requests within <strong>{EARLY_CANCEL_HOURS}h</strong> of booking creation incur a{" "}
          <strong>{CANCELLATION_FEE_PCT}% platform fee</strong>. Approving those requests enforces the fee automatically.
        </span>
      </div>

      <div className="flex gap-1 mb-4">
        <Button
          size="sm"
          variant={tab === "requests" ? "default" : "outline"}
          data-testid="tab-cancel-requests"
          onClick={() => setTab("requests")}
          className="flex items-center gap-1.5"
        >
          <Clock className="w-3.5 h-3.5" />
          Pending Requests
          {requests.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-400 text-background text-[10px] px-1.5 py-0.5 font-bold leading-none">
              {requests.length}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          variant={tab === "history" ? "default" : "outline"}
          data-testid="tab-cancel-history"
          onClick={() => setTab("history")}
          className="flex items-center gap-1.5"
        >
          <History className="w-3.5 h-3.5" />
          History ({cancelled.length})
        </Button>
      </div>

      {tab === "requests" ? (
        <>
          {requestsQuery.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : requests.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">No pending cancellation requests</div>
          ) : (
            <div className="space-y-2">
              {requests.map((b: any) => {
                const fee = cancellationFee(b);
                const hrs = Math.round(hoursSince(b.createdAt));
                return (
                  <Card key={b.id} data-testid={`card-cancel-req-${b.id}`} className="border-amber-400/20">
                    <CardContent className="flex items-start justify-between py-3 px-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}</span>
                          <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs">cancel requested</Badge>
                          {fee > 0 && (
                            <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">
                              {CANCELLATION_FEE_PCT}% fee: {formatEgp(fee)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-1 font-medium">{b.guestName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {b.yachtName ?? b.yachtId?.slice(0, 8)} · {b.bookingDate} · {b.guestCount} guests
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Total: {formatEgp(b.totalAmountEgp)} · Requested {hrs}h after creation
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4 shrink-0">
                        <p className="text-sm font-semibold text-foreground">{formatEgp(b.totalAmountEgp)}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline"
                            className="text-green-400 border-green-400/40 hover:bg-green-400/10 h-7 text-xs"
                            data-testid={`button-approve-cancel-${b.id}`}
                            onClick={() => setDialog({ id: b.id, action: "approve", booking: b })}>
                            <CheckCircle className="w-3 h-3 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10 h-7 text-xs"
                            data-testid={`button-reject-cancel-${b.id}`}
                            onClick={() => setDialog({ id: b.id, action: "reject", booking: b })}>
                            <XCircle className="w-3 h-3 mr-1" />Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {historyQuery.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : cancelled.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">No cancelled bookings</div>
          ) : (
            <div className="space-y-2">
              {cancelled.map((b: any) => {
                const fee = cancellationFee(b);
                return (
                  <Card key={b.id} data-testid={`card-cancel-hist-${b.id}`}>
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}</span>
                          <Badge variant="outline" className="text-muted-foreground border-muted/30 text-xs">cancelled</Badge>
                          {fee > 0 && (
                            <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs">
                              Fee: {formatEgp(fee)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-0.5">
                          {b.yachtName ?? `Yacht ${b.yachtId?.slice(0, 8)}`} · {b.bookingDate}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {b.guestName} · Total: {formatEgp(b.totalAmountEgp)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground ml-4 shrink-0">
                        {new Date(b.createdAt).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "approve" ? "Approve Cancellation" : "Reject Cancellation Request"}
            </DialogTitle>
          </DialogHeader>
          {dialog?.action === "approve" && cancellationFee(dialog.booking) > 0 && (
            <div className="p-3 rounded-md bg-amber-400/10 border border-amber-400/30 text-sm text-amber-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This booking was made within {EARLY_CANCEL_HOURS}h. Approving will enforce a{" "}
                <strong>{CANCELLATION_FEE_PCT}% fee of {formatEgp(cancellationFee(dialog.booking))}</strong>.
              </span>
            </div>
          )}
          {dialog?.action === "reject" && (
            <div className="space-y-2">
              <Label>Message to guest (optional)</Label>
              <Textarea
                data-testid="textarea-cancel-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Explain why the cancellation request is denied..."
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setNotes(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-cancellation"
              variant={dialog?.action === "approve" ? "default" : "destructive"}
              disabled={processCancellation.isPending}
              onClick={() => dialog && processCancellation.mutate({ id: dialog.id, action: dialog.action, notes: notes || undefined })}
            >
              {processCancellation.isPending ? "Processing..." : dialog?.action === "approve" ? "Approve & Cancel Booking" : "Reject — Keep Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
