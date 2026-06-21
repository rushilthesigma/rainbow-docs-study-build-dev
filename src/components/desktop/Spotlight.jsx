import { useState, useEffect, useRef } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { checkAdmin } from '../../api/admin';
import { Z } from '../../styles/tokens';

export default function Spotlight({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const { openApp } = useWindowManager();

  // Check admin status once so adminOnly apps (Admin, Mobile Preview)
  // are hidden from non-admin users in spotlight search results.
  useEffect(() => {
    checkAdmin().then((d) => setIsAdmin(!!d.isAdmin)).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the selected item in view as it moves.
  // IMPORTANT: every hook must run on every render - do NOT place hooks after
  // the `if (!open) return null` early-return below, or React will throw
  // "change in the order of Hooks" and crash the subtree.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, open]);

  if (!open) return null;

  // adminOnly apps are filtered out unconditionally for non-admins so
  // they never surface in spotlight regardless of search text.
  const visibleRegistry = APP_REGISTRY.filter((a) => !a.adminOnly || isAdmin);
  const results = query.trim()
    ? visibleRegistry.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.id.toLowerCase().includes(query.toLowerCase())
      )
    : visibleRegistry;

  function handleSelect(app) {
    openApp(app.id, app.label);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIdx] || results[0]);
    }
  }

  return (
    <div className="fixed inset-0 flex items-start justify-center pt-[16vh]" style={{ zIndex: Z.spotlight }} onClick={onClose}>
      <div
        className="w-full max-w-[620px] mx-4 rounded-2xl overflow-hidden shadow-2xl border border-gray-200/70 dark:border-white/[0.14]"
        style={{
          background: document.documentElement.classList.contains('dark')
            ? 'rgba(28, 28, 38, 0.82)'
            : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(60px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(60px) saturate(1.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 dark:border-white/10">
          <Search size={18} className="text-gray-400 dark:text-white/50 flex-shrink-0" />
          <input
            ref={inputRef}
            data-spotlight-input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search apps..."
            className="flex-1 bg-transparent text-gray-900 dark:text-white text-base outline-none placeholder:text-gray-400 dark:placeholder:text-white/40"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[11px] text-gray-400 hover:text-gray-700 dark:text-white/40 dark:hover:text-white/70 px-1.5">clear</button>
          )}
          <kbd className="text-[10px] text-gray-400 dark:text-white/40 font-mono border border-gray-300 dark:border-white/15 rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div ref={listRef} className="py-2 px-2 max-h-[380px] overflow-y-auto">
            {results.map((app, i) => {
              const Icon = app.icon;
              const selected = i === selectedIdx;
              return (
                <button
                  key={app.id}
                  data-idx={i}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onClick={() => handleSelect(app)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors ${
                    selected ? 'bg-gray-900/[0.06] dark:bg-white/15' : 'hover:bg-gray-900/[0.04] dark:hover:bg-white/10'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${app.gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon size={17} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{app.label}</div>
                    <div className="text-[11px] text-gray-400 dark:text-white/40">Application</div>
                  </div>
                  {selected && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-white/50">
                      <CornerDownLeft size={11} /> open
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-white/40">
            No apps match "<span className="text-gray-700 dark:text-white/70">{query}</span>"
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-white/10 text-[10px] text-gray-400 dark:text-white/40">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono border border-gray-300 dark:border-white/15 rounded px-1 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono border border-gray-300 dark:border-white/15 rounded px-1 py-0.5">↵</kbd> open</span>
          </div>
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
