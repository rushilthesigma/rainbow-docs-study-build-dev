import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';

export default function Spotlight({ open, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const { openApp } = useWindowManager();

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Cmd+K to toggle
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) onClose();
        else onClose(); // parent toggles
      }
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const results = query.trim()
    ? APP_REGISTRY.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.id.toLowerCase().includes(query.toLowerCase())
      )
    : APP_REGISTRY;

  function handleSelect(app) {
    openApp(app.id, app.label);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center pt-[18vh]" onClick={onClose}>
      <div
        className="w-full max-w-[560px] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(30, 30, 40, 0.75)',
          backdropFilter: 'blur(50px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(50px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <Search size={18} className="text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search apps..."
            className="flex-1 bg-transparent text-white text-lg outline-none placeholder:text-white/30"
          />
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="py-2 px-2 max-h-[300px] overflow-y-auto">
            {results.map(app => {
              const Icon = app.icon;
              return (
                <button
                  key={app.id}
                  onClick={() => handleSelect(app)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${app.gradient} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} className="text-white" />
                  </div>
                  <span className="text-sm font-medium text-white/90">{app.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <div className="py-6 text-center text-sm text-white/30">No results</div>
        )}
      </div>
    </div>
  );
}
