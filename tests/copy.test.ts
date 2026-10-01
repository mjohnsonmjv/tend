import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

// Tend copy must never contain em dashes, including email templates.
const FILES = [
  "supabase/functions/capture-lead/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
  "supabase/functions/nurture-unsubscribe/index.ts",
  "client/src/pages/Landing.tsx",
  "client/src/pages/Pricing.tsx",
  "client/src/pages/SubmitThanks.tsx",
  "client/src/components/Inbox.tsx",
  "client/src/components/PraySession.tsx",
  "client/src/components/OAuthReturn.tsx",
  "client/src/pages/ChurchSettings.tsx",
  "client/src/components/PcoSyncSettings.tsx",
  "client/src/lib/pcoSync.ts",
  "supabase/functions/pray-session/index.ts",
];

for (const f of FILES) {
  test(`no em dashes in ${f}`, () => {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.ok(!src.includes("—"), `${f} contains an em dash`);
  });
}
