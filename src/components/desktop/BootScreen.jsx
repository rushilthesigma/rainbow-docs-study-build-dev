import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { useUIShell } from '../../context/UIShellContext';

// First-load boot animation: black background, mark fades + scales in,
// then the whole overlay fades out to reveal the desktop. The dock-slide
// is handled by Dock itself watching `booted` from UIShellContext.
export default function BootScreen() {
  const { setBooted } = useUIShell();

  useEffect(() => {
    const t = window.setTimeout(() => setBooted(true), 1700);
    return () => window.clearTimeout(t);
  }, [setBooted]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 1.35, duration: 0.55, ease: 'easeOut' }}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center pointer-events-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <RushilAIMark size={84} />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-5 text-white/80 text-base tracking-[0.3em] font-medium"
        >
          RUSHIL AI
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="mt-6 w-44 h-1 rounded-full bg-white/[0.08] overflow-hidden"
        >
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ delay: 0.6, duration: 0.9, ease: 'easeOut' }}
            className="h-full bg-white/70 rounded-full"
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// SVG mark — same gear-meets-apple silhouette as the menu-bar logo. Kept
// in this file so BootScreen + PowerOverlay can both import it without
// going through the MenuBar module (which has its own context deps).
export function RushilAIMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`mark-grad-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <g transform="translate(50 50)">
        {[...Array(8)].map((_, i) => (
          <rect
            key={i}
            x={-5}
            y={-44}
            width={10}
            height={14}
            rx={2}
            transform={`rotate(${i * 45})`}
            fill={`url(#mark-grad-${size})`}
          />
        ))}
        <circle r={26} fill={`url(#mark-grad-${size})`} />
        <circle r={10} fill="#0b1020" />
      </g>
    </svg>
  );
}
