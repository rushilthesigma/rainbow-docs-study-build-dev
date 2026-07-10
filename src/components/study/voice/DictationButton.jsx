import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic2, MicOff, AlertCircle } from 'lucide-react';
import { useSpeechRecognition, speechRecognitionSupported } from '../../../hooks/useSpeechRecognition';

const LANG_KEY = 'covalent.dictation.lang';

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

const ERR_LABELS = {
  'network':           'You appear to be offline. Speech recognition needs an internet connection.',
  'audio-capture':     'No microphone found.',
  'language-not-supported': 'Dictation language not supported by your browser.',
};

// Errors that mean mic access is permanently blocked — show persistent indicator.
const BLOCKED_ERRORS = new Set(['not-allowed', 'service-not-allowed']);

const VOICE_ACCENT_STYLE = {
  '--tool-accent': 'var(--voice-accent)',
  '--tool-accent-text': 'var(--voice-accent-text)',
  '--tool-accent-hover': 'var(--voice-accent-hover)',
  '--tool-accent-soft': 'var(--voice-accent-soft)',
  '--tool-accent-ring': 'var(--voice-accent-ring)',
};

async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    stream?.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

// Tolerant of how speech recognition actually transcribes "send send":
// "sent send", "send, send", a trailing period. Must match ChatInput's copy
// (the final-transcript fallback) so both layers agree.
const SEND_TRIGGER    = /\b(?:send|sent)[\s,.!]+(?:send|sent)[\s,.!?]*$/i;
const RESTART_TRIGGER = /\brestart\s+restart\s*$/i;
const DELETE_TRIGGER  = /\bdelete\s+delete\s+(\w+)\s*$/i;

