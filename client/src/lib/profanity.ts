// Shared profanity blocklist for the prayer wall moderation bot.
// Mirrored in SQL in supabase/migrations/20261011_prayer_wall_moderation.sql.
// Keep both in sync: edit here, then copy the list into the migration.
// Matching is case-insensitive on word boundaries; leetspeak variants included
// for the most common evasions.

const BLOCKED_WORDS = [
  // Sexual / vulgar
  "fuck", "fucker", "fucking", "fuk", "fuker", "shit", "shitty", "bitch",
  "bitches", "bastard", "asshole", "dick", "dicks", "pussy", "cunt",
  "whore", "slut", "tits", "boobs", "porn", "porno", "xxx",
  // Slurs
  "nigger", "nigga", "faggot", "fag", "retard", "retarded", "chink",
  "spic", "kike", "tranny",
  // Common evasions (leetspeak)
  "f4ck", "fck", "sh1t", "b1tch", "a55hole", "d1ck", "c0ck",
  // Hate / threats
  "kill yourself", "kys",
];

const pattern = new RegExp(
  `\\b(${BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
);

/** Returns true if the text contains blocked language. */
export function containsProfanity(text: string | null | undefined): boolean {
  if (!text) return false;
  return pattern.test(text);
}

/** Returns the message with blocked words replaced by asterisks (for display safety). */
export function maskProfanity(text: string): string {
  return text.replace(pattern, (m) => "*".repeat(m.length));
}
