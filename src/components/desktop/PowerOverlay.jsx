import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Power } from 'lucide-react';
import { useUIShell } from '../../context/UIShellContext';
import { RushilAIMark } from './BootScreen';

// Sleep / shut-down overlays — ported from EngOS.
//   • Sleep: dimmed full-bleed lock screen with a live clock. Any click
//     or keypress wakes it.
//   • Off:   "system is off" screen with a round power button that
//     re-runs the boot sequence (sets booted=false, then BootScreen's
//     own timer flips it back).
export default function PowerOverlay() {
  const { power, setPower, setBooted } = useUIShell();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (power !== 'sleep') return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    const wake = () => setPower('on');
    window.addEventListener('mousedown', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('mousedown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [power, setPower]);

  return (
    <AnimatePresence>
      {power === 'sleep' && (
        <motion.div
          key="sleep"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center cursor-pointer select-none"
        >
          <div className="text-white/90 text-7xl font-semibold tabular-nums">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-white/45 text-sm mt-2">
            {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-white/30 text-xs mt-10">Click or press any key to wake</div>
        </motion.div>
      )}

      {power === 'off' && (
        <motion.div
          key="off"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center select-none"
        >
          <RushilAIMark size={56} className="opacity-30" />
          <div className="text-white/40 text-sm mt-6">RushilAI has shut down.</div>
          <button
            onClick={() => {
              // Re-run boot: flip booted off so BootScreen re-mounts,
              // then it flips itself back on its own timer.
              setBooted(false);
              setPower('on');
            }}
            className="mt-8 w-16 h-16 rounded-full border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:border-white/50 hover:bg-white/5 transition-colors"
            title="Power on"
          >
            <Power size={26} />
          </button>
          <div className="text-white/25 text-[11px] mt-4">Press to power on</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
