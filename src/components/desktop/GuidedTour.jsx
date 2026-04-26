import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, X, GraduationCap, Sparkles } from 'lucide-react';

// Guided product tour. Anchors a spotlight + tooltip to a real DOM
// element identified by a CSS selector. Each step's `target` element is
// looked up every animation frame so the spotlight tracks layout changes.
//
// Steps progress when:
//   - the user clicks the highlighted target (advanceOn === 'click'), OR
//   - the user clicks "Next" / "Finish" in the tooltip (advanceOn === 'next' / 'finish'), OR
//   - the user opens the right window (auto-advance from icon→app step).
//
// While a step is waiting for a target that hasn't appeared yet (e.g. the
// catalog is still fetching), the tooltip stays in the center of the screen
// without a spotlight. As soon as the target shows up, we scroll it into
// view and snap the spotlight + tooltip onto it.

const STEPS = [
  {
    id: 'curricula-icon',
    target: '[data-tour="curricula-icon"]',
    title: 'Open Curricula',
    body: 'Click the Curricula icon to open it. This is where every course lives.',
    advanceOn: 'click',
  },
  {
    id: 'new-button',
    target: '[data-tour="new-curriculum-button"]',
    title: 'Make a new curriculum',
    body: 'Click "+ New". The AI builds a full course — units, lessons, assessments — from any topic you give it.',
    advanceOn: 'click',
  },
  {
    id: 'topic-input',
    target: '[data-tour="curriculum-topic-input"]',
    title: 'Pick a topic',
    body: 'Type anything you want to learn — "Cellular biology", "WWII Pacific theatre", "Python for data analysis", whatever. Then hit Next.',
    advanceOn: 'next',
  },
  {
    id: 'generate-button',
    target: '[data-tour="curriculum-generate-button"]',
    title: 'Generate the curriculum',
    body: 'Click Generate. Takes 20-40 seconds — the AI builds your full unit + lesson tree. After it lands, open any lesson and the AI tutor takes over.',
    advanceOn: 'click',
  },
  {
    id: 'wrap-up',
    target: null,
    title: "You're set",
    body: 'Curriculum is generating. Once it\'s done, open any lesson and the AI tutor will drive it — built-in quizzes, escalating practice, XP per lesson. Replay this tour anytime from Settings.',
    advanceOn: 'finish',
    placement: 'center',
  },
];

const STORAGE_KEY = 'cov-tour-step';

