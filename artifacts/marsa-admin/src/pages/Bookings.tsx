import { useState } from "react";
import {
  useAdminListBookings,
  getAdminListBookingsQueryKey,
  useConfirmBooking,
  useRejectBooking,
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
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  User,
  Anchor,
  CreditCard,
} from "lucide-react";

const STATUS_DISPLAY: Record<string, string> = {
  pending_payment: "Pending Payment",
  paid_under_review: "Pending Host",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  cancel_requested: "Cancel Requested",
  rejected_refunded: "Rejected",
  closed: "Closed",
};

const statusColors: Record<string, string> = {
  pending_payment: "text-muted-foreground border-muted/40",
  paid_under_review: "text-amber-400 border-amber-400/40",
  confirmed: "text-green-400 border-green-400/40",
  completed: "text-blue-400 border-blue-400/40",
  cancelled: "text-muted-foreground border-muted/40",
  cancel_requested: "text-orange-400 border-orange-400/40",
  rejected_refunded: "text-destructive border-destructive/40",
  closed: "text-muted-foreground border-muted/40",
};

function SlaTimer({ createdAt }: { createdAt: string }) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageH = Math.floor(ageMs / 3600000);
  const ageM = Math.floor((ageMs % 3600000) / 60000);
  const breached = ageMs > 12 * 3600 * 1000;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${breached ? "text-amber-400 font-medium" : "text-muted-foreground"}`}
    >
      {breached && <AlertTriangle className="w-3 h-3" />}
      {ageH}h {ageM}m waiting
    </span>
  );
}

function formatEgp(v: string | number | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
}

function BookingDetail({ b }: { b: any }) {
  return (
    <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
          <User className="w-3 h-3" />
          Guest
        </p>
        <p className="text-xs text-foreground">{b.guestName}</p>
        {b.guestPhone && (
          <p className="text-xs text-muted-foreground">{b.guestPhone}</p>
        )}
        {b.guestEmail && (
          <p className="text-xs text-muted-foreground">{b.guestEmail}</p>
        )}
        {b.guestNationality && (
          <p className="text-xs text-muted-foreground">{b.guestNationality}</p>
        )}
        <p className="text-xs text-muted-foreground">{b.guestCount} guests</p>
        {b.specialRequests && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            "{b.specialRequests}"
          </p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
          <Anchor className="w-3 h-3" />
          Yacht
        </p>
        <p className="text-xs text-foreground">
          {b.yachtName ?? `ID: ${b.yachtId?.slice(0, 8)}`}
        </p>
        <p className="text-xs text-muted-foreground">{b.bookingDate}</p>
        {b.startTime && (
          <p className="text-xs text-muted-foreground">Start: {b.startTime}</p>
        )}
        <p className="text-xs text-muted-foreground font-mono">
          Booking ID: {b.id?.slice(0, 8)}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
          <CreditCard className="w-3 h-3" />
          Payment
        </p>
        <p className="text-xs text-foreground font-semibold">
          {formatEgp(b.totalAmountEgp)}
        </p>
        {b.baseAmountEgp && (
          <p className="text-xs text-muted-foreground">
            Base: {formatEgp(b.baseAmountEgp)}
          </p>
        )}
        {b.platformFeeEgp && (
          <p className="text-xs text-muted-foreground">
            Platform fee: {formatEgp(b.platformFeeEgp)}
          </p>
        )}
        {b.hostEarningsEgp && (
          <p className="text-xs text-muted-foreground">
            Host earnings: {formatEgp(b.hostEarningsEgp)}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Paid: {new Date(b.createdAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

export default function Bookings() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rejectDialog, setRejectDialog] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const params: any = { page };
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading, isSuccess } = useAdminListBookings(params, {
    query: { queryKey: getAdminListBookingsQueryKey(params) },
  });
  useAdminSectionSeen("bookings", isSuccess);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getAdminListBookingsQueryKey() });
    qc.invalidateQueries({
      queryKey: getAdminListBookingsQueryKey({ page: 1 }),
    });
  };

  const confirm = useConfirmBooking({
    mutation: {
      onSuccess: () => {
        toast({ title: "Booking confirmed" });
        invalidate();
      },
      onError: () =>
        toast({ title: "Failed to confirm booking", variant: "destructive" }),
    },
  });

  const reject = useRejectBooking({
    mutation: {
      onSuccess: () => {
        toast({ title: "Booking rejected" });
        invalidate();
        setRejectDialog(null);
        setRejectReason("");
      },
      onError: () =>
        toast({ title: "Failed to reject booking", variant: "destructive" }),
    },
  });

  const bookings: any[] = (data as any)?.bookings ?? [];
  const total = (data as any)?.total ?? 0;

  const pendingHostBookings = bookings.filter(
    (b) => b.status === "paid_under_review",
  );
  const otherBookings = bookings.filter(
    (b) => b.status !== "paid_under_review",
  );
  const displayBookings =
    statusFilter === "all"
      ? [
          ...pendingHostBookings.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
          ...otherBookings,
        ]
      : bookings;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">
          Bookings{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({total})
          </span>
        </h1>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52" data-testid="select-booking-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="paid_under_review">
              Pending Host Review
            </SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancel_requested">Cancel Requested</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="rejected_refunded">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pendingHostBookings.length > 0 && statusFilter === "all" && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center gap-2 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {pendingHostBookings.length} booking
            {pendingHostBookings.length !== 1 ? "s" : ""} awaiting host response
            — sorted oldest first
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : displayBookings.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          No bookings found
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayBookings.map((b: any) => {
              const isPendingHost = b.status === "paid_under_review";
              const isExpanded = expandedId === b.id;
              return (
                <Card
                  key={b.id}
                  data-testid={`card-booking-${b.id}`}
                  className={isPendingHost ? "border-amber-400/20" : ""}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <button
                        className="min-w-0 text-left flex-1"
                        onClick={() => setExpandedId(isExpanded ? null : b.id)}
                        data-testid={`expand-booking-${b.id}`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs font-mono text-muted-foreground">
                            {b.id?.slice(0, 8)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusColors[b.status] ?? ""}`}
                          >
                            {STATUS_DISPLAY[b.status] ??
                              b.status?.replace(/_/g, " ")}
                          </Badge>
                          {isPendingHost && (
                            <SlaTimer createdAt={b.createdAt} />
                          )}
                        </div>
                        <p className="text-sm text-foreground mt-1 font-medium">
                          {b.guestName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.bookingDate} ·{" "}
                          {b.yachtName ?? b.yachtId?.slice(0, 8)} ·{" "}
                          {b.guestCount} guests
                        </p>
                      </button>
                      <div className="flex flex-col items-end gap-2 ml-4 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">
                            {formatEgp(b.totalAmountEgp ?? 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(b.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {isPendingHost && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-400 border-green-400/40 hover:bg-green-400/10 h-7 text-xs"
                              data-testid={`button-confirm-booking-${b.id}`}
                              disabled={confirm.isPending}
                              onClick={() => confirm.mutate({ id: b.id })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/40 hover:bg-destructive/10 h-7 text-xs"
                              data-testid={`button-reject-booking-${b.id}`}
                              onClick={() => setRejectDialog({ id: b.id })}
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {isExpanded && <BookingDetail b={b} />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {total > 50 && (
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground"
              >
                &larr; Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={bookings.length < 50}
                data-testid="button-next-page"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!rejectDialog}
        onOpenChange={() => {
          setRejectDialog(null);
          setRejectReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              data-testid="textarea-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Explain why the booking is being rejected..."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialog(null);
                setRejectReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-reject-booking"
              disabled={reject.isPending}
              onClick={() =>
                rejectDialog &&
                reject.mutate({
                  id: rejectDialog.id,
                  data: { reason: rejectReason || undefined },
                })
              }
            >
              {reject.isPending ? "Rejecting..." : "Reject Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
