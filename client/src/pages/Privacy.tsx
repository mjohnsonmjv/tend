import { SiteHeader, SiteFooter } from "@/components/SiteHeader";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="font-serif text-2xl text-foreground mb-3">{title}</h2>
      <div className="text-foreground/90 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="eyebrow mb-3">Privacy Policy</p>
        <h1 className="font-serif text-4xl mb-4">How Tend handles information</h1>
        <p className="text-muted-foreground mb-10">Last updated September 23, 2026. Tend is a pilot service, and this policy will evolve as the service does.</p>

        <Section title="What Tend collects">
          <p>When a church signs up, Tend collects the church name, a public care-team display name, a welcome message, and the account holder's email address.</p>
          <p>When someone shares through a church's prayer page, Tend collects the request itself: the message, the request type, and whether it was marked urgent. A name and phone number are optional, and requests can be shared anonymously.</p>
        </Section>

        <Section title="How it is used">
          <p>Prayer requests are delivered to the signed-in owner of that church's prayer inbox so they can pray and follow up. Account details are used to operate the service, such as sign-in and account notices.</p>
          <p>Tend does not sell personal information and does not use it for advertising.</p>
        </Section>

        <Section title="Who can see what">
          <p>Only the signed-in account that owns a church can see that church's prayer inbox. A church's public prayer page shows only the church name, its welcome message, and the care-team display name. Prayer requests are never posted publicly.</p>
        </Section>

        <Section title="How long it is kept">
          <p>Prayer requests are kept until the church's account owner archives or deletes them, or until the church's account is closed. A church can request deletion of its data at any time by writing to support@tendpray.com.</p>
        </Section>

        <Section title="Security">
          <p>Church data is stored with per-church access controls so one church cannot see another's requests. Pastor sessions are kept in memory on the pastor's own device and end when the page is refreshed or closed. No system is perfectly secure, so please share only what you are comfortable giving your pastor.</p>
        </Section>

        <Section title="A note on sensitive requests">
          <p>Tend is a pastoral-care tool, not an emergency or medical service. Public forms say so directly. Please do not share anything that needs an immediate emergency response.</p>
        </Section>

        <Section title="Children">
          <p>Tend is intended for churches and their adult congregations. Churches should not collect prayer requests from children under 13 through Tend.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If this policy changes in a meaningful way, the updated date above will change. Questions about privacy can go to <a className="underline" href="mailto:support@tendpray.com">support@tendpray.com</a>.</p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
