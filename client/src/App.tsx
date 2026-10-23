import { Switch, Route, Router, Redirect } from "wouter";
import { useAppLocation } from "@/lib/location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import NotFound from "@/pages/not-found";
import { AuthProvider,RequireAuth,useAuth } from "@/components/Auth";
import { trackPageView, currentHashPath, initAnalytics } from "@/lib/analytics";
import { logSiteEvent } from "@/lib/siteEvents";

// After a deploy, an open tab may request a chunk that no longer exists.
// Reload once to pick up the new build instead of showing a blank page.
const RELOAD_KEY = "tend_chunk_reload";
function page<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch((err) => {
    try {
      if (!sessionStorage.getItem(RELOAD_KEY)) { sessionStorage.setItem(RELOAD_KEY, "1"); location.reload(); }
    } catch { /* storage unavailable */ }
    throw err;
  }).then((m) => { try { sessionStorage.removeItem(RELOAD_KEY); } catch {} return m; }));
}

const Landing = page(() => import("@/pages/Landing"));
const Signup = page(() => import("@/pages/Signup"));
const ChurchSubmit = page(() => import("@/pages/ChurchSubmit"));
const PrayerWall = page(() => import("@/pages/PrayerWall"));
const SubmitThanks = page(() => import("@/pages/SubmitThanks"));
const Dashboard = page(() => import("@/pages/Dashboard"));
const PrayerDetail = page(() => import("@/pages/PrayerDetail"));
const ChurchQR = page(() => import("@/pages/ChurchQR"));
const ChurchSettings = page(() => import("@/pages/ChurchSettings"));
const Pricing = page(() => import("@/pages/Pricing"));
const BillingCheckout = page(() => import("@/pages/BillingCheckout"));
const BillingSuccess = page(() => import("@/pages/BillingSuccess"));
const Gift = page(() => import("@/pages/Gift"));
const GiftSuccess = page(() => import("@/pages/GiftSuccess"));
const Faq = page(() => import("@/pages/Faq"));
const Privacy = page(() => import("@/pages/Privacy"));
const Terms = page(() => import("@/pages/Terms"));
const TextLine = page(() => import("@/pages/TextLine"));
const Login = page(() => import("@/pages/Login"));
const MyChurches = page(() => import("@/pages/MyChurches"));
const Demo = page(() => import("@/pages/Demo"));
const Watches = page(() => import("@/pages/Watches"));
const WatchDashboard = page(() => import("@/pages/WatchDashboard"));
const WatchSignup = page(() => import("@/pages/WatchSignup"));

function PageFallback(){
  return <div className="min-h-screen" aria-busy="true" />;
}

function SignupEntry(){
  const {session,loading}=useAuth();
  if(loading) return <p className="p-12">Loading…</p>;
  return session?<Signup/>:<Login register/>;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  return null; // Currently no visible toggle; component reserved for future header widget.
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/demo" component={Demo} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/faq" component={Faq} />
      <Route path="/billing/checkout" component={BillingCheckout} />
      <Route path="/billing/success" component={BillingSuccess} />
      <Route path="/gift/success" component={GiftSuccess} />
      <Route path="/gift/:slug" component={Gift} />
      <Route path="/login">{()=><Login/>}</Route>
      <Route path="/register">{()=><Redirect to="/signup"/>}</Route>
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/text" component={TextLine} />
      <Route path="/app">{()=><RequireAuth><MyChurches/></RequireAuth>}</Route>
      <Route path="/signup">{()=><SignupEntry/>}</Route>
      {/* Dashboard */}
      <Route path="/church/:id/dashboard">{()=><RequireAuth><Dashboard/></RequireAuth>}</Route>
      <Route path="/church/:id/qr">{()=><RequireAuth><ChurchQR/></RequireAuth>}</Route>
      <Route path="/church/:id/settings">{()=><RequireAuth><ChurchSettings/></RequireAuth>}</Route>
      <Route path="/church/:id/prayer/:prayerId">{()=><RequireAuth><PrayerDetail/></RequireAuth>}</Route>
      <Route path="/church/:id/watches">{()=><RequireAuth><Watches/></RequireAuth>}</Route>
      <Route path="/church/:id/watches/:watchId">{()=><RequireAuth><WatchDashboard/></RequireAuth>}</Route>
      {/* Public prayer submission (QR-code landing) */}
      <Route path="/c/:slug" component={ChurchSubmit} />
      <Route path="/c/:slug/wall" component={PrayerWall} />
      <Route path="/c/:slug/thanks" component={SubmitThanks} />
      <Route path="/w/:slug" component={WatchSignup} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AnalyticsTracker() {
  useEffect(() => {
    initAnalytics();
    trackPageView(currentHashPath());
    logSiteEvent("page_view");
    const onHashChange = () => {
      trackPageView(currentHashPath());
      logSiteEvent("page_view");
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ThemeToggle />
        <AnalyticsTracker />
        <Router hook={useAppLocation}>
          <AuthProvider><Suspense fallback={<PageFallback />}><AppRouter /></Suspense></AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
