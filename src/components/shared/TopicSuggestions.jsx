import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { getTopicSuggestions } from '../../api/suggestions';

export default function TopicSuggestions({
  title = 'Suggested for you',
  onPick,
  pickLabel = 'Start',
  className = '',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getTopicSuggestions({ refresh });
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setError(e.message || 'Failed to load suggestions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading) {
    return (
      <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-semibold text-white/60">{title}</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[74px] rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !suggestions.length) {
    return (
      <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 flex items-center gap-2 ${className}`}>
        <span className="text-[12px] text-white/35 flex-1">Couldn't load suggestions</span>
        <button onClick={() => load(true)} className="text-[12px] text-white/55 hover:text-white/80 font-medium transition-colors">Retry</button>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-semibold text-white/75">{title}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/25 ml-1">AI</span>
        <div className="flex-1" />
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          title="Refresh suggestions"
          className="p-1 rounded text-white/25 hover:text-white/55 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick?.(s)}
            className="group text-left rounded-xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.07] transition-colors p-3 flex flex-col"
          >
            <h4 className="text-[13px] font-semibold text-white/80 group-hover:text-white/90 mb-1 line-clamp-1">
              {s.topic}
            </h4>
            <p className="text-[11px] text-white/40 leading-snug line-clamp-2 mb-2 flex-1">
              {s.reason}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black text-white/25 uppercase tracking-[0.14em]">
                {s.difficulty || 'beginner'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/45 group-hover:text-white/70 transition-colors">
                {pickLabel} <ArrowRight size={10} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
