// prayAudio: mic capture plus ElevenLabs Scribe realtime streaming for pray mode.
// Audio exists only as in-memory chunks in transit. Nothing is recorded,
// written to disk, or persisted anywhere. Transcripts are delivered to the
// caller and must be discarded when the session ends.

export interface PrayAudioEvents {
  onOpen: () => void;
  onPartial: (text: string) => void;
  onCommitted: (text: string) => void;
  onError: (message: string) => void;
  onClose: (unexpected: boolean) => void;
}

export interface PrayToken {
  token: string;
  keyterms: string[];
  fetchedAt: number;
}

const TOKEN_STALE_MS = 10 * 60 * 1000; // tokens expire after 15 minutes

function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function base64Pcm16(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  return btoa(binary);
}

/** Average downsampling for contexts that ignore the 16 kHz hint. */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export class PrayAudioSession {
  private events: PrayAudioEvents;
  private mintToken: () => Promise<PrayToken>;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private ws: WebSocket | null = null;
  private closing = false;
  private token: PrayToken | null = null;

  constructor(mintToken: () => Promise<PrayToken>, events: PrayAudioEvents) {
    this.mintToken = mintToken;
    this.events = events;
  }

  private async freshToken(): Promise<PrayToken> {
    if (!this.token || Date.now() - this.token.fetchedAt > TOKEN_STALE_MS) {
      this.token = await this.mintToken();
    }
    return this.token;
  }

  private buildUrl(t: PrayToken): string {
    const params = new URLSearchParams({
      token: t.token,
      model_id: "scribe_v2_realtime",
      audio_format: "pcm_16000",
      commit_strategy: "vad",
      language_code: "en",
      no_verbatim: "true",
      filter_background_audio: "true",
      enable_logging: "false",
    });
    for (const k of t.keyterms.slice(0, 50)) params.append("keyterms", k);
    return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
  }

  /** Open the mic, connect the socket, and start streaming. */
  async start(): Promise<void> {
    this.closing = false;
    const token = await this.freshToken();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot access the microphone.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("This browser cannot process audio.");
    this.ctx = new Ctx({ sampleRate: 16000 });
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    const sampleRate = this.ctx.sampleRate;
    this.processor.onaudioprocess = (ev) => {
      if (this.closing || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const floats = downsample(ev.inputBuffer.getChannelData(0), sampleRate, 16000);
      const frame = {
        message_type: "input_audio_chunk",
        audio_base_64: base64Pcm16(floatToPcm16(floats)),
        commit: false,
        sample_rate: 16000,
      };
      try { this.ws.send(JSON.stringify(frame)); } catch { /* socket closing */ }
    };
    this.source.connect(this.processor);
    // ScriptProcessor only fires when connected to the destination; keep it
    // silent with a zero-gain node so no mic audio is ever played back.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.processor.connect(sink);
    sink.connect(this.ctx.destination);

    await this.connectSocket(token);
  }

  private connectSocket(token: PrayToken): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        // Safari throws SecurityError synchronously when a Content-Security-Policy
        // blocks the socket; surface the friendly message instead of the raw error.
        ws = new WebSocket(this.buildUrl(token));
      } catch {
        reject(new Error("Could not reach the transcription service."));
        return;
      }
      this.ws = ws;
      let opened = false;
      const openTimer = setTimeout(() => {
        if (!opened) { try { ws.close(); } catch { /* noop */ } reject(new Error("Could not reach the transcription service.")); }
      }, 12000);
      ws.onopen = () => { opened = true; };
      ws.onmessage = (ev) => {
        let msg: { message_type?: string; text?: string; error?: unknown; warning?: unknown };
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (typeof msg.error === "string" && msg.error) {
          this.events.onError(msg.error);
          return;
        }
        // Non-fatal server warnings (e.g. zero-retention mode requested but
        // not applied on non-enterprise accounts). Log and keep the session.
        if (msg.message_type === "warning" && typeof msg.warning === "string" && msg.warning) {
          console.warn("ElevenLabs warning:", msg.warning);
          return;
        }
        if (msg.message_type === "session_started") {
          clearTimeout(openTimer);
          this.events.onOpen();
          resolve();
        } else if (msg.message_type === "partial_transcript" && msg.text) {
          this.events.onPartial(msg.text);
        } else if (msg.message_type === "committed_transcript" && msg.text) {
          this.events.onCommitted(msg.text);
        }
      };
      ws.onerror = () => {
        if (!opened) { clearTimeout(openTimer); reject(new Error("Could not reach the transcription service.")); }
      };
      ws.onclose = () => {
        clearTimeout(openTimer);
        if (!opened) reject(new Error("Could not reach the transcription service."));
        this.events.onClose(!this.closing);
      };
    });
  }

  /** Pause: close the socket and release the mic. Resume with start(). */
  async suspend(): Promise<void> {
    await this.stop();
  }

  /** Stop everything and release the mic. Idempotent. */
  async stop(): Promise<void> {
    this.closing = true;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch { /* noop */ }
    }
    if (this.processor) {
      try { this.processor.disconnect(); } catch { /* noop */ }
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch { /* noop */ }
      this.source = null;
    }
    if (this.ctx) {
      const ctx = this.ctx;
      this.ctx = null;
      try { await ctx.close(); } catch { /* noop */ }
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try { track.stop(); } catch { /* noop */ }
      }
      this.stream = null;
    }
  }
}
