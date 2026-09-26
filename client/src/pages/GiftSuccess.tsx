import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { Gift as GiftIcon } from "lucide-react";
import { pageQuery } from "@/lib/location";

function hashQuery() {
  return pageQuery();
}

export default function GiftSuccess() {
  const church = hashQuery().get("church");
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-6 py-20 text-center">
        <GiftIcon className="h-12 w-12 mx-auto mb-6 text-primary" />
        <h1 className="font-serif text-4xl mb-4">Gift received. Thank you.</h1>
        <p className="text-muted-foreground mb-8">
          Your gift is being set up{church ? <> for <strong>{church.replace(/-/g, " ")}</strong></> : ""}.
          The church's team has been notified, and your receipt is on its way to your email.
        </p>
        <Link href="/" className="underline text-sm">Back to Tend</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
