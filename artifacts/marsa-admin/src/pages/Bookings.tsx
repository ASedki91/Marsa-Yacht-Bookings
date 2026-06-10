import { useState } from "react";
import { useAdminListBookings, getAdminListBookingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors: Record<string, string> = {
  pending_payment: "text-muted-foreground border-muted/40",
  pending_host: "text-amber-400 border-amber-400/40",
  confirmed: "text-green-400 border-green-400/40",
  completed: "text-blue-400 border-blue-400/40",
  cancelled: "text-muted-foreground border-muted/40",
  refunded: "text-orange-400 border-orange-400/40",
  rejected: "text-destructive border-destructive/40",
};

export default function Bookings() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const params: any = { page };
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, isLoading } = useAdminListBookings(params, {
    query: { queryKey: getAdminListBookingsQueryKey(params) }
  });

  const bookings = (data as any)?.bookings ?? [];
  const total = (data as any)?.total ?? 0;

  const formatEgp = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Bookings <span className="text-sm font-normal text-muted-foreground">({total})</span></h1>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44" data-testid="select-booking-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_payment">Pending Payment</SelectItem>
            <SelectItem value="pending_host">Pending Host</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : bookings.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No bookings found</div>
      ) : (
        <>
          <div className="space-y-2">
            {bookings.map((b: any) => (
              <Card key={b.id} data-testid={`card-booking-${b.id}`}>
                <CardContent className="flex items-center justify-between py-3 px-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{b.id?.slice(0, 8)}</span>
                      <Badge variant="outline" className={`text-xs ${statusColors[b.status] ?? ""}`}>
                        {b.status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground mt-0.5">{b.guestName} · {b.bookingDate}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.yachtName ?? b.yachtId?.slice(0, 8)} · Guests: {b.guestCount}
                    </p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-sm font-semibold text-foreground">{formatEgp(b.totalAmountEgp ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {total > 50 && (
            <div className="flex justify-between items-center mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                data-testid="button-prev-page"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">← Previous</button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={bookings.length < 50}
                data-testid="button-next-page"
                className="text-sm text-muted-foreground disabled:opacity-50 hover:text-foreground">Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
