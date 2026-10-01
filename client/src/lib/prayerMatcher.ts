// prayerMatcher: fuzzy keyword matching for one-button pray mode.
// Pure functions with no DOM or network access, so they unit-test cleanly.
// Transcripts passed here are never stored; callers must discard them.

import type { PrayerRequest } from "@shared/schema";

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","been","but","by","for","from","has","have",
  "he","her","hers","him","his","i","in","is","it","its","me","my","of","on",
  "or","our","ours","please","pray","praying","prayer","prayers","she","that",
  "the","their","them","they","this","to","us","was","we","were","will","with",
  "you","your","lord","god","jesus","christ","amen","father","dear","just",
  "also","so","all","up","out","who","what","when","where","how","can","could",
  "would","should","do","does","did","not","no","yes","if","then","than","too",
  "very","into","over","again","there","here","their","its",
]);

export interface KeywordSet {
  requestId: number;
  /** distinctive content words from the message */
  keywords: string[];
  /** name parts from the submitter, when not anonymous */
  names: string[];
}

/** Punctuation/whitespace splitter; built via constructor so the unicode
 *  property escapes don't trip the ES5 tsc target used by `npm run check`. */
const PUNCT_RE = new RegExp("[^\\p{L}\\p{N}'\\s-]", "gu");

/** Lowercase, strip accents and punctuation, split on whitespace. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, "").replace(/'s$/, ""))
    .filter((t) => t.length > 0);
}

/** Distinctive words: longer than 2 chars, not a stopword. */
function distinctive(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length <= 2 || STOPWORDS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Build the keyword set for one request. Uses the submitter name (unless
 * anonymous) plus distinctive words from the prayer message. Message words
 * are capped so long requests do not become overly match-happy.
 */
export function buildKeywordSet(p: PrayerRequest): KeywordSet {
  const names: string[] = [];
  if (!p.isAnonymous && p.submitterName) {
    for (const part of tokenize(p.submitterName)) {
      if (part.length >= 2 && !STOPWORDS.has(part)) names.push(part);
    }
  }
  // Prefer capitalized words in the original message (likely names/places),
  // then fall back to other distinctive words.
  const rawWords = p.message.split(/\s+/);
  const capitalized = rawWords.filter((w) => /^[A-Z][a-z]/.test(w)).join(" ");
  const rest = p.message;
  const keywords = distinctive([...tokenize(capitalized), ...tokenize(rest)]).slice(0, 14);
  return { requestId: p.id, keywords, names: names.filter((n, i) => names.indexOf(n) === i) };
}

/** True when a and b differ by at most one insertion, deletion, or substitution. */
export function oneEditAway(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }
    else if (la > lb) i++;
    else j++;
  }
  return edits + (la - i) + (lb - j) <= 1;
}

function wordIn(haystack: Set<string>, word: string): boolean {
  if (haystack.has(word)) return true;
  // One-edit fuzzy matching only for longer keywords, to avoid false hits.
  if (word.length > 5) {
    let fuzzy = false;
    haystack.forEach((h) => {
      if (!fuzzy && h.length > 5 && oneEditAway(h, word)) fuzzy = true;
    });
    return fuzzy;
  }
  return false;
}

/**
 * Score committed transcripts against keyword sets. Returns the ids of every
 * request that passes threshold. A request matches when:
 *  - at least two of its keywords appear in the transcript, or
 *  - a full name match (first and last name parts both present), or
 *  - a distinctive first name (4+ chars) appears on its own.
 * Callers must exclude requests already checked or manually overridden.
 */
export function matchTranscript(sets: KeywordSet[], transcript: string): number[] {
  const tokens = new Set(tokenize(transcript));
  if (tokens.size === 0) return [];
  const matched: number[] = [];
  for (const set of sets) {
    if (set.keywords.length === 0 && set.names.length === 0) continue;
    // Full name: every name part present.
    if (set.names.length >= 2 && set.names.every((n) => wordIn(tokens, n))) {
      matched.push(set.requestId);
      continue;
    }
    // Distinctive single name: first name part of 4+ chars.
    const firstName = set.names[0];
    if (firstName && firstName.length >= 4 && wordIn(tokens, firstName)) {
      matched.push(set.requestId);
      continue;
    }
    // Keyword quorum: two hits when the request has two or more keywords,
    // a single hit when it has only one. Short requests ("My family") can
    // never reach a quorum of two, so without this they would never check off.
    const needed = set.keywords.length >= 2 ? 2 : 1;
    let hits = 0;
    for (const kw of set.keywords) {
      if (wordIn(tokens, kw)) {
        hits++;
        if (hits >= needed) break;
      }
    }
    if (hits >= needed) matched.push(set.requestId);
  }
  return matched;
}

/**
 * Keyterms for ElevenLabs realtime recognition biasing. Names first, then
 * distinctive message words. Each term capped at 20 chars, max 50 terms.
 */
export function buildKeyterms(requests: PrayerRequest[]): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const clean = t.toLowerCase().slice(0, 20);
    if (clean.length >= 2 && !seen.has(clean) && !STOPWORDS.has(clean)) {
      seen.add(clean);
      terms.push(clean);
    }
  };
  for (const p of requests) {
    if (!p.isAnonymous && p.submitterName) tokenize(p.submitterName).forEach(push);
  }
  for (const p of requests) {
    distinctive(tokenize(p.message)).forEach(push);
    if (terms.length >= 50) break;
  }
  return terms.slice(0, 50);
}
