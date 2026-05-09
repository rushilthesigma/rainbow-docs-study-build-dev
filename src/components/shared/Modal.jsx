import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white/[0.08] backdrop-blur-xl rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)] w-full max-w-md mx-4 p-6 border border-white/[0.14]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-bold text-white/90">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