export default function DictationButton({ onStart, onLiveText, onTranscript, onListeningChange, onAutoSend, onAutoRestart, onAutoDelete, disabled }) {
  const [lang] = useState(() => readPref(LANG_KEY, 'en-US'));
  const [srError, setSrError] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const [showBlockedTip, setShowBlockedTip] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const tipTimerRef = useRef(null);
  const btnRef = useRef(null);
  // The tip/error bubbles portal to <body> because the composer card has
  // overflow-hidden and clips anything positioned above the rail. Fixed
  // position is computed from the button when a bubble becomes visible.
  const [tipPos, setTipPos] = useState(null);

  useLayoutEffect(() => {
    if (!showBlockedTip && !srError) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setTipPos({ left: Math.max(8, r.left), top: r.top - 8 });
  }, [showBlockedTip, srError]);

  // Check permission state on mount; prompt immediately if not yet asked (like Google Meet).
  useEffect(() => {
    let status;
    const handler = () => {
      const blocked = status?.state === 'denied';
      setMicBlocked(blocked);
      if (!blocked) { setSrError(''); setShowBlockedTip(false); }
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' }).then(s => {
        status = s;
        if (s.state === 'denied') {
          setMicBlocked(true);
        } else if (s.state === 'prompt') {
          // Trigger the browser's native permission dialog now, before the user
          // tries to dictate — mirrors how Google Meet / Zoom request access.
          requestMicPermission().then(granted => {
            if (!granted) setMicBlocked(true);
          });
        }
        s.addEventListener('change', handler);
      }).catch(() => {
        // Permissions API unsupported — try requesting directly and handle the result.
        requestMicPermission().then(granted => { if (!granted) setMicBlocked(true); });
      });
    } else {
      requestMicPermission().then(granted => { if (!granted) setMicBlocked(true); });
    }

    return () => { try { status?.removeEventListener('change', handler); } catch {} };
  }, []);

  const { listening, start, stop } = useSpeechRecognition({
    lang,
    continuous: true,
    interimResults: true,
    silenceMs: 0,
    onResult: (text) => {
      if (onAutoSend && SEND_TRIGGER.test(text)) {
        const clean = text.replace(SEND_TRIGGER, '').trim();
        stop({ finalizeNow: false });
        onAutoSend(clean);
        return;
      }
      if (onAutoRestart && RESTART_TRIGGER.test(text)) {
        stop({ finalizeNow: false });
        onAutoRestart();
        return;
      }
      const deleteMatch = onAutoDelete && text.match(DELETE_TRIGGER);
      if (deleteMatch) {
        stop({ finalizeNow: false });
        onAutoDelete(deleteMatch[1]);
        return;
      }
      onLiveText?.(text);
    },
    onFinal: (text) => onTranscript?.(text),
    onError: (err) => {
      if (BLOCKED_ERRORS.has(err)) {
        setMicBlocked(true);
        setSrError('');
        showTip();
      } else if (err === 'network' && navigator.onLine !== false) {
        // Chrome reports 'network' for any speech-service failure. Only blame
        // the connection when the browser actually says it's offline.
        setSrError("Speech service didn't respond. Tap the mic to retry.");
        setTimeout(() => setSrError(''), 5000);
      } else {
        setSrError(ERR_LABELS[err] || `Speech error: ${err}`);
        setTimeout(() => setSrError(''), 5000);
      }
    },
  });

  useEffect(() => {
    onListeningChange?.(listening);
  }, [listening, onListeningChange]);

  function showTip() {
    setShowBlockedTip(true);
    clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setShowBlockedTip(false), 8000);
  }

  // "Try again" in the blocked tip: re-request access. Succeeds when the
  // browser will re-prompt ('prompt' state, or the user just unblocked the
  // site without reloading) — in that case start dictating right away.
  async function retryMicAccess() {
    if (retrying) return;
    setRetrying(true);
    clearTimeout(tipTimerRef.current);
    const granted = await requestMicPermission();
    setRetrying(false);
    if (granted) {
      setMicBlocked(false);
      setShowBlockedTip(false);
      setSrError('');
      onStart?.();
      start();
    } else {
      // Still denied — keep the guidance up so the user can follow it.
      showTip();
    }
  }

  useEffect(() => () => clearTimeout(tipTimerRef.current), []);

  if (!speechRecognitionSupported) return null;

  async function toggle() {
    if (micBlocked) {
      showTip();
      return;
    }
    setSrError('');
    if (listening) {
      stop();
    } else {
      // Explicitly request mic permission before starting speech recognition.
      // This ensures the browser shows a clear permission dialog rather than
      // letting the Speech API fail silently or with a cryptic error.
      const granted = await requestMicPermission();
      if (!granted) {
        setMicBlocked(true);
        showTip();
        return;
      }
      onStart?.();
      start();
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        style={micBlocked ? undefined : VOICE_ACCENT_STYLE}
        title={
          micBlocked
            ? 'Microphone blocked — click for help'
            : listening
            ? 'Stop voice input'
            : 'Voice input'
        }
        className={`relative flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 focus:outline-none ${
          micBlocked
            ? 'text-amber-400 hover:bg-amber-500/10'
            : listening
            ? 'tool-accent-button is-fill'
            : 'tool-accent-button text-gray-400 dark:text-blue-200/55'
        }`}
      >
        {micBlocked ? (
          <MicOff size={13} />
        ) : listening ? (
          <>
            <Mic2 size={13} className="animate-pulse shrink-0" />
            <span className="text-[10px] font-semibold">Listening…</span>
          </>
        ) : (
          <Mic2 size={13} />
        )}
        {micBlocked && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
        )}
      </button>

      {micBlocked && showBlockedTip && tipPos && createPortal(
        <div
          style={{ position: 'fixed', left: tipPos.left, top: tipPos.top, transform: 'translateY(-100%)', zIndex: 9999 }}
          className="w-64 px-2.5 py-2 rounded-lg bg-amber-950/95 border border-amber-500/40 text-[11px] text-amber-200 leading-snug shadow-xl"
        >
          <div className="flex items-start gap-1.5">
            <AlertCircle size={12} className="mt-px shrink-0 text-amber-400" />
            <span>Microphone is blocked for this site. Click the mic or lock icon in the address bar, allow the microphone, then try again.</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 pl-[18px]">
            <button
              type="button"
              onClick={retryMicAccess}
              disabled={retrying}
              className="px-2 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 font-semibold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
            >
              {retrying ? 'Checking…' : 'Try again'}
            </button>
            <button
              type="button"
              onClick={() => setShowBlockedTip(false)}
              className="text-amber-300/60 hover:text-amber-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>,
        document.body
      )}

      {srError && tipPos && createPortal(
        <div
          style={{ position: 'fixed', left: tipPos.left, top: tipPos.top, transform: 'translateY(-100%)', zIndex: 9999 }}
          className="w-56 flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-rose-900/90 border border-rose-500/40 text-[11px] text-rose-200 leading-snug shadow-xl"
        >
          <AlertCircle size={12} className="mt-px shrink-0 text-rose-400" />
          {srError}
        </div>,
        document.body
      )}
    </div>
  );
}
