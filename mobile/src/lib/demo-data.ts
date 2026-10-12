import type { Church, PrayerRequest } from "./supabase";

// Sample data for preview mode — lets someone tour the inbox, request
// detail, and pray screens without signing in. Nothing here is real.

export const DEMO_CHURCH: Church = {
  id: 0,
  slug: "demo",
  name: "Demo Church",
  pastor_name: "Demo Pastor",
  pastor_email: "demo@example.com",
  greeting_message: "How can we pray for you?",
  plan: "free",
  created_at: new Date().toISOString(),
};

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export const DEMO_REQUESTS: PrayerRequest[] = [
  {
    id: 1,
    church_id: 0,
    submitter_name: "Sarah M.",
    submitter_phone: null,
    submitter_email: null,
    message:
      "My mom starts chemo on Tuesday. Praying for strength for her and wisdom for her doctors. She is scared but trusting God.",
    category: "prayer",
    is_anonymous: false,
    is_urgent: true,
    is_private: false,
    status: "new",
    pastor_notes: null,
    created_at: hoursAgo(2),
  },
  {
    id: 2,
    church_id: 0,
    submitter_name: null,
    submitter_phone: null,
    submitter_email: null,
    message:
      "Lost my job last week. Trying to trust God with what's next, but the anxiety keeps me up at night.",
    category: "prayer",
    is_anonymous: true,
    is_urgent: false,
    is_private: false,
    status: "new",
    pastor_notes: null,
    created_at: hoursAgo(5),
  },
  {
    id: 3,
    church_id: 0,
    submitter_name: "The Alvarez family",
    submitter_phone: null,
    submitter_email: null,
    message:
      "Praise! Our son's surgery went well yesterday and the surgeon said everything looks great. Thank you for praying.",
    category: "praise",
    is_anonymous: false,
    is_urgent: false,
    is_private: false,
    status: "praying",
    pastor_notes: "Follow up Sunday — bring a meal next week?",
    created_at: hoursAgo(26),
  },
  {
    id: 4,
    church_id: 0,
    submitter_name: "James K.",
    submitter_phone: null,
    submitter_email: null,
    message:
      "Marriage is strained right now. We start counseling Thursday. Please pray we listen to each other with grace.",
    category: "prayer",
    is_anonymous: false,
    is_urgent: false,
    is_private: true,
    status: "praying",
    pastor_notes: null,
    created_at: hoursAgo(49),
  },
  {
    id: 5,
    church_id: 0,
    submitter_name: "Ruth T.",
    submitter_phone: null,
    submitter_email: null,
    message:
      "My granddaughter was born healthy this morning, 7 lbs 4 oz. God is good!",
    category: "praise",
    is_anonymous: false,
    is_urgent: false,
    is_private: false,
    status: "prayed_for",
    pastor_notes: null,
    created_at: hoursAgo(76),
  },
  {
    id: 6,
    church_id: 0,
    submitter_name: "David L.",
    submitter_phone: null,
    submitter_email: null,
    message:
      "New to the area and looking for community. When do the small groups start up again?",
    category: "question",
    is_anonymous: false,
    is_urgent: false,
    is_private: false,
    status: "new",
    pastor_notes: null,
    created_at: hoursAgo(96),
  },
];
