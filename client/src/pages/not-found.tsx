import { Link } from "wouter";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-lg mx-auto px-6 py-20 text-center">
        <h1 className="font-serif text-4xl mb-4">This page isn't here.</h1>
        <p className="text-muted-foreground mb-8">The link may be old, or the page may have moved. Let's get you back.</p>
        <Link href="/" className="brand-button" data-testid="link-notfound-home">Back to Tend home</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
