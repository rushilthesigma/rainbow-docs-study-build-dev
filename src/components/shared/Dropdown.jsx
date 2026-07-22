import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

function normalizeOptions(options) {
  return options.map(option => (
    typeof option === 'object' ? option : { value: option, label: option }
  ));
}

export default function Dropdown({ value, options = [], onChange, className = '', 'aria-label': ariaLabel }) {
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const normalizedOptions = normalizeOptions(options);
  const currentIndex = Math.max(0, normalizedOptions.findIndex(option => option.value === value));
  const current = normalizedOptions[currentIndex];

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) setHighlighted(currentIndex);
  }, [open, currentIndex]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleButtonKeyDown(event) {
    if (normalizedOptions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted(index => (index + delta + normalizedOptions.length) % normalizedOptions.length);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      if (normalizedOptions[highlighted]) choose(normalizedOptions[highlighted]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onKeyDown={handleButtonKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left text-[12px] font-medium text-white/80 outline-none transition-colors hover:border-white/[0.16] hover:bg-white/[0.07] focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15"
      >
        <span className="truncate">{current?.label ?? ''}</span>
        <ChevronDown size={13} className={`shrink-0 text-white/35 transition-transform ${open ? 'rotate-180 text-blue-300' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-lg border border-white/[0.12] bg-[#1b1b1b] py-1 shadow-xl shadow-black/40"
        >
          {normalizedOptions.map((option, index) => {
            const selected = option.value === value;
            const active = index === highlighted;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(option)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                  active ? 'bg-white/[0.08]' : ''
                } ${selected ? 'text-blue-100' : 'text-white/75 hover:text-white'}`}
              >
                <Check size={13} className={selected ? 'text-blue-300' : 'opacity-0'} />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
