# One-Button Pray Mode

Status: build APPROVED by Mark in chat on 2026-09-29 ("Let's build both"). Implementation in progress.

## What it is

A "Pray" button in the church team's prayer inbox. Tap once, pray aloud over the prayer requests, and the app listens. As each request is heard in the prayer, the UI checks it off with a green check and a soft chime. A pray-through-the-list mode for pastors and care teams.

## Goals

- Make praying through the inbox feel effortless and delightful.
- Never lose or leak prayer content. Privacy first, always.
- Work on mobile browsers (iPhone Safari, Android Chrome) since the team prays from phones.

## Non-goals

- Recording or storing prayers. There is no playback feature and there never will be.
- Perfect transcription. The human stays in charge; the app assists.
- Replacing manual check-off. Tapping a request still works and always wins.

## Design principles (agreed with Mark, 2026-09-29)

Rooted in 1 Peter 5:2 ("Tend the flock of God") and Jim Samra's six marks of serious prayer (emotionally engaging, time-consuming, persistent, absolutely absorbing, physically exhausting, powerfully effective).

- **Earn full absorption, then get out of the way.** The voice loop (app reads each need aloud, you pray aloud, it hears you and checks it off) holds 100% of attention. Eyes closed, earbuds in, praying with someone rather than working a list. No multitasking-friendly tapping UI as the primary path.
- **Engaging, never gamified.** No streaks, points, badges, or confetti. The chime on check-off should feel like an amen, not a reward. The sense of accomplishment comes from "I tended my flock this morning," not from closing a ring.
- **Reverent tone.** Weighty and calm, never chirpy. Sound design and copy stay quiet and warm.
- **Persistence over sessions.** The prayed-for tracking exists so you see who is still waiting and come back tomorrow. No timers pressuring the prayer itself; the app keeps unhurried presence.
- **The care is yours.** Tend keeps track; the shepherd does the tending. The app never replaces the human work.

## User flow

1. From the inbox, tap the **Pray** button (prominent, top of inbox).
2. First run: mic permission prompt with plain-language copy explaining the mic is only used to hear which requests are prayed for, and nothing is recorded.
3. Session starts. Requests listed in a calm full-screen view, each with an unchecked circle.
4. User prays aloud. When a request is detected, its circle becomes a green check with a soft chime.
5. User can tap any request to check or uncheck it manually at any time. Manual state always overrides auto-detection. An undo control restores the last auto check-off.
6. Pause button freezes listening (mic muted, socket kept alive briefly, then closed). Resume re-opens.
7. Stop ends the session and shows a simple summary: X of Y requests prayed for, elapsed time. No transcript is shown or saved. A "pray again" button restarts.

## Mic capture on mobile browsers

- Use `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
- Pipe through `AudioContext` at 16 kHz, convert to PCM16, and stream chunks over WebSocket. This matches what Scribe realtime expects (`audio_format=pcm_16000`).
- iOS Safari supports `getUserMedia` in Safari itself. It does not work reliably inside in-app webviews (e.g. opened from Facebook or Gmail apps). If mic access fails there, show a hint to open Tend in Safari.
- If the tab is backgrounded, iOS suspends audio capture. Show a warning state and auto-pause the session rather than silently missing prayers.
- Never use `MediaRecorder` to a file. Audio exists only as in-memory chunks in transit.

## ElevenLabs Scribe integration

Researched September 2026. Two surfaces exist; we use realtime.

### Realtime (primary path)

- Endpoint: `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- Query params: `model_id=scribe_v2_realtime`, `audio_format=pcm_16000`, `commit_strategy=vad`
- Server messages: `partial_transcript` (interim, low latency around 150 ms) and `committed_transcript` (final, VAD endpointed).
- Pricing: $0.39 per audio hour. Same rate on all plan tiers.
- Auth: browsers cannot set the `xi-api-key` header on a WebSocket. Flow: the client calls our Supabase Edge Function, which mints a single-use token via `POST /v1/single-use-token/realtime_scribe` (15 minute expiry) and returns it; the client connects with `?token=`. The real API key never leaves the server.
- Add-on worth using: keyterm prompting (about $0.05/hour). Before the session starts, send the request titles and names as keyterms so Scribe recognizes names and unusual words better.

### Batch (fallback path)

- Endpoint: `POST https://api.elevenlabs.io/v1/speech-to-text`, model `scribe_v2`, $0.22 per hour.
- Used only if the realtime socket cannot connect after one retry. In batch fallback the app records short rolling buffers in memory, transcribes every 20 seconds, and checks off matches with a slight delay. Still nothing persisted.

### Server pieces

- One Supabase Edge Function: `pray-session`. It verifies the user belongs to the church (existing RLS), mints the single-use token, and returns the session's request list with precomputed keyword sets.
- No audio ever touches Supabase storage. The Edge Function only brokers the token.

## Fuzzy matching design

Goal: detect "I pray for Sarah's surgery" and check off the request titled "Sarah, knee surgery next week" without exact wording.

