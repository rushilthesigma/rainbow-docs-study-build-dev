import { useState, useRef, useCallback, useEffect } from 'react';

// Wrapper over the Web Speech API's SpeechRecognition (webkit-prefixed in
// Chrome). Two usage shapes:
//   • Dictation (push-to-talk): continuous, silenceMs = 0. User toggles
//     start/stop; on stop we finalize the accumulated transcript.
//   • Hands-free conversation: continuous, silenceMs > 0. We auto-finalize
//     after the user pauses for `silenceMs`, which is what triggers "send".
//
// Only one SpeechRecognition can run per page, so callers must not have two
// active at once (the dictation button and the voice overlay are mutually
// exclusive by UI state).

const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;
export const speechRecognitionSupported = !!SR;

export function useSpeechRecognition({
  lang = 'en-US',
  continuous = true,
  interimResults = true,
  silenceMs = 0,
  onFinal,
  onResult, // fires on every result with the live combined transcript (final + interim)
  onError,
} = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const recRef = useRef(null);
  const finalRef = useRef('');     // confirmed transcript so far
  const interimRef = useRef('');   // live (unconfirmed) words
  const wantRef = useRef(false);   // do we intend to be listening? (auto-restart guard)
  const stoppedRef = useRef(false); // suppress onresult after stop/abort to prevent duplicate words
  const silenceTimer = useRef(null);
  // Chrome's speech service reports 'network' for any hiccup in its own
  // backend, online or not, and a retry usually succeeds. Track consecutive
  // network errors so we can retry silently before surfacing a real failure.
  const netRetriesRef = useRef(0);
  const netRetryRef = useRef(false); // tells onend to do a delayed restart

  const cbRef = useRef({ onFinal, onResult, onError });
  cbRef.current = { onFinal, onResult, onError };
  const cfgRef = useRef({ lang, continuous, interimResults, silenceMs });
  cfgRef.current = { lang, continuous, interimResults, silenceMs };

  const clearSilence = () => {
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }
  };

  // Emit the accumulated transcript (confirmed + any leftover interim) to the
  // caller and reset the buffers for the next utterance.
  const finalize = useCallback(() => {
    clearSilence();
    const text = `${finalRef.current} ${interimRef.current}`.replace(/\s+/g, ' ').trim();
    finalRef.current = '';
    interimRef.current = '';
    setInterim('');
    if (text) cbRef.current.onFinal?.(text);
  }, []);

  const ensureRec = useCallback(() => {
    if (recRef.current || !SR) return recRef.current;
    const rec = new SR();
    rec.lang = cfgRef.current.lang;
    rec.continuous = cfgRef.current.continuous;
    rec.interimResults = cfgRef.current.interimResults;

    rec.onresult = (e) => {
      // Ignore results that arrive after stop()/abort() — they would duplicate
      // text that finalize() already committed via the interim buffer.
      if (stoppedRef.current) return;
      // Real results mean the speech service is healthy again.
      netRetriesRef.current = 0;
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + ' ';
        else live += r[0].transcript;
      }
      interimRef.current = live;
      setInterim(live);
      // Surface the live, growing transcript (confirmed words + the words
      // currently being spoken) so callers can render it into the composer
      // in real time, before the user stops.
      const combined = `${finalRef.current} ${live}`.replace(/\s+/g, ' ').trim();
      cbRef.current.onResult?.(combined);
      // Reset the pause timer on any speech activity; fire after silence.
      clearSilence();
      const { silenceMs: sm } = cfgRef.current;
      if (sm && (finalRef.current.trim() || live.trim())) {
        silenceTimer.current = setTimeout(() => finalize(), sm);
      }
    };

    rec.onerror = (e) => {
      // no-speech / aborted are routine (pauses, manual stop) — stay quiet.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      // 'network' is usually a transient speech-service drop, not real
      // connectivity loss. Retry silently a couple of times (onend does the
      // actual restart) before treating it as a failure.
      if (e.error === 'network' && wantRef.current && netRetriesRef.current < 2) {
        netRetriesRef.current += 1;
        netRetryRef.current = true;
        return;
      }
      // Real error (not-allowed, service-not-allowed, repeated network…):
      // stop auto-restart so we don't spin in an infinite error loop.
      wantRef.current = false;
      cbRef.current.onError?.(e.error);
    };

    rec.onend = () => {
      // Delayed restart after a 'network' hiccup: an immediate start() tends
      // to hit the same dead speech-service connection.
      if (netRetryRef.current) {
        netRetryRef.current = false;
        setTimeout(() => {
          if (!wantRef.current) return;
          try { rec.start(); } catch { /* already running */ }
        }, 400);
        return;
      }
      // Chrome ends the session on its own after pauses. If the caller still
      // wants to listen (continuous), restart transparently.
      if (wantRef.current && cfgRef.current.continuous) {
        try { rec.start(); return; } catch {
          // Browser refused to restart — stop cleanly.
          wantRef.current = false;
        }
      }
      setListening(false);
    };

    recRef.current = rec;
    return rec;
  }, [finalize]);

  const start = useCallback(() => {
    const rec = ensureRec();
    if (!rec) return false;
    // Pick up the latest language choice (settings can change it between runs).
    try { rec.lang = cfgRef.current.lang; } catch {}
    stoppedRef.current = false;
    wantRef.current = true;
    netRetriesRef.current = 0;
    netRetryRef.current = false;
    finalRef.current = '';
    interimRef.current = '';
    setInterim('');
    try {
      rec.start();
      setListening(true);
      return true;
    } catch {
      // start() throws if already started — treat as already listening.
      setListening(true);
      return true;
    }
  }, [ensureRec]);

  // Graceful stop: finalizes the current transcript and blocks any onresult
  // events that arrive late (they'd duplicate text already in the interim buf).
  const stop = useCallback(({ finalizeNow = true } = {}) => {
    stoppedRef.current = true;
    wantRef.current = false;
    clearSilence();
    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch {} }
    setListening(false);
    if (finalizeNow) finalize();
  }, [finalize]);

  // Hard abort: drop everything, emit nothing.
  const abort = useCallback(() => {
    stoppedRef.current = true;
    wantRef.current = false;
    clearSilence();
    finalRef.current = '';
    interimRef.current = '';
    setInterim('');
    const rec = recRef.current;
    if (rec) { try { rec.abort(); } catch {} }
    setListening(false);
  }, []);

  useEffect(() => () => { abort(); }, [abort]);

  return { supported: speechRecognitionSupported, listening, interim, start, stop, abort };
}
