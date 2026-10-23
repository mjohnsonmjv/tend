// Prerender the public pages into static HTML after the Vite build.
//
// Why: Tend is a hash-routed SPA, so the HTML served for every page used to
// be an empty shell. Search engines and AI agents that do not run JavaScript
// (most of them) saw no copy at all. Now the build renders the real React
// pages at build time and writes them into dist/public:
//   - index.html keeps the app bundle, with the landing page prerendered
//     inside #root (the app replaces it on boot, same content).
//   - /pricing, /faq, /text, /privacy, /terms each get a real static page at
//     a real path, with their own title and description. A tiny boot script
//     points the hash router at the matching route, so a human visitor gets
//     the fully interactive app at the same page; a crawler gets the copy.
//
// Run by `npm run build` after both Vite builds. Fails the build loudly if a
// page renders empty, so a prerender regression can never ship silently.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPublic = resolve(root, "dist/public");
const { renderRoute, faqJsonLd } = await import(
  resolve(root, "dist-ssr/prerender-entry.js")
);

const ROUTES = [
  {
    path: "/pricing",
    title: "Pricing | Tend",
    description:
      "One plan for every church: free forever, or the Church plan at $49/month with every feature included. 30-day free trial, no card required.",
  },
  {
    path: "/faq",
    title: "FAQ | Tend",
    description:
      "How Tend works, what it costs, who sees prayer requests, text-to-prayer, 24/7 prayer watches, gifting, and Planning Center sync.",
  },
  {
    path: "/text",
    title: "Text a prayer request | Tend",
    description:
      "Text a prayer request to Tend at (616) 816-4172. Requests go to the Tend prayer team or your church's care team.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Tend",
    description: "How Tend handles prayer requests, account information, and text messages.",
  },
  {
    path: "/terms",
    title: "Terms of Service | Tend",
    description: "The ground rules for using Tend, including the text-messaging program terms.",
  },
];

const BOOT_SCRIPT = `// Sent with prerendered pages: point the hash router at this page's route
// before the app bundle runs, so the app opens on the same page the static
// HTML shows. Crawlers without JavaScript just read the static page.
if (!location.hash && location.pathname.length > 1) {
  location.hash = location.pathname.replace(/\\/+$/, "");
}
`;

function fillRoot(html, markup) {
  const marker = '<div id="root"></div>';
  if (!html.includes(marker)) throw new Error("index.html has no empty #root to fill");
  return html.replace(marker, `<div id="root">${markup}</div>`);
}

function stripTags(markup) {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const template = readFileSync(resolve(distPublic, "index.html"), "utf8");

// Root: prerender the landing page inside the app shell.
const homeMarkup = renderRoute("/");
if (stripTags(homeMarkup).length < 500) throw new Error("Landing prerender looks empty");
writeFileSync(resolve(distPublic, "index.html"), fillRoot(template, homeMarkup));
console.log("prerendered /");

// Subpages: full static documents at real paths.
writeFileSync(resolve(distPublic, "route-boot.js"), BOOT_SCRIPT);
for (const route of ROUTES) {
  const markup = renderRoute(route.path);
  const text = stripTags(markup);
  if (text.length < 300) throw new Error(`Prerender of ${route.path} looks empty (${text.length} chars)`);
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`);
  html = html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${route.description}$2`,
  );
  html = html.replace(
    /(<meta property="og:title" content=")[^"]*(")/,
    `$1${route.title}$2`,
  );
  html = html.replace(
    /(<meta property="og:description" content=")[^"]*(")/,
    `$1${route.description}$2`,
  );
  html = html.replace(
    /(<meta property="og:url" content=")[^"]*(")/,
    `$1https://tendpray.com${route.path}$2`,
  );
  html = html.replace(
    "</head>",
    `    <link rel="canonical" href="https://tendpray.com${route.path}" />\n  </head>`,
  );
  if (route.path === "/faq") {
    html = html.replace(
      "</head>",
      `    <script type="application/ld+json">${faqJsonLd()}</script>\n  </head>`,
    );
  }
  html = html.replace(
    '<script type="module"',
    '<script src="/route-boot.js"></script>\n    <script type="module"',
  );
  html = fillRoot(html, markup);
  const dir = resolve(distPublic, route.path.slice(1));
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "index.html"), html);
  console.log(`prerendered ${route.path} (${text.length} chars of copy)`);
}
