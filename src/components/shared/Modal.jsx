import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { Z } from '../../styles/tokens';

// Accessible modal:
//   - role=dialog + aria-modal=true + aria-labelledby/-describedby
//   - Esc key closes
//   - focus trap (Tab / Shift+Tab cycle inside)
//   - focus moves into the dialog on open, returns to opener on close
//   - body scroll lock cleaned up on unmount, not just on close
//
// Backward compatible API: <Modal open onClose title>children</Modal>
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  closeOnOverlay = true,
}) {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Body scroll lock — runs only while open. Cleanup restores overflow
  // even if the component unmounts mid-open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus management — capture the previously focused element on open,
  // move focus into the dialog, restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    const node = dialogRef.current;
    if (node) {
      // Focus first focusable element if present, else the dialog itself.
      const focusable = node.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable || node).focus();
    }
    return () => {
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [open]);

  // Esc to close + focus trap.
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[size] || 'max-w-md';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={(e) => {
        if (closeOnOverlay && e.target === overlayRef.current) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`bg-white/[0.08] backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] w-full ${widthClass} mx-4 p-6 border border-white/[0.14] outline-none max-h-[90vh] overflow-y-auto`}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between mb-4">
            {title ? (
              <h3 id={titleId} className="text-[16px] font-bold text-white/90">
                {title}
              </h3>
            ) : <span />}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-white/30 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {description && (
          <p id={descId} className="text-xs text-white/55 mb-3">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
