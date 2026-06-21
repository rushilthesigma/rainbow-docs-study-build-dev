import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, Mic, Square, Video, AlertCircle } from 'lucide-react';
import VoiceSelect from './VoiceSelect';

// Voice mode launcher in the Study header. Opens a popover with:
//   • Mode A: read answers aloud
//   • Mode B: full hands-free conversation
//   • TTS voice + speed settings
//   • Microphone picker + live level-meter test
//   • Camera picker + live preview test
//   • Dictation language picker

// ── constants ──────────────────────────────────────────────────────────────────

const LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
];

const LANG_KEY = 'covalent.dictation.lang';
const MIC_KEY  = 'covalent.dictation.micDeviceId';
const CAM_KEY  = 'covalent.dictation.camDeviceId';

function readLS(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

function devErrLabel(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permission denied — allow access in your browser.';
  if (n === 'NotFoundError'   || n === 'OverconstrainedError') return 'No matching device found.';
  if (n === 'NotReadableError') return 'Device is in use by another app.';
  return e?.message || 'Could not access the device.';
}


const SPEEDS = [
  { v: 0.85, label: '0.85×' },
  { v: 1,    label: '1×'    },
  { v: 1.15, label: '1.15×' },
  { v: 1.35, label: '1.35×' },
];

const sectionLabel = 'text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wide mb-1';
const selectCls = 'w-full appearance-none px-2 py-1.5 pr-7 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/85 border border-transparent focus:border-blue-400/50 focus:outline-none';
const divider = <div className="my-2.5 border-t border-gray-100 dark:border-white/[0.07]" />;

export default function VoiceMenu({
  voices = [],
  voiceURI,
  onPickVoice,
  rate = 1,
  onRate,
  sttSupported,
  ttsSupported,
  variant = 'overlay',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // ── mic / camera device state ──────────────────────────────────────────────
  const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const [dictLang,   setDictLang]   = useState(() => readLS(LANG_KEY, 'en-US'));
  const [micDeviceId, setMicDevId]  = useState(() => readLS(MIC_KEY, ''));
  const [camDeviceId, setCamDevId]  = useState(() => readLS(CAM_KEY, ''));
  const [mics, setMics] = useState([]);
  const [cams, setCams] = useState([]);
  const [testingMic, setTestingMic] = useState(false);
  const [testingCam, setTestingCam] = useState(false);
  const [micError,   setMicError]   = useState('');
  const [camError,   setCamError]   = useState('');

  const micStreamRef = useRef(null);
  const camStreamRef = useRef(null);
  const audioCtxRef  = useRef(null);
  const rafRef       = useRef(0);
  const meterRef     = useRef(null);
  const videoRef     = useRef(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMics(list.filter((d) => d.kind === 'audioinput'));
      setCams(list.filter((d) => d.kind === 'videoinput'));
    } catch {}
  }, []);

  const stopMicTest = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (meterRef.current) meterRef.current.style.width = '0%';
    setTestingMic(false);
  }, []);

  const startMicTest = useCallback(async () => {
    stopMicTest();
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      });
      micStreamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        const level = Math.min(1, rms * 3.2);
        if (meterRef.current) meterRef.current.style.width = `${Math.round(level * 100)}%`;
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      setTestingMic(true);
      refreshDevices();
    } catch (e) {
      setMicError(devErrLabel(e));
      setTestingMic(false);
    }
  }, [micDeviceId, refreshDevices, stopMicTest]);

  const stopCamTest = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTestingCam(false);
  }, []);

  const startCamTest = useCallback(async () => {
    stopCamTest();
    setCamError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camDeviceId ? { deviceId: { exact: camDeviceId } } : true,
      });
      camStreamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play?.().catch(() => {}); }
      setTestingCam(true);
      refreshDevices();
    } catch (e) {
      setCamError(devErrLabel(e));
      setTestingCam(false);
    }
  }, [camDeviceId, refreshDevices, stopCamTest]);

  useEffect(() => { if (testingMic) startMicTest(); }, [micDeviceId]); // eslint-disable-line
  useEffect(() => { if (testingCam) startCamTest(); }, [camDeviceId]); // eslint-disable-line

  function pickLang(v)  { setDictLang(v);   writeLS(LANG_KEY, v); }
  function pickMic(v)   { setMicDevId(v);   writeLS(MIC_KEY, v); }
  function pickCam(v)   { setCamDevId(v);   writeLS(CAM_KEY, v); }

  // ── popover positioning ────────────────────────────────────────────────────
  const WIDTH = 300;
  function place() {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    setPos({
      left: Math.max(8, Math.min(b.right - WIDTH, window.innerWidth - WIDTH - 8)),
      bottom: window.innerHeight - b.top + 6,
    });
  }
  function toggle() { if (!open) { place(); refreshDevices(); } setOpen((o) => !o); }

  useEffect(() => {
    if (!open) { stopMicTest(); stopCamTest(); return; }
    function onDoc(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function reposition() { place(); }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, stopMicTest, stopCamTest]);

  useEffect(() => () => { stopMicTest(); stopCamTest(); }, [stopMicTest, stopCamTest]);

  // ── voice picker options ───────────────────────────────────────────────────
  const sorted = [...voices].sort((a, b) => {
    const ae = /^en/i.test(a.lang) ? 0 : 1;
    const be = /^en/i.test(b.lang) ? 0 : 1;
    return ae - be || a.name.localeCompare(b.name);
  });
  const voiceOptions = [
    { value: '', label: 'Browser default' },
    ...sorted.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` })),
  ];

  const triggerTone = variant === 'surface'
    ? (open
        ? 'text-white bg-blue-500/30 ring-1 ring-blue-400/50'
        : 'text-gray-400 dark:text-blue-200/55 hover:text-gray-700 dark:hover:text-blue-100 hover:bg-white/40 dark:hover:bg-blue-500/[0.12]')
    : (open
        ? 'text-white bg-white/20'
        : 'text-white/70 hover:text-white hover:bg-white/[0.15]');

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Voice mode (beta)"
        className={`relative p-1.5 rounded-lg transition-colors ${triggerTone}`}
      >
        <Settings2 size={14} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: WIDTH, zIndex: 9999, maxHeight: 'calc(100vh - 80px)' }}
          className="rounded-xl border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[#1b1b1f] shadow-2xl p-2 animate-fade-in overflow-y-auto"
        >
          <div className="flex items-center gap-2 px-1.5 pt-1 pb-2">
            <span className="text-[12px] font-bold text-gray-900 dark:text-white">Voice mode</span>
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide bg-gray-200 text-gray-600 ring-1 ring-black/[0.06] dark:bg-zinc-700 dark:text-zinc-200 dark:ring-white/10">BETA</span>
          </div>

          {!ttsSupported && !sttSupported ? (
            <p className="px-1.5 pb-2 text-[11px] text-gray-500 dark:text-white/50 leading-relaxed">
              Your browser doesn&rsquo;t support the Web Speech API. Try the latest Chrome or Edge on desktop.
            </p>
          ) : (
            <>
              {divider}

              {/* Speed */}
              <div className="px-1.5">
                <p className={sectionLabel}>Speed</p>
                <div className="flex gap-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => onRate(s.v)}
                      className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        Math.abs(rate - s.v) < 0.001
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60 hover:bg-gray-200 dark:hover:bg-white/[0.1]'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice */}
              {sorted.length > 0 && (
                <div className="px-1.5 pt-2">
                  <p className={sectionLabel}>Voice</p>
                  <VoiceSelect
                    value={voiceURI || ''}
                    options={voiceOptions}
                    onChange={(v) => onPickVoice(v || null)}
                  />
                </div>
              )}

              {divider}

              {/* Microphone */}
              {hasMedia && sttSupported && (
                <div className="px-1.5">
                  <p className={sectionLabel}>Microphone</p>
                  <div className="relative mb-2">
                    <select value={micDeviceId || ''} onChange={(e) => pickMic(e.target.value)} className={selectCls}>
                      <option value="">System default</option>
                      {mics.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/40 text-[9px]">▼</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => (testingMic ? stopMicTest() : startMicTest())}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors shrink-0 ${
                        testingMic
                          ? 'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/30'
                          : 'bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/[0.14]'
                      }`}
                    >
                      {testingMic ? <Square size={11} /> : <Mic size={11} />}
                      {testingMic ? 'Stop' : 'Test mic'}
                    </button>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                      <div ref={meterRef} className="h-full w-0 bg-pink-500 transition-[width] duration-75" />
                    </div>
                  </div>
                  {micError && (
                    <p className="flex items-start gap-1 mt-1 text-[10px] text-rose-500 dark:text-rose-400">
                      <AlertCircle size={11} className="mt-px shrink-0" /> {micError}
                    </p>
                  )}
                </div>
              )}

              {hasMedia && <div className="my-2.5 border-t border-gray-100 dark:border-white/[0.07]" />}

              {/* Camera */}
              {hasMedia && (
                <div className="px-1.5">
                  <p className={sectionLabel}>Camera</p>
                  <div className="mb-2">
                    <VoiceSelect
                      value={camDeviceId || ''}
                      options={[
                        { value: '', label: 'System default' },
                        ...cams.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` })),
                      ]}
                      onChange={pickCam}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => (testingCam ? stopCamTest() : startCamTest())}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                      testingCam
                        ? 'bg-pink-500/15 text-pink-400 ring-1 ring-pink-500/30'
                        : 'bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/[0.14]'
                    }`}
                  >
                    {testingCam ? <Square size={11} /> : <Video size={11} />}
                    {testingCam ? 'Stop camera' : 'Test camera'}
                  </button>
                  <div className={`mt-2 rounded-lg overflow-hidden bg-gray-900/40 dark:bg-black/80 aspect-video ${testingCam ? 'block' : 'hidden'}`}>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                  </div>
                  {camError && (
                    <p className="flex items-start gap-1 mt-1 text-[10px] text-rose-500 dark:text-rose-400">
                      <AlertCircle size={11} className="mt-px shrink-0" /> {camError}
                    </p>
                  )}
                </div>
              )}

              {/* Dictation language */}
              {sttSupported && (
                <>
                  {divider}
                  <div className="px-1.5 pb-1">
                    <p className={sectionLabel}>Dictation language</p>
                    <VoiceSelect
                      value={dictLang}
                      options={LANGS.map((l) => ({ value: l.code, label: l.label }))}
                      onChange={pickLang}
                    />
                    <p className="mt-1.5 text-[10px] leading-snug text-gray-400 dark:text-white/40">
                      Dictation listens on your system&rsquo;s default microphone. The picker above tests your input devices.
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
