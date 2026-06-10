import {
  useAdminListBookings,
  getAdminListBookingsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock } from "lucide-react";

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
  const { data, isLoading } = useAdminListBookings(
    { status: "cancelled" },
    { query: { queryKey: getAdminListBookingsQueryKey({ status: "cancelled" }) } }
  );

  const bookings: any[] = (data as any)?.bookings ?? [];

  const withFee = bookings.filter(b => cancellationFee(b) > 0);
  const withoutFee = bookings.filter(b => cancellationFee(b) === 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Cancellations &amp; Refunds</h1>
        {bookings.length > 0 && (
          <span className="text-sm text-muted-foreground">{bookings.length} cancelled</span>
        )}
      </div>

      <div className="mb-4 p-3 rounded-lg border border-amber-400/20 bg-amber-400/5 text-xs text-amber-400 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Cancellations within <strong>{EARLY_CANCEL_HOURS}h</strong> of booking creation incur a{" "}
          <strong>{CANCELLATION_FEE_PCT}% platform cancellation fee</strong> on the total booking amount.
          Cancellations after {EARLY_CANCEL_HOURS}h are fee-free.
        </span>
      </div>

      {withFee.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5" />
            Within {EARLY_CANCEL_HOURS}h — fee applies ({withFee.length})
          </h2>
          <BookingList bookings={withFee} showFee />
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5 mb-2">
          Fee-free cancellations ({withoutFee.length})
        </h2>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : withoutFee.length === 0 && withFee.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">No cancelled bookings</div>
        ) : (
          <BookingList bookings={withoutFee} showFee={false} />
        )}
      </div>
    </div>
  );
}

function BookingList({ bookings, showFee }: { bookings: any[]; showFee: boolean }) {
  if (bookings.length === 0) {
    return <p className="text-xs text-muted-foreground py-3">None</p>;
  }
  return (
    <div className="space-y-2">
      {bookings.map((b: any) => {
        const fee = cancellationFee(b);
        const hrs = hoursSince(b.createdAt);
        return (
          <Card key={b.id} data-testid={`card-cancellation-${b.id}`}
            className={showFee ? "border-amber-400/20" : undefined}>
            <CardContent className="flex items-center justify-between py-3 px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}</span>
                  <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs">cancelled</Badge>
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
                  Total: {formatEgp(b.totalAmountEgp)} ·{" "}
                  {b.guestName} · {b.guestCount} guests ·{" "}
                  cancelled {Math.round(hrs)}h after creation
                </p>
              </div>
              <div className="text-right ml-4 shrink-0">
                <p className="text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleDateString()}
                </p>
                {fee > 0 && (
                  <p className="text-xs font-semibold text-amber-400">
                    {formatEgp(fee)} fee
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
