import { test } from "node:test";
import assert from "node:assert/strict";
import {
  needsRefresh,
  normalizePhone,
  buildCardNoteText,
  cardCreatePayload,
  cardNotePayload,
  fallbackPersonPayload,
  parsePrayerId,
  refreshPcoTokens,
  PcoClient,
  TendPrayer,
} from "../supabase/functions/pco-prayer-sync/sync.ts";

const prayer = (v: Partial<TendPrayer>): TendPrayer => ({
  id: 7,
  church_id: 4,
  submitter_name: "Sarah Miller",
  submitter_phone: null,
  submitter_email: "sarah@example.com",
  message: "Knee surgery next week for my mom",
  category: "prayer",
  is_anonymous: false,
  is_urgent: false,
  created_at: "2026-10-01T09:00:00.000Z",
  ...v,
});
const opts = { churchName: "Frontier Church", siteUrl: "https://tendpray.com" };

test("needsRefresh: expired and near-expiry tokens need refresh", () => {
  const now = Date.now();
  assert.equal(needsRefresh(new Date(now - 1000).toISOString(), now), true);
  assert.equal(needsRefresh(new Date(now + 60 * 1000).toISOString(), now), true); // within skew
  assert.equal(needsRefresh(new Date(now + 2 * 3600 * 1000).toISOString(), now), false);
  assert.equal(needsRefresh("not-a-date", now), true);
});

test("normalizePhone keeps digits only", () => {
  assert.equal(normalizePhone("(616) 555-0142"), "6165550142");
  assert.equal(normalizePhone(null), "");
  assert.equal(normalizePhone("+1-616-555-0142"), "16165550142");
});

test("buildCardNoteText includes message, name, type, inbox link, no em dashes", () => {
  const note = buildCardNoteText(prayer(), opts);
  assert.ok(note.includes("Knee surgery next week for my mom"));
  assert.ok(note.includes("Sarah Miller"));
  assert.ok(note.includes("Type: Prayer request"));
  assert.ok(note.includes("https://tendpray.com/#/church/4/inbox"));
  assert.ok(!note.includes("\u2014"), "note must not contain em dashes");
});

test("buildCardNoteText anonymizes and flags urgent", () => {
  const note = buildCardNoteText(
    prayer({ is_anonymous: true, submitter_name: null, submitter_email: null, is_urgent: true }),
    opts,
  );
  assert.ok(note.includes("From: Anonymous"));
  assert.ok(!note.includes("Sarah Miller"));
  assert.ok(note.includes("Marked urgent in Tend"));
  assert.ok(!note.includes("\u2014"));
});

test("buildCardNoteText labels non-prayer categories", () => {
  const note = buildCardNoteText(prayer({ category: "praise" }), opts);
  assert.ok(note.includes("Type: Praise"));
});

test("payload builders produce JSON:API shapes", () => {
  assert.deepEqual(cardCreatePayload("123"), {
    data: { type: "WorkflowCard", attributes: { person_id: "123" } },
  });
  assert.deepEqual(cardNotePayload("hello", null), {
    data: { type: "WorkflowCardNote", attributes: { note: "hello" } },
  });
  assert.deepEqual(cardNotePayload("hello", "9"), {
    data: { type: "WorkflowCardNote", attributes: { note: "hello", note_category_id: "9" } },
  });
  const person = fallbackPersonPayload() as any;
  assert.equal(person.data.type, "Person");
  assert.equal(person.data.attributes.first_name, "Tend");
});

test("parsePrayerId accepts all supported shapes", () => {
  assert.deepEqual(parsePrayerId({ prayer_id: 5 }), { prayerId: 5 });
  assert.deepEqual(parsePrayerId({ prayer_request_id: "7" }), { prayerId: 7 });
  assert.deepEqual(parsePrayerId({ type: "INSERT", table: "tend_prayers", record: { id: 9 } }), {
    prayerId: 9,
  });
  assert.deepEqual(parsePrayerId({}), { error: "missing_prayer_id" });
  assert.deepEqual(parsePrayerId(null), { error: "empty_body" });
  assert.deepEqual(parsePrayerId({ prayer_id: -2 }), { error: "missing_prayer_id" });
});

const stubFetch = (handler: (url: string, init?: RequestInit) => any) =>
  (async (url: any, init?: any) => {
    const result = handler(String(url), init);
    return {
      ok: result.ok,
      status: result.status,
      text: async () => JSON.stringify(result.json ?? null),
    };
  }) as unknown as typeof fetch;

