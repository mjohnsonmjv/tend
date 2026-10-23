// Build-time prerender entry. The production build renders the public
// marketing pages to static HTML (see scripts/prerender.mjs) so search
// engines and AI agents, most of which do not run JavaScript, can read the
// real copy instead of an empty app shell. The app itself is unchanged:
// in the browser it boots over the prerendered markup as usual.
//
// Only presentational pages are prerendered. Anything that reads browser
// state at render time does not belong here.

import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "./lib/queryClient";
import { AuthProvider } from "@/components/Auth";
import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import Faq from "@/pages/Faq";
import TextLine from "@/pages/TextLine";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import { FAQ_ENTRIES } from "@/lib/faqData";

const PAGES: Record<string, () => React.JSX.Element> = {
  "/": Landing,
  "/pricing": Pricing,
  "/faq": Faq,
  "/text": TextLine,
  "/privacy": Privacy,
  "/terms": Terms,
};

export function renderRoute(path: string): string {
  const Page = PAGES[path];
  if (!Page) throw new Error(`No prerender page for ${path}`);
  // Wouter needs a location hook; in prerender every page is its own route.
  const staticHook = () => [path, () => undefined] as unknown as ReturnType<
    typeof import("wouter").useLocation
  >;
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router hook={staticHook as never}>
          <AuthProvider>
            <Page />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// FAQPage structured data for the /faq static page, built from the same
// source as the visible page so the two can never drift.
export function faqJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer.replace(/\s*\n\s*/g, " "),
      },
    })),
  });
}
