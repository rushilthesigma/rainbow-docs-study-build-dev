import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Swords, RotateCcw, ArrowLeft, ArrowRight, Trophy, Users, User, Copy, Check, Loader2, X, Zap, FileText, AlertCircle, Paperclip, Clock, Camera, Download, Eye, Sparkles,
} from 'lucide-react';
import { apiFetch, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ChatContainer from '../chat/ChatContainer';
import { errorChatMessage } from '../../utils/aiErrors';
import { InlineProgress } from '../shared/ProgressBar';

// =========================================================
// DEBATE PANEL — embedded inside Study Mode (no longer a top-level app).
// Modes:
//   menu          — pick singleplayer or multiplayer
//   single-setup  — pick topic + side, start solo debate vs AI
//   single-debate — chat with AI; click End Debate → final verdict
//   single-verdict — read AI verdict + scores
//   mp-menu       — Create or Join code
//   mp-lobby      — waiting room; host configures topic/side and starts
//   mp-game       — turn-based with AI per-move grade + dual end vote
//   mp-verdict    — final verdict
// =========================================================
const QUICK_TOPICS = [
  'Social media is harmful',
  'AI will replace most jobs',
  'College is worth the cost',
  'Space exploration matters',
  'Standardized testing should be abolished',
  'Self-driving cars are safer than humans',
];

// Reusable topic chip row used by every debate setup screen (solo,
// 1v1 lobby, tournament setup). Starts with the QUICK_TOPICS defaults
// plus an "AI" button that swaps in 6 fresh AI-picked topics from the
// /api/debate/suggest-topics endpoint. Hitting AI again re-rolls.
function TopicChips({ onPick, max = null }) {
  const [aiTopics, setAiTopics] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const defaults = max ? QUICK_TOPICS.slice(0, max) : QUICK_TOPICS;
  const chips = aiTopics || defaults;
  async function fetchAi() {
    setAiBusy(true); setAiErr(null);
    try {
      const r = await apiFetch('/api/debate/suggest-topics', {
        method: 'POST',
        body: JSON.stringify({ exclude: chips }),
      });
      if (Array.isArray(r.topics) && r.topics.length) setAiTopics(r.topics);
      else setAiErr('No topics');
    } catch (e) { setAiErr(e.message || 'Failed'); }
    setAiBusy(false);
  }
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {chips.map(t => (
        <button
          key={t}
          onClick={() => onPick(t)}
          className="px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/30 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-200 transition-colors"
        >
          {t}
        </button>
      ))}
      <button
        onClick={fetchAi}
        disabled={aiBusy}
        title={aiTopics ? 'Re-roll AI suggestions' : 'AI-suggest fresh topics'}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-b from-blue-500/30 to-blue-600/20 border border-blue-400/45 text-[11px] font-semibold text-blue-100 hover:from-blue-500/40 hover:to-blue-600/25 disabled:opacity-50 transition-colors"
      >
        {aiBusy ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
        {aiTopics ? 'Re-roll' : 'AI'}
      </button>
      {aiErr && <span className="text-[10px] text-rose-300/85">· {aiErr}</span>}
    </div>
  );
}

export default function DebatePanel({ onBack }) {
  const [mode, setMode] = useState('menu');
  // Forced-timed flag: set when the user picks "Timed multiplayer" from
  // the menu so the lobby opens with the timed-mode toggle pre-checked.
  // Reset when we go back to the menu.
  const [forceTimed, setForceTimed] = useState(false);
  // Tournament-rejoin entry point. When the mode menu detects this user
  // is already in an active tournament (via /my-active-tournament), the
  // Rejoin banner sets this and selectMode('tour-lobby' or 'tour-bracket')
  // — the Tournament component reads `rejoinTournament` and skips its
  // own create/join screen.
  const [rejoinTournament, setRejoinTournament] = useState(null);
  const selectMode = (m) => {
    if (m === 'mp-menu-timed') {
      setForceTimed(true);
      setMode('mp-menu');
    } else {
      if (m === 'menu') setForceTimed(false);
      setMode(m);
    }
  };

  // Top-bar back behavior:
  //   - In any sub-mode (single-*, mp-*): step back to the mode menu.
  //   - On the mode menu:
  //       · if onBack is provided (e.g., mounted inside StudyMode as a
  //         sub-view, with a parent that wants to take over) call it.
  //       · otherwise (mounted as its own top-level app) hide the arrow —
  //         the window's own close button is the only sensible exit.
  const onMenu = mode === 'menu';
  // Lock the header back arrow during active games — leaving must go
  // through the in-match Leave flow so the opponent gets notified and
  // the match state advances correctly.
  const isActiveGame = mode === 'mp-game' || mode === 'single-debate';
  const headerBackTarget = onMenu ? (onBack || null) : (isActiveGame ? null : () => selectMode('menu'));

  const header = (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-transparent">
      {headerBackTarget ? (
        <button onClick={headerBackTarget} className="p-1 rounded text-white/70 hover:text-white transition-colors">
          <ArrowLeft size={14} />
        </button>
      ) : (
        <span className="w-[22px]" aria-hidden="true" />
      )}
      <div className="w-7 h-7 rounded-xl bg-white/20 dark:bg-white/10 border border-white/40 dark:border-white/15 flex items-center justify-center text-white/80 flex-shrink-0">
        <Swords size={13} />
      </div>
      <span className="text-[13px] font-bold text-white">Debate</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {mode === 'menu' && 'Pick a mode'}
        {mode === 'history' && 'History'}
        {mode === 'single-setup' && 'Solo · Setup'}
        {mode === 'single-debate' && 'Solo · Live'}
        {mode === 'single-verdict' && 'Solo · Verdict'}
        {mode === 'mp-menu' && 'Multiplayer · Setup'}
        {mode === 'mp-lobby' && 'Multiplayer · Lobby'}
        {mode === 'mp-game' && 'Multiplayer · Live'}
        {mode === 'mp-verdict' && 'Multiplayer · Verdict'}
        {(mode === 'tour-menu' || mode === 'tour-lobby' || mode === 'tour-bracket') && 'Tournament'}
      </span>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {mode === 'menu' && (
          <ModeMenu
            onSelect={selectMode}
            onRejoinTournament={(t) => {
              setRejoinTournament(t);
              setMode(t.state === 'waiting' ? 'tour-lobby' : 'tour-bracket');
            }}
          />
        )}
        {mode === 'history' && <HistoryView onExit={() => selectMode('menu')} />}
        {(mode === 'tour-menu' || mode === 'tour-lobby' || mode === 'tour-bracket') && (
          <Tournament
            mode={mode}
            setMode={selectMode}
            onExit={() => { setRejoinTournament(null); selectMode('menu'); }}
            rejoinTournament={rejoinTournament}
          />
        )}
        {(mode === 'single-setup' || mode === 'single-debate' || mode === 'single-verdict') && (
          <Singleplayer
            mode={mode}
            setMode={selectMode}
            onExit={() => selectMode('menu')}
          />
        )}
        {(mode === 'mp-menu' || mode === 'mp-lobby' || mode === 'mp-game' || mode === 'mp-verdict') && (
          <Multiplayer
            mode={mode}
            setMode={selectMode}
            onExit={() => selectMode('menu')}
            forceTimed={forceTimed}
          />
        )}
      </div>
    </div>
  );
}

// =========================================================
// MENU
// =========================================================
function ModeMenu({ onSelect, onRejoinTournament }) {
  const card = 'flex flex-col items-center justify-center gap-2.5 p-6 rounded-xl border transition-colors group';
  // Detect a tournament this user is already in (created/joined on
  // another device or earlier session). If found, surface a Rejoin
  // banner at the top — clicking it routes straight to lobby/bracket
  // without going through create/join.
  const [activeTour, setActiveTour] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/debate/my-active-tournament');
        if (!cancelled) setActiveTour(r?.tournament || null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-md md:max-w-3xl mx-auto">
      {activeTour && onRejoinTournament && (
        <button
          onClick={() => onRejoinTournament(activeTour)}
          className="w-full mb-5 flex items-center gap-3 p-3.5 rounded-xl border border-blue-400/45 bg-gradient-to-b from-blue-500/[0.18] to-blue-600/[0.10] hover:from-blue-500/[0.24] hover:to-blue-600/[0.14] hover:border-blue-400/65 transition-colors text-left"
          title="Rejoin your active tournament"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.35)] flex-shrink-0">
            <Trophy size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-white truncate">
              You're in a tournament · <span className="font-mono tracking-wider">{activeTour.code}</span>
            </p>
            <p className="text-[11px] text-blue-100/80 truncate">
              {activeTour.name && activeTour.name !== activeTour.topic ? activeTour.name : `"${activeTour.topic}"`}
              {' · '}
              {activeTour.state === 'waiting'
                ? `Lobby ${activeTour.players?.length || 0}/${activeTour.size}`
                : 'In progress'}
            </p>
          </div>
          <ArrowRight size={14} className="text-blue-100 flex-shrink-0" />
        </button>
      )}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base md:text-xl font-bold text-gray-900 dark:text-white">Pick a mode</h2>
        <button
          onClick={() => onSelect('history')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors"
        >
          <Trophy size={11} className="text-blue-300" /> History
        </button>
      </div>
      <div className="grid gap-3 md:gap-4 md:grid-cols-3 mb-3 md:mb-4">
        <button
          onClick={() => onSelect('single-setup')}
          className={`${card} border-blue-500/25 bg-blue-500/[0.04] hover:bg-blue-500/[0.10] hover:border-blue-500/45`}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center"><User size={22} /></div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Solo</p>
          <p className="text-[11px] text-blue-300/55">vs AI</p>
        </button>

        <button
          onClick={() => onSelect('mp-menu')}
          className={`${card} border-blue-500/25 bg-blue-500/[0.04] hover:bg-blue-500/[0.10] hover:border-blue-500/45`}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center"><Users size={22} /></div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">1v1</p>
          <p className="text-[11px] text-blue-300/55">with a friend</p>
        </button>

        <button
          onClick={() => onSelect('mp-menu-timed')}
          className={`${card} border-blue-400/40 bg-gradient-to-b from-blue-500/[0.12] to-blue-600/[0.08] hover:from-blue-500/[0.18] hover:to-blue-600/[0.12] hover:border-blue-400/60 relative`}
        >
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded bg-blue-500 text-white border border-blue-400/60">
            <Clock size={9} strokeWidth={3} /> 2:00
          </span>
          <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.30)]"><Clock size={22} /></div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Timed 1v1</p>
          <p className="text-[11px] text-blue-100/75">2 min per turn</p>
        </button>
      </div>

      <button
        onClick={() => onSelect('tour-menu')}
        className="w-full flex items-center gap-4 p-5 rounded-xl border border-blue-400/40 bg-gradient-to-b from-blue-500/[0.12] to-blue-600/[0.08] hover:from-blue-500/[0.18] hover:to-blue-600/[0.12] hover:border-blue-400/60 transition-colors text-left"
      >
        <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.30)] flex-shrink-0"><Trophy size={22} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Tournament</p>
          <p className="text-[11px] text-blue-100/75 mt-0.5">Single-elimination bracket · 4, 8, or 16 players</p>
        </div>
        <ArrowRight size={16} className="text-blue-200/70 flex-shrink-0" />
      </button>
    </div>
  );
}

