import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { Z, ToastDuration } from '../../styles/tokens';

// Toast system - replaces silent `catch {}` and ad-hoc inline error
// messages. Mount <ToastProvider> once at the app root, then call
// `useToast()` from any component:
//
//   const toast = useToast();
//   toast.error('Failed to upload file');
//   toast.success('Saved');
//
// Tokens kept consistent with the rest of the design language (dark
// glass surfaces, 12.5px text, blue accent).

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast) => {
      const id = nextId++;
      const duration = toast.duration ?? ToastDuration.base;
      setToasts((list) => [...list, { id, ...toast }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  // Cleanup any pending timers if the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const api = useMemo(
    () => ({
      show: (message, opts = {}) => push({ message, variant: 'info', ...opts }),
      info: (message, opts = {}) => push({ message, variant: 'info', ...opts }),
      success: (message, opts = {}) => push({ message, variant: 'success', ...opts }),
      error: (message, opts = {}) => push({ message, variant: 'error', duration: ToastDuration.long, ...opts }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft fallback so a missing provider doesn't crash callers -
    // log instead and noop visibly. Should never happen in app code.
    return {
      show: (m) => console.warn('[toast:no-provider]', m),
      info: (m) => console.warn('[toast:no-provider]', m),
      success: (m) => console.warn('[toast:no-provider]', m),
      error: (m) => console.warn('[toast:no-provider]', m),
      dismiss: () => {},
    };
  }
  return ctx;
}

// Toast surfaces need solid theme-aware backgrounds - the previous
// `bg-white/[0.08]` was invisible against a light wallpaper. Each variant
// uses a tinted but solid surface in both modes so toasts always pop.
const variantStyles = {
  info: {
    border: 'border-gray-200 dark:border-white/[0.12]',
    bg: 'bg-white/95 dark:bg-[#1a1a26]/95',
    icon: <Info size={14} className="text-blue-500 dark:text-blue-300/90" />,
  },
  success: {
    border: 'border-emerald-300 dark:border-emerald-400/25',
    bg: 'bg-emerald-50/95 dark:bg-emerald-500/[0.08]',
    icon: <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-300/90" />,
  },
  error: {
    border: 'border-rose-300 dark:border-rose-400/25',
    bg: 'bg-rose-50/95 dark:bg-rose-500/[0.08]',
    icon: <AlertCircle size={14} className="text-rose-600 dark:text-rose-300/90" />,
  },
};

function ToastViewport({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-3 right-3 flex flex-col gap-2 pointer-events-none"
      style={{ zIndex: Z.toast }}
    >
      {toasts.map((t) => {
        const v = variantStyles[t.variant] || variantStyles.info;
        return (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 min-w-[240px] max-w-sm px-3 py-2 rounded-xl backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] border ${v.border} ${v.bg} text-[12.5px] text-gray-800 dark:text-white/85 animate-fade-in`}
          >
            <span className="mt-0.5 shrink-0">{v.icon}</span>
            <div className="flex-1 leading-snug">
              {t.title && <div className="font-semibold text-gray-900 dark:text-white/90">{t.title}</div>}
              <div className="text-gray-700 dark:text-white/80">{t.message}</div>
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-white/40 dark:hover:text-white/80 dark:hover:bg-white/[0.07] transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
