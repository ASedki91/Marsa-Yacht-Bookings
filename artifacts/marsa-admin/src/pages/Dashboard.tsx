import { Link } from "wouter";
import { useGetAdminStats, getGetAdminStatsQueryKey, useAdminListBookings, getAdminListBookingsQueryKey } from "@workspace/api-client-react";
import { Users, Ship, CalendarCheck, Wallet, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending_payment: "#6B7280",
  pending_host: "#F59E0B",
  confirmed: "#3B82F6",
  completed: "#10B981",
  cancelled: "#6B7280",
  refunded: "#F97316",
  rejected: "#EF4444",
};

function StatCard({
  label, value, icon: Icon, badge, badgeVariant = "secondary", href
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  badge?: string | number;
  badgeVariant?: "secondary" | "destructive";
  href?: string;
}) {
  const inner = (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`} className={href ? "cursor-pointer hover:border-primary/50 transition-colors" : ""}>
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
        {href && badge !== undefined && Number(badge) > 0 && (
          <p className="text-xs text-primary flex items-center gap-0.5 mt-1">
            Review <ArrowRight className="w-3 h-3" />
          </p>
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}><a>{inner}</a></Link> : inner;
}

const CHART_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#F97316", "#EF4444", "#8B5CF6", "#6B7280"];

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() }
  });

  const { data: bookingsData } = useAdminListBookings(
    {},
    { query: { queryKey: getAdminListBookingsQueryKey({}) } }
  );

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
  const bookings: any[] = (bookingsData as any)?.bookings ?? [];

  const formatEgp = (v: string | number) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return `EGP ${n.toLocaleString("en-EG", { maximumFractionDigits: 0 })}`;
  };

  const pendingTotal = (s?.pendingHostApplications ?? 0) + (s?.pendingYachtReviews ?? 0) + (s?.pendingWithdrawals ?? 0);

  const platformFeeEgp = parseFloat(s?.totalRevenueEgp ?? "0") * 0.20;
  const payoutLiabilityEgp = parseFloat(s?.totalRevenueEgp ?? "0") * 0.80;

  const statusCounts: Record<string, number> = {};
  bookings.forEach(b => {
    statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
  });
  const statusChartData = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.replace(/_/g, " "),
    value: count,
    fill: BOOKING_STATUS_COLORS[status] ?? "#6B7280",
  }));

  const pendingHostBookings = bookings.filter(b => b.status === "pending_host");
  const slaBreached = pendingHostBookings.filter(b => {
    const ageMs = Date.now() - new Date(b.createdAt).getTime();
    return ageMs > 12 * 3600 * 1000;
  }).length;

  const kpiData = [
    { label: "Total Users", value: s?.totalUsers ?? 0 },
    { label: "Total Hosts", value: s?.totalHosts ?? 0 },
    { label: "Total Yachts", value: s?.totalYachts ?? 0 },
    { label: "Total Bookings", value: s?.totalBookings ?? 0 },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        {pendingTotal > 0 && (
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            <span>{pendingTotal} items need attention</span>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Users" value={s?.totalUsers ?? 0} icon={Users} />
        <StatCard label="Live Yachts" value={s?.totalYachts ?? 0} icon={Ship} />
        <StatCard label="Total Bookings" value={s?.totalBookings ?? 0} icon={CalendarCheck} />
        <StatCard label="Total Revenue" value={formatEgp(s?.totalRevenueEgp ?? 0)} icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Platform Fee Collected" value={formatEgp(platformFeeEgp)} icon={Wallet} />
        <StatCard label="Payout Liability" value={formatEgp(payoutLiabilityEgp)} icon={Wallet} />
        <StatCard label="Pending Host Applications" value={s?.pendingHostApplications ?? 0} icon={ShieldCheck} badge={s?.pendingHostApplications} badgeVariant="destructive" href="/hosts" />
        <StatCard label="Pending Withdrawals" value={s?.pendingWithdrawals ?? 0} icon={Wallet} badge={s?.pendingWithdrawals} badgeVariant="destructive" href="/withdrawals" />
      </div>

      {/* Action queues */}
      {(slaBreached > 0 || (s?.pendingYachtReviews ?? 0) > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {slaBreached > 0 && (
            <Link href="/bookings">
              <a>
                <Card className="border-amber-400/30 bg-amber-400/5 cursor-pointer hover:border-amber-400/60 transition-colors">
                  <CardContent className="flex items-center justify-between py-4 px-4">
                    <div>
                      <p className="font-semibold text-amber-400 text-sm">{slaBreached} bookings breached 12h SLA</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Hosts have not responded in time — review now</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
                  </CardContent>
                </Card>
              </a>
            </Link>
          )}
          {(s?.pendingYachtReviews ?? 0) > 0 && (
            <Link href="/yachts">
              <a>
                <Card className="border-blue-400/30 bg-blue-400/5 cursor-pointer hover:border-blue-400/60 transition-colors">
                  <CardContent className="flex items-center justify-between py-4 px-4">
                    <div>
                      <p className="font-semibold text-blue-400 text-sm">{s.pendingYachtReviews} yachts awaiting review</p>
                      <p className="text-xs text-muted-foreground mt-0.5">New listings pending moderation approval</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
                  </CardContent>
                </Card>
              </a>
            </Link>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Platform overview bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={kpiData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                  itemStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                />
                <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bookings by status pie chart */}
        {statusChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Bookings by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={2}>
                    {statusChartData.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.fill ?? CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                    itemStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
