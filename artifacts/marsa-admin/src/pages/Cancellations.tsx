import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminListCancellationsQueryKey,
  type BookingCancellation,
  useAdminListCancellations,
  useAdminProcessCancellation,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdminSectionSeen } from "@/hooks/useAdminSectionSeen";
import { useToast } from "@/hooks/use-toast";

type ReviewAction = "approve" | "reject";

interface ReviewDialog {
  cancellation: BookingCancellation;
  action: ReviewAction;
}

const openStatuses = new Set(["pending", "processing", "refund_failed"]);

const statusStyles: Record<string, string> = {
  pending: "border-amber-500/40 text-amber-600",
  processing: "border-blue-500/40 text-blue-600",
  approved: "border-green-500/40 text-green-600",
  rejected: "border-muted-foreground/30 text-muted-foreground",
  refund_failed: "border-destructive/40 text-destructive",
};

function formatEgp(value?: string | number | null) {
  if (value === null || value === undefined) return "Pending review";
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNotice(minutes: number) {
  const absoluteMinutes = Math.abs(minutes);
  const days = Math.floor(absoluteMinutes / 1440);
  const hours = Math.floor((absoluteMinutes % 1440) / 60);
  const remainingMinutes = absoluteMinutes % 60;
  const parts = [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    remainingMinutes || (!days && !hours) ? `${remainingMinutes}m` : "",
  ].filter(Boolean);
  return `${parts.join(" ")} ${minutes < 0 ? "after" : "before"} trip start`;
}

function getErrorMessage(error: any) {
  return error?.data?.error ?? error?.message ?? "Please try again.";
}

function AmountSummary({
  cancellation,
}: {
  cancellation: BookingCancellation;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Original amount</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {formatEgp(cancellation.originalAmountEgp)}
        </p>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Cancellation fee</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {formatEgp(cancellation.feeAmountEgp)}
        </p>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Guest refund</p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {formatEgp(cancellation.refundAmountEgp)}
        </p>
      </div>
    </div>
  );
}

function CancellationCard({
  cancellation,
  onReview,
}: {
  cancellation: BookingCancellation;
  onReview: (action: ReviewAction) => void;
}) {
  const retry = cancellation.status === "refund_failed";
  const canReview = cancellation.status === "pending" || retry;

  return (
    <Card
      data-testid={`card-cancellation-${cancellation.id}`}
      className={
        retry
          ? "border-destructive/30"
          : cancellation.status === "pending"
            ? "border-amber-500/25"
            : undefined
      }
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {cancellation.id.slice(0, 8)}
              </span>
              <Badge
                variant="outline"
                className={statusStyles[cancellation.status] ?? ""}
              >
                {cancellation.status.replace(/_/g, " ")}
              </Badge>
              {cancellation.manualReviewRequired && (
                <Badge
                  variant="outline"
                  className="border-orange-500/40 text-orange-600"
                >
                  Manual fee required
                </Badge>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">
              Booking {cancellation.bookingId.slice(0, 8)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Requested {formatDate(cancellation.requestedAt)} ·{" "}
              {formatNotice(cancellation.remainingMinutes)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Trip starts {formatDate(cancellation.tripStartsAt)}
            </p>
          </div>
          {canReview && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-green-500/40 text-green-600"
                onClick={() => onReview("approve")}
              >
                {retry ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {retry ? "Retry refund" : "Approve"}
              </Button>
              {!retry && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                  onClick={() => onReview("reject")}
                >
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Reject
                </Button>
              )}
            </div>
          )}
        </div>

        {cancellation.reason && (
          <div className="rounded-lg border p-3">
            <p className="text-xs font-semibold text-foreground">
              Guest reason
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {cancellation.reason}
            </p>
          </div>
        )}

        <AmountSummary cancellation={cancellation} />

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Policy version:{" "}
            {cancellation.policyVersion
              ? `v${cancellation.policyVersion}`
              : "legacy / unavailable"}
          </span>
          <span>
            Fee rate:{" "}
            {cancellation.feePercentage !== null
              ? `${Number(cancellation.feePercentage)}%`
              : "manual review"}
          </span>
          {cancellation.reviewedAt && (
            <span>Reviewed {formatDate(cancellation.reviewedAt)}</span>
          )}
        </div>

        {cancellation.reviewNotes && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground">Admin notes</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {cancellation.reviewNotes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Cancellations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"requests" | "history">("requests");
  const [dialog, setDialog] = useState<ReviewDialog | null>(null);
  const [notes, setNotes] = useState("");
  const [manualFeePercentage, setManualFeePercentage] = useState("");

  const cancellationsQuery = useAdminListCancellations(undefined, {
    query: { queryKey: getAdminListCancellationsQueryKey() },
  });
  useAdminSectionSeen("cancellations", cancellationsQuery.isSuccess);
  const cancellations = cancellationsQuery.data?.cancellations ?? [];
  const requests = useMemo(
    () =>
      cancellations.filter((cancellation) =>
        openStatuses.has(cancellation.status),
      ),
    [cancellations],
  );
  const history = useMemo(
    () =>
      cancellations.filter(
        (cancellation) => !openStatuses.has(cancellation.status),
      ),
    [cancellations],
  );

  const processCancellation = useAdminProcessCancellation({
    mutation: {
      onSuccess: (cancellation) => {
        queryClient.invalidateQueries({
          queryKey: getAdminListCancellationsQueryKey(),
        });
        toast({
          title:
            cancellation.status === "rejected"
              ? "Cancellation rejected"
              : cancellation.status === "approved"
                ? "Cancellation approved"
                : "Cancellation processing",
          description:
            cancellation.status === "processing"
              ? "The provider refund has started."
              : undefined,
        });
        closeDialog();
      },
      onError: (error: any) => {
        queryClient.invalidateQueries({
          queryKey: getAdminListCancellationsQueryKey(),
        });
        toast({
          title: "Cancellation could not be processed",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      },
    },
  });

  const closeDialog = () => {
    setDialog(null);
    setNotes("");
    setManualFeePercentage("");
  };

  const submitReview = () => {
    if (!dialog) return;
    const manualReview =
      dialog.action === "approve" && dialog.cancellation.manualReviewRequired;
    const manualFee = Number(manualFeePercentage);
    if (
      manualReview &&
      (!manualFeePercentage ||
        !Number.isFinite(manualFee) ||
        manualFee < 0 ||
        manualFee > 100)
    ) {
      toast({
        title: "Enter a fee from 0% to 100%",
        variant: "destructive",
      });
      return;
    }
    if (manualReview && !notes.trim()) {
      toast({
        title: "Add review notes for a manual fee",
        variant: "destructive",
      });
      return;
    }
    processCancellation.mutate({
      id: dialog.cancellation.id,
      data: {
        decision: dialog.action,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(manualReview ? { manualFeePercentage: manualFee } : {}),
      },
    });
  };

  const displayed = tab === "requests" ? requests : history;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Booking operations
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          Cancellations &amp; refunds
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the fee and refund snapshot calculated when the guest requested
          cancellation.
        </p>
      </div>

      <div className="flex gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          Amounts shown here come from the server-side booking policy snapshot.
          The admin page does not recalculate historical cancellation fees.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={tab === "requests" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setTab("requests")}
        >
          <Clock3 className="h-3.5 w-3.5" />
          Open requests
          {requests.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-black">
              {requests.length}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          variant={tab === "history" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setTab("history")}
        >
          <History className="h-3.5 w-3.5" />
          History ({history.length})
        </Button>
      </div>

      {cancellationsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      ) : cancellationsQuery.error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center justify-between p-5">
            <p className="text-sm text-destructive">
              Cancellation requests could not be loaded.
            </p>
            <Button
              variant="outline"
              onClick={() => cancellationsQuery.refetch()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : displayed.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            {tab === "requests" ? (
              <CheckCircle2 className="mx-auto h-9 w-9 text-green-600" />
            ) : (
              <History className="mx-auto h-9 w-9 text-muted-foreground" />
            )}
            <p className="mt-3 font-semibold text-foreground">
              {tab === "requests"
                ? "No open cancellation requests"
                : "No cancellation history yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayed.map((cancellation) => (
            <CancellationCard
              key={cancellation.id}
              cancellation={cancellation}
              onReview={(action) => setDialog({ cancellation, action })}
            />
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === "reject"
                ? "Reject cancellation request"
                : dialog?.cancellation.status === "refund_failed"
                  ? "Retry cancellation refund"
                  : "Approve cancellation"}
            </DialogTitle>
          </DialogHeader>

          {dialog && (
            <div className="space-y-4">
              <AmountSummary cancellation={dialog.cancellation} />

              {dialog.action === "approve" &&
                dialog.cancellation.manualReviewRequired && (
                  <div className="space-y-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                    <div className="flex gap-2 text-sm text-orange-700 dark:text-orange-400">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>
                        This legacy request has no complete policy snapshot. Set
                        the fee manually and record why.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-fee">Manual fee percentage</Label>
                      <div className="relative">
                        <Input
                          id="manual-fee"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={manualFeePercentage}
                          onChange={(event) =>
                            setManualFeePercentage(event.target.value)
                          }
                          placeholder="0"
                          className="pr-9"
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                )}

              <div className="space-y-2">
                <Label htmlFor="cancellation-notes">
                  Admin notes
                  {dialog.action === "approve" &&
                  dialog.cancellation.manualReviewRequired
                    ? " (required)"
                    : " (optional)"}
                </Label>
                <Textarea
                  id="cancellation-notes"
                  value={notes}
                  rows={4}
                  maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={
                    dialog.action === "reject"
                      ? "Explain why the booking will remain active."
                      : "Add an internal review note."
                  }
                />
              </div>

              {dialog.action === "approve" &&
                !dialog.cancellation.manualReviewRequired && (
                  <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    The saved refund amount will be sent through the booking's
                    payment provider. If the provider fails, this request stays
                    available for retry.
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={processCancellation.isPending}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              variant={dialog?.action === "reject" ? "destructive" : "default"}
              disabled={processCancellation.isPending}
              onClick={submitReview}
            >
              {processCancellation.isPending
                ? "Processing…"
                : dialog?.action === "reject"
                  ? "Reject request"
                  : dialog?.cancellation.status === "refund_failed"
                    ? "Retry refund"
                    : "Approve & refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
