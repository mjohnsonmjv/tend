import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-2xl text-foreground mb-3">{title}</h2>
      <div className="text-foreground/90 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="eyebrow mb-3">Terms of Service</p>
        <h1 className="font-serif text-4xl mb-4">The ground rules</h1>
        <p className="text-muted-foreground mb-10">Last updated September 23, 2026. Tend is a pilot service, and these terms will evolve as the service does.</p>

        <Section title="What Tend is">
          <p>Tend gives churches a QR code that opens a simple prayer-request page, plus a private inbox where the church's account owner can read and track requests. Every plan starts with a 30-day free trial. Automated notifications are not active during the pilot, and features may change or pause without notice. Tend is provided as is.</p>
        </Section>

        <Section title="Church accounts">
          <p>You must be authorized by your church to create its account. Keep your sign-in private. You are responsible for activity under your account, including who you allow to view your church's inbox.</p>
        </Section>

        <Section title="Using Tend well">
          <p>Use Tend for pastoral care: prayer requests, check-ins, praises, and questions. Do not use public forms to send spam, abuse, or unlawful content. Do not try to access another church's inbox or interfere with the service.</p>
          <p>Tend is not an emergency service, a medical service, or a substitute for professional care. Public forms say this directly, and churches should not present Tend as one.</p>
        </Section>

        <Section title="Your church's data">
          <p>Your church owns the prayer requests it receives. You can archive or delete requests in the inbox, and you can request full deletion of your church's data by writing to support@tendpray.com.</p>
        </Section>

        <Section title="Suspension">
          <p>Accounts used for spam, abuse, or attempts to access other churches' data may be suspended or closed.</p>
        </Section>

        <Section title="Limits">
          <p>To the extent the law allows, Tend is not liable for indirect or incidental damages arising from use of the pilot service.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If these terms change in a meaningful way, the updated date above will change. Questions can go to <a className="underline" href="mailto:support@tendpray.com">support@tendpray.com</a>.</p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
