import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { speechSynthesisSupported } from '../../hooks/useSpeechSynthesis';

// Shared read-aloud kit for the Quiz Bowl play surfaces outside solo play
// (the AI lobby, live matches, replays) so the audio option looks and behaves
// the same everywhere. Solo play in QuizBowlApp.jsx keeps its own inline
// spoken reveal (it also drives the mic answer leg); every surface persists
// the same 'covalent-qb-voice' preference, so turning read-aloud on in one
// place turns it on in all of them.

export function useQbVoicePref() {
  const [voiceMode, setVoiceMode] = useState(() => {
    try { return localStorage.getItem('covalent-qb-voice') === '1'; } catch { return false; }
  });
  function toggleVoiceMode() {
    setVoiceMode(v => {
      try { localStorage.setItem('covalent-qb-voice', v ? '0' : '1'); } catch {}
      return !v;
    });
  }
  return [voiceMode, toggleVoiceMode];
}

// Read-aloud twin of a timed word reveal. The reveal is driven by the
// synthesizer's word-boundary events instead of a timer so the on-screen text
// tracks the spoken word — buzz-point scoring stays honest. Spoken one
// sentence per utterance to dodge Chrome's long-utterance cutoff; boundary
// events can drift on some voices (or not fire at all), so we snap the index
// exact at each sentence end, which also serves as the no-boundary fallback.
export function useSpokenReveal(text, active, paused = false) {
  const [wordIndex, setWordIndex] = useState(0);
  const [spokenDone, setSpokenDone] = useState(false);
  const words = text ? text.split(/\s+/) : [];

  useEffect(() => { setWordIndex(0); setSpokenDone(false); }, [text]);

  useEffect(() => {
    if (!active || !words.length || !speechSynthesisSupported) return;
    const synth = window.speechSynthesis;
    const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
    let cancelled = false;
    let base = 0; // word offset of the chunk currently being spoken

    const speakChunk = (i) => {
      if (cancelled) return;
      if (i >= chunks.length) { setSpokenDone(true); return; }
      const chunk = chunks[i].trim();
      const chunkWords = chunk ? chunk.split(/\s+/).length : 0;
      // Strip power marks and pronunciation guides from the AUDIO only; the
      // displayed text keeps them, and the end-of-chunk snap absorbs the
      // small word-count drift stripping introduces mid-sentence.
      const spokenText = chunk.replace(/\(\*\)/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (!spokenText) { base += chunkWords; speakChunk(i + 1); return; }
      const u = new window.SpeechSynthesisUtterance(spokenText);
      u.onboundary = (e) => {
        if (cancelled || e.name !== 'word') return;
        const upto = spokenText.slice(0, e.charIndex).trim();
        const w = upto ? upto.split(/\s+/).length : 0;
        setWordIndex(prev => Math.max(prev, Math.min(words.length - 1, base + w)));
      };
      const advance = () => {
        if (cancelled) return;
        base += chunkWords;
        setWordIndex(prev => Math.max(prev, Math.min(words.length - 1, base - 1)));
        speakChunk(i + 1);
      };
      u.onend = advance;
      u.onerror = advance;
      try { synth.speak(u); } catch { advance(); }
    };

    try { synth.cancel(); } catch {}
    speakChunk(0);
    return () => { cancelled = true; try { synth.cancel(); } catch {} };
  }, [active, text]);

  // Pause/resume the utterance in place — toggling `active` instead would
  // restart the current sentence from its first word.
  useEffect(() => {
    if (!active || !speechSynthesisSupported) return;
    try { paused ? window.speechSynthesis.pause() : window.speechSynthesis.resume(); } catch {}
  }, [paused, active]);

  function stop() { if (speechSynthesisSupported) try { window.speechSynthesis.cancel(); } catch {} }
  const revealed = words.slice(0, wordIndex + 1).join(' ');
  const done = spokenDone || wordIndex >= words.length - 1;
  return { revealed, done, wordIndex, totalWords: words.length, stop };
}

// Follower variant for surfaces where the reveal timing is fixed and shared
// (a live multiplayer match runs on server timestamps, so TTS must not drive
// it). Speaks the question sentence-by-sentence at a rate scaled to roughly
// match the reveal speed; the on-screen text stays authoritative.
export function useSpokenFollow(text, active, paused = false, msPerWord = 140) {
  useEffect(() => {
    if (!active || !text || !speechSynthesisSupported) return;
    const synth = window.speechSynthesis;
    const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
    // Rate 1 reads roughly 3 words per second; clamp so voices stay legible.
    const rate = Math.max(0.8, Math.min(2.5, (1000 / Math.max(60, msPerWord)) / 3));
    let cancelled = false;
    const speakChunk = (i) => {
      if (cancelled || i >= chunks.length) return;
      const spokenText = chunks[i].replace(/\(\*\)/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (!spokenText) { speakChunk(i + 1); return; }
      const u = new window.SpeechSynthesisUtterance(spokenText);
      u.rate = rate;
      u.onend = () => speakChunk(i + 1);
      u.onerror = () => speakChunk(i + 1);
      try { synth.speak(u); } catch {}
    };
    try { synth.cancel(); } catch {}
    speakChunk(0);
    return () => { cancelled = true; try { synth.cancel(); } catch {} };
  }, [active, text]);

  useEffect(() => {
    if (!active || !speechSynthesisSupported) return;
    try { paused ? window.speechSynthesis.pause() : window.speechSynthesis.resume(); } catch {}
  }, [paused, active]);
}

// One-off line (verdicts, answer reveals). Cancels whatever is playing and
// resumes a paused queue first — a paused synth silently swallows speak().
export function speakLine(text) {
  if (!speechSynthesisSupported || !text) return;
  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    synth.resume();
    synth.speak(new window.SpeechSynthesisUtterance(text));
  } catch {}
}

// Answer lines carry bracketed alternates and pronunciation guides that read
// terribly aloud — strip them before speaking.
export function spokenAnswer(answer) {
  return String(answer || '').replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

// The exact speaker button solo play uses, so the audio option is visually
// identical in every Quiz Bowl header. Renders nothing when the browser has
// no speech synthesis.
export function QbVoiceToggle({ on, onToggle, withMic = false }) {
  if (!speechSynthesisSupported) return null;
  return (
    <button
      onClick={onToggle}
      aria-label={on ? 'Turn off read aloud' : 'Read aloud'}
      title={on
        ? (withMic ? 'Read aloud on — questions are spoken, answer by voice' : 'Read aloud on — questions are spoken')
        : 'Read aloud'}
      className={`p-1 rounded-lg border transition-colors ${on ? 'border-blue-400/30 bg-blue-500/[0.12] text-blue-300' : 'border-transparent text-white/30 hover:text-white/60 hover:bg-white/5'}`}
    >
      {on ? <Volume2 size={13} /> : <VolumeX size={13} />}
    </button>
  );
}
