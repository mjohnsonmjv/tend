import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Signup from "@/pages/Signup";
import ChurchSubmit from "@/pages/ChurchSubmit";
import SubmitThanks from "@/pages/SubmitThanks";
import Dashboard from "@/pages/Dashboard";
import PrayerDetail from "@/pages/PrayerDetail";
import ChurchQR from "@/pages/ChurchQR";
import ChurchSettings from "@/pages/ChurchSettings";
import Pricing from "@/pages/Pricing";
import BillingCheckout from "@/pages/BillingCheckout";
import BillingSuccess from "@/pages/BillingSuccess";
import Gift from "@/pages/Gift";
import GiftSuccess from "@/pages/GiftSuccess";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import { AuthProvider,RequireAuth,useAuth } from "@/components/Auth";
import Login from "@/pages/Login";
import MyChurches from "@/pages/MyChurches";
import Demo from "@/pages/Demo";

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
      <Route path="/billing/checkout" component={BillingCheckout} />
      <Route path="/billing/success" component={BillingSuccess} />
      <Route path="/gift/success" component={GiftSuccess} />
      <Route path="/gift/:slug" component={Gift} />
      <Route path="/login">{()=><Login/>}</Route>
      <Route path="/register">{()=><Redirect to="/signup"/>}</Route>
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/app">{()=><RequireAuth><MyChurches/></RequireAuth>}</Route>
      <Route path="/signup">{()=><SignupEntry/>}</Route>
      {/* Dashboard */}
      <Route path="/church/:id/dashboard">{()=><RequireAuth><Dashboard/></RequireAuth>}</Route>
      <Route path="/church/:id/qr">{()=><RequireAuth><ChurchQR/></RequireAuth>}</Route>
      <Route path="/church/:id/settings">{()=><RequireAuth><ChurchSettings/></RequireAuth>}</Route>
      <Route path="/church/:id/prayer/:prayerId">{()=><RequireAuth><PrayerDetail/></RequireAuth>}</Route>
      {/* Public prayer submission (QR-code landing) */}
      <Route path="/c/:slug" component={ChurchSubmit} />
      <Route path="/c/:slug/thanks" component={SubmitThanks} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ThemeToggle />
        <Router hook={useHashLocation}>
          <AuthProvider><AppRouter /></AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