test("findPersonByEmail returns id only for a single exact match", async () => {
  const fetchFn = stubFetch((url) => {
    assert.ok(url.includes("where[search_name_or_email]="));
    return {
      ok: true,
      status: 200,
      json: {
        data: [{ id: "42", type: "Person" }],
        included: [
          { type: "Email", attributes: { address: "Sarah@Example.com", primary: true } },
        ],
      },
    };
  });
  assert.equal(await new PcoClient("tok", fetchFn).findPersonByEmail("sarah@example.com"), "42");
});

test("findPersonByEmail rejects ambiguous or non-matching results", async () => {
  const multi = stubFetch(() => ({
    ok: true,
    status: 200,
    json: { data: [{ id: "1" }, { id: "2" }], included: [] },
  }));
  assert.equal(await new PcoClient("tok", multi).findPersonByEmail("a@b.com"), null);

  const wrongEmail = stubFetch(() => ({
    ok: true,
    status: 200,
    json: {
      data: [{ id: "42" }],
      included: [{ type: "Email", attributes: { address: "other@example.com" } }],
    },
  }));
  assert.equal(await new PcoClient("tok", wrongEmail).findPersonByEmail("sarah@example.com"), null);

  const failing = stubFetch(() => {
    throw new Error("network down");
  });
  assert.equal(await new PcoClient("tok", failing).findPersonByEmail("sarah@example.com"), null);
});

test("findPersonByPhone requires enough digits and exact match", async () => {
  const fetchFn = stubFetch((url) => {
    assert.ok(url.includes("where[search_phone_number]=6165550142"));
    return {
      ok: true,
      status: 200,
      json: {
        data: [{ id: "77" }],
        included: [{ type: "PhoneNumber", attributes: { number: "(616) 555-0142" } }],
      },
    };
  });
  const client = new PcoClient("tok", fetchFn);
  assert.equal(await client.findPersonByPhone("(616) 555-0142"), "77");
  assert.equal(await client.findPersonByPhone("123"), null); // too short, no request made
});

test("createCard posts to the workflow cards endpoint", async () => {
  let seenUrl = "";
  let seenBody: any = null;
  const fetchFn = stubFetch((url, init) => {
    seenUrl = url;
    seenBody = JSON.parse(String(init?.body));
    return { ok: true, status: 201, json: { data: { id: "999", type: "WorkflowCard" } } };
  });
  const id = await new PcoClient("tok", fetchFn).createCard("5", "42");
  assert.equal(id, "999");
  assert.ok(seenUrl.endsWith("/people/v2/workflows/5/cards"));
  assert.equal(seenBody.data.attributes.person_id, "42");
});

test("createCard throws on PCO failure", async () => {
  const fetchFn = stubFetch(() => ({ ok: false, status: 422, json: { errors: [] } }));
  await assert.rejects(() => new PcoClient("tok", fetchFn).createCard("5", "42"), /pco create card failed/);
});

test("createCardNote posts note text to the card notes endpoint", async () => {
  let seenUrl = "";
  const fetchFn = stubFetch((url) => {
    seenUrl = url;
    return { ok: true, status: 201, json: { data: { id: "313", type: "WorkflowCardNote" } } };
  });
  const id = await new PcoClient("tok", fetchFn).createCardNote("42", "999", "pray for mom");
  assert.equal(id, "313");
  assert.ok(seenUrl.endsWith("/people/v2/people/42/workflow_cards/999/notes"));
});

test("listWorkflows maps id and name", async () => {
  const fetchFn = stubFetch(() => ({
    ok: true,
    status: 200,
    json: { data: [{ id: "5", attributes: { name: "Prayer" } }, { id: "6", attributes: {} }] },
  }));
  assert.deepEqual(await new PcoClient("tok", fetchFn).listWorkflows(), [
    { id: "5", name: "Prayer" },
  ]);
});

test("refreshPcoTokens posts the refresh grant and returns the new pair", async () => {
  let seenBody = "";
  const fetchFn = stubFetch((_url, init) => {
    seenBody = String(init?.body);
    return {
      ok: true,
      status: 200,
      json: { access_token: "new-at", refresh_token: "new-rt", expires_in: 7200 },
    };
  });
  const tokens = await refreshPcoTokens("cid", "csec", "old-rt", fetchFn);
  assert.equal(tokens.access_token, "new-at");
  assert.equal(tokens.refresh_token, "new-rt");
  assert.ok(seenBody.includes("grant_type=refresh_token"));
  assert.ok(seenBody.includes("refresh_token=old-rt"));
});

test("refreshPcoTokens throws when PCO rejects the refresh", async () => {
  const fetchFn = stubFetch(() => ({ ok: false, status: 400, json: { error: "invalid_grant" } }));
  await assert.rejects(() => refreshPcoTokens("cid", "csec", "bad-rt", fetchFn), /token refresh failed/);
});
