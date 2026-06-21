import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Video, Square, AlertCircle } from 'lucide-react';
import VoiceSelect from './VoiceSelect';

// Settings + hardware test for dictation. Opens from the gear next to the
// composer mic. Lets the user:
//   • pick which microphone / camera to test
//   • test the mic with a live input-level meter
//   • test the camera with a live preview
//   • choose the dictation language
//
// Note on devices: the Web Speech API (used for dictation) always listens on
// the OS default microphone — there is no API to point it at a specific
// device. The mic picker here drives the *test* meter so the user can confirm
// their input is working; the footnote says so plainly.

// A short, practical set of dictation languages. value is a BCP-47 tag the
// SpeechRecognition engine understands.
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

const CAM_KEY = 'covalent.dictation.camDeviceId';

function errLabel(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Permission denied — allow access in your browser.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No matching device found.';
  if (n === 'NotReadableError') return 'Device is in use by another app.';
  return e?.message || 'Could not access the device.';
}

export default function MicSettingsPopover({
  open,
  onClose,
  anchorRef,
  lang,
  onLang,
  micDeviceId,
  onMicDevice,
}) {
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  const [mics, setMics] = useState([]);
  const [cams, setCams] = useState([]);
  const [camDeviceId, setCamDeviceId] = useState(() => {
    try { return localStorage.getItem(CAM_KEY) || ''; } catch { return ''; }
  });

  const [testingMic, setTestingMic] = useState(false);
  const [testingCam, setTestingCam] = useState(false);
  const [micError, setMicError] = useState('');
  const [camError, setCamError] = useState('');

  const micStreamRef = useRef(null);
  const camStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(0);
  const meterRef = useRef(null);
  const videoRef = useRef(null);

  const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // ---- positioning: grow upward from the gear (composer sits at the bottom) ----
  const WIDTH = 300;
  const place = useCallback(() => {
    const b = anchorRef?.current?.getBoundingClientRect();
    if (!b) return;
    setPos({
      left: Math.max(8, Math.min(b.left + b.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8)),
      bottom: Math.max(8, window.innerHeight - b.top + 6),
    });
  }, [anchorRef]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMics(list.filter((d) => d.kind === 'audioinput'));
      setCams(list.filter((d) => d.kind === 'videoinput'));
    } catch { /* ignore */ }
  }, []);

  // ---- mic test (live level meter via Web Audio AnalyserNode) ----
  const stopMicTest = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
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
        const level = Math.min(1, rms * 3.2); // scale so normal speech fills the bar
        if (meterRef.current) meterRef.current.style.width = `${Math.round(level * 100)}%`;
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
      setTestingMic(true);
      refreshDevices(); // labels become available once permission is granted
    } catch (e) {
      setMicError(errLabel(e));
      setTestingMic(false);
    }
  }, [micDeviceId, refreshDevices, stopMicTest]);

  // ---- camera test (live preview) ----
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play?.().catch(() => {});
      }
      setTestingCam(true);
      refreshDevices();
    } catch (e) {
      setCamError(errLabel(e));
      setTestingCam(false);
    }
  }, [camDeviceId, refreshDevices, stopCamTest]);

  // Restart an active test when its device selection changes.
  useEffect(() => { if (testingMic) startMicTest(); /* eslint-disable-next-line */ }, [micDeviceId]);
  useEffect(() => { if (testingCam) startCamTest(); /* eslint-disable-next-line */ }, [camDeviceId]);

  function pickCam(v) {
    setCamDeviceId(v);
    try { localStorage.setItem(CAM_KEY, v); } catch { /* ignore */ }
  }

  // Open / close lifecycle: position, list devices, wire outside-click, and
  // always release the camera/mic when the popover closes or unmounts.
  useEffect(() => {
    if (!open) { stopMicTest(); stopCamTest(); return; }
    place();
    refreshDevices();
    function onDoc(e) {
      if (anchorRef?.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      onClose?.();
    }
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place, refreshDevices, onClose, anchorRef, stopMicTest, stopCamTest]);

  // Final safety net: stop everything if the component unmounts mid-test.
  useEffect(() => () => { stopMicTest(); stopCamTest(); }, [stopMicTest, stopCamTest]);

  if (!open || !pos) return null;

  const selectClass = 'w-full appearance-none px-2 py-1.5 pr-7 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/85 border border-transparent focus:border-blue-400/50 focus:outline-none';
  const sectionLabel = 'text-[10px] font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wide mb-1';

  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, width: WIDTH, zIndex: 9999 }}
      className="rounded-xl border border-gray-200 dark:border-white/[0.12] bg-white dark:bg-[#1b1b1f] shadow-2xl p-3 animate-fade-in"
    >
      <div className="flex items-center gap-2 px-0.5 pb-2">
        <span className="text-[12px] font-bold text-gray-900 dark:text-white">Microphone &amp; camera</span>
      </div>

      {!hasMedia && (
        <p className="px-0.5 pb-2 text-[11px] text-gray-500 dark:text-white/50 leading-relaxed">
          Your browser can&rsquo;t access audio or video devices here.
        </p>
      )}

      {hasMedia && (
        <>
          {/* MICROPHONE */}
          <div className="px-0.5">
            <p className={sectionLabel}>Microphone</p>
            <div className="relative mb-2">
              <select value={micDeviceId || ''} onChange={(e) => onMicDevice?.(e.target.value)} className={selectClass}>
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
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gray-100 dark:bg-white/[0.08] text-gray-700 dark:text-white/80 hover:bg-gray-200 dark:hover:bg-white/[0.14]'
                }`}
              >
                {testingMic ? <Square size={11} /> : <Mic size={11} />}
                {testingMic ? 'Stop' : 'Test mic'}
              </button>
              {/* live input-level meter */}
              <div className="flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <div ref={meterRef} className="h-full w-0 bg-emerald-500 transition-[width] duration-75" />
              </div>
            </div>
            {micError && (
              <p className="flex items-start gap-1 mt-1 text-[10px] text-rose-500 dark:text-rose-400">
                <AlertCircle size={11} className="mt-px shrink-0" /> {micError}
              </p>
            )}
          </div>

          <div className="my-2.5 border-t border-gray-100 dark:border-white/[0.07]" />

          {/* CAMERA */}
          <div className="px-0.5">
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
                  ? 'bg-red-500 hover:bg-red-600 text-white'
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

          <div className="my-2.5 border-t border-gray-100 dark:border-white/[0.07]" />

          {/* DICTATION LANGUAGE */}
          <div className="px-0.5">
            <p className={sectionLabel}>Dictation language</p>
            <VoiceSelect
              value={lang}
              options={LANGS.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(v) => onLang?.(v)}
            />
            <p className="mt-2 text-[10px] leading-snug text-gray-400 dark:text-white/40">
              Dictation listens on your system&rsquo;s default microphone. The picker above tests your input devices.
            </p>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
