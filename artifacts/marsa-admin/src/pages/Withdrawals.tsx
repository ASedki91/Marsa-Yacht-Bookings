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
import { CheckCircle, XCircle, Clock } from "lucide-react";

type WithdrawalAction = "paid" | "rejected";

export default function Withdrawals() {
  const [dialog, setDialog] = useState<{ id: string; action: WithdrawalAction } | null>(null);
  const [txRef, setTxRef] = useState("");
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
        setDialog(null); setTxRef("");
      },
      onError: () => toast({ title: "Failed to process withdrawal", variant: "destructive" }),
    }
  });

  const withdrawals = (data as any)?.withdrawals ?? [];

  const formatEgp = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  };

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
          {withdrawals.map((w: any) => (
            <Card key={w.id} data-testid={`card-withdrawal-${w.id}`}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{formatEgp(w.amount ?? 0)}</span>
                    {statusIcon[w.status]}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Host: {w.hostId?.slice(0, 8)} · {w.bankName} ····{w.accountNumber?.slice(-4)}
                    {w.transactionRef && ` · Ref: ${w.transactionRef}`}
                  </p>
                </div>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={() => { setDialog(null); setTxRef(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.action === "paid" ? "Mark as Paid" : "Reject Withdrawal"}</DialogTitle>
          </DialogHeader>
          {dialog?.action === "paid" && (
            <div className="space-y-2">
              <Label htmlFor="tx-ref">Transaction Reference (optional)</Label>
              <Input id="tx-ref" data-testid="input-tx-ref" value={txRef} onChange={e => setTxRef(e.target.value)} placeholder="Bank reference..." />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setTxRef(""); }}>Cancel</Button>
            <Button
              data-testid="button-confirm-withdrawal"
              variant={dialog?.action === "paid" ? "default" : "destructive"}
              disabled={process.isPending}
              onClick={() => dialog && process.mutate({ id: dialog.id, data: { action: dialog.action, transactionRef: txRef || undefined } })}
            >
              {process.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
