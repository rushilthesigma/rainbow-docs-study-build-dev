import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Home, Moon, Sun, RotateCw, Wifi, BatteryFull, Signal, Shield, Smartphone, LayoutDashboard } from 'lucide-react';
import MobileShell from '../mobile/MobileShell';
import MobileLanding from '../mobile/MobileLanding';
import { checkAdmin } from '../../api/admin';
import LoadingSpinner from '../shared/LoadingSpinner';

// Standalone admin-only "Mobile Preview" app.
//
// Window sizing: locked at 380×870 by the WindowManager `fixedSize`
// flag for `mobilepreview`. The window IS the phone — content area
// inside is roughly 375 × 810 once you subtract title bar + dev
// toolbar + mock status bar.
//
// Layout (top → bottom):
//   1. Dev toolbar       — Back / Home / Theme / Reset / 375×812 readout
//   2. Mock status bar   — time + carrier + wifi + battery
//   3. <MobileShell>     — the actual mobile UI
//
// Admin gate: render is blocked for non-admins. The dock + spotlight
// already filter by `adminOnly`, but this is the in-component last
// line of defense in case someone calls `openApp('mobilepreview')`
// directly.
export default function MobilePreview() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [innerDark, setInnerDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  // Which surface is shown inside the cutout: signed-in `app` (the
  // full MobileShell) or signed-out `landing` (the marketing page).
  const [surface, setSurface] = useState('app'); // 'app' | 'landing'
  const shellRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    checkAdmin()
      .then((d) => { if (!cancelled) setIsAdmin(!!d.isAdmin); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);

  if (isAdmin === null) {
    return <div className="h-full w-full grid place-items-center bg-black"><LoadingSpinner size={20} /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <Shield size={32} className="text-rose-400 mb-3" />
        <p className="text-sm font-bold">Admin access required</p>
        <p className="text-[11px] text-white/60 mt-1">Mobile Preview is a developer-only tool.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-black">
      <DevToolbar
        surface={surface}
        onSetSurface={setSurface}
        innerDark={innerDark}
        onToggleTheme={() => setInnerDark((v) => !v)}
        onReset={() => setResetKey((k) => k + 1)}
        onBack={() => shellRef.current?.goBack()}
        onHome={() => shellRef.current?.goHome()}
      />
      {/* The phone screen — black bg behind status bar, then either
          the live shell or the marketing landing page. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <MockStatusBar />
        <div className="absolute inset-0 pt-[26px]">
          <div className={`h-full w-full ${innerDark ? 'dark' : ''}`}>
            {surface === 'landing'
              ? <MobileLanding key={`landing-${resetKey}`} onSignIn={() => setSurface('app')} />
              : <MobileShell key={`app-${resetKey}`} ref={shellRef} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Dev toolbar =====
//
// Slim 36px row that sits ABOVE the simulated phone screen. Drives
// the inner shell via the imperative ref (back/home) and owns
// preview-only state (theme + reset).
function DevToolbar({ surface, onSetSurface, innerDark, onToggleTheme, onReset, onBack, onHome }) {
  const inApp = surface === 'app';
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[#0a0a14] border-b border-white/[0.08] flex-shrink-0 flex-wrap">
      {/* Surface picker — App (signed-in) vs Landing (signed-out) */}
      <div className="inline-flex rounded-md bg-white/[0.04] p-0.5">
        <ToolbarToggle active={inApp}  onClick={() => onSetSurface('app')}     icon={<Smartphone size={11} />}      label="App" />
        <ToolbarToggle active={!inApp} onClick={() => onSetSurface('landing')} icon={<LayoutDashboard size={11} />} label="Landing" />
      </div>

      <span className="mx-1 h-3 w-px bg-white/10" />

      {/* Shell-only navigation controls. Hidden on the landing surface. */}
      {inApp && (
        <>
          <ToolbarButton onClick={onBack} title="Back inside the mobile shell">
            <ArrowLeft size={11} /> Back
          </ToolbarButton>
          <ToolbarButton onClick={onHome} title="Jump to Home tab">
            <Home size={11} /> Home
          </ToolbarButton>
          <span className="mx-1 h-3 w-px bg-white/10" />
        </>
      )}

      <ToolbarButton onClick={onToggleTheme} title="Toggle preview theme">
        {innerDark ? <Sun size={11} /> : <Moon size={11} />}
        {innerDark ? 'Light' : 'Dark'}
      </ToolbarButton>
      <ToolbarButton onClick={onReset} title="Reload preview from scratch">
        <RotateCw size={11} /> Reset
      </ToolbarButton>

      <span className="ml-auto text-[10px] font-mono text-white/40 tabular-nums tracking-tight">
        375×812
      </span>
    </div>
  );
}

function ToolbarToggle({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10.5px] font-semibold tracking-tight transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-white/60 hover:text-white'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ToolbarButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] text-white/80 hover:bg-white/[0.10] hover:text-white text-[10.5px] font-semibold tracking-tight transition-colors"
    >
      {children}
    </button>
  );
}

// ===== Mock iOS status bar =====
//
// 26px-tall overlay drawn on top of the mobile shell. The `pt-[26px]`
// on the parent pushes MobileShell down so its own header isn't
// covered. Time updates every minute, the rest are static fakes.
function MockStatusBar() {
  const [now, setNow] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNow(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute top-0 left-0 right-0 h-[26px] z-50 px-5 flex items-center justify-between text-[12px] font-semibold tracking-tight text-gray-900 dark:text-white pointer-events-none select-none">
      <span className="font-mono tabular-nums">{now}</span>
      <div className="flex items-center gap-1.5">
        <Signal size={11} strokeWidth={2.4} />
        <Wifi size={11} strokeWidth={2.4} />
        <BatteryFull size={14} strokeWidth={2.2} />
      </div>
    </div>
  );
}

function formatTime(d) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}
