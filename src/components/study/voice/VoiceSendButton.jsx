import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { useSpeechRecognition, speechRecognitionSupported } from '../../../hooks/useSpeechRecognition';

async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
    stream?.getTracks().forEach(t => t.stop());
    return true;
  } catch { return false; }
}

// Tap to speak, auto-sends after 1.2 s of silence, AI reply plays as TTS.
// Visually distinct from the plain dictation button: blue when active.
export default function VoiceSendButton({ onSend, onListeningChange, disabled }) {
  const [micBlocked, setMicBlocked] = useState(false);
  const [showBlockedTip, setShowBlockedTip] = useState(false);
  const tipTimerRef = useRef(null);

  const { listening, interim, start, stop } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    silenceMs: 1200,
    onFinal: (text) => {
      const t = (text || '').trim();
      if (t) {
        stop({ finalizeNow: false });
        onSend(t);
      }
    },
    onError: (err) => {
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setMicBlocked(true);
        showTip();
      }
    },
  });

  useEffect(() => { onListeningChange?.(listening); }, [listening, onListeningChange]);
  useEffect(() => () => clearTimeout(tipTimerRef.current), []);

  function showTip() {
    setShowBlockedTip(true);
    clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setShowBlockedTip(false), 5000);
  }

  if (!speechRecognitionSupported) return null;

  async function toggle() {
    if (micBlocked) { showTip(); return; }
    if (listening) {
      stop();
    } else {
      const granted = await requestMicPermission();
      if (!granted) { setMicBlocked(true); showTip(); return; }
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
            ? 'Listening… auto-sends when you stop talking'
            : 'Voice send — speak, pause, auto-sends with TTS reply'
        }
        className={`relative flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 focus:outline-none ${
          micBlocked
            ? 'text-amber-400 hover:bg-amber-500/10'
            : listening
            ? 'text-white bg-blue-500 hover:bg-blue-600'
            : 'text-gray-400 dark:text-blue-200/55 hover:text-gray-700 dark:hover:text-blue-100 hover:bg-white/40 dark:hover:bg-blue-500/[0.12]'
        }`}
      >
        {micBlocked ? (
          <MicOff size={13} />
        ) : listening ? (
          <>
            <Mic size={13} className="animate-pulse shrink-0" />
            <span className="text-[10px] font-semibold max-w-[80px] truncate leading-none">
              {interim || 'Listening…'}
            </span>
          </>
        ) : (
          <>
            <Mic size={13} />
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
    </div>
  );
}
