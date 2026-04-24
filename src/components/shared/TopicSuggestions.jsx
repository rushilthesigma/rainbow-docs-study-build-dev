import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw, ArrowRight } from 'lucide-react';
import { getTopicSuggestions } from '../../api/suggestions';

// Small "AI picks 3 topics for you" strip. Used at the top of CurriculaApp
// (home/curricula hub) and LessonsApp (lesson hub). The actual click action
// depends on surface — pass `onPick({ topic, difficulty, reason })`.
//
// Props:
//   title         — header text (default: "Suggested for you")
//   onPick        — (suggestion) => void  (required)
//   pickLabel     — CTA text on each card (default: "Start →")
//   className     — optional wrapper classes
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

  // Render nothing while the first fetch is in flight — prevents a "blank
  // card" flicker on hub mount. Subsequent refreshes show the spinner
  // inline on the refresh button instead.
  if (loading) {
    return (
      <div className={`rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-[74px] rounded-lg bg-gray-50 dark:bg-[#0D0D14] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Fatal error state — collapse to a single compact row rather than a big card.
  if (error && !suggestions.length) {
    return (
      <div className={`rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] px-4 py-2.5 flex items-center gap-2 ${className}`}>
        <Sparkles size={14} className="text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">Couldn't load suggestions ({error})</span>
        <button onClick={() => load(true)} className="text-xs text-blue-500 hover:text-blue-600 font-medium">Retry</button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider ml-1">AI</span>
        <div className="flex-1" />
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          title="Refresh suggestions"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick?.(s)}
            className="group text-left rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] hover:border-blue-400 dark:hover:border-blue-600 hover:bg-white dark:hover:bg-[#1e1e2e] transition-colors p-3 flex flex-col"
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
              {s.topic}
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2 mb-2 flex-1">
              {s.reason}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {s.difficulty || 'beginner'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500 group-hover:text-blue-600">
                {pickLabel} <ArrowRight size={11} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