export default function GuidedTour() {
  const [stepIdx, setStepIdx] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw == null ? -1 : Math.max(0, Math.min(STEPS.length - 1, parseInt(raw, 10) || 0));
  });
  const [rect, setRect] = useState(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const tipRef = useRef(null);

  const step = stepIdx >= 0 ? STEPS[stepIdx] : null;
  const isWaiting = step && step.target && !rect;

  const advance = useCallback(() => {
    setRect(null);
    setHasScrolled(false);
    setStepIdx(prev => {
      const next = prev + 1;
      if (next >= STEPS.length) {
        localStorage.removeItem(STORAGE_KEY);
        return -1;
      }
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const skip = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStepIdx(-1);
    setRect(null);
  }, []);

  // Note: we used to auto-advance from the first step when the Curricula
  // app window opened, but that fired in addition to the click-handler
  // advance below — the click already queued an advance, then the
  // window-state effect fired a SECOND advance, jumping past the next
  // step entirely. Now we rely solely on the click handler. If the user
  // opens Curricula without clicking the highlighted icon (e.g. via
  // Spotlight), they can hit "Skip" or just click their way through.

  // RAF loop: track the target's bounding rect every frame. Scroll the
  // target into view ONCE when first found (so the user sees what we're
  // pointing at without manually scrolling).
  useEffect(() => {
    if (!step) { setRect(null); return; }
    if (!step.target) { setRect(null); return; }

    let raf;
    const tick = () => {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) {
          // First sighting — scroll into view politely.
          if (!hasScrolled) {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch {}
            setHasScrolled(true);
          }
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        } else {
          setRect(null);
        }
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [step, hasScrolled]);

  // Click on the highlighted target advances. Capture phase so we see the
  // event before it triggers the underlying handler — but we let the click
  // propagate (no preventDefault) so the actual UI action still fires.
  useEffect(() => {
    if (!step || step.advanceOn !== 'click') return;
    function handler(e) {
      const tgt = document.querySelector(step.target);
      if (!tgt) return;
      if (tgt === e.target || tgt.contains(e.target)) {
        // Wait a beat for the resulting UI change before advancing.
        setTimeout(advance, 80);
      }
    }
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [step, advance]);

  // ESC = skip
  useEffect(() => {
    if (!step) return;
    function handler(e) { if (e.key === 'Escape') skip(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, skip]);

  if (!step) return null;

  const tipWidth = 320;
  const tipHeight = 160;
  const margin = 14;
  const vw = window.innerWidth, vh = window.innerHeight;

  // Tooltip position. Center if no target rect, else try below/above/right/left.
  let tipStyle = {};
  if (step.placement === 'center' || !rect) {
    tipStyle = { top: vh / 2 - tipHeight / 2, left: vw / 2 - tipWidth / 2 };
  } else {
    const fitsBelow = rect.top + rect.height + margin + tipHeight < vh - 8;
    const fitsAbove = rect.top - margin - tipHeight > 8;
    const fitsRight = rect.left + rect.width + margin + tipWidth < vw - 8;
    if (fitsBelow) {
      tipStyle = {
        top: rect.top + rect.height + margin,
        left: Math.min(Math.max(8, rect.left + rect.width / 2 - tipWidth / 2), vw - tipWidth - 8),
      };
    } else if (fitsAbove) {
      tipStyle = {
        top: rect.top - margin - tipHeight,
        left: Math.min(Math.max(8, rect.left + rect.width / 2 - tipWidth / 2), vw - tipWidth - 8),
      };
    } else if (fitsRight) {
      tipStyle = {
        top: Math.min(Math.max(8, rect.top + rect.height / 2 - tipHeight / 2), vh - tipHeight - 8),
        left: rect.left + rect.width + margin,
      };
    } else {
      tipStyle = {
        top: Math.min(Math.max(8, rect.top + rect.height / 2 - tipHeight / 2), vh - tipHeight - 8),
        left: Math.max(8, rect.left - margin - tipWidth),
      };
    }
  }

  const spotlightPad = 8;
  const radius = 12;
  const showHole = !!rect && step.placement !== 'center';
  const title = isWaiting && step.waitingTitle ? step.waitingTitle : step.title;
  const body = isWaiting && step.waitingBody ? step.waitingBody : step.body;

  return (
    <div className="fixed inset-0 z-[3500] pointer-events-none">
      {/* Dim mask with hole */}
      <svg width={vw} height={vh} className="absolute inset-0">
        <defs>
          <mask id="tour-mask">
            <rect width={vw} height={vh} fill="white" />
            {showHole && (
              <rect
                x={rect.left - spotlightPad}
                y={rect.top - spotlightPad}
                width={rect.width + spotlightPad * 2}
                height={rect.height + spotlightPad * 2}
                rx={radius} ry={radius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width={vw} height={vh} fill="rgba(5, 8, 22, 0.55)" mask="url(#tour-mask)" />
      </svg>

      {/* Pulsing ring around the target */}
      {showHole && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: rect.top - spotlightPad,
            left: rect.left - spotlightPad,
            width: rect.width + spotlightPad * 2,
            height: rect.height + spotlightPad * 2,
            borderRadius: radius,
            boxShadow: '0 0 0 2px rgba(96, 165, 250, 0.85), 0 0 28px 6px rgba(59, 130, 246, 0.5)',
            animation: 'tour-pulse 1.6s ease-in-out infinite',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tipRef}
        className="absolute pointer-events-auto rounded-xl shadow-2xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] p-4"
        style={{ ...tipStyle, width: tipWidth }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className={isWaiting ? 'text-amber-500 animate-pulse' : 'text-blue-500'} />
            <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isWaiting ? 'text-amber-500' : 'text-blue-500'}`}>
              {isWaiting ? 'Loading' : `Tour · ${stepIdx + 1} of ${STEPS.length}`}
            </span>
          </div>
          <button onClick={skip} title="Skip tour (Esc)" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 -m-1 p-1">
            <X size={13} />
          </button>
        </div>
        <h3 className="text-[14px] font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-[12px] text-gray-600 dark:text-gray-300 leading-snug mb-3">{body}</p>
        <div className="flex items-center justify-between">
          <button onClick={skip} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Skip tour
          </button>
          {step.advanceOn === 'click' ? (
            <span className={`text-[11px] italic ${isWaiting ? 'text-gray-400' : 'text-blue-500'}`}>
              {isWaiting ? 'Waiting…' : 'Click the highlighted item →'}
            </span>
          ) : step.advanceOn === 'finish' ? (
            <button onClick={advance} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold">
              <GraduationCap size={12} /> Finish
            </button>
          ) : (
            <button onClick={advance} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold">
              Next <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.85), 0 0 28px 6px rgba(59, 130, 246, 0.5); }
          50%       { box-shadow: 0 0 0 3px rgba(96, 165, 250, 1.0), 0 0 40px 9px rgba(59, 130, 246, 0.7); }
        }
      `}</style>
    </div>
  );
}
