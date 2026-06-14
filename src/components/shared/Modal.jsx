import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import { Z } from '../../styles/tokens';
import { useInsideWindowFrame } from '../../context/WindowFrameContext';

// Inside a window frame: full-area takeover — slides up and replaces the
// window content entirely. No scrim, no overlay, no dimming.
// Classic routes / full-page: centered dialog with a light scrim.
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl' — only used in portal mode
  closeOnOverlay = true,
}) {
  const insideWindow = useInsideWindowFrame();
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open || insideWindow) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, insideWindow]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    const node = dialogRef.current;
    if (node) {
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

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (insideWindow) {
    // Right side panel — slides in from the right edge of the window.
    // No scrim, no dimming. Clicking outside (the transparent backdrop) closes it.
    return (
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ zIndex: Z.modal }}
        onClick={(e) => { if (closeOnOverlay && e.target === overlayRef.current) onClose?.(); }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          data-modal-surface
          className="absolute right-0 top-0 bottom-0 w-[360px] flex flex-col bg-[#141414] border-l border-white/[0.09] shadow-[-12px_0_48px_rgba(0,0,0,0.55)] outline-none animate-slide-in-right overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0 border-b border-white/[0.07]">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="flex items-center gap-1.5 text-white/40 hover:text-white/80 transition-colors text-sm"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            {title && (
              <h3 id={titleId} className="text-[14px] font-semibold text-white/90 flex-1">
                {title}
              </h3>
            )}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {description && <p id={descId} className="text-xs text-white/55 mb-3">{description}</p>}
            {children}
          </div>
        </div>
      </div>
    );
  }

  // Classic routes: light scrim + centered dialog
  const widthClass = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }[size] || 'max-w-md';
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 flex items-center justify-center bg-black/40 animate-fade-in"
      style={{ zIndex: Z.modal }}
      onClick={(e) => { if (closeOnOverlay && e.target === overlayRef.current) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        data-modal-surface
        className={`rounded-2xl shadow-[0_8px_48px_rgba(0,0,0,0.6)] w-full ${widthClass} mx-4 p-6 outline-none max-h-[90vh] overflow-y-auto bg-[#141414] border border-white/[0.12] animate-modal-in`}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between mb-4">
            {title ? <h3 id={titleId} className="text-[16px] font-bold text-white/90">{title}</h3> : <span />}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-white/25 hover:text-white/65 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {description && <p id={descId} className="text-xs text-white/55 mb-3">{description}</p>}
        {children}
      </div>
    </div>,
    document.body
  );
}
