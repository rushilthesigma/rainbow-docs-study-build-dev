import { useEffect, useRef } from 'react';

// Module-level guard: when an instance calls `history.back()` itself (to clean
// up its own pushed entry), the resulting popstate must NOT be treated as a
// user pressing Back. This matters under React StrictMode, where the effect
// mounts → cleans up (calling history.back()) → re-mounts and re-adds its
// listener before that programmatic popstate fires - which otherwise made a
// component that mounts already-active (deep links like ?view=flashcards)
// immediately "go back" to its default view. The short TTL means a real Back
// pressed >150ms later is unaffected.
let ignoreNextPopUntil = 0;

// While `active` is true, intercept the browser Back button and run
// `onBack()` instead of navigating away from the SPA.
//
// How it works: when `active` flips to true, we push a throwaway history
// entry. When the user hits Back, popstate fires - we handle it and push
// another entry so the next Back still works. When `active` flips back to
// false (or the component unmounts), we silently consume our own entry.
export default function useBrowserBack(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const pushedRef = useRef(false);
  const handlingRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    // Mark the entry so we only react to our own back.
    const marker = `cov-back-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      window.history.pushState({ covalentBack: marker }, '');
      pushedRef.current = true;
    } catch {}

    function onPop(e) {
      if (handlingRef.current) return;
      // Swallow the popstate caused by our own cleanup history.back() (see note
      // at top) so a deep-linked / already-active mount doesn't snap back.
      // Don't reset the guard here: every active instance receives this same
      // popstate (multiple open windows each register a listener), so the
      // first one consuming the guard would leave the rest treating it as a
      // real Back - which snapped deep-linked windows (QBpedia -> Quiz Bowl)
      // to their default view on mount. The 150ms TTL expires it instead.
      if (Date.now() < ignoreNextPopUntil) return;
      handlingRef.current = true;
      pushedRef.current = false;
      try { onBackRef.current?.(); } catch {}
      // If still active after the callback (parent didn't flip it false),
      // push another entry so future Backs keep working.
      setTimeout(() => {
        handlingRef.current = false;
        if (active) {
          try {
            window.history.pushState({ covalentBack: marker }, '');
            pushedRef.current = true;
          } catch {}
        }
      }, 0);
    }

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // If we pushed an entry and we're unmounting without the user hitting
      // Back, silently go back one entry to keep history clean. Do NOT call
      // onBack - this cleanup happens when the parent already closed the
      // drilled-in view, so we'd loop.
      if (pushedRef.current && !handlingRef.current) {
        handlingRef.current = true;
        ignoreNextPopUntil = Date.now() + 150; // suppress the popstate this triggers
        try { window.history.back(); } catch {}
        setTimeout(() => { handlingRef.current = false; }, 0);
        pushedRef.current = false;
      }
    };
  }, [active]);
}
