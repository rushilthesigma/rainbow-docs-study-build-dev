import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

// Modal that lists every keyboard shortcut. Triggered by ⌘/Ctrl+/.
// Shortcuts that are active GLOBALLY (work from anywhere on the desktop)
// are listed first; in-app ones are grouped after.

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS = [
  {
    title: 'Desktop',
    items: [
      { keys: [MOD, 'K'],         desc: 'Open Spotlight (search apps + actions)' },
      { keys: [MOD, '/'],         desc: 'Show this shortcuts list' },
      { keys: [MOD, 'W'],         desc: 'Close the active window' },
      { keys: [MOD, 'M'],         desc: 'Minimize the active window' },
      { keys: [MOD, '1', '–', '9'], desc: 'Switch to the Nth open window' },
      { keys: ['Esc'],            desc: 'Close any open modal / overlay' },
    ],
  },
  {
    title: 'Chat',
    items: [
      { keys: ['Enter'],            desc: 'Send the message' },
      { keys: ['Shift', 'Enter'],   desc: 'New line in the message' },
      { keys: [MOD, 'Shift', 'A'],  desc: 'Toggle Source mode (web-cited replies)' },
    ],
  },
  {
    title: 'Quiz Bowl',
    items: [
      { keys: ['Space'],          desc: 'Buzz in (when a question is reading)' },
      { keys: ['Enter'],          desc: 'Submit your answer (after buzzing)' },
    ],
  },
];

export default function ShortcutsHelp({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[3200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#161622] border border-gray-200 dark:border-[#2A2A40] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200 dark:border-[#2A2A40]">
          <Keyboard size={16} className="text-blue-500" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Keyboard shortcuts</h2>
          <span className="text-[10px] text-gray-400 ml-1 tabular-nums">{MOD}+/</span>
          <span className="flex-1" />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 -m-1 p-1">
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {GROUPS.map((g, gi) => (
            <div key={g.title} className={gi > 0 ? 'mt-5' : ''}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 mb-2">{g.title}</p>
              <ul className="space-y-1.5">
                {g.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {it.keys.map((k, ki) => (
                        <Kbd key={ki} char={k} />
                      ))}
                    </div>
                    <span className="text-[12px] text-gray-700 dark:text-gray-200 leading-snug">{it.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kbd({ char }) {
  if (char === '–') return <span className="text-gray-400 text-[11px]">–</span>;
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-gray-300 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-[11px] font-mono font-semibold text-gray-700 dark:text-gray-200 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
      {char}
    </kbd>
  );
}
