import { Link, useRoute } from "wouter";
import { Logo } from "./Logo";
import { QrCode, MessageSquareHeart, Settings, ArrowLeft } from "lucide-react";
import type { Church } from "@shared/schema";
import { supabase } from "@/lib/supabase";

interface Props {
  church: Church | undefined;
  children: React.ReactNode;
}

export function DashboardShell({ church, children }: Props) {
  const nav = church
    ? [
        { href: `/church/${church.id}/dashboard`, icon: MessageSquareHeart, label: "Prayer inbox" },
        { href: `/church/${church.id}/qr`, icon: QrCode, label: "QR code & poster" },
        { href: `/church/${church.id}/settings`, icon: Settings, label: "Settings" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-64 md:h-screen md:sticky md:top-0 border-b md:border-b-0 md:border-r border-border bg-sidebar text-sidebar-foreground p-6 flex flex-col">
        <Link href="/" data-testid="link-sidebar-home" className="flex items-center gap-2 mb-4 md:mb-10">
            <Logo size={28} showWordmark />
        </Link>

        {church && (
          <div className="mb-8">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Church</div>
            <div className="font-serif text-lg text-foreground leading-tight">{church.name}</div>
            <div className="text-xs font-mono text-muted-foreground mt-1">/c/{church.slug}</div>
          </div>
        )}

        <nav className="flex md:flex-col gap-1 flex-1">
          {nav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>

        <button className="text-sm text-left py-3 mt-6" data-testid="button-sign-out" onClick={()=>supabase.auth.signOut()}>Sign out</button>
        <Link href="/app" data-testid="link-sidebar-back" className="mt-auto pt-4 md:pt-8 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" /> My churches
        </Link>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0"><p className="preview-notice">Private team workspace. Automated notifications are not active yet.</p>{children}</main>
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const [active] = useRoute(href);
  return (
    <Link href={href} data-testid={`link-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        aria-current={active?"page":undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
    </Link>
  );
}
