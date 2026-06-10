import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe, useSyncUser, getGetMeQueryKey } from "@workspace/api-client-react";
import { AdminLayout } from "./components/AdminLayout";
import Dashboard from "./pages/Dashboard";
import Hosts from "./pages/Hosts";
import Documents from "./pages/Documents";
import Yachts from "./pages/Yachts";
import Bookings from "./pages/Bookings";
import Cancellations from "./pages/Cancellations";
import Withdrawals from "./pages/Withdrawals";
import Users from "./pages/Users";
import Reviews from "./pages/Reviews";
import Categories from "./pages/Categories";
import AddOns from "./pages/AddOns";
import BookingTemplates from "./pages/BookingTemplates";
import PhotographerRequests from "./pages/PhotographerRequests";
import ExamplePhotos from "./pages/ExamplePhotos";
import AuditLog from "./pages/AuditLog";
import NotFound from "./pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(217 91% 60%)",
    colorForeground: "hsl(222 47% 11%)",
    colorMutedForeground: "hsl(215.4 16.3% 46.9%)",
    colorDanger: "hsl(0 84.2% 60.2%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(214.3 31.8% 91.4%)",
    colorInputForeground: "hsl(222 47% 11%)",
    colorNeutral: "hsl(214.3 31.8% 91.4%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-border",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary font-medium hover:text-primary/90",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive font-medium",
    logoBox: "h-12 flex items-center justify-center mb-6",
    logoImage: "h-8 object-contain",
    socialButtonsBlockButton: "border-border hover:bg-muted/50 transition-colors",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium",
    formFieldInput: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    footerAction: "bg-muted/50 py-4 mt-6",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border-destructive/20 text-destructive rounded-md",
    otpCodeFieldInput: "border-input",
    formFieldRow: "mb-4",
    main: "px-8 pb-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function AccessDenied() {
  const { signOut } = useClerk();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 dark">
      <div className="max-w-md w-full bg-card border border-border p-8 rounded-xl shadow-xl text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-8">You do not have administrative privileges to access this area.</p>
        <button
          data-testid="button-access-denied-signout"
          onClick={() => signOut({ redirectUrl: basePath || "/" })}
          className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded: clerkLoaded, user } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: isSignedIn,
      retry: false,
    }
  });

  const syncUserMutation = useSyncUser();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (isSignedIn && user && !syncedRef.current) {
      syncedRef.current = true;
      syncUserMutation.mutate({
        data: {
          email: user.primaryEmailAddress?.emailAddress || "",
          fullName: user.fullName || "",
          avatarUrl: user.imageUrl || "",
        }
      });
    }
  }, [isSignedIn, user]);

  if (!clerkLoaded || (isSignedIn && meLoading)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background dark text-foreground text-sm">
        Loading...
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/" />;
  }

  if ((me as any)?.user?.role !== "admin") {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

function AdminApp() {
  return (
    <AuthGuard>
      <AdminLayout>
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/hosts" component={Hosts} />
          <Route path="/documents" component={Documents} />
          <Route path="/yachts" component={Yachts} />
          <Route path="/bookings" component={Bookings} />
          <Route path="/cancellations" component={Cancellations} />
          <Route path="/withdrawals" component={Withdrawals} />
          <Route path="/users" component={Users} />
          <Route path="/reviews" component={Reviews} />
          <Route path="/categories" component={Categories} />
          <Route path="/add-ons" component={AddOns} />
          <Route path="/booking-templates" component={BookingTemplates} />
          <Route path="/photographer-requests" component={PhotographerRequests} />
          <Route path="/example-photos" component={ExamplePhotos} />
          <Route path="/audit-log" component={AuditLog} />
          <Route component={NotFound} />
        </Switch>
      </AdminLayout>
    </AuthGuard>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/*" component={AdminApp} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
