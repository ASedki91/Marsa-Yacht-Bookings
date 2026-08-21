import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import {
  LayoutDashboard,
  Users,
  Ship,
  CalendarCheck,
  Wallet,
  Tag,
  Package,
  Clock,
  Star,
  FileText,
  Camera,
  Image,
  ScrollText,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  Ban,
  MapPinned,
  BellRing,
  SlidersHorizontal,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  getAdminGetUnseenCountsQueryKey,
  useAdminGetUnseenCounts,
} from "@workspace/api-client-react";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    path: "/hosts",
    label: "Host Verification",
    icon: ShieldCheck,
    sectionKey: "hosts",
  },
  {
    path: "/documents",
    label: "Documents",
    icon: FileText,
    sectionKey: "documents",
  },
  { path: "/yachts", label: "Yachts", icon: Ship, sectionKey: "yachts" },
  {
    path: "/bookings",
    label: "Bookings",
    icon: CalendarCheck,
    sectionKey: "bookings",
  },
  {
    path: "/cancellations",
    label: "Cancellations",
    icon: Ban,
    sectionKey: "cancellations",
  },
  {
    path: "/cancellation-policy",
    label: "Cancellation Policy",
    icon: SlidersHorizontal,
  },
  {
    path: "/withdrawals",
    label: "Withdrawals",
    icon: Wallet,
    sectionKey: "withdrawals",
  },
  { path: "/users", label: "Users", icon: Users, sectionKey: "users" },
  { path: "/reviews", label: "Reviews", icon: Star, sectionKey: "reviews" },
  { path: "/locations", label: "Locations", icon: MapPinned },
  { path: "/notifications", label: "Broadcasts", icon: BellRing },
  { path: "/categories", label: "Categories", icon: Tag },
  { path: "/add-ons", label: "Add-ons", icon: Package },
  { path: "/booking-templates", label: "Booking Templates", icon: Clock },
  {
    path: "/photographer-requests",
    label: "Photographer Requests",
    icon: Camera,
    sectionKey: "photographer_requests",
  },
  { path: "/example-photos", label: "Example Photos", icon: Image },
  { path: "/audit-log", label: "Audit Log", icon: ScrollText },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unseenQuery = useAdminGetUnseenCounts({
    query: {
      queryKey: getAdminGetUnseenCountsQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  });
  const counts = (unseenQuery.data as any)?.counts ?? {};

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 h-[100dvh] w-56 flex flex-col bg-sidebar border-r border-sidebar-border opacity-100 transition-transform duration-200",
          "lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={`${import.meta.env.BASE_URL}marsa-mark.svg`}
              alt=""
              className="w-7 h-7 object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-display tracking-[0.26em] text-sidebar-foreground leading-none">
              MARSA
            </p>
            <p className="text-[10px] text-sidebar-muted-foreground tracking-widest uppercase leading-none mt-0.5">
              Admin
            </p>
          </div>
          <button
            className="ml-auto lg:hidden text-sidebar-muted-foreground hover:text-sidebar-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navItems.map(({ path, label, icon: Icon, sectionKey }) => {
            const active = location === path || location.startsWith(path + "/");
            const unseen = sectionKey ? Number(counts[sectionKey] ?? 0) : 0;
            return (
              <Link key={path} href={path}>
                <a
                  data-testid={`nav-${path.slice(1)}`}
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors mb-0.5",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {unseen > 0 && (
                    <span
                      aria-label={`${unseen} unseen ${label.toLowerCase()} items`}
                      className={cn(
                        "ml-auto min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
                        active
                          ? "bg-sidebar-primary-foreground text-sidebar-primary"
                          : "bg-destructive text-destructive-foreground",
                      )}
                    >
                      {unseen > 99 ? "99+" : unseen}
                    </span>
                  )}
                  {active && (
                    <ChevronRight
                      className={cn(
                        "w-3 h-3 shrink-0",
                        unseen === 0 && "ml-auto",
                      )}
                    />
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="p-2 border-t border-sidebar-border">
          <button
            data-testid="button-sign-out"
            onClick={() => signOut()}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium text-sidebar-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-foreground/70 hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            MARSA Admin
          </span>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
