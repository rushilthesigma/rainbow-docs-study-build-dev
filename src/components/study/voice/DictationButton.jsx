import { useState, useEffect, useRef } from 'react';
import { Mic2, MicOff, AlertCircle } from 'lucide-react';
import { useSpeechRecognition, speechRecognitionSupported } from '../../../hooks/useSpeechRecognition';

const LANG_KEY = 'covalent.dictation.lang';

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

const ERR_LABELS = {
  'network':           'Network error — speech recognition needs an internet connection.',
  'audio-capture':     'No microphone found.',
  'language-not-supported': 'Dictation language not supported by your browser.',
};

// Errors that mean mic access is permanently blocked — show persistent indicator.
const BLOCKED_ERRORS = new Set(['not-allowed', 'service-not-allowed']);

async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    stream?.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
}

const SEND_TRIGGER    = /\bsend\s+send\s*$/i;
const RESTART_TRIGGER = /\brestart\s+restart\s*$/i;
const DELETE_TRIGGER  = /\bdelete\s+delete\s+(\w+)\s*$/i;

export default function DictationButton({ onStart, onLiveText, onTranscript, onListeningChange, onAutoSend, onAutoRestart, onAutoDelete, disabled }) {
  const [lang] = useState(() => readPref(LANG_KEY, 'en-US'));
  const [srError, setSrError] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const [showBlockedTip, setShowBlockedTip] = useState(false);
  const tipTimerRef = useRef(null);

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
    tipTimerRef.current = setTimeout(() => setShowBlockedTip(false), 5000);
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
        type="button"
        onClick={toggle}
        disabled={disabled}
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
            ? 'text-white bg-pink-500 hover:bg-pink-600 focus:ring-2 focus:ring-pink-500'
            : 'text-gray-400 dark:text-blue-200/55 hover:text-gray-700 dark:hover:text-blue-100 hover:bg-white/40 dark:hover:bg-blue-500/[0.12]'
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
          <>
            <Mic2 size={13} />
            <span className="text-[10px] font-semibold leading-none">Voice</span>
          </>
        )}
        {micBlocked && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
        )}
      </button>

      {micBlocked && showBlockedTip && (
        <div className="absolute bottom-full left-0 mb-2 w-60 z-50 flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-amber-950/90 border border-amber-500/40 text-[11px] text-amber-200 leading-snug shadow-xl">
          <AlertCircle size={12} className="mt-px shrink-0 text-amber-400" />
          Microphone is blocked. Open your browser settings, allow microphone access for this site, then reload the page.
        </div>
      )}

      {srError && (
        <div className="absolute bottom-full left-0 mb-2 w-56 z-50 flex items-start gap-1.5 px-2.5 py-2 rounded-lg bg-rose-900/90 border border-rose-500/40 text-[11px] text-rose-200 leading-snug shadow-xl">
          <AlertCircle size={12} className="mt-px shrink-0 text-rose-400" />
          {srError}
        </div>
      )}
    </div>
  );
}
