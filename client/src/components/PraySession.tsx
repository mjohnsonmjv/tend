// PraySession: full-screen one-button pray mode for the church team inbox.
// Tap once, pray aloud, and requests are checked off as they are heard.
// Transcribe and discard: transcripts live only in memory during the session
// and are never displayed or saved.

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Check, Undo2, Volume2, VolumeX, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PrayerRequest, Status } from "@shared/schema";
import { supabase, SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase";
import { buildKeywordSet, matchTranscript, type KeywordSet } from "@/lib/prayerMatcher";
import { PrayAudioSession, type PrayToken, type PrayAudioEvents } from "@/lib/prayAudio";
import { playChime, isPrayMuted, setPrayMuted, hasSeenMicDisclosure, markMicDisclosureSeen } from "@/lib/prayMode";

type Phase = "disclosure" | "starting" | "listening" | "paused" | "reconnecting" | "denied" | "error" | "summary";

interface Props {
  churchId: number;
  requests: PrayerRequest[];
  onStatus: (id: number, status: Status) => void;
  onClose: () => void;
}

class PraySetupError extends Error {}

async function mintPrayToken(churchId: number): Promise<PrayToken> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error("Please sign in to access your church.");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pray-session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.session.access_token}`,
    },
    body: JSON.stringify({ church_id: churchId }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503) throw new PraySetupError(data.error || "Pray mode is not set up for this church yet.");
  if (!res.ok) throw new Error(data.error || "Could not start a prayer session.");
  if (!data.token) throw new Error("Could not start a prayer session.");
  return { token: data.token, keyterms: Array.isArray(data.keyterms) ? data.keyterms : [], fetchedAt: Date.now() };
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SESSION_LIMIT_MS = 30 * 60 * 1000;
const SESSION_WARN_MS = 28 * 60 * 1000;

export function PraySession({ churchId, requests, onStatus, onClose }: Props) {
  // Snapshot the open requests at session start.
  const [sessionRequests] = useState(() => requests.filter((r) => r.status === "new" || r.status === "praying"));
  const [phase, setPhase] = useState<Phase>(hasSeenMicDisclosure() ? "starting" : "disclosure");
  const [checked, setChecked] = useState<number[]>([]);
  const [muted, setMuted] = useState(isPrayMuted());
  const [error, setError] = useState("");
  const [setupIssue, setSetupIssue] = useState(false);
  const [warned, setWarned] = useState(false);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const [autoStopped, setAutoStopped] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const keywordSets = useRef<KeywordSet[]>(sessionRequests.map(buildKeywordSet));
  const manualIds = useRef<Set<number>>(new Set());
  const lastAuto = useRef<{ id: number; prevStatus: Status } | null>(null);
  const audio = useRef<PrayAudioSession | null>(null);
  const timers = useRef<number[]>([]);
  const activeStart = useRef<number>(0);
  const activeTotal = useRef<number>(0);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  // Mirror of checked state for use inside the audio callback.
  const lastCheckedRef = useRef<number[]>([]);
  useEffect(() => { lastCheckedRef.current = checked; }, [checked]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const stopTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  const markActive = () => {
    activeStart.current = Date.now();
  };
  const bankActive = () => {
    if (activeStart.current) {
      activeTotal.current += Date.now() - activeStart.current;
      activeStart.current = 0;
    }
    setElapsedMs(activeTotal.current);
  };

  const stopAudio = useCallback(async () => {
    if (audio.current) {
      await audio.current.stop();
      audio.current = null;
    }
  }, []);

  const finishSession = useCallback(async (stoppedEarly: boolean) => {
    bankActive();
    stopTimers();
    await stopAudio();
    if (stoppedEarly) setAutoStopped(true);
    setPhase("summary");
  }, [stopAudio]);

  const handleCommitted = useCallback((text: string) => {
    if (phaseRef.current !== "listening") return;
    const sets = keywordSets.current.filter(
      (s) => !manualIds.current.has(s.requestId) && !lastCheckedRef.current.includes(s.requestId)
    );
    const ids = matchTranscript(sets, text);
    if (!ids.length) return;
    for (const id of ids) {
      const req = sessionRequests.find((r) => r.id === id);
      if (!req) continue;
      lastAuto.current = { id, prevStatus: req.status as Status };
      lastCheckedRef.current = [...lastCheckedRef.current, id];
      setChecked((prev) => (prev.includes(id) ? prev : [...prev, id]));
      onStatus(id, "prayed_for");
    }
    if (!isPrayMuted()) playChime();
    // Transcripts are never stored; `text` falls out of scope here.
  }, [onStatus, sessionRequests]);

  // Shared event wiring for the initial socket and the one silent retry.
  const makeEvents = (): PrayAudioEvents => ({
    onOpen: () => {
      if (phaseRef.current === "starting" || phaseRef.current === "reconnecting") {
        setPhase("listening");
        markActive();
      }
    },
    onPartial: () => { /* partials only drive the listening pulse */ },
    onCommitted: handleCommitted,
    onError: (message: string) => {
      setError(message || "The transcription service reported a problem.");
      setPhase("error");
      void stopAudio();
    },
    onClose: (unexpected: boolean) => {
      if (!unexpected) return;
      if (phaseRef.current !== "listening") return;
      setPhase("reconnecting");
      // One silent retry, then surface the error.
      void (async () => {
        try {
          const retry = new PrayAudioSession(() => mintPrayToken(churchId), makeEvents());
          audio.current = retry;
          await retry.start();
        } catch {
          setError("The connection dropped and could not be restored. Nothing was recorded.");
          setPhase("error");
          void stopAudio();
        }
      })();
    },
  });

  const startListening = useCallback(async () => {
    setPhase("starting");
    setError("");
    setSetupIssue(false);
    try {
      const session = new PrayAudioSession(() => mintPrayToken(churchId), makeEvents());
      audio.current = session;
      await session.start();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start.";
      if (e instanceof PraySetupError) {
        setSetupIssue(true);
        setError(message);
        setPhase("error");
      } else if (/microphone|permission|denied|not allowed/i.test(message)) {
        setPhase("denied");
      } else {
        setError(message);
        setPhase("error");
      }
      await stopAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId, handleCommitted, stopAudio]);

  const begin = () => {
    markMicDisclosureSeen();
    void startListening();
  };

  const pause = async () => {
    bankActive();
    stopTimers();
    await stopAudio();
    setPhase("paused");
  };

  const resume = () => {
    void startListening();
  };

  const toggleCheck = (id: number) => {
    manualIds.current.add(id);
    if (checked.includes(id)) {
      setChecked(checked.filter((c) => c !== id));
      onStatus(id, "praying");
    } else {
      if (lastAuto.current?.id === id) lastAuto.current = null;
      setChecked([...checked, id]);
      onStatus(id, "prayed_for");
      if (!muted) playChime();
    }
  };

  const undoLastAuto = () => {
    const last = lastAuto.current;
    if (!last) return;
    manualIds.current.add(last.id);
    setChecked(checked.filter((c) => c !== last.id));
    onStatus(last.id, last.prevStatus);
    lastAuto.current = null;
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setPrayMuted(next);
  };

  // Session clock, warning, and auto-stop.
  useEffect(() => {
    if (phase !== "listening") return;
    const tick = window.setInterval(() => {
      setElapsedMs(activeTotal.current + (activeStart.current ? Date.now() - activeStart.current : 0));
    }, 1000);
    later(() => { if (!warnDismissed) setWarned(true); }, SESSION_WARN_MS - (activeTotal.current));
    later(() => { void finishSession(true); }, SESSION_LIMIT_MS - activeTotal.current);
    return () => { clearInterval(tick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Auto-pause when the tab is backgrounded (mobile browsers suspend capture).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && phaseRef.current === "listening") void pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-start when the disclosure was already seen.
  useEffect(() => {
    if (phase === "starting" && !audio.current) void startListening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopTimers();
      void stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prayedCount = checked.length;
  const total = sessionRequests.length;
  const canUndo = lastAuto.current !== null;

  const requestName = (r: PrayerRequest) => (r.isAnonymous ? "Anonymous" : r.submitterName || "Name not provided");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#FBF8F1] text-[#2A2521]" role="dialog" aria-modal="true" aria-label="Pray mode" data-testid="pray-session">
      <div className="mx-auto max-w-xl px-5 py-6 sm:py-10 min-h-full flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <p className="eyebrow">Pray mode</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close pray mode" data-testid="button-pray-close"><X size={20} /></Button>
        </div>

        {phase === "disclosure" && (
          <div className="flex-1 flex flex-col justify-center text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#EFC65E]/20"><Mic size={28} className="text-[#8a6d1f]" /></div>
            <h1 className="font-serif text-3xl leading-tight mb-4">Before you begin</h1>
            <p className="text-muted-foreground leading-relaxed mb-3">Pray mode listens through your microphone to hear which requests you pray for, and checks them off as you go.</p>
            <p className="text-muted-foreground leading-relaxed mb-8">Nothing is recorded. Audio is transcribed in the moment and immediately discarded. No transcript is ever shown or saved.</p>
            <Button onClick={begin} className="min-h-12 text-base" data-testid="button-pray-begin">Begin praying</Button>
            <button onClick={onClose} className="mt-4 text-sm text-muted-foreground underline underline-offset-4" data-testid="button-pray-cancel">Back to inbox</button>
          </div>
        )}

        {phase === "starting" && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6"><div className="h-16 w-16 rounded-full bg-[#EFC65E]/25 animate-pulse" /><Mic size={26} className="absolute inset-0 m-auto text-[#8a6d1f]" /></div>
            <p className="text-muted-foreground">Getting ready to listen...</p>
          </div>
        )}

        {(phase === "listening" || phase === "paused" || phase === "reconnecting") && (
          <>
            <div className="text-center mb-6">
              <div className="relative mx-auto mb-4 h-14 w-14">
                {phase === "listening" && <span className="absolute inset-0 rounded-full bg-[#EFC65E]/40 animate-ping" aria-hidden="true" />}
                <span className="absolute inset-0 rounded-full bg-[#EFC65E]/25 flex items-center justify-center" aria-hidden="true">
                  {phase === "paused" ? <Mic size={22} className="text-[#8a6d1f] opacity-50" /> : <Mic size={22} className="text-[#8a6d1f]" />}
                </span>
              </div>
              <h1 className="font-serif text-2xl mb-1">{phase === "paused" ? "Paused" : "Praying through the list"}</h1>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {phase === "reconnecting" ? "Reconnecting..." : phase === "paused" ? "Take your time. Nothing is being heard right now." : "Pray aloud. Requests are checked off as you name them."}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="text-pray-timer"><Clock size={14} /> {formatElapsed(elapsedMs)}</p>
            </div>

            {warned && !warnDismissed && (
              <div className="mb-4 rounded-lg border border-[#E2DACA] bg-white/70 p-4 text-sm" role="status">
                <p>Your prayer time will gently pause at 30 minutes. You can start a new session any time.</p>
                <button onClick={() => setWarnDismissed(true)} className="mt-2 underline underline-offset-4 text-muted-foreground">Dismiss</button>
              </div>
            )}

            <div className="space-y-3 mb-6" aria-live="polite">
              {sessionRequests.map((r) => {
                const isChecked = checked.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleCheck(r.id)}
                    aria-pressed={isChecked}
                    data-testid={`pray-card-${r.id}`}
                    className={`w-full text-left rounded-xl border p-4 flex items-start gap-4 min-h-16 transition-colors ${isChecked ? "border-[#93A68B] bg-[#93A68B]/10" : "border-[#E2DACA] bg-white/60"}`}
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${isChecked ? "border-[#5c7a54] bg-[#5c7a54] text-white" : "border-[#E2DACA] text-transparent"}`} aria-hidden="true">
                      <Check size={16} strokeWidth={3} />
                    </span>
                    <span>
                      <span className="block font-medium">{requestName(r)}</span>
                      <span className="block text-sm text-muted-foreground line-clamp-2 mt-0.5">{r.message}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto space-y-3 pb-2">
              <div className="flex items-center justify-center gap-3">
                {phase === "paused" ? (
                  <Button onClick={resume} className="min-h-12 px-8" data-testid="button-pray-resume"><Play size={16} className="mr-2" /> Resume</Button>
                ) : (
                  <Button variant="outline" onClick={pause} disabled={phase !== "listening"} className="min-h-12 px-8" data-testid="button-pray-pause"><Pause size={16} className="mr-2" /> Pause</Button>
                )}
                <Button variant="ghost" onClick={() => void finishSession(false)} className="min-h-12" data-testid="button-pray-stop">End session</Button>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <button onClick={toggleMute} className="inline-flex items-center gap-1.5 min-h-11" aria-pressed={muted} data-testid="button-pray-mute">
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />} {muted ? "Sound off" : "Sound on"}
                </button>
                {canUndo && (
                  <button onClick={undoLastAuto} className="inline-flex items-center gap-1.5 min-h-11" data-testid="button-pray-undo">
                    <Undo2 size={16} /> Undo last check
                  </button>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground" data-testid="text-pray-count">{prayedCount} of {total} prayed for</p>
            </div>
          </>
        )}

        {phase === "denied" && (
          <div className="flex-1 flex flex-col justify-center text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#E2DACA]/50"><Mic size={28} className="text-muted-foreground" /></div>
            <h1 className="font-serif text-3xl mb-4">Microphone is blocked</h1>
            <p className="text-muted-foreground leading-relaxed mb-3">Tend needs microphone access to hear which requests you pray for. Open your browser settings, allow the microphone for this site, then try again.</p>
            <p className="text-muted-foreground leading-relaxed mb-8">If you opened Tend inside another app, try opening it directly in Safari or Chrome instead.</p>
            <Button onClick={() => void startListening()} className="min-h-12" data-testid="button-pray-retry">Try again</Button>
            <button onClick={onClose} className="mt-4 text-sm text-muted-foreground underline underline-offset-4">Back to inbox</button>
          </div>
        )}

        {phase === "error" && (
          <div className="flex-1 flex flex-col justify-center text-center">
            <h1 className="font-serif text-3xl mb-4">{setupIssue ? "Pray mode is not ready" : "The session was interrupted"}</h1>
            <p className="text-muted-foreground leading-relaxed mb-8" role="alert">{setupIssue ? error : `${error} Nothing was recorded, and your checked requests are saved.`}</p>
            {!setupIssue && <Button onClick={() => void startListening()} className="min-h-12 mb-3" data-testid="button-pray-retry">Try again</Button>}
            <Button variant={setupIssue ? "default" : "outline"} onClick={onClose} className="min-h-12" data-testid="button-pray-error-close">Back to inbox</Button>
          </div>
        )}

        {phase === "summary" && (
          <div className="flex-1 flex flex-col justify-center text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#93A68B]/20"><Check size={28} className="text-[#5c7a54]" /></div>
            <h1 className="font-serif text-3xl mb-4">Session complete</h1>
            <p className="text-lg mb-1" data-testid="text-pray-summary">{prayedCount} of {total} requests prayed for</p>
            <p className="text-muted-foreground mb-2">Time in prayer: {formatElapsed(elapsedMs)}</p>
            {autoStopped && <p className="text-sm text-muted-foreground mb-6">The session gently paused at 30 minutes.</p>}
            <div className="mt-6 space-y-3">
              <Button onClick={() => { setChecked([]); lastCheckedRef.current = []; manualIds.current = new Set(); lastAuto.current = null; activeTotal.current = 0; setElapsedMs(0); setAutoStopped(false); setWarned(false); setWarnDismissed(false); void startListening(); }} className="min-h-12 w-full" data-testid="button-pray-again">Pray again</Button>
              <Button variant="outline" onClick={onClose} className="min-h-12 w-full" data-testid="button-pray-done">Back to inbox</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PraySession;