// =========================================================
// HISTORY
// =========================================================
function HistoryView({ onExit }) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, ties: 0 });
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/debate/history');
        if (cancelled) return;
        setHistory(r.history || []);
        setStats(r.stats || { total: 0, wins: 0, losses: 0, ties: 0 });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function openMatch(finishedAt) {
    setSelectedLoading(true);
    try {
      const r = await apiFetch(`/api/debate/history/${finishedAt}`);
      setSelected(r.entry);
    } catch (e) {
      setError(e.message || 'Failed to load match');
    } finally {
      setSelectedLoading(false);
    }
  }

  if (selected) {
    return <HistoryDetail entry={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
      <button onClick={onExit} className="text-xs text-blue-300/60 hover:text-blue-200 mb-4 inline-flex items-center gap-1 transition-colors">
        <ArrowLeft size={12} /> Back
      </button>

      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-blue-400/70">Total</p>
          <p className="text-lg font-black tabular-nums text-white mt-0.5">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/80">Wins</p>
          <p className="text-lg font-black tabular-nums text-emerald-200 mt-0.5">{stats.wins}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-rose-400/80">Losses</p>
          <p className="text-lg font-black tabular-nums text-rose-200 mt-0.5">{stats.losses}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/80">Ties</p>
          <p className="text-lg font-black tabular-nums text-amber-200 mt-0.5">{stats.ties}</p>
        </div>
      </div>

      {loading && <p className="text-xs text-blue-300/50 text-center py-8">Loading…</p>}
      {!loading && error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      {!loading && !error && history.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-blue-300/45">
          <Trophy size={20} />
          <p className="text-[12px]">No debates yet</p>
        </div>
      )}
      {!loading && !error && history.length > 0 && (
        <div className="space-y-1.5">
          {history.map(h => (
            <button
              key={h.finishedAt}
              onClick={() => openMatch(h.finishedAt)}
              disabled={selectedLoading}
              className="w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] hover:bg-blue-500/[0.10] hover:border-blue-500/40 transition-colors disabled:opacity-50"
            >
              <span className={`w-1 h-10 rounded-full flex-shrink-0 ${
                h.result === 'win' ? 'bg-emerald-400' : h.result === 'loss' ? 'bg-rose-400' : 'bg-amber-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${
                    h.result === 'win' ? 'text-emerald-300' : h.result === 'loss' ? 'text-rose-300' : 'text-amber-300'
                  }`}>{h.result}{h.forfeit ? ' · forfeit' : ''}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300/60">·</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-blue-300/70">
                    {h.mode === 'solo' ? 'vs AI' : (h.opponent?.name || 'opp')}
                  </span>
                  {h.timedMode && <Clock size={9} className="text-blue-300/60" />}
                  {h.tournament && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-300/85 bg-blue-500/10 border border-blue-500/25 rounded px-1 py-0.5">
                      <Trophy size={8} /> {h.tournament.name}{h.tournament.round ? ` · R${h.tournament.round}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-white/85 truncate">{h.topic}</p>
                <p className="text-[10.5px] text-blue-300/55 tabular-nums">
                  {h.mySide?.toUpperCase()} {h.myScore} · {h.opponent?.side?.toUpperCase()} {h.opponentScore} · {new Date(h.finishedAt).toLocaleDateString()}
                </p>
              </div>
              <ArrowRight size={13} className="text-blue-300/40 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryDetail({ entry, onBack }) {
  const me = { side: entry.mySide, score: entry.myScore };
  const opp = entry.opponent || { name: 'AI', side: entry.mySide === 'for' ? 'against' : 'for' };
  const v = entry.verdict || {};
  return (
    <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
      <button onClick={onBack} className="text-xs text-blue-300/60 hover:text-blue-200 mb-3 inline-flex items-center gap-1 transition-colors">
        <ArrowLeft size={12} /> History
      </button>
      <p className="text-xs text-blue-300/55 mb-1">{new Date(entry.finishedAt).toLocaleString()}</p>
      {entry.tournament && (
        <p className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-blue-200 bg-blue-500/10 border border-blue-500/25 rounded px-2 py-0.5 mb-2">
          <Trophy size={10} /> {entry.tournament.name}{entry.tournament.round ? ` · R${entry.tournament.round}${entry.tournament.totalRounds ? `/${entry.tournament.totalRounds}` : ''}` : ''}
        </p>
      )}
      {entry.forfeit && (
        <p className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded px-2 py-0.5 mb-2 ml-2">
          Forfeit
        </p>
      )}
      <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{entry.topic}</h2>
      <div className={`rounded-2xl p-4 mb-4 text-center border ${
        entry.result === 'win' ? 'bg-emerald-500/10 border-emerald-500/30' :
        entry.result === 'loss' ? 'bg-rose-500/10 border-rose-500/30' :
        'bg-amber-500/10 border-amber-500/30'
      }`}>
        <Trophy size={24} className={`mx-auto mb-1.5 ${
          entry.result === 'win' ? 'text-emerald-300' : entry.result === 'loss' ? 'text-rose-300' : 'text-amber-300'
        }`} />
        <p className="text-base font-black uppercase tracking-wider text-white">
          {entry.result === 'win' ? 'You won' : entry.result === 'loss' ? 'You lost' : 'Tie'}
        </p>
        <p className="text-[11px] text-blue-300/75 mt-1 tabular-nums">
          You ({me.side?.toUpperCase()}): {me.score} · {opp.name} ({opp.side?.toUpperCase()}): {entry.opponentScore}
        </p>
      </div>
      {v.summary && (
        <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1.5">Verdict</p>
          <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.summary}</p>
        </div>
      )}
      {Array.isArray(entry.turns) && entry.turns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80">Transcript</p>
          {entry.turns.map((t, i) => {
            const isMe = t.side === me.side;
            return (
              <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 ${
                  isMe ? 'bg-blue-500/15 border border-blue-500/30 text-gray-900 dark:text-white' : 'bg-white/[0.05] border border-white/[0.08] text-gray-800 dark:text-gray-100'
                }`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-blue-400/80 mb-1">
                    {t.side?.toUpperCase()} {t.score?.total != null ? `· ${t.score.total}/30` : ''}
                  </p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{t.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =========================================================
// SINGLEPLAYER
// =========================================================
function buildAdversarialSystem(side) {
  const opp = side === 'for' ? 'AGAINST' : 'FOR';
  return `You are a sharp, openly adversarial debate opponent. The user is arguing ${side === 'for' ? 'FOR' : 'AGAINST'} the topic — you argue ${opp}. Your job is to make this hard for them.

How to debate (read this twice):
- Be DIRECT and POINTED. Don't soften ("I see your point but…"). Open with a counter-claim, name the user's weakest assumption, and make them defend it.
- Use REAL DATA. You have web search — pull specific numbers, studies, examples, dates. Cite them inline naturally (no separate Sources section — the UI shows one). If you can't find data, attack the user's lack of data instead.
- ATTACK the user's strongest argument first, not their weakest. Don't strawman; quote their actual claim and dismantle it.
- DEMAND specifics when they hand-wave. "Which study?" "What time period?" "Compared to what baseline?" — push back hard on vagueness.
- Keep responses TIGHT. 2-3 paragraphs max per turn. Lead with the strongest counter, support it, end with a question that puts them on the defensive.

What you do NOT do:
- Don't moderate or summarize unless the user explicitly asks for a recap.
- Don't say "good point" or "I agree" — you're arguing the opposite side.
- Don't volunteer to end the debate; the user has an "End Debate" button for that.

Format: GitHub-flavored markdown. **Bold** key claims, use - bullets for evidence lists, $math$ if relevant.`;
}

// =========================================================
// TOURNAMENT — single-elimination bracket of 4/8/16 players.
// Handles create/join, lobby (waiting for players), and the live bracket
// view. When the user has a live match they're routed inline into the
// existing Multiplayer game UI via the presetCode + tournamentCode path.
// =========================================================
function Tournament({ mode, setMode, onExit, rejoinTournament = null }) {
  const { user } = useAuth();
  const myId = user?.id || null;
  const [code, setCode] = useState(rejoinTournament?.code || '');
  const [iAmHost, setIAmHost] = useState(rejoinTournament?.hostId === (user?.id || null));
  const [tournament, setTournament] = useState(rejoinTournament || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Setup form state.
  const [size, setSize] = useState(4);
  const [nameInput, setNameInput] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [timedMode, setTimedMode] = useState(false);
  const [maxRounds, setMaxRounds] = useState(5);
  const [joinInput, setJoinInput] = useState('');
  // Per-round topics. Off by default — same topic everywhere. When on,
  // host can specify the semi/final etc. their own topic; any empty
  // round falls back to the main topic on the server.
  const [perRoundTopics, setPerRoundTopics] = useState(false);
  const [roundTopics, setRoundTopics] = useState({}); // { [roundNum]: string }
  // Host can opt out of playing — useful for teachers / organizers
  // running a bracket without taking a player slot.
  const [hostPlays, setHostPlays] = useState(true);
  // In-match mode: switch the panel from the bracket view to the
  // Multiplayer game view scoped to the user's current bracket match.
  const [activeMatchCode, setActiveMatchCode] = useState(null);
  // Set to true when the user opens a match they're NOT playing in —
  // eliminated player or organizer watching a live match.
  const [activeMatchIsSpectator, setActiveMatchIsSpectator] = useState(false);
  // Local "in-match" mode for Multiplayer's controlled state — it doesn't
  // need to share with the parent setMode because the user never goes back
  // to mp-menu from a tournament match.
  const [matchMode, setMatchMode] = useState('mp-game');
  const streamRef = useRef(null);
  // Host-only snapshot modal — exports the full bracket state as a PNG
  // and a copy-pasteable text summary.
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [copiedSnap, setCopiedSnap] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const snapshotRef = useRef(null);

  // SSE stream — same shape as the match stream, just hits the tournament
  // endpoint. Every event carries `tournament` and we just setTournament.
  useEffect(() => {
    if (!code) return;
    const tok = getToken();
    if (!tok) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/debate/tournament/${code}/stream`, {
          headers: { Authorization: `Bearer ${tok}` },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.tournament) setTournament(ev.tournament);
              if (ev.type === 'started' || ev.type === 'round_advanced') setMode('tour-bracket');
              if (ev.type === 'kicked') {
                setError('You were removed from the tournament.');
                setCode('');
                setTournament(null);
                setMode('tour-menu');
              }
              if (ev.type === 'cancelled') {
                setError('The host cancelled this tournament.');
                setCode('');
                setTournament(null);
                setMode('tour-menu');
              }
            } catch {}
          }
        }
      } catch {}
    })();
    streamRef.current = ctrl;
    return () => { try { ctrl.abort(); } catch {} };
  }, [code, setMode]);

  async function handleCreate() {
    if (!topicInput.trim()) { setError('Topic required'); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiFetch('/api/debate/tournament', {
        method: 'POST',
        body: JSON.stringify({
          size,
          name: nameInput.trim(),
          topic: topicInput.trim(),
          timedMode,
          maxRounds,
          hostPlays,
          // Only send filled-in per-round topics; server fills the rest
          // with the main topic.
          roundTopics: perRoundTopics
            ? Object.fromEntries(Object.entries(roundTopics).filter(([, v]) => (v || '').trim()).map(([k, v]) => [k, v.trim()]))
            : {},
        }),
      });
      setCode(r.code);
      setTournament(r.tournament);
      setIAmHost(true);
      setMode('tour-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinInput.trim().toUpperCase();
    if (c.length < 4) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/tournament/${c}/join`, { method: 'POST' });
      setCode(c);
      setTournament(r.tournament);
      setIAmHost(r.tournament?.hostId === myId);
      setMode(r.tournament?.state === 'playing' ? 'tour-bracket' : 'tour-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleStart() {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/tournament/${code}/start`, { method: 'POST' });
      setTournament(r.tournament);
      setMode('tour-bracket');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleLeaveTournament() {
    if (!code) { onExit(); return; }
    try { await apiFetch(`/api/debate/tournament/${code}/leave`, { method: 'POST' }); }
    catch {}
    setCode('');
    setTournament(null);
    onExit();
  }

  async function handleKick(userId) {
    if (!code || !userId) return;
    setError(null);
    try {
      const r = await apiFetch(`/api/debate/tournament/${code}/kick`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      setTournament(r.tournament);
    } catch (e) { setError(e.message); }
  }

  function copyCode() {
    if (!code) return;
    try { navigator.clipboard.writeText(code); } catch {}
  }

  // ===== ACTIVE BRACKET MATCH =====
  if (activeMatchCode) {
    return (
      <Multiplayer
        mode={matchMode}
        setMode={setMatchMode}
        onExit={() => { setActiveMatchCode(null); setActiveMatchIsSpectator(false); setMatchMode('mp-game'); }}
        presetCode={activeMatchCode}
        tournamentCode={code}
        spectator={activeMatchIsSpectator}
      />
    );
  }

  // ===== MENU =====
  if (mode === 'tour-menu') {
    return (
      <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
        <button onClick={onExit} className="text-xs text-blue-300/60 hover:text-blue-200 mb-3 inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Tournament</h2>
        <p className="text-xs text-blue-300/55 mb-5">Single elimination · winner takes all</p>

        {/* Create */}
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Size</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[4, 8, 16].map(n => (
            <button
              key={n}
              onClick={() => setSize(n)}
              className={`py-2 rounded-lg text-sm font-bold tabular-nums border transition-colors ${
                size === n
                  ? 'bg-blue-500/20 text-blue-100 border-blue-500/50'
                  : 'border-blue-500/20 text-blue-300/70 bg-transparent hover:bg-blue-500/10 hover:text-blue-200'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          placeholder="Tournament name (e.g., Spring 2026 Debate)"
          maxLength={80}
          className="w-full px-3 py-2 mb-2 rounded-lg border border-blue-500/25 bg-white/50 dark:bg-white/[0.06] text-sm font-semibold text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/45"
        />
        <input
          value={topicInput}
          onChange={e => setTopicInput(e.target.value)}
          placeholder={perRoundTopics ? 'Default topic (used when a round is blank)' : 'Topic for the whole bracket'}
          className="w-full px-3 py-2 mb-2 rounded-lg border border-blue-500/25 bg-white/50 dark:bg-white/[0.06] text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/45"
        />
        <div className="mb-3">
          <TopicChips onPick={setTopicInput} max={4} />
        </div>
        {/* Per-round topic toggle + inputs. When on, host can give each
            round its own topic (Quarter / Semi / Final). Empty rounds
            inherit the main topic above. */}
        <button
          type="button"
          onClick={() => setPerRoundTopics(v => !v)}
          className={`w-full mb-2 flex items-center justify-between px-3 py-2 rounded-lg border text-[12px] transition-colors ${
            perRoundTopics ? 'bg-blue-500/15 border-blue-500/45 text-blue-100' : 'border-blue-500/20 text-blue-300/70 hover:bg-blue-500/10 hover:text-blue-200'
          }`}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${perRoundTopics ? 'bg-blue-500 border-blue-400' : 'border-blue-500/50 bg-transparent'}`}>
              {perRoundTopics && <Check size={10} className="text-white" />}
            </span>
            Different topic per round
          </span>
        </button>

        {/* Host-plays toggle. Default is "play" — uncheck to organize-only,
            useful for a teacher / spectator running a bracket. */}
        <button
          type="button"
          onClick={() => setHostPlays(v => !v)}
          className={`w-full mb-2 flex items-center justify-between px-3 py-2 rounded-lg border text-[12px] transition-colors ${
            hostPlays ? 'bg-blue-500/15 border-blue-500/45 text-blue-100' : 'border-blue-500/20 text-blue-300/70 hover:bg-blue-500/10 hover:text-blue-200'
          }`}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${hostPlays ? 'bg-blue-500 border-blue-400' : 'border-blue-500/50 bg-transparent'}`}>
              {hostPlays && <Check size={10} className="text-white" />}
            </span>
            I'll play in this tournament
          </span>
          <span className="text-[10.5px] text-blue-300/65">{hostPlays ? `1/${size} filled` : `Organize only`}</span>
        </button>
        {perRoundTopics && (() => {
          const total = Math.log2(size);
          const label = (n) => {
            const fromEnd = total - n;
            if (fromEnd === 0) return 'Final';
            if (fromEnd === 1) return 'Semifinal';
            if (fromEnd === 2) return 'Quarterfinal';
            return `Round ${n}`;
          };
          return (
            <div className="space-y-1.5 mb-3">
              {Array.from({ length: total }).map((_, idx) => {
                const r = idx + 1;
                return (
                  <div key={r} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-400/70 w-[100px] flex-shrink-0 whitespace-nowrap">{label(r)}</span>
                    <input
                      value={roundTopics[r] || ''}
                      onChange={e => setRoundTopics(prev => ({ ...prev, [r]: e.target.value }))}
                      placeholder={`Topic for ${label(r).toLowerCase()} (optional)`}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-blue-500/20 bg-white/40 dark:bg-white/[0.04] text-[13px] text-gray-900 dark:text-white placeholder-gray-400/70 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/45"
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setTimedMode(v => !v)}
            className={`px-3 py-2 rounded-lg text-[12px] font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors ${
              timedMode ? 'bg-blue-500/15 border-blue-500/50 text-blue-100' : 'border-blue-500/20 text-blue-300/70 hover:bg-blue-500/10'
            }`}
          >
            <Clock size={12} /> Timed {timedMode && '· 2:00'}
          </button>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-500/20">
            <span className="text-[11px] text-blue-300/70">Rounds/match</span>
            <input
              type="number"
              min="3" max="10"
              value={maxRounds}
              onChange={e => setMaxRounds(Math.max(3, Math.min(10, Number(e.target.value) || 5)))}
              className="w-12 bg-transparent text-sm font-bold tabular-nums text-blue-100 outline-none text-right"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={busy || !topicInput.trim()}
          className="w-full py-3 mb-5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
        >
          {busy ? <InlineProgress active /> : <Trophy size={14} />}
          Create tournament
        </button>

        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 border-t border-blue-500/20" />
          <span className="text-[10px] uppercase tracking-wider text-blue-400/70">or join</span>
          <div className="flex-1 border-t border-blue-500/20" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
            placeholder="CODE"
            className="flex-1 px-3 py-2.5 rounded-xl border border-blue-500/30 bg-white/50 dark:bg-white/[0.06] text-sm font-mono uppercase tracking-widest text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinInput.trim().length < 4}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 transition-all"
          >
            Join
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== LOBBY (waiting for players) =====
  if (mode === 'tour-lobby' && tournament) {
    const filled = tournament.players.length;
    const isFull = filled >= tournament.size;
    return (
      <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.18em] text-blue-400/70 mb-1.5">Tournament code</p>
        <button
          onClick={copyCode}
          title="Copy"
          className="w-full font-mono text-3xl font-black tabular-nums tracking-[0.2em] text-gray-900 dark:text-white bg-white/[0.10] dark:bg-white/[0.06] border border-blue-500/40 dark:border-blue-500/30 rounded-xl py-4 mb-3 hover:border-blue-500/60 transition-colors inline-flex items-center justify-center gap-3"
        >
          {tournament.code}
          <Copy size={16} className="text-blue-400/70" />
        </button>
        <p className="text-[11px] text-blue-300/50 text-center mb-1">Share with players</p>
        {tournament.name && tournament.name !== tournament.topic && (
          <p className="text-[14px] font-bold text-white text-center truncate">{tournament.name}</p>
        )}
        <p className="text-[12px] text-white/75 text-center mb-5 truncate">"{tournament.topic}"</p>

        {/* Organizer-host chip — shown when host opted out of playing. */}
        {!tournament.hostPlays && iAmHost && (
          <div className="rounded-xl border border-blue-400/35 bg-blue-500/[0.10] p-3 mb-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-500/30 border border-blue-400/50 grid place-items-center flex-shrink-0">
              <Trophy size={12} className="text-blue-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-blue-100">You're the organizer</p>
              <p className="text-[10.5px] text-blue-200/65">Not playing — just running the bracket.</p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-blue-500/[0.15] bg-blue-500/[0.04] p-3 mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70">Players</p>
            <span className="text-[11px] font-bold tabular-nums text-blue-200">{filled}/{tournament.size}</span>
          </div>
          <div className="space-y-1.5">
            {tournament.players.map(p => (
              <div key={p.userId} className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center text-[10px] font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                {p.userId === tournament.hostId && <span title="Host" className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-blue-400/80"><Trophy size={9} /> host</span>}
                {p.userId === myId && <span className="text-[9px] uppercase tracking-wider text-blue-300/55">you</span>}
                {iAmHost && p.userId !== myId && (
                  <button
                    onClick={() => handleKick(p.userId)}
                    title={`Kick ${p.name}`}
                    className="inline-flex items-center justify-center w-6 h-6 rounded text-rose-300/70 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {Array.from({ length: tournament.size - filled }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-2 opacity-50">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400">?</div>
                <span className="text-sm text-gray-500 italic">Waiting…</span>
              </div>
            ))}
          </div>
        </div>

        {iAmHost ? (
          <button
            onClick={handleStart}
            disabled={busy || !isFull}
            className="w-full py-3 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
          >
            {busy ? <InlineProgress active /> : <Swords size={14} />}
            {isFull ? 'Start tournament' : `Waiting for ${tournament.size - filled} more…`}
          </button>
        ) : (
          <p className="text-xs text-blue-300/50 text-center italic py-4">Waiting for host to start…</p>
        )}

        <button
          onClick={handleLeaveTournament}
          className="w-full mt-2 py-2 rounded-xl text-[12px] text-rose-300/80 hover:text-rose-200 transition-colors"
        >
          {iAmHost ? 'Cancel tournament' : 'Leave'}
        </button>

        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== BRACKET (live or finished) =====
  if (mode === 'tour-bracket' && tournament) {
    const finished = tournament.state === 'finished';
    const champion = finished && tournament.champion
      ? tournament.players.find(p => p.userId === tournament.champion)
      : null;
    const myLiveMatch = tournament.bracket.find(
      b => b.state === 'playing' && b.players.includes(myId)
    );
    const me = tournament.players.find(p => p.userId === myId);
    const iAmEliminated = !!me?.eliminated;
    // Host running the bracket without taking a player slot.
    const iAmOrganizer = tournament.hostId === myId && !tournament.hostPlays;

    // Group bracket by round for the column layout.
    const roundsMap = {};
    for (const b of tournament.bracket) {
      if (!roundsMap[b.round]) roundsMap[b.round] = [];
      roundsMap[b.round].push(b);
    }
    const roundNumbers = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
    const totalRounds = Math.log2(tournament.size);
    const roundLabel = (n) => {
      const fromEnd = totalRounds - n;
      if (fromEnd === 0) return 'Final';
      if (fromEnd === 1) return 'Semifinal';
      if (fromEnd === 2) return 'Quarterfinal';
      return `Round ${n}`;
    };

    return (
      <div className="p-4 md:p-6 max-w-md md:max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {tournament.name && tournament.name !== tournament.topic && (
              <p className="text-[14px] font-bold text-white truncate">{tournament.name}</p>
            )}
            <p className="text-[11px] text-blue-300/55 truncate">"{tournament.topic}"</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-300/70">
                <Users size={10} /> {tournament.size}
              </span>
              {tournament.timedMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-300/70">
                  <Clock size={10} /> 2:00
                </span>
              )}
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300/70">
                best-of-{tournament.maxRounds || '?'}
              </span>
            </div>
          </div>
          {tournament.hostId === myId && (
            <button
              onClick={() => setShowSnapshot(true)}
              title="Snapshot — export bracket state"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors flex-shrink-0"
            >
              <Camera size={11} /> Snapshot
            </button>
          )}
        </div>

        {/* Champion banner */}
        {finished && champion && (
          <div className="rounded-2xl p-4 mb-4 text-center bg-gradient-to-b from-blue-500/20 to-blue-600/10 border border-blue-400/40">
            <Trophy size={28} className="mx-auto mb-1.5 text-blue-200" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300/80">Champion</p>
            <p className="text-lg font-black text-white">{champion.name}</p>
            {champion.userId === myId && <p className="text-[11px] text-emerald-300 font-semibold mt-0.5">that's you</p>}
          </div>
        )}

        {/* Your status / CTA */}
        {!finished && myLiveMatch && (
          <button
            onClick={() => setActiveMatchCode(myLiveMatch.code)}
            className="w-full mb-4 rounded-xl p-3.5 bg-gradient-to-b from-blue-500/25 to-blue-600/15 border border-blue-400/45 hover:from-blue-500/30 hover:to-blue-600/20 hover:border-blue-400/65 transition-colors text-left inline-flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.35)] flex-shrink-0">
              <Swords size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-white">Your match is ready</p>
              <p className="text-[11px] text-blue-100/75">
                {roundLabel(myLiveMatch.round)} · vs {tournament.players.find(p => p.userId === myLiveMatch.players.find(id => id !== myId))?.name || 'opponent'}
              </p>
            </div>
            <ArrowRight size={14} className="text-blue-100 flex-shrink-0" />
          </button>
        )}
        {!finished && !myLiveMatch && iAmOrganizer && (
          <div className="rounded-xl border border-blue-400/35 bg-blue-500/[0.08] p-3 mb-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-500/25 border border-blue-400/45 grid place-items-center flex-shrink-0">
              <Trophy size={12} className="text-blue-200" />
            </div>
            <p className="text-[12px] text-blue-100/85 flex-1">Organizing — bracket auto-advances as matches finish.</p>
          </div>
        )}
        {!finished && !myLiveMatch && iAmEliminated && !iAmOrganizer && (
          <p className="text-[12px] text-rose-300/70 text-center py-2 mb-2">You were eliminated in round {me?.eliminatedInRound || '?'}. Watching the bracket.</p>
        )}
        {!finished && !myLiveMatch && !iAmEliminated && !iAmOrganizer && (
          <p className="text-[12px] text-blue-300/55 text-center py-2 mb-2 italic">Waiting for the next round…</p>
        )}

        {/* Bracket columns */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {roundNumbers.map(rn => {
            const rTopic = tournament.roundTopics?.[rn];
            const hasOwnTopic = rTopic && rTopic !== tournament.topic;
            return (
            <div key={rn} className="flex-1 min-w-[180px]">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-1">{roundLabel(rn)}</p>
              {hasOwnTopic && (
                <p className="text-[10.5px] text-blue-200/80 italic truncate mb-1.5" title={rTopic}>"{rTopic}"</p>
              )}
              <div className="space-y-2">
                {roundsMap[rn].sort((a, b) => a.matchIndex - b.matchIndex).map(b => {
                  const p1 = tournament.players.find(p => p.userId === b.players[0]);
                  const p2 = tournament.players.find(p => p.userId === b.players[1]);
                  const winnerId = b.winnerId;
                  const isMyMatch = b.players.includes(myId);
                  // Anyone who isn't a player in this match can spectate
                  // (eliminated players + organizer). The match must be
                  // live to be worth watching.
                  const canSpectate = !isMyMatch && b.state === 'playing' && (iAmEliminated || iAmOrganizer);
                  const cellClasses = `rounded-lg border p-2 ${
                    isMyMatch && b.state === 'playing'
                      ? 'border-blue-400/55 bg-blue-500/[0.12] shadow-[0_0_0_2px_rgba(96,165,250,0.18)]'
                      : b.state === 'finished'
                        ? 'border-blue-500/20 bg-blue-500/[0.04]'
                        : 'border-blue-500/[0.18] bg-blue-500/[0.03]'
                  } ${canSpectate ? 'hover:border-blue-400/55 hover:bg-blue-500/[0.10] cursor-pointer transition-colors' : ''}`;
                  const innerRows = (
                    <>
                      <PlayerRow player={p1} score={b.scores?.[p1?.userId]} won={winnerId === p1?.userId} matchFinished={b.state === 'finished'} self={p1?.userId === myId} />
                      <div className="my-0.5 h-px bg-blue-500/[0.12]" />
                      <PlayerRow player={p2} score={b.scores?.[p2?.userId]} won={winnerId === p2?.userId} matchFinished={b.state === 'finished'} self={p2?.userId === myId} />
                      {(b.spectatorCount > 0 || canSpectate) && (
                        <div className="mt-1 pt-1 border-t border-blue-500/[0.10] flex items-center justify-between text-[9.5px] text-blue-300/55">
                          {b.spectatorCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5"><Eye size={9} /> {b.spectatorCount}</span>
                          ) : <span />}
                          {canSpectate && <span className="font-semibold text-blue-300/80">Watch</span>}
                        </div>
                      )}
                    </>
                  );
                  if (canSpectate) {
                    return (
                      <button
                        key={b.code}
                        onClick={() => { setActiveMatchIsSpectator(true); setActiveMatchCode(b.code); }}
                        className={`${cellClasses} text-left w-full`}
                        title="Watch live"
                      >
                        {innerRows}
                      </button>
                    );
                  }
                  return (
                    <div key={b.code} className={cellClasses}>
                      {innerRows}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>

        <button
          onClick={handleLeaveTournament}
          className="w-full mt-4 py-2 rounded-xl text-[12px] text-rose-300/80 hover:text-rose-200 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          {finished ? <><ArrowLeft size={12} /> Back to menu</> : <><X size={12} /> {iAmOrganizer ? 'Cancel tournament' : iAmEliminated ? 'Exit' : 'Leave (forfeit)'}</>}
        </button>

        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}

        {showSnapshot && (
          <TournamentSnapshotModal
            tournament={tournament}
            roundsMap={roundsMap}
            roundNumbers={roundNumbers}
            roundLabel={roundLabel}
            snapshotRef={snapshotRef}
            onClose={() => setShowSnapshot(false)}
            copiedSnap={copiedSnap}
            setCopiedSnap={setCopiedSnap}
            downloadingPng={downloadingPng}
            setDownloadingPng={setDownloadingPng}
          />
        )}
      </div>
    );
  }

  // Fallback — no tournament loaded yet.
  return (
    <div className="p-6 text-center">
      <Loader2 size={20} className="mx-auto text-blue-300/40 animate-spin" />
    </div>
  );
}

function PlayerRow({ player, score, won, matchFinished, self }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 opacity-50">
        <span className="text-[11px] text-blue-300/40">—</span>
      </div>
    );
  }
  const eliminatedHere = matchFinished && !won;
  return (
    <div className={`flex items-center gap-2 px-1 py-1 ${eliminatedHere ? 'opacity-50' : ''}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
        won ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-300'
      }`}>
        {player.name.charAt(0).toUpperCase()}
      </div>
      <span className={`text-[11.5px] truncate flex-1 ${won ? 'font-bold text-white' : 'text-white/75'} ${eliminatedHere ? 'line-through' : ''}`}>
        {player.name}{self ? ' · you' : ''}
      </span>
      {typeof score === 'number' && (
        <span className="text-[10px] font-bold tabular-nums text-blue-300/70">{score}</span>
      )}
      {won && <Check size={11} className="text-blue-300 flex-shrink-0" />}
    </div>
  );
}

// =========================================================
// TOURNAMENT SNAPSHOT — host-only export. Renders a full, printable view
// of the bracket state and offers Copy (text summary) and Download PNG.
// =========================================================
function TournamentSnapshotModal({ tournament, roundsMap, roundNumbers, roundLabel, snapshotRef, onClose, copiedSnap, setCopiedSnap, downloadingPng, setDownloadingPng }) {
  const finished = tournament.state === 'finished';
  const champion = finished && tournament.champion
    ? tournament.players.find(p => p.userId === tournament.champion)
    : null;

  function buildTextSummary() {
    const lines = [];
    lines.push(`TOURNAMENT · ${tournament.code}${tournament.name && tournament.name !== tournament.topic ? ` · ${tournament.name}` : ''}`);
    lines.push(`Topic: ${tournament.topic}`);
    lines.push(`Size: ${tournament.size} · Best-of-${tournament.maxRounds || '?'} per match${tournament.timedMode ? ' · 2:00 per turn' : ''}`);
    lines.push(`State: ${tournament.state}`);
    if (champion) lines.push(`Champion: ${champion.name}`);
    lines.push('');
    lines.push('PLAYERS');
    for (const p of tournament.players) {
      lines.push(`  - ${p.name}${p.eliminated ? ` (eliminated R${p.eliminatedInRound || '?'})` : ''}`);
    }
    lines.push('');
    lines.push('BRACKET');
    for (const rn of roundNumbers) {
      lines.push(`  ${roundLabel(rn)}${tournament.roundTopics?.[rn] && tournament.roundTopics[rn] !== tournament.topic ? ` — "${tournament.roundTopics[rn]}"` : ''}`);
      for (const m of roundsMap[rn].sort((a, b) => a.matchIndex - b.matchIndex)) {
        const p1 = tournament.players.find(p => p.userId === m.players[0]);
        const p2 = tournament.players.find(p => p.userId === m.players[1]);
        const s1 = m.scores?.[p1?.userId];
        const s2 = m.scores?.[p2?.userId];
        const winId = m.winnerId;
        const fmt = (p, s) => p ? `${p.name}${typeof s === 'number' ? ` (${s})` : ''}${winId === p.userId ? ' ✓' : ''}` : '—';
        lines.push(`    ${fmt(p1, s1)} vs ${fmt(p2, s2)}${m.state === 'finished' ? '' : '  [in progress]'}`);
      }
    }
    lines.push('');
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    return lines.join('\n');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildTextSummary());
      setCopiedSnap(true);
      setTimeout(() => setCopiedSnap(false), 1500);
    } catch {}
  }

  async function handleDownload() {
    if (!snapshotRef.current) return;
    setDownloadingPng(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(snapshotRef.current, { pixelRatio: 2, cacheBust: true, skipFonts: true, backgroundColor: '#0b1220' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `tournament-${tournament.code}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.warn('Snapshot PNG export failed:', e);
    }
    setDownloadingPng(false);
  }

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/65 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl my-4 rounded-2xl border border-blue-500/30 bg-gradient-to-b from-[#0b1220] to-[#0e1426] shadow-[0_18px_48px_rgba(0,0,0,0.55)] overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-blue-500/15">
          <div className="flex items-center gap-2">
            <Camera size={14} className="text-blue-300" />
            <p className="text-[13px] font-bold text-white">Tournament snapshot</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              title="Copy text summary"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors"
            >
              {copiedSnap ? <Check size={11} /> : <Copy size={11} />}
              {copiedSnap ? 'Copied' : 'Copy text'}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloadingPng}
              title="Download bracket as PNG"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-50 transition-all"
            >
              {downloadingPng ? <InlineProgress active /> : <Download size={11} />}
              PNG
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Capture target — what gets exported to PNG */}
        <div ref={snapshotRef} className="p-6 bg-gradient-to-b from-[#0b1220] to-[#0e1426]">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-blue-400/70">Tournament</p>
              {tournament.name && tournament.name !== tournament.topic && (
                <p className="text-[16px] font-bold text-white">{tournament.name}</p>
              )}
              <p className="font-mono text-2xl font-black tabular-nums tracking-[0.18em] text-white">{tournament.code}</p>
              <p className="text-[12px] text-blue-200/85 mt-1.5 max-w-[440px]">"{tournament.topic}"</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-300/70"><Users size={10} /> {tournament.size}</span>
                {tournament.timedMode && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-300/70"><Clock size={10} /> 2:00</span>}
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300/70">best-of-{tournament.maxRounds || '?'}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  tournament.state === 'finished' ? 'text-emerald-300' : 'text-blue-300/70'
                }`}>{tournament.state}</span>
              </div>
            </div>
            {champion && (
              <div className="rounded-xl border border-blue-400/45 bg-gradient-to-b from-blue-500/25 to-blue-600/10 px-3 py-2 text-center flex-shrink-0">
                <Trophy size={18} className="mx-auto text-blue-200 mb-0.5" />
                <p className="text-[9px] uppercase tracking-[0.2em] text-blue-300/80">Champion</p>
                <p className="text-[13px] font-black text-white">{champion.name}</p>
              </div>
            )}
          </div>

          {/* Players strip */}
          <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Players</p>
            <div className="flex flex-wrap gap-1.5">
              {tournament.players.map(p => (
                <span
                  key={p.userId}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] ${
                    p.eliminated
                      ? 'bg-rose-500/10 border border-rose-500/25 text-rose-200/65 line-through decoration-rose-300/60'
                      : 'bg-blue-500/15 border border-blue-500/30 text-blue-100'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    p.eliminated ? 'bg-rose-500/20 text-rose-200/70' : 'bg-blue-500/30 text-blue-100'
                  }`}>{p.name.charAt(0).toUpperCase()}</span>
                  {p.name}
                  {p.eliminated && <span className="text-[8.5px] uppercase tracking-wider">R{p.eliminatedInRound || '?'}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Bracket columns — same layout as the live bracket */}
          <div className="flex gap-3 overflow-x-auto pb-1">
            {roundNumbers.map(rn => {
              const rTopic = tournament.roundTopics?.[rn];
              const hasOwnTopic = rTopic && rTopic !== tournament.topic;
              return (
                <div key={rn} className="flex-1 min-w-[170px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">{roundLabel(rn)}</p>
                  {hasOwnTopic && <p className="text-[10px] text-blue-200/75 italic truncate mb-1.5" title={rTopic}>"{rTopic}"</p>}
                  <div className="space-y-2">
                    {roundsMap[rn].sort((a, b) => a.matchIndex - b.matchIndex).map(m => {
                      const p1 = tournament.players.find(p => p.userId === m.players[0]);
                      const p2 = tournament.players.find(p => p.userId === m.players[1]);
                      const winnerId = m.winnerId;
                      return (
                        <div key={m.code} className={`rounded-lg border p-2 ${
                          m.state === 'finished'
                            ? 'border-blue-500/25 bg-blue-500/[0.05]'
                            : 'border-blue-500/[0.18] bg-blue-500/[0.03]'
                        }`}>
                          <SnapshotPlayerRow player={p1} score={m.scores?.[p1?.userId]} won={winnerId === p1?.userId} matchFinished={m.state === 'finished'} />
                          <div className="my-0.5 h-px bg-blue-500/[0.12]" />
                          <SnapshotPlayerRow player={p2} score={m.scores?.[p2?.userId]} won={winnerId === p2?.userId} matchFinished={m.state === 'finished'} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[9.5px] text-blue-300/40 mt-3 text-right">Generated {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function SnapshotPlayerRow({ player, score, won, matchFinished }) {
  if (!player) return <div className="flex items-center gap-2 px-1 py-1 opacity-50"><span className="text-[11px] text-blue-300/40">—</span></div>;
  const eliminated = matchFinished && !won;
  return (
    <div className={`flex items-center gap-2 px-1 py-1 ${eliminated ? 'opacity-50' : ''}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
        won ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-300'
      }`}>
        {player.name.charAt(0).toUpperCase()}
      </div>
      <span className={`text-[11.5px] truncate flex-1 ${won ? 'font-bold text-white' : 'text-white/75'} ${eliminated ? 'line-through' : ''}`}>
        {player.name}
      </span>
      {typeof score === 'number' && (
        <span className="text-[10px] font-bold tabular-nums text-blue-300/70">{score}</span>
      )}
      {won && <Check size={11} className="text-blue-300 flex-shrink-0" />}
    </div>
  );
}

function Singleplayer({ mode, setMode, onExit }) {
  const [topic, setTopic] = useState('');
  const [side, setSide] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [verdictLoading, setVerdictLoading] = useState(false);
  const [error, setError] = useState(null);
  const systemRef = useRef('');

  async function startDebate(t, s) {
    setError(null);
    try { await apiFetch('/api/debate/start', { method: 'POST' }); }
    catch (err) {
      if (err.code === 'debate_limit_reached') { setError(err.message || 'Weekly debate limit reached.'); return; }
    }
    setSide(s);
    setTopic(t);
    setMode('single-debate');
    systemRef.current = buildAdversarialSystem(s);
    doSend(`Topic: "${t}". I'm arguing ${s === 'for' ? 'FOR' : 'AGAINST'} this. Open with your counter — give me your strongest argument first.`);
  }

  async function doSend(text) {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system: systemRef.current, messages: allMessages, max_tokens: 4096, sourced: true }),
      });
      const reply = result.content?.[0]?.text || 'I need a moment to formulate my argument...';
      const sources = Array.isArray(result.sources) ? result.sources : [];
      const msg = { role: 'assistant', content: reply, timestamp: new Date().toISOString() };
      if (sources.length) msg.sources = sources;
      setMessages(prev => [...prev, msg]);
    } catch (err) {
      setMessages(prev => [...prev, errorChatMessage(err)]);
    }
    setStreamingContent('');
    setStreaming(false);
  }

  async function handleEndDebate() {
    if (verdictLoading) return;
    if (messages.length < 2) { setError('Make at least one argument before ending.'); return; }
    setVerdictLoading(true);
    try {
      const r = await apiFetch('/api/debate/singleplayer/verdict', {
        method: 'POST',
        body: JSON.stringify({
          topic, userSide: side,
          transcript: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      setVerdict(r.verdict);
      setMode('single-verdict');
    } catch (e) {
      setError(e.message || 'Failed to get verdict');
    }
    setVerdictLoading(false);
  }

  // SETUP
  if (mode === 'single-setup') {
    return (
      <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
        <button onClick={onExit} className="text-xs text-blue-300/60 hover:text-blue-200 mb-3 inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">Pick a topic</h2>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="What do you want to debate?"
          className="w-full px-3 py-2 rounded-lg border border-blue-500/30 bg-white/50 dark:bg-white/[0.06] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 mb-3"
        />
        <div className="mb-5">
          <TopicChips onPick={setTopic} />
        </div>
        {topic.trim() && (
          <>
            <p className="text-[11px] font-semibold text-blue-400/70 uppercase tracking-wider mb-2">Your side</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => startDebate(topic.trim(), 'for')} className="px-4 py-3 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 transition-all">
                FOR
              </button>
              <button onClick={() => startDebate(topic.trim(), 'against')} className="px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/40 text-blue-200 text-sm font-semibold hover:bg-blue-500/20 hover:border-blue-500/60 hover:text-blue-100 transition-colors">
                AGAINST
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // VERDICT
  if (mode === 'single-verdict' && verdict) {
    const won = verdict.winner === 'student';
    const tie = verdict.winner === 'tie';
    return (
      <div className="p-6 md:p-10 max-w-lg md:max-w-3xl mx-auto">
        <div className="rounded-2xl p-5 mb-4 text-center bg-blue-500/10 border border-blue-500/30">
          <Trophy size={32} className="mx-auto mb-2 text-blue-300" />
          <p className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-wider">
            {won ? 'You won' : tie ? 'Tie' : 'AI won'}
          </p>
          <p className="text-xs text-blue-300/80 mt-1.5 tabular-nums">
            You: <span className="font-bold">{verdict.studentScore}/100</span> · AI: <span className="font-bold">{verdict.aiScore}/100</span>
          </p>
        </div>
        <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.summary}</p>
        </div>
        {verdict.studentStrongest && (
          <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">★ Your strongest</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentStrongest}</p>
          </div>
        )}
        {verdict.studentWeakest && (
          <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">△ Your weakest</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.studentWeakest}</p>
          </div>
        )}
        {verdict.improve && (
          <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">→ Drill next</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{verdict.improve}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 transition-all inline-flex items-center justify-center gap-2">
          <ArrowLeft size={14} /> Back to menu
        </button>
      </div>
    );
  }

  // ACTIVE DEBATE
  const debateHeader = (
    <div className="flex items-center gap-2 px-3 py-2 bg-transparent">
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-200">
        You · {side === 'for' ? 'FOR' : 'AGAINST'}
      </span>
      <span className="text-[11px] text-white/80 truncate flex-1">{topic}</span>
      <button
        onClick={handleEndDebate}
        disabled={streaming || verdictLoading || messages.length < 2}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/20 border border-blue-400/40 text-blue-200 text-[11px] font-semibold hover:bg-blue-500/30 hover:text-blue-100 disabled:opacity-40 transition-colors"
      >
        {verdictLoading ? <><InlineProgress active /> Judging…</> : <><Swords size={11} /> End debate</>}
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {error && <p className="px-4 py-2 text-xs text-rose-300 bg-rose-500/10 border-b border-rose-500/20">{error}</p>}
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        onSend={(t) => !streaming && doSend(t)}
        disabled={streaming}
        placeholder={streaming ? 'AI is countering…' : 'Your argument'}
        header={debateHeader}
        className="h-full"
        flush
      />
    </div>
  );
}

// =========================================================
// MULTIPLAYER
// =========================================================
function Multiplayer({ mode, setMode, onExit, forceTimed = false, presetCode = null, tournamentCode = null, spectator = false }) {
  const { user } = useAuth();
  const myId = user?.id || null;
  const [iAmHost, setIAmHost] = useState(false);
  const [code, setCode] = useState('');
  const [match, setMatch] = useState(null);
  const [joinInput, setJoinInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [topicInput, setTopicInput] = useState('');
  // Per-side round cap. 0 = infinite (match only ends on vote-end).
  const [maxRounds, setMaxRounds] = useState(0);
  const [hostSide, setHostSide] = useState('for');
  const [timedMode, setTimedMode] = useState(forceTimed);
  const [argument, setArgument] = useState('');
  const [argImages, setArgImages] = useState([]);
  const [argDragOver, setArgDragOver] = useState(false);
  const argFileRef = useRef(null);
  const argDragDepth = useRef(0);
  const [submittingMove, setSubmittingMove] = useState(false);
  const [voting, setVoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef(null);
  // Tick state for the timed-mode countdown — refreshes once a second.
  // Computed from match.turnLimitMs - (now - match.turnStartedAt).
  const [nowTick, setNowTick] = useState(Date.now());
  const timeoutFiredRef = useRef(null);
  // Leave-debate UI state. confirmLeave shows the "Are you sure?" modal
  // when the player clicks Leave; opponentLeft is set from a server SSE
  // event when the other player abandons the match.
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(null);

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  async function addImageFiles(files) {
    const list = Array.from(files || []).filter(f => f.type?.startsWith('image/'));
    if (!list.length) return;
    const added = [];
    for (const f of list.slice(0, 4 - argImages.length)) {
      if (f.size > 5 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(f);
      added.push({ dataUrl, mimeType: f.type, name: f.name });
    }
    if (added.length) setArgImages(prev => [...prev, ...added]);
  }

  // Tournament entry path: when a presetCode is passed in, idempotently
  // join the match (server treats already-a-player as a no-op) and load
  // its current state so the user lands directly in the game view without
  // touching the create/join flow. Spectator entry skips /join entirely —
  // the SSE stream below auto-snapshots the match read-only.
  useEffect(() => {
    if (!presetCode || code) return;
    if (spectator) {
      setCode(presetCode);
      setMode('mp-game');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`/api/debate/match/${presetCode}/join`, { method: 'POST' });
        if (cancelled) return;
        setMatch(r.match);
        setCode(presetCode);
        setMode(r.match?.state === 'finished' ? 'mp-verdict' : 'mp-game');
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; };
  }, [presetCode, code, setMode, spectator]);

  // Spectator mode auto-switches into the verdict view once the SSE
  // snapshot tells us the match is finished.
  useEffect(() => {
    if (!spectator || !match) return;
    if (match.state === 'finished' && mode !== 'mp-verdict') setMode('mp-verdict');
  }, [spectator, match, mode, setMode]);

  useEffect(() => {
    if (!code || mode === 'mp-menu') return;
    const tok = getToken();
    if (!tok) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/debate/match/${code}/stream`, {
          headers: { Authorization: `Bearer ${tok}` },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.match) setMatch(ev.match);
              if (ev.type === 'started') setMode('mp-game');
              if (ev.type === 'finished') setMode('mp-verdict');
              if (ev.type === 'player_left' && ev.leaverId && ev.leaverId !== myId) {
                setOpponentLeft({ name: ev.leaverName || 'Opponent' });
              }
            } catch {}
          }
        }
      } catch {}
    })();
    streamRef.current = ctrl;
    return () => { try { ctrl.abort(); } catch {} };
  }, [code, mode, setMode, myId]);

  // Tick the countdown when the player is in a timed game. The effect
  // is a no-op when timed mode is off — no setInterval at all.
  useEffect(() => {
    if (!match?.timedMode || match.state !== 'playing') return;
    const id = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [match?.timedMode, match?.state, match?.turnStartedAt]);

  // Reset the timeout-fired ref whenever the turn changes — otherwise a
  // late timeout from the previous turn could no-op the next.
  useEffect(() => {
    timeoutFiredRef.current = null;
  }, [match?.turnStartedAt]);

  // Live-typing broadcast — only in timed mode, only on the active
  // player's side, debounced ~400ms so we're not hammering the server
  // with one POST per keystroke. The opponent reads match.draftText
  // from the SSE stream and renders it inline.
  useEffect(() => {
    if (!code) return;
    if (!match?.timedMode || match.state !== 'playing') return;
    if (match.turnOf !== myId) return;
    const handle = setTimeout(() => {
      apiFetch(`/api/debate/match/${code}/draft`, {
        method: 'POST',
        body: JSON.stringify({ text: argument }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(handle);
  }, [argument, code, match?.timedMode, match?.state, match?.turnOf, myId]);

  async function handleCreate() {
    setBusy(true); setError(null);
    try {
      const r = await apiFetch('/api/debate/match', { method: 'POST' });
      setCode(r.code); setMatch(r.match); setIAmHost(true); setMode('mp-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleJoin() {
    const c = joinInput.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${c}/join`, { method: 'POST' });
      setCode(c); setMatch(r.match); setIAmHost(false); setMode('mp-lobby');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleStart() {
    const t = topicInput.trim();
    if (!t) { setError('Topic required'); return; }
    setBusy(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/start`, {
        method: 'POST',
        body: JSON.stringify({ topic: t, hostSide, timedMode, maxRounds }),
      });
      setMatch(r.match); setMode('mp-game');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function handleSubmitMove() {
    const a = argument.trim();
    if (a.length < 20 && argImages.length === 0) {
      setError('Argument must be at least 20 characters (or attach an image)');
      return;
    }
    setSubmittingMove(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/move`, {
        method: 'POST',
        body: JSON.stringify({
          argument: a,
          images: argImages.map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType })),
        }),
      });
      setMatch(r.match);
      setArgument('');
      setArgImages([]);
    } catch (e) { setError(e.message); }
    setSubmittingMove(false);
  }

  // Time-expired auto-submit. Sends whatever's in the textbox (plus any
  // attached images) with a timedOut marker so the server can grade what
  // they had instead of stalling — empty drafts still fall back to 0/0/0.
  // Idempotent per turn via a ref keyed on the turn's start time.
  async function handleTimeout() {
    if (!match || !code) return;
    const turnKey = match.turnStartedAt || 0;
    if (timeoutFiredRef.current === turnKey) return;
    timeoutFiredRef.current = turnKey;
    try {
      const r = await apiFetch(`/api/debate/match/${code}/move`, {
        method: 'POST',
        body: JSON.stringify({
          argument: argument.trim() || '',
          images: argImages.map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType })),
          timedOut: true,
        }),
      });
      setMatch(r.match);
      setArgument('');
      setArgImages([]);
    } catch (e) {
      // Server may reject (already-not-your-turn etc.) — swallow.
      console.warn('Timeout submit failed:', e?.message);
    }
  }

  // Explicit leave. Fires the /leave endpoint so the opponent gets a
  // `player_left` SSE push and the match transitions out of "playing"
  // state instead of just leaving them staring at a stalled clock.
  async function handleLeave() {
    if (!code) { onExit(); return; }
    setLeaving(true);
    try {
      // In tournament context, leaving forfeits the bracket match — the
      // tournament endpoint synthesizes a verdict and advances the bracket
      // for us. Outside tournaments, plain match leave is fine.
      const path = tournamentCode
        ? `/api/debate/tournament/${tournamentCode}/leave`
        : `/api/debate/match/${code}/leave`;
      await apiFetch(path, { method: 'POST' });
    } catch {} // best effort — UI exits either way
    setLeaving(false);
    setConfirmLeave(false);
    onExit();
  }

  // Lobby ready toggle. Sends desired ready state; server emits a
  // ready_changed SSE event so both players' lists update instantly.
  async function handleToggleReady(next) {
    if (!code) return;
    try {
      const r = await apiFetch(`/api/debate/match/${code}/ready`, {
        method: 'POST',
        body: JSON.stringify({ ready: !!next }),
      });
      setMatch(r.match);
    } catch (e) { setError(e.message); }
  }

  async function handleVoteEnd() {
    setVoting(true); setError(null);
    try {
      const r = await apiFetch(`/api/debate/match/${code}/vote-end`, { method: 'POST' });
      setMatch(r.match);
      if (r.finished) setMode('mp-verdict');
    } catch (e) { setError(e.message); }
    setVoting(false);
  }

  function copyCode() {
    if (!code) return;
    try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch {}
  }

  // ===== MENU (Create / Join) =====
  if (mode === 'mp-menu') {
    return (
      <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
        <button onClick={onExit} className="text-xs text-blue-300/60 hover:text-blue-200 mb-3 inline-flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> Back
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">Match</h2>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full py-3 mb-4 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
        >
          {busy ? <InlineProgress active /> : <Zap size={14} />}
          Create new
        </button>

        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 border-t border-blue-500/20" />
          <span className="text-[10px] uppercase tracking-wider text-blue-400/70">or join</span>
          <div className="flex-1 border-t border-blue-500/20" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinInput}
            onChange={e => setJoinInput(e.target.value.toUpperCase().slice(0, 5))}
            onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
            placeholder="CODE"
            className="flex-1 px-3 py-2.5 rounded-xl border border-blue-500/30 bg-white/50 dark:bg-white/[0.06] text-sm font-mono uppercase tracking-widest text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinInput.trim().length < 4}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none transition-all"
          >
            Join
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== LOBBY =====
  if (mode === 'mp-lobby' && match) {
    const isHost = iAmHost || (myId && match.hostId === myId);
    const opponent = match.players.find(p => (myId ? p.userId !== myId : p.userId !== match.hostId));
    const opponentJoined = match.players.length >= 2;
    const readySet = new Set(match.readyUserIds || []);
    const iAmReady = readySet.has(myId);
    const allReady = opponentJoined && match.players.every(p => readySet.has(p.userId));
    return (
      <div className="p-6 md:p-10 max-w-md md:max-w-2xl mx-auto">
        <p className="text-[11px] uppercase tracking-[0.18em] text-blue-400/70 mb-1.5">Match code</p>
        <button
          onClick={copyCode}
          title="Copy"
          className="w-full font-mono text-3xl font-black tabular-nums tracking-[0.2em] text-gray-900 dark:text-white bg-white/[0.10] dark:bg-white/[0.06] border border-blue-500/40 dark:border-blue-500/30 rounded-xl py-4 mb-3 hover:border-blue-500/60 hover:bg-white/[0.18] dark:hover:bg-white/[0.10] transition-colors inline-flex items-center justify-center gap-3"
        >
          {match.code}
          {copied ? <Check size={18} className="text-blue-400" /> : <Copy size={16} className="text-blue-400/70" />}
        </button>
        <p className="text-[11px] text-blue-300/50 text-center mb-5">Share with your opponent</p>

        <div className="bg-white/[0.07] dark:bg-white/[0.04] border border-blue-500/[0.12] rounded-xl p-3 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Players</p>
          <div className="space-y-1.5">
            {match.players.map(p => {
              const pReady = readySet.has(p.userId);
              return (
                <div key={p.userId} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center text-[10px] font-bold">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                  {p.userId === match.hostId && <span title="Host" className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-blue-400/80"><Trophy size={9} /> host</span>}
                  {p.userId === myId && <span className="text-[9px] uppercase tracking-wider text-blue-300/55">you</span>}
                  <span
                    title={pReady ? 'Ready' : 'Not ready'}
                    className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      pReady ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-white/[0.04] text-white/40 border border-white/[0.10]'
                    }`}
                  >
                    {pReady ? <Check size={9} /> : null} {pReady ? 'ready' : 'not ready'}
                  </span>
                </div>
              );
            })}
            {!opponentJoined && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white/10 dark:bg-white/[0.06] flex items-center justify-center text-[10px] font-bold text-gray-400">?</div>
                <span className="text-[12px] text-blue-300/50 italic">Waiting…</span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Ready toggle — visible to both players. Host's Start button
            is gated below until both check in. */}
        <button
          type="button"
          onClick={() => handleToggleReady(!iAmReady)}
          disabled={!opponentJoined}
          className={`w-full mb-3 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-[12.5px] font-semibold transition-colors ${
            iAmReady
              ? 'bg-emerald-500/15 border-emerald-500/45 text-emerald-200 hover:bg-emerald-500/20'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-200 hover:bg-blue-500/20 hover:border-blue-500/50 disabled:opacity-40'
          }`}
        >
          <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${iAmReady ? 'bg-emerald-500 border-emerald-400' : 'border-blue-500/50 bg-transparent'}`}>
            {iAmReady && <Check size={11} className="text-white" />}
          </span>
          {iAmReady ? "I'm ready" : 'Click to ready up'}
        </button>

        {isHost ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Topic</p>
            <input
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              placeholder="What are we debating?"
              className="w-full px-3 py-2 mb-2 rounded-lg border border-blue-500/25 bg-white/50 dark:bg-white/[0.06] text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/45"
            />
            <div className="mb-4">
              <TopicChips onPick={setTopicInput} max={4} />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2">Your side</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setHostSide('for')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${hostSide === 'for' ? 'bg-blue-500/20 text-blue-100 border-blue-500/50' : 'border-blue-500/20 text-gray-700 dark:text-gray-300 bg-transparent hover:bg-blue-500/10'}`}
              >
                FOR
              </button>
              <button
                onClick={() => setHostSide('against')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${hostSide === 'against' ? 'bg-blue-500/20 text-blue-100 border-blue-500/50' : 'border-blue-500/20 text-gray-700 dark:text-gray-300 bg-transparent hover:bg-blue-500/10'}`}
              >
                AGAINST
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTimedMode(v => !v)}
              className={`w-full mb-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-[12.5px] transition-colors ${
                timedMode
                  ? 'bg-blue-500/15 border-blue-500/50 text-blue-100'
                  : 'bg-transparent border-blue-500/25 text-blue-300/85 hover:border-blue-500/50 hover:text-blue-200'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${timedMode ? 'bg-blue-500 border-blue-400' : 'border-blue-500/50 bg-transparent'}`}>
                  {timedMode && <Check size={11} className="text-white" />}
                </span>
                <Clock size={12} /> Timed
              </span>
              <span className="text-[10.5px] tabular-nums text-blue-300/70">2:00 / turn</span>
            </button>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/70 mb-2 mt-3">Rounds / side</p>
            <div className="grid grid-cols-5 gap-1.5 mb-4">
              {[
                { v: 3, label: '3' },
                { v: 5, label: '5' },
                { v: 7, label: '7' },
                { v: 10, label: '10' },
                { v: 0, label: '∞' },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => setMaxRounds(opt.v)}
                  title={opt.v === 0 ? 'Infinite — ends on vote' : `${opt.v} arguments per side, then auto-finalize`}
                  className={`py-2 rounded-lg text-[12.5px] font-bold tabular-nums border transition-colors ${
                    maxRounds === opt.v
                      ? 'bg-blue-500/20 text-blue-100 border-blue-500/50'
                      : 'border-blue-500/20 text-blue-300/70 bg-transparent hover:bg-blue-500/10 hover:text-blue-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleStart}
              disabled={busy || !topicInput.trim() || !opponentJoined || !allReady}
              className="w-full py-3 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 transition-all"
            >
              {busy ? <InlineProgress active /> : <Swords size={14} />}
              {!opponentJoined ? 'Waiting for opponent…' : !allReady ? 'Waiting for ready up…' : 'Start'}
            </button>
          </>
        ) : (
          <p className="text-xs text-blue-300/50 text-center italic py-4">
            {!allReady ? 'Ready up to start…' : 'Waiting for the host to start…'}
          </p>
        )}

        {error && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{error}</p>}
      </div>
    );
  }

  // ===== GAME =====
  if (mode === 'mp-game' && match) {
    const me = match.players.find(p => p.userId === myId);
    const opp = match.players.find(p => p.userId !== myId);
    const myTurn = match.turnOf === myId;
    const myScore = match.scores[myId] || 0;
    const oppScore = (opp && match.scores[opp.userId]) || 0;
    const iVoted = match.endVotes.includes(myId);
    const oppVoted = opp && match.endVotes.includes(opp.userId);

    // Timed-mode countdown. remainingMs is the live time the active player
    // has left to submit; UI ticks every 500ms via nowTick. When it hits 0
    // and we're the active player, fire a timeout submit once.
    const remainingMs = match.timedMode && match.turnStartedAt
      ? Math.max(0, (match.turnLimitMs || 120000) - (nowTick - match.turnStartedAt))
      : null;
    if (match.timedMode && myTurn && remainingMs === 0 && !submittingMove) {
      handleTimeout();
    }
    const formatClock = (ms) => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    };

    // Per-side round count. Used for the round badge — clamped to maxRounds
    // so the display reads "5/5" once the cap hits even if a stray turn
    // lands while finalization is in flight.
    const myTurnsUsed = match.turns.filter(t => t.userId === myId).length;
    const oppTurnsUsed = opp ? match.turns.filter(t => t.userId === opp.userId).length : 0;
    const roundsDisplay = match.maxRounds > 0
      ? `${Math.min(Math.max(myTurnsUsed, oppTurnsUsed), match.maxRounds)}/${match.maxRounds}`
      : `${Math.max(myTurnsUsed, oppTurnsUsed)} · ∞`;

    return (
      <div className="h-full flex flex-col relative">
        {/* Topic + scoreboard */}
        <div className="px-4 py-2 bg-transparent">
          <p className="text-xs text-white/80 font-medium truncate">{match.topic}</p>
          <div className="flex items-center gap-3 mt-1">
            <ScorePill name={me?.name || 'You'} side={me?.side} score={myScore} active={myTurn && !spectator} self={!spectator} />
            <span className="text-gray-300 dark:text-gray-600">vs</span>
            <ScorePill name={opp?.name || 'Opponent'} side={opp?.side} score={oppScore} active={!myTurn && !spectator} />
            <span
              title={match.maxRounds > 0 ? `Rounds used / cap per side. Match auto-ends when both sides hit ${match.maxRounds}.` : 'Infinite rounds — ends on vote'}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold tabular-nums bg-blue-500/10 border border-blue-500/25 text-blue-300/85"
            >
              <Swords size={10} /> {roundsDisplay}
            </span>
            {/* Live spectator count — visible to everyone when > 0. */}
            {match.spectatorCount > 0 && (
              <span
                title={`${match.spectatorCount} spectator${match.spectatorCount === 1 ? '' : 's'} watching`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold tabular-nums bg-white/[0.06] border border-white/[0.12] text-white/70"
              >
                <Eye size={10} /> {match.spectatorCount}
              </span>
            )}
            <span className="flex-1" />
            {spectator ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-200">
                  <Eye size={10} /> Spectating
                </span>
                <button
                  onClick={onExit}
                  title="Stop watching"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/[0.06] border border-white/[0.12] text-white/75 hover:bg-white/[0.10] hover:text-white transition-colors"
                >
                  <X size={11} /> Exit
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmLeave(true)}
                  title="Leave debate"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 hover:text-rose-200 transition-colors"
                >
                  <X size={11} /> Leave
                </button>
                <button
                  onClick={handleVoteEnd}
                  disabled={voting || iVoted}
                  title={iVoted ? 'Waiting for opponent to vote' : oppVoted ? 'Opponent voted — confirm to end' : 'Vote to end'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    iVoted
                      ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300/80'
                      : oppVoted
                        ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-blue-400/40 animate-pulse'
                        : 'bg-blue-500/20 border border-blue-400/40 text-blue-200 hover:bg-blue-500/30 hover:text-blue-100'
                  }`}
                >
                  {voting ? <InlineProgress active /> : iVoted ? <><Check size={11} /> Waiting</> : oppVoted ? <><Trophy size={11} /> Confirm end</> : <><Trophy size={11} /> End</>}
                </button>
              </>
            )}
          </div>
          {remainingMs !== null && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
                remainingMs <= 15000 ? 'text-rose-300' : myTurn ? 'text-blue-300' : 'text-white/40'
              }`}>
                {myTurn ? 'Your turn' : `${opp?.name || 'Opponent'}'s turn`}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-base font-bold tabular-nums border-2 shadow-[0_2px_14px_rgba(0,0,0,0.25)] transition-colors ${
                  remainingMs <= 15000
                    ? 'bg-rose-500/25 border-rose-500/70 text-rose-100 animate-pulse shadow-rose-500/30'
                    : remainingMs <= 45000
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-100'
                      : 'bg-blue-500/20 border-blue-500/55 text-blue-100'
                }`}
                title={myTurn ? 'Time left on your turn. When it hits 0 your draft is auto-submitted.' : `Time left on ${opp?.name || 'opponent'}'s turn.`}
              >
                <Clock size={14} strokeWidth={2.5} />
                {formatClock(remainingMs)}
              </span>
            </div>
          )}
        </div>

        {/* Turn list */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {match.turns.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-blue-300/45">
              {myTurn ? <Zap size={18} /> : (
                <div className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" style={{animationDelay: '0.15s'}} />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" style={{animationDelay: '0.3s'}} />
                </div>
              )}
              <p className="text-[11px]">{myTurn ? 'Your opening statement' : `Waiting for ${opp?.name || 'opponent'}…`}</p>
            </div>
          )}
          {match.turns.map((t, i) => {
            const isMine = t.userId === myId;
            return (
              <div key={i} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm ${isMine ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white border border-blue-400/40 shadow-[0_4px_18px_rgba(59,130,246,0.25)] rounded-tr-md' : 'bg-white/[0.12] dark:bg-white/[0.07] border border-blue-500/20 text-gray-900 dark:text-gray-100 rounded-tl-md'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isMine ? 'text-blue-100/80' : 'text-blue-400/80'}`}>
                      {t.side === 'for' ? 'FOR' : 'AGAINST'} · {isMine ? 'you' : opp?.name}
                    </span>
                    {t.timedOut && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isMine ? 'bg-white/15 text-white/75' : 'bg-amber-500/15 text-amber-300 dark:text-amber-200 border border-amber-500/30'
                      }`}>
                        <Clock size={8} strokeWidth={3} />
                        Auto-submitted
                      </span>
                    )}
                  </div>
                  {Array.isArray(t.images) && t.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {t.images.map((img, ii) => (
                        <a key={ii} href={img.dataUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={img.dataUrl}
                            alt={`evidence ${ii + 1}`}
                            className="max-w-[180px] max-h-[180px] rounded-lg object-cover border border-white/20 dark:border-white/10"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {t.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{t.content}</p>}
                  <div className={`mt-3 pt-2.5 border-t ${isMine ? 'border-white/20' : 'border-blue-500/15 dark:border-white/[0.08]'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-baseline gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                        isMine
                          ? 'bg-white/20 text-white border border-white/25'
                          : 'bg-blue-500/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 border border-blue-500/30'
                      }`}>
                        {t.score.total}<span className="opacity-60 text-[9.5px] ml-0.5">/30</span>
                      </span>
                      {[
                        { label: 'ARG', value: t.score.argumentation },
                        { label: 'EV', value: t.score.evidence },
                        { label: 'RH', value: t.score.rhetoric },
                      ].map(s => (
                        <span key={s.label} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
                          isMine
                            ? 'bg-white/10 text-white/90'
                            : 'bg-blue-500/[0.08] dark:bg-white/[0.06] text-gray-700 dark:text-gray-200'
                        }`}>
                          <span className={`font-semibold tracking-wide ${isMine ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>{s.label}</span>
                          <span className="font-bold">{s.value}</span>
                        </span>
                      ))}
                    </div>
                    {t.feedback && (
                      <p className={`mt-1.5 text-[11px] leading-snug ${isMine ? 'text-white/85' : 'text-gray-600 dark:text-gray-300'}`}>
                        {t.feedback}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Live opponent draft — only renders in timed mode while it's
              the opponent's turn AND they have actually typed something.
              Visually distinct from a sent turn (lower opacity, dashed
              border, blinking caret) so it's clearly in-progress. */}
          {match.timedMode && !myTurn && match.draftBy && match.draftBy !== myId && match.draftText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl p-3.5 border-2 border-dashed border-blue-500/40 bg-blue-500/[0.04] text-gray-900 dark:text-gray-100 rounded-tl-md">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400/80">
                    {opp?.side === 'for' ? 'FOR' : 'AGAINST'} · {opp?.name} is typing
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {match.draftText}
                  <span className="inline-block w-0.5 h-4 align-middle bg-blue-400 ml-0.5 animate-pulse" />
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Composer — hidden for spectators (read-only). */}
        {!spectator && <div
          className="relative bg-transparent px-3 pt-2 pb-3"
          onDragEnter={e => {
            if (!myTurn) return;
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            argDragDepth.current++;
            setArgDragOver(true);
          }}
          onDragOver={e => {
            if (!myTurn) return;
            if (e.dataTransfer?.types?.includes('Files')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDragLeave={e => {
            e.preventDefault();
            argDragDepth.current = Math.max(0, argDragDepth.current - 1);
            if (argDragDepth.current === 0) setArgDragOver(false);
          }}
          onDrop={async (e) => {
            if (!myTurn) return;
            e.preventDefault();
            argDragDepth.current = 0;
            setArgDragOver(false);
            await addImageFiles(e.dataTransfer?.files);
          }}
        >
          {/* Drag overlay */}
          {argDragOver && myTurn && (
            <div className="absolute inset-x-3 top-2 bottom-3 z-20 rounded-xl border-2 border-dashed border-white/50 bg-white/60 dark:bg-white/[0.10] flex items-center justify-center pointer-events-none">
              <p className="text-sm font-bold text-gray-700 dark:text-white">Drop image to attach</p>
            </div>
          )}

          {!myTurn ? (
            <p className="text-xs text-blue-300/70 text-center py-2.5 italic flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {opp?.name || 'Opponent'}'s turn
            </p>
          ) : (
            <>
              <input
                ref={argFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { addImageFiles(e.target.files); e.target.value = ''; }}
              />

              {/* Image thumbnails */}
              {argImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {argImages.map((img, i) => (
                    <div key={i} className="relative w-14 h-14 rounded-md overflow-hidden border border-white/20 dark:border-white/[0.10] bg-white/10 dark:bg-white/[0.06]">
                      <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setArgImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
                        aria-label="Remove image"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                value={argument}
                onChange={e => setArgument(e.target.value)}
                onPaste={async (e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const files = [];
                  for (const it of items) {
                    if (it.kind === 'file') {
                      const f = it.getAsFile();
                      if (f && f.type?.startsWith('image/')) files.push(f);
                    }
                  }
                  if (files.length) {
                    e.preventDefault();
                    await addImageFiles(files);
                  }
                }}
                placeholder={`Argue as ${me?.side?.toUpperCase()}…`}
                rows={4}
                disabled={submittingMove}
                className="w-full p-3 rounded-xl border border-blue-500/25 bg-white/30 dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 resize-y"
              />
              <div className="flex items-center justify-between mt-2 gap-2">
                <button
                  type="button"
                  onClick={() => argFileRef.current?.click()}
                  disabled={submittingMove || argImages.length >= 4}
                  title="Attach image (paste or drag also works)"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-blue-300/65 hover:text-blue-200 hover:bg-blue-500/10 disabled:opacity-40 transition-colors"
                >
                  <Paperclip size={11} /> Image
                </button>
                <p className="text-[10px] text-blue-300/55 tabular-nums flex-1">
                  {argument.length} chars
                  {argImages.length > 0 && <span className="ml-1.5">· {argImages.length} image{argImages.length === 1 ? '' : 's'}</span>}
                </p>
                <button
                  onClick={handleSubmitMove}
                  disabled={submittingMove || (argument.trim().length < 20 && argImages.length === 0)}
                  className="px-4 py-1.5 rounded-md bg-gradient-to-b from-blue-500 to-blue-600 text-white text-xs font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_12px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 disabled:opacity-40 disabled:shadow-none inline-flex items-center gap-1 transition-all"
                >
                  {submittingMove ? <><InlineProgress active /> Grading…</> : <><Zap size={12} /> Send</>}
                </button>
              </div>
            </>
          )}
        </div>}

        {error && <p className="mx-3 mb-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-1.5">{error}</p>}

        {confirmLeave && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm p-6">
            <div className="w-full max-w-xs rounded-2xl border border-rose-500/30 bg-gradient-to-b from-[#0b1220] to-[#0e1426] shadow-[0_18px_48px_rgba(0,0,0,0.55)] p-5 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center">
                <AlertCircle size={22} className="text-rose-300" />
              </div>
              <p className="text-[14px] font-bold text-white mb-1">Leave debate?</p>
              <p className="text-[11.5px] text-white/55 mb-4">Your opponent will be notified.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmLeave(false)}
                  disabled={leaving}
                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeave}
                  disabled={leaving}
                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold text-white bg-gradient-to-b from-rose-500 to-rose-600 border border-rose-400/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_12px_rgba(244,63,94,0.30)] hover:from-rose-400 hover:to-rose-500 disabled:opacity-50 transition-all inline-flex items-center justify-center gap-1.5"
                >
                  {leaving ? <InlineProgress active /> : <X size={12} />}
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {opponentLeft && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm p-6">
            <div className="w-full max-w-xs rounded-2xl border border-blue-500/30 bg-gradient-to-b from-[#0b1220] to-[#0e1426] shadow-[0_18px_48px_rgba(0,0,0,0.55)] p-5 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-blue-500/15 border border-blue-400/35 flex items-center justify-center">
                <Users size={22} className="text-blue-200" />
              </div>
              <p className="text-[14px] font-bold text-white mb-0.5">{opponentLeft.name} left</p>
              <p className="text-[11.5px] text-white/55 mb-4">The match has ended.</p>
              <button
                onClick={() => { setOpponentLeft(null); onExit(); }}
                className="w-full py-2 rounded-lg text-[12px] font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_12px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 transition-all inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft size={13} /> Back to menu
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== VERDICT =====
  if (mode === 'mp-verdict' && match?.verdict) {
    const v = match.verdict;
    const me = match.players.find(p => p.userId === myId);
    const won = v.winner === me?.side;
    const tie = v.winner === 'tie';
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="rounded-2xl p-5 mb-4 text-center bg-blue-500/10 border border-blue-500/30">
          <Trophy size={32} className="mx-auto mb-2 text-blue-300" />
          <p className="text-2xl font-black uppercase tracking-wider text-gray-900 dark:text-white">
            {tie ? 'Tie' : v.winner === 'for' ? 'FOR' : 'AGAINST'}
          </p>
          <p className="text-xs text-blue-300/80 mt-1.5 tabular-nums">
            {match.players.map(p => `${p.side?.toUpperCase()} ${match.scores[p.userId] || 0}`).join(' · ')}
          </p>
        </div>
        <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-4 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1.5">Verdict</p>
          <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{v.summary}</p>
        </div>
        {v.forStrongest && (
          <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">★ FOR's best</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.forStrongest}</p>
          </div>
        )}
        {v.againstStrongest && (
          <div className="bg-white/[0.04] border border-blue-500/20 rounded-xl p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400/80 mb-1">★ AGAINST's best</p>
            <p className="text-xs text-gray-800 dark:text-gray-100 leading-relaxed">{v.againstStrongest}</p>
          </div>
        )}
        <button onClick={onExit} className="w-full py-2.5 rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 text-white text-sm font-semibold border border-blue-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_18px_rgba(59,130,246,0.30)] hover:from-blue-400 hover:to-blue-500 transition-all inline-flex items-center justify-center gap-2">
          <ArrowLeft size={14} /> {tournamentCode ? 'Back to bracket' : 'Back to menu'}
        </button>
      </div>
    );
  }

  // Fallback
  return (
    <div className="p-6 text-center">
      <AlertCircle size={20} className="mx-auto text-blue-300/40" />
    </div>
  );
}

function ScorePill({ name, side, score, active, self }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors ${active ? 'ring-2 ring-white/40 dark:ring-white/20 bg-white/20 dark:bg-white/10' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
        {side === 'for' ? 'FOR' : side === 'against' ? 'AG.' : '—'}
      </span>
      <span className="text-[11px] font-bold text-gray-800 dark:text-gray-100 tabular-nums">{score}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[80px]">
        {self ? 'you' : name}
      </span>
    </div>
  );
}
