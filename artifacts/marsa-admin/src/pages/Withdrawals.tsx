import { useState } from "react";
import {
  useAdminListWithdrawals, useAdminProcessWithdrawal,
  getAdminListWithdrawalsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

type WithdrawalAction = "paid" | "rejected";

function formatEgp(v: string | number | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
}

function EarningsBreakdown({ earnings }: { earnings: any[] }) {
  if (!earnings?.length) {
    return <p className="text-xs text-muted-foreground py-1">No earnings records found for this host.</p>;
  }

  const available = earnings.filter(e => e.status === "available");
  const pending = earnings.filter(e => e.status === "pending");
  const withdrawn = earnings.filter(e => e.status === "withdrawn");

  const total = (arr: any[]) => arr.reduce((s, e) => s + parseFloat(e.amountEgp ?? "0"), 0);

  return (
    <div className="space-y-2">
      {available.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-400 mb-1">Available ({available.length} entries · {formatEgp(total(available))})</p>
          <div className="space-y-1">
            {available.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono">{e.id.slice(0, 8)}</span>
                <span className="text-foreground font-medium">{formatEgp(e.amountEgp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-400 mb-1">Pending release ({pending.length} entries · {formatEgp(total(pending))})</p>
          <div className="space-y-1">
            {pending.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono">{e.id.slice(0, 8)}</span>
                <span className="text-foreground">{formatEgp(e.amountEgp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {withdrawn.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Already withdrawn ({withdrawn.length} entries · {formatEgp(total(withdrawn))})</p>
        </div>
      )}
    </div>
  );
}

export default function Withdrawals() {
  const [dialog, setDialog] = useState<{ id: string; action: WithdrawalAction } | null>(null);
  const [txRef, setTxRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useAdminListWithdrawals({
    query: { queryKey: getAdminListWithdrawalsQueryKey() }
  });

  const process = useAdminProcessWithdrawal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Withdrawal processed" });
        qc.invalidateQueries({ queryKey: getAdminListWithdrawalsQueryKey() });
        setDialog(null); setTxRef(""); setRejectReason("");
      },
      onError: () => toast({ title: "Failed to process withdrawal", variant: "destructive" }),
    }
  });

  const withdrawals = (data as any)?.withdrawals ?? [];

  const statusIcon: Record<string, React.ReactNode> = {
    withdrawal_requested: <Badge variant="outline" className="text-amber-400 border-amber-400/40"><Clock className="w-3 h-3 mr-1" />Requested</Badge>,
    paid: <Badge variant="outline" className="text-green-400 border-green-400/40"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>,
    rejected: <Badge variant="outline" className="text-destructive border-destructive/40"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>,
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Withdrawals</h1>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : withdrawals.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No withdrawals found</div>
      ) : (
        <div className="space-y-2">
          {withdrawals.map((w: any) => {
            const isExpanded = expandedId === w.id;
            return (
              <Card key={w.id} data-testid={`card-withdrawal-${w.id}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <button
                      className="min-w-0 text-left flex items-start gap-2 flex-1"
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                      data-testid={`expand-withdrawal-${w.id}`}
                    >
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-1 shrink-0" />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">{formatEgp(w.amountEgp ?? 0)}</span>
                          {statusIcon[w.status]}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Host: {w.hostId?.slice(0, 8)}
                          {w.payoutMethod && ` · ${w.payoutMethod}`}
                          {w.transactionRef && ` · Ref: ${w.transactionRef}`}
                        </p>
                        {w.notes && <p className="text-xs text-muted-foreground italic mt-0.5">Note: {w.notes}</p>}
                      </div>
                    </button>
                    {w.status === "withdrawal_requested" && (
                      <div className="flex gap-2 ml-4 shrink-0">
                        <Button size="sm" variant="outline" className="text-green-400 border-green-400/40 hover:bg-green-400/10"
                          data-testid={`button-pay-${w.id}`}
                          onClick={() => setDialog({ id: w.id, action: "paid" })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Mark Paid
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          data-testid={`button-reject-withdrawal-${w.id}`}
                          onClick={() => setDialog({ id: w.id, action: "rejected" })}>
                          <XCircle className="w-3 h-3 mr-1" />Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                        <TrendingUp className="w-3 h-3" />Earnings Breakdown for this host
                      </p>
                      <EarningsBreakdown earnings={w.earningsBreakdown ?? []} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setTxRef(""); setRejectReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.action === "paid" ? "Mark as Paid" : "Reject Withdrawal"}</DialogTitle>
          </DialogHeader>
          {dialog?.action === "paid" ? (
            <div className="space-y-2">
              <Label htmlFor="tx-ref">Payout Reference (optional)</Label>
              <Input id="tx-ref" data-testid="input-tx-ref" value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="Bank reference or transfer ID..." />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason (required)</Label>
              <textarea
                id="reject-reason"
                data-testid="textarea-withdrawal-reject-reason"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                placeholder="Explain why this withdrawal request is being rejected..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setTxRef(""); setRejectReason(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-withdrawal"
              variant={dialog?.action === "paid" ? "default" : "destructive"}
              disabled={process.isPending || (dialog?.action === "rejected" && !rejectReason.trim())}
              onClick={() => dialog && process.mutate({
                id: dialog.id,
                data: {
                  status: dialog.action,
                  payoutReference: txRef || undefined,
                  notes: rejectReason || undefined,
                }
              })}
            >
              {process.isPending ? "Processing..." : dialog?.action === "paid" ? "Confirm Payment" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
