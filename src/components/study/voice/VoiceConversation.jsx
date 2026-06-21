import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Mic, MicOff } from 'lucide-react';
import { useSpeechRecognition, speechRecognitionSupported } from '../../../hooks/useSpeechRecognition';
import { Z } from '../../../styles/tokens';

// Compact voice input panel — floats above the chat input as a small card.
// The AI's response lands in the chat as a normal text bubble (with a play
// button for on-demand TTS). No full-screen takeover, no auto-speak loop.
// Flow: listen → silence/tap → send → AI responds in chat → listen again.

const STATUS_LABEL = {
  listening: 'Listening…',
  thinking:  'Thinking…',
  idle:      'Paused',
  error:     'Something went wrong',
};

export default function VoiceConversation({ onSendVoice, onClose, modelLabel = '' }) {
  const [status, setStatus] = useState('listening');
  const [youText, setYouText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const statusRef  = useRef(status);  statusRef.current  = status;
  const mutedRef   = useRef(muted);   mutedRef.current   = muted;
  const closedRef  = useRef(false);
  const beginListeningRef = useRef(() => {});

  const rec = useSpeechRecognition({
    continuous:     true,
    interimResults: true,
    silenceMs:      1500,
    onFinal: (text) => handleHeard(text),
    onError: (err) => {
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        setErrMsg('Microphone access was blocked. Allow it in your browser to use voice mode.');
        setStatus('error');
      }
    },
  });

  const beginListening = useCallback(() => {
    if (closedRef.current || mutedRef.current) return;
    setYouText('');
    setStatus('listening');
    rec.start();
  }, [rec]);
  beginListeningRef.current = beginListening;

  function handleHeard(text) {
    if (closedRef.current || mutedRef.current) return;
    if (statusRef.current !== 'listening') return;
    const t = (text || '').trim();
    if (!t) return;
    rec.abort();
    setYouText(t);
    startTurn(t);
  }

  function startTurn(text) {
    setStatus('thinking');
    onSendVoice(text, {
      onPartial: () => {},
      onDone: () => {
        // AI finished streaming → response is already in the chat bubble.
        // Resume listening for the next spoken turn.
        if (!closedRef.current) beginListeningRef.current();
      },
      onError: (err) => {
        setErrMsg(typeof err === 'string' ? err : 'The AI hit an error. Tap to try again.');
        setStatus('error');
      },
    });
  }

  function handleOrbTap() {
    const s = statusRef.current;
    if (s === 'listening') {
      rec.stop(); // send now without waiting for silence
    } else if (s === 'error' || s === 'idle') {
      setErrMsg('');
      setMuted(false);
      beginListening();
    }
    // 'thinking' — nothing to do while AI is generating
  }

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      if (next) { rec.abort(); setStatus('idle'); }
      else { setTimeout(() => beginListeningRef.current(), 0); }
      return next;
    });
  }

  function handleClose() {
    closedRef.current = true;
    try { rec.abort(); } catch {}
    onClose?.();
  }

  useEffect(() => {
    const t = setTimeout(() => { if (!closedRef.current) beginListeningRef.current(); }, 250);
    function onKey(e) { if (e.key === 'Escape') handleClose(); }
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      closedRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unsupported = !speechRecognitionSupported;

  const orbState =
    status === 'listening' ? 'voice-orb--listening'
    : status === 'thinking' ? 'voice-orb--thinking'
    : status === 'error'    ? 'voice-orb--error'
    : 'voice-orb--idle';

  return createPortal(
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 w-72 rounded-2xl shadow-2xl flex flex-col items-center gap-2 px-5 pt-3.5 pb-4 animate-fade-in"
      style={{
        zIndex: Z.presentation,
        backgroundColor: 'rgba(12, 13, 20, 0.95)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide bg-blue-500/25 text-blue-200 ring-1 ring-blue-400/30">BETA</span>
          <span className="text-[11px] text-white/45">Voice{modelLabel ? ` · ${modelLabel}` : ''}</span>
        </div>
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title="End voice mode (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      {unsupported ? (
        <p className="text-[12px] text-white/50 text-center py-2">
          Voice mode needs Chrome or Edge.
        </p>
      ) : (
        <>
          {/* Orb */}
          <button
            onClick={handleOrbTap}
            className={`voice-orb voice-orb--sm ${orbState}`}
            title={status === 'listening' ? 'Tap to send now' : 'Tap to resume'}
            aria-label="Voice control"
          >
            <span className="voice-orb__core" />
          </button>

          {/* Status */}
          <p className="text-[12px] font-semibold text-white/75 min-h-[18px] -mt-1">
            {errMsg ? '' : STATUS_LABEL[status]}
          </p>

          {/* Live caption */}
          <div className="w-full min-h-[32px] text-center">
            {errMsg ? (
              <p className="text-[11px] text-rose-300/80">{errMsg}</p>
            ) : (
              <p className="text-[11px] text-white/50 leading-snug line-clamp-2">
                {status === 'listening'
                  ? (rec.interim || youText || <span className="text-white/25">Say something…</span>)
                  : youText}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2.5 mt-0.5">
            <button
              onClick={toggleMute}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                muted
                  ? 'bg-white/10 text-white/35'
                  : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.12]'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={handleClose}
              className="px-4 h-8 rounded-full text-[11px] font-semibold text-white/90 bg-rose-500/70 hover:bg-rose-500 transition-colors flex items-center gap-1.5"
            >
              <X size={12} /> End
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
