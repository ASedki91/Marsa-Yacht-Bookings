import { useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Users, Ship, CalendarCheck, Wallet, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  label, value, icon: Icon, badge, badgeVariant = "secondary"
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  badge?: string | number;
  badgeVariant?: "secondary" | "destructive";
}) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {badge !== undefined && badge !== 0 && (
          <Badge variant={badgeVariant} className="mt-1 text-xs">
            {badge} pending
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() }
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-xl font-bold text-foreground mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const s = stats as any;

  const formatEgp = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        {(s?.pendingHostApplications > 0 || s?.pendingYachtReviews > 0 || s?.pendingWithdrawals > 0) && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Items need attention</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={s?.totalUsers ?? 0} icon={Users} />
        <StatCard label="Total Hosts" value={s?.totalHosts ?? 0} icon={ShieldCheck} badge={s?.pendingHostApplications} badgeVariant="destructive" />
        <StatCard label="Total Yachts" value={s?.totalYachts ?? 0} icon={Ship} badge={s?.pendingYachtReviews} badgeVariant="destructive" />
        <StatCard label="Total Bookings" value={s?.totalBookings ?? 0} icon={CalendarCheck} />
        <StatCard label="Total Revenue" value={formatEgp(s?.totalRevenueEgp ?? 0)} icon={Wallet} />
        <StatCard label="Pending Host Applications" value={s?.pendingHostApplications ?? 0} icon={ShieldCheck} />
        <StatCard label="Pending Yacht Reviews" value={s?.pendingYachtReviews ?? 0} icon={Ship} />
        <StatCard label="Pending Withdrawals" value={s?.pendingWithdrawals ?? 0} icon={Wallet} />
      </div>
    </div>
  );
}