1. **Keyword sets.** For each request, build a keyword set at session start: lowercase, strip punctuation, drop stopwords, keep names, nouns, and distinctive words from the title, topic tags, and submitter name. Example: "Sarah, knee surgery next week" becomes {sarah, knee, surgery}.
2. **Match on committed transcripts only.** Partial transcripts update a subtle "hearing..." indicator but never check anything off. This avoids flicker from mid-sentence guesses.
3. **Scoring.** A request matches when a committed transcript contains at least two of its keywords, or a full name match (first plus last, or a distinctive first name). Names get a lower threshold because people pray using names.
4. **Mispronunciations.** Scribe is strong here (3.6% word error rate), and keyterm prompting covers unusual names. As a second layer, allow one-edit fuzzy matching on keywords longer than 5 characters.
5. **Multiple requests at once.** Score all requests against each committed transcript; check off every request that passes threshold. One sentence can check off two requests.
6. **No match.** If nothing matches, nothing happens. The request stays unchecked and the user taps it. Never guess or show "did you mean" prompts mid-prayer; that breaks the moment.
7. **Cooldown.** Once a request is auto checked, it cannot be unchecked by a later transcript. Only the user can uncheck it.

## UI states

- `idle`: Pray button on the inbox.
- `requesting-mic`: permission explainer, then system prompt.
- `listening`: full-screen list, pulsing mic indicator, elapsed timer, pause and stop controls.
- `paused`: mic muted, dimmed list, resume prominent.
- `reconnecting`: brief spinner if the socket drops; one auto retry, then batch fallback or error.
- `denied`: mic blocked. Plain-language help to enable it in browser settings.
- `error`: network or transcription failure. Copy explains nothing was recorded and offers retry.
- `summary`: counts and time, pray-again button. No transcript displayed.

## Sound

- Soft chime on auto check-off, generated with the Web Audio API (a short two-tone sine, no audio asset to ship).
- Mute toggle on the pray screen, persisted in localStorage.
- Respect silent mode as far as the browser allows; the visual check is the primary signal, sound is secondary.

## Privacy requirements (hard rules)

- Transcribe and discard. Audio chunks live only in memory in transit to ElevenLabs. Nothing is written to disk, storage, or database.
- Transcripts live only in memory during the session and are discarded when the session ends. The summary screen shows counts only.
- Prayer text is never sent to analytics, consistent with the existing rule for GA4.
- Mic-use disclosure shown before first use and linked from the pray screen.
- ElevenLabs processes audio under their API terms; note this in the privacy policy before GA launch.
- Existing RLS is unchanged: the session only sees requests the signed-in team member could already see.

## Cost estimate per session

- Realtime Scribe: $0.39/hour. A 10 minute pray session costs about $0.07. Keyterm prompting adds about $0.01.
- 100 sessions a month at 10 minutes each: roughly $7/month total. Negligible at pilot scale.
- Guardrails: cap sessions at 30 minutes (auto-stop with a gentle notice), rate-limit pray sessions per church per day on the free tier, and add per-church usage to the existing admin view so cost stays visible. Absorb the cost into paid tiers; revisit if a church prays for hours daily.

## Edge cases

- **Permission denied:** show the denied state with steps to re-enable. Never loop the prompt.
- **No mic hardware:** disable the Pray button with a tooltip.
- **Background noise:** noiseSuppression on by default; a "noisy environment" hint if transcripts come back empty repeatedly.
- **Long sessions:** 30 minute auto-stop, with a 2 minute warning the user can dismiss once.
- **Network drop mid-session:** one silent reconnect; if it fails, offer batch fallback or clean stop. Already checked requests stay checked.
- **Two people praying together:** fine. Matching is keyword based, not speaker based. Diarization not needed.
- **Accidental pocket taps:** the Pray button requires the mic permission gate, so accidental entry is unlikely. Pause is one tap.
- **Battery:** streaming audio plus screen on drains battery; show a low-battery hint only if the Battery API reports under 20 percent.

## Testing plan

- Unit tests for the keyword builder and matcher: exact names, misspellings, multiple requests in one sentence, no-match input, unicode names.
- Manual matrix: iPhone Safari, Android Chrome, desktop Chrome. Test permission grant, deny, revoke mid-session, backgrounding the tab, airplane mode mid-session.
- Audio quality test: quiet room, noisy room, speakerphone at arm's length, two voices.
- Load: 50 concurrent sessions against the Edge Function in staging.
- Privacy audit: verify no audio or transcript bytes reach Supabase storage, logs, or analytics in any path including errors.
- Copy review: no em dashes, plain language, mobile-first layout.

## Phased rollout

1. **Prototype:** pray screen and matching wired to Scribe in the local dev environment. Mark tries it with his own voice. Kill switch: feature flag `pray_mode`, default off.
2. **Beta:** enable for Frontier Church pilot only. Watch cost, match accuracy from manual overrides (count how often users uncheck auto checks), and session drop-off.
3. **GA:** enable for all churches on paid tiers; free tier gets a monthly session cap. Privacy policy updated with the ElevenLabs processing note.

## Open questions for Mark

- Should pray mode be available on the free tier, and if so, what monthly session cap?
- Should the summary screen offer "mark remaining as prayed" in one tap?
