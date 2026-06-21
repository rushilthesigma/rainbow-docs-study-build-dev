import { useState, useRef, useEffect, useCallback } from 'react';

// Thin queue on top of window.speechSynthesis. The browser's TTS chokes on
// long utterances (Chrome cuts off around ~15s) and offers no clean way to
// stream, so we speak ONE sentence at a time: callers enqueue short chunks as
// the AI streams, and this drains the queue utterance-by-utterance. That keeps
// each utterance short (dodging the cutoff bug) and lets speech start before
// the full answer arrives.

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
export const speechSynthesisSupported =
  !!synth && typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';

export function useSpeechSynthesis({ rate = 1, pitch = 1, voiceURI = null, onStart, onEnd } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);

  const queueRef = useRef([]);     // pending sentences
  const activeRef = useRef(null);  // utterance currently being spoken
  // Mirror latest config + callbacks in refs so the pump closure (created
  // once) always reads current values without being re-memoized.
  const cfgRef = useRef({ rate, pitch, voiceURI });
  cfgRef.current = { rate, pitch, voiceURI };
  const cbRef = useRef({ onStart, onEnd });
  cbRef.current = { onStart, onEnd };

  // Voice list loads asynchronously in most browsers.
  useEffect(() => {
    if (!synth) return;
    const load = () => setVoices(synth.getVoices() || []);
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);

  const pump = useCallback(() => {
    if (!synth) return;
    if (activeRef.current) return; // a sentence is already in flight
    const next = queueRef.current.shift();
    if (!next) {
      setSpeaking(false);
      cbRef.current.onEnd?.();
      return;
    }
    const u = new window.SpeechSynthesisUtterance(next);
    const { rate: r, pitch: p, voiceURI: vuri } = cfgRef.current;
    u.rate = r;
    u.pitch = p;
    if (vuri) {
      const v = (synth.getVoices() || []).find((x) => x.voiceURI === vuri);
      if (v) u.voice = v;
    }
    const advance = () => { activeRef.current = null; pump(); };
    u.onend = advance;
    u.onerror = advance;
    activeRef.current = u;
    setSpeaking(true);
    cbRef.current.onStart?.();
    try {
      synth.speak(u);
    } catch {
      activeRef.current = null;
    }
  }, []);

  // Add a chunk to the queue and start draining if idle.
  const enqueue = useCallback((text) => {
    if (!synth || !text || !text.trim()) return;
    queueRef.current.push(text.trim());
    if (!activeRef.current) pump();
  }, [pump]);

  // Hard stop: clear queue and cancel anything in flight.
  const cancel = useCallback(() => {
    if (!synth) return;
    queueRef.current = [];
    activeRef.current = null;
    try { synth.cancel(); } catch {}
    setSpeaking(false);
  }, []);

  // Replace whatever is playing with a single block of text.
  const speak = useCallback((text) => {
    if (!synth) return;
    cancel();
    enqueue(text);
  }, [cancel, enqueue]);

  // Cancel on unmount so speech doesn't bleed across views.
  useEffect(() => () => { if (synth) try { synth.cancel(); } catch {} }, []);

  return { supported: speechSynthesisSupported, speaking, voices, enqueue, speak, cancel };
}
