import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCw, Wifi, BatteryFull, Signal, Shield, ExternalLink } from 'lucide-react';
import { checkAdmin } from '../../api/admin';
import LoadingSpinner from '../shared/LoadingSpinner';

// Standalone admin-only "Mobile Preview" app — an iframe of the
// actual site sized to a phone viewport. Because the iframe's
// `window.innerWidth` is ~375px, the same App.jsx breakpoint
// (`MOBILE_BREAKPOINT = 768`) that drives real phone visitors flips
// the iframe to MobileShell automatically. So this IS the mobile
// site, not a re-mount of MobileShell. Same routing, same auth,
// same APIs, same everything.
//
// Window sizing is locked at 380×870 by the WindowManager `fixedSize`
// flag for `mobilepreview` — no resize, no maximize.
//
// Three-layer admin gate:
//   1. appRegistry `adminOnly: true`
//   2. Spotlight + Dock filter by checkAdmin
//   3. This component itself refuses to render for non-admins
export default function MobilePreview() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef(null);

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

  // Same-origin iframe of the real site. The iframe inherits
  // localStorage (auth token, theme), so the admin sees their own
  // session in mobile mode.
  const src = `${window.location.origin}/?mobilepreview=1`;

  function reload() {
    setReloadKey((k) => k + 1); // remount the iframe — fastest path
  }

  function openInTab() {
    window.open(src, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="h-full w-full flex flex-col bg-black">
      <DevToolbar onReload={reload} onOpenInTab={openInTab} />
      {/* The phone screen — black bg behind status bar, then the live
          iframe of the real site at phone width. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <MockStatusBar />
        <iframe
          ref={iframeRef}
          key={reloadKey}
          src={src}
          title="Mobile site preview"
          className="absolute inset-0 w-full h-full pt-[26px] bg-white dark:bg-[#0a0a14] border-0"
          // sandbox is intentionally NOT restricted — we want full
          // same-origin access so the iframe can hit the real APIs
          // and share the auth token via localStorage.
          allow="clipboard-write *;"
        />
      </div>
    </div>
  );
}

// ===== Dev toolbar =====
function DevToolbar({ onReload, onOpenInTab }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[#0a0a14] border-b border-white/[0.08] flex-shrink-0">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/60 px-1.5">Mobile site</span>
      <span className="ml-auto inline-flex items-center gap-1">
        <ToolbarButton onClick={onReload} title="Reload the iframe">
          <RotateCw size={11} /> Reload
        </ToolbarButton>
        <ToolbarButton onClick={onOpenInTab} title="Open the mobile preview URL in a new tab">
          <ExternalLink size={11} /> Open
        </ToolbarButton>
      </span>
      <span className="ml-2 text-[10px] font-mono text-white/40 tabular-nums tracking-tight">
        375×812
      </span>
    </div>
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
function MockStatusBar() {
  const [now, setNow] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setNow(formatTime(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="absolute top-0 left-0 right-0 h-[26px] z-50 px-5 flex items-center justify-between text-[12px] font-semibold tracking-tight text-gray-900 dark:text-white pointer-events-none select-none bg-white dark:bg-[#0a0a14]">
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
