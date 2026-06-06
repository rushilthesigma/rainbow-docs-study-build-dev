import { useEffect, useState } from 'react';

// Returns the height (px) currently occupied by the on-screen keyboard,
// derived from the VisualViewport API. On desktop (no virtual keyboard)
// and inside the admin Mobile Preview cutout this stays 0, so callers
// can apply it unconditionally without affecting non-touch layouts.
//
// Pin a bottom input bar above the keyboard by adding this value as
// padding-bottom / translateY on its container - it rises as the
// keyboard opens and settles back to 0 when it closes.
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      // Layout viewport minus the visible viewport (and any offset the
      // browser applied when scrolling the focused field into view) is
      // the slice the keyboard is covering.
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setInset(kb > 60 ? Math.round(kb) : 0); // ignore tiny URL-bar deltas
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
