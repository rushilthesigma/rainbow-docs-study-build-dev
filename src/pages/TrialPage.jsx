import { useState, useEffect } from 'react';
import { Zap, Trophy, RefreshCw, BookOpen, AlertCircle, Swords, Database, Sparkles, Users } from 'lucide-react';
import Button from '../components/shared/Button';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import TrialSession from '../components/trial/TrialSession';
import { generateQuestions, fetchQBReaderQuestions, getTrialQueue, saveTrialSession, getTrialStats } from '../api/trial';
import { isDue } from '../utils/sm2';

// ── Topics ────────────────────────────────────────────────────────────────
const STANDARD_TOPICS = [
  'World History', 'American History', 'Literature', 'Science', 'Biology',
  'Chemistry', 'Physics', 'Math', 'Geography', 'Current Events',
  'Classical Music', 'Fine Arts', 'Philosophy', 'Economics', 'Computer Science',
];
const NICHE_TOPICS = [
  'Mythology', 'Architecture', 'Opera', 'Film & Cinema', 'Jazz & Blues',
  'Ancient Civilizations', 'Linguistics', 'Astronomy', 'Art History',
  'Organic Chemistry', 'Number Theory', 'Evolutionary Biology',
  'Political Theory', 'Constitutional Law', 'Shakespeare',
  'Medieval History', 'Quantum Physics', 'Marine Biology', 'Theater',
];

// ── 7 bots — generic Player N names by default ───────────────────────────
const BOT_ROSTER = [
  { id: 'biscuit', name: 'Player 2', label: 'Newbie',       stars: 1, color: 'slate',   buzzAt: 0.90, accuracy: 0.40, thinkMs: 3000 },
  { id: 'alex',    name: 'Player 3', label: 'Amateur',      stars: 2, color: 'emerald', buzzAt: 0.80, accuracy: 0.58, thinkMs: 1800 },
  { id: 'sam',     name: 'Player 4', label: 'Varsity',      stars: 3, color: 'amber',   buzzAt: 0.62, accuracy: 0.74, thinkMs: 1100 },
  { id: 'jordan',  name: 'Player 5', label: 'Collegiate',   stars: 3, color: 'sky',     buzzAt: 0.50, accuracy: 0.82, thinkMs: 800  },
  { id: 'quinn',   name: 'Player 6', label: 'Invitational', stars: 4, color: 'violet',  buzzAt: 0.36, accuracy: 0.90, thinkMs: 600  },
  { id: 'morgan',  name: 'Player 7', label: 'National',     stars: 4, color: 'orange',  buzzAt: 0.22, accuracy: 0.94, thinkMs: 350  },
  { id: 'cipher',  name: 'Player 8', label: 'Pro',          stars: 5, color: 'rose',    buzzAt: 0.12, accuracy: 0.98, thinkMs: 150  },
];

const DEFAULT_BOT_NAMES = Object.fromEntries(BOT_ROSTER.map(b => [b.id, b.name]));

// ── Modes ─────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'quick',    label: 'Quick Trial',    icon: Zap,      desc: '5 questions · ~3 min',            count: 5,    color: 'blue'    },
  { id: 'standard', label: 'Standard Round', icon: BookOpen, desc: '10 questions · ~6 min',           count: 10,   color: 'indigo'  },
  { id: 'full',     label: 'Full Packet',    icon: Trophy,   desc: '20 questions · ~12 min',          count: 20,   color: 'violet'  },
  { id: 'lobby',    label: 'Lobby Match',    icon: Users,    desc: '8 players · tournament room',     count: 20,   color: 'cyan'    },
  { id: '1v1',      label: '1v1 Match',      icon: Swords,   desc: 'Head-to-head · first to 10 pts', count: 15,   color: 'rose'    },
  { id: 'review',   label: 'SRS Review',     icon: RefreshCw,desc: 'Due cards only · spaced rep',     count: null, color: 'emerald' },
];

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   desc: 'Intro / MS level' },
  { id: 'medium', label: 'Medium', desc: 'High school varsity' },
  { id: 'hard',   label: 'Hard',   desc: 'College / nationals' },
];

// ── Scoring formats ──────────────────────────────────────────────────────
// Tossup point rules per format. Two data models coexist for back-compat:
//   - Simple flat (`getPts`/`negPts`, optional `powerThreshold`+`powerPts`)
//   - Tiered (`tiers: [{ upTo, pts }, …]` with optional `afterEndPts`,
//     `negDuring`, `negAfter`) — required for real IAC Playoff scoring.
// Values for IAC Prelim/Playoff come from the official IAC rules PDFs
// (iacompetitions.com). `target` is points-to-win in 1v1 mode.
const SCORING_FORMATS = [
  { id: 'standard',    label: 'Standard',    desc: 'Continuous · earlier = more',
    powerThreshold: null, powerPts: null, getPts: 10, negPts: -5, target: null },
  { id: 'iac-prelim',  label: 'IAC Prelim',  desc: '1 pt · race to 8',
    powerThreshold: null, powerPts: null, getPts: 1, negPts: -1, target: 8 },
  { id: 'iac-playoff', label: 'IAC Playoff', desc: '6/5/4/3 · −2 / −1 neg',
    tiers: [{ upTo: 0.33, pts: 6 }, { upTo: 0.66, pts: 5 }, { upTo: 1.0, pts: 4 }],
    afterEndPts: 3, negDuring: -2, negAfter: -1,
    powerThreshold: 0.33, powerPts: 6, getPts: 4, negPts: -2, target: 40 },
  { id: 'jv',          label: 'JV',          desc: 'Get 10 · No power · No neg',
    powerThreshold: null, powerPts: null, getPts: 10, negPts: 0, target: 40 },
];

// ── Color maps ────────────────────────────────────────────────────────────
const COLOR_BTN = {
  blue:    'border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/18 hover:border-blue-500/50',
  indigo:  'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/18 hover:border-indigo-500/50',
  violet:  'border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/18 hover:border-violet-500/50',
  cyan:    'border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/18 hover:border-cyan-500/50',
  rose:    'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/18 hover:border-rose-500/50',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/18 hover:border-emerald-500/50',
};
const COLOR_TEXT = {
  blue:'text-blue-300', indigo:'text-indigo-300', violet:'text-violet-300',
  cyan:'text-cyan-300', rose:'text-rose-300', emerald:'text-emerald-300',
};
const COLOR_ICON = {
  blue:'text-blue-400', indigo:'text-indigo-400', violet:'text-violet-400',
  cyan:'text-cyan-400', rose:'text-rose-400', emerald:'text-emerald-400',
};

const BOT_BORDER = {
  slate:   'border-slate-500/30 bg-slate-500/10 hover:border-slate-400/50',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-400/50',
  amber:   'border-amber-500/30 bg-amber-500/10 hover:border-amber-400/50',
  sky:     'border-sky-500/30 bg-sky-500/10 hover:border-sky-400/50',
  violet:  'border-violet-500/30 bg-violet-500/10 hover:border-violet-400/50',
  orange:  'border-orange-500/30 bg-orange-500/10 hover:border-orange-400/50',
  rose:    'border-rose-500/30 bg-rose-500/10 hover:border-rose-400/50',
};
const BOT_TEXT = {
  slate:'text-slate-300', emerald:'text-emerald-300', amber:'text-amber-300',
  sky:'text-sky-300', violet:'text-violet-300', orange:'text-orange-300', rose:'text-rose-300',
};
const BOT_RING = {
  slate:'ring-slate-500/40', emerald:'ring-emerald-500/40', amber:'ring-amber-500/40',
  sky:'ring-sky-500/40', violet:'ring-violet-500/40', orange:'ring-orange-500/40', rose:'ring-rose-500/40',
};
// Static border+bg only (for input containers)
const BOT_STATIC = {
  slate:   'border-slate-500/25 bg-slate-500/[0.07]',
  emerald: 'border-emerald-500/25 bg-emerald-500/[0.07]',
  amber:   'border-amber-500/25 bg-amber-500/[0.07]',
  sky:     'border-sky-500/25 bg-sky-500/[0.07]',
  violet:  'border-violet-500/25 bg-violet-500/[0.07]',
  orange:  'border-orange-500/25 bg-orange-500/[0.07]',
  rose:    'border-rose-500/25 bg-rose-500/[0.07]',
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function TrialPage() {
  const [screen,         setScreen]        = useState('lobby');
  const [mode,           setMode]          = useState(MODES[0]);
  const [topic,          setTopic]         = useState('World History');
  const [difficulty,     setDifficulty]    = useState('medium');
  const [scoringFormat,  setScoringFormat] = useState(SCORING_FORMATS[0]);
  const [source,         setSource]        = useState('qbreader'); // default: real QB questions
  const [selectedBot,    setSelectedBot]   = useState(BOT_ROSTER[2]); // Player 4 for 1v1
  const [practiceBotIds, setPracticeBotIds]= useState(['biscuit', 'alex', 'sam']);
  const [botCustomNames, setBotCustomNames]= useState({ ...DEFAULT_BOT_NAMES });
  const [questions,      setQuestions]     = useState([]);
  const [sessionBots,    setSessionBots]   = useState(null);
  const [matchMode,      setMatchMode]     = useState(false);
  const [lobbyMode,      setLobbyMode]     = useState(false);
  const [stats,          setStats]         = useState(null);
  const [dueCount,       setDueCount]      = useState(0);
  const [error,          setError]         = useState(null);
  const [lastResult,     setLastResult]    = useState(null);

  useEffect(() => { loadStats(); loadDueCount(); }, []);

  async function loadStats()    { try { setStats(await getTrialStats()); } catch {} }
  async function loadDueCount() {
    try { const d = await getTrialQueue(); setDueCount((d.items || []).filter(isDue).length); } catch {}
  }

  function handleSourceChange(src) {
    setSource(src);
    if (src === 'qbreader' && NICHE_TOPICS.includes(topic)) setTopic('World History');
  }

  function togglePracticeBot(id) {
    setPracticeBotIds(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(x => x !== id) : prev
        : [...prev, id]
    );
  }

  function updateBotName(id, val) {
    setBotCustomNames(p => ({ ...p, [id]: val.slice(0, 16) }));
  }

  async function startSession() {
    setError(null);
    setScreen('loading');
    try {
      let qs;
      const isLobby  = mode.id === 'lobby';
      const is1v1    = mode.id === '1v1';
      const isReview = mode.id === 'review';

      // ── Fetch questions ──
      if (isReview) {
        const queueData = await getTrialQueue();
        const all  = queueData.items || [];
        const due  = all.filter(isDue);
        const pool = due.length > 0 ? due : all;
        if (pool.length === 0) {
          setError('No review items yet — play a Quick Trial first to build your queue.');
          setScreen('lobby'); return;
        }
        qs = pool.slice(0, 10).map(item => ({
          id: item.id, question: item.question, answer: item.answer,
          topic: item.topic, ease: item.ease, interval: item.interval,
          reps: item.reps, nextDue: item.nextDue,
        }));
      } else if (source === 'qbreader') {
        const data = await fetchQBReaderQuestions(topic, mode.count, difficulty);
        qs = data.questions;
        if (!qs || qs.length === 0) {
          setError('QBReader returned no questions for this topic/difficulty. Try a different topic or switch to AI Generated.');
          setScreen('lobby'); return;
        }
      } else {
        const data = await generateQuestions(topic, mode.count, difficulty);
        qs = data.questions;
      }

      // ── Set bots ──
      if (isLobby) {
        setSessionBots([...BOT_ROSTER]);
        setMatchMode(false);
        setLobbyMode(true);
      } else if (is1v1) {
        setSessionBots([selectedBot]);
        setMatchMode(true);
        setLobbyMode(false);
      } else {
        const bots = BOT_ROSTER.filter(b => practiceBotIds.includes(b.id));
        setSessionBots(bots.length > 0 ? bots : BOT_ROSTER.slice(0, 3));
        setMatchMode(false);
        setLobbyMode(false);
      }

      setQuestions(qs);
      setScreen('session');
    } catch (e) {
      setError(e.message || 'Failed to load questions. Try again.');
      setScreen('lobby');
    }
  }

  async function handleSessionComplete(result) {
    setLastResult(result);
    try { await saveTrialSession(result.sessionResults); } catch {}
    loadStats(); loadDueCount();
    setScreen('summary');
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <LoadingSpinner />
        <p className="text-white/45 text-sm">
          {mode.id === 'review'
            ? 'Loading review queue…'
            : source === 'qbreader'
              ? `Fetching QBReader tossups on ${topic}…`
              : `Generating ${mode.count} ${difficulty} AI tossups on ${topic}…`}
        </p>
      </div>
    );
  }

  // ── Session ────────────────────────────────────────────────────────────
  if (screen === 'session') {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <TrialSession
          questions={questions}
          difficulty={difficulty}
          bots={sessionBots}
          matchMode={matchMode}
          lobbyMode={lobbyMode}
          botNames={botCustomNames}
          scoringFormat={scoringFormat}
          onComplete={handleSessionComplete}
        />
      </div>
    );
  }

  // ── Summary ────────────────────────────────────────────────────────────
  if (screen === 'summary') {
    const correct = (lastResult?.sessionResults || []).filter(r => r.correct).length;
    const total   = lastResult?.sessionResults?.length ?? 0;
    const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-md mx-auto flex flex-col items-center text-center space-y-6 py-10 px-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.35)]">
            <Trophy size={28} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Session Complete</h2>
            <p className="text-white/40 text-sm mt-1">{correct}/{total} correct · {pct}% accuracy · +{lastResult?.xp ?? 0} XP</p>
          </div>
          <div className="w-full space-y-3">
            <Button onClick={() => { setScreen('lobby'); setLastResult(null); }} size="lg" className="w-full">
              <RefreshCw size={15} /> Play Again
            </Button>
            <Button onClick={() => { setMode(MODES.find(m => m.id === 'review')); setScreen('lobby'); }} variant="secondary" size="lg" className="w-full">
              <BookOpen size={15} /> Review Due Cards
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lobby ──────────────────────────────────────────────────────────────
  const hideTopicDiff = mode.id === 'review';

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-2xl mx-auto space-y-6 p-1 pb-10">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.35)]">
            <Trophy size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Trial Mode</h1>
            <p className="text-sm text-white/35">QB tossup practice · AI competitors · spaced repetition</p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={Trophy}    label="Sessions"  value={stats.totalSessions ?? 0} />
            <StatCard icon={Zap}       label="Total XP"  value={stats.totalXP ?? 0}  color="yellow" />
            <StatCard icon={RefreshCw} label="Due Today" value={dueCount} color={dueCount > 0 ? 'emerald' : undefined} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3">
            <AlertCircle size={14} className="text-rose-400 flex-shrink-0 mt-0.5" />
            <p className="text-rose-300 text-sm">{error}</p>
          </div>
        )}

        {/* ── Mode ── */}
        <div>
          <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Session Type</p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map(m => {
              const Icon = m.icon;
              const sel  = mode.id === m.id;
              return (
                <button key={m.id} onClick={() => setMode(m)}
                  className={`relative rounded-xl border p-4 text-left transition-all focus:outline-none ${COLOR_BTN[m.color]} ${sel ? 'ring-2 ring-white/15' : ''}`}>
                  {sel && <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-white/50" />}
                  {m.id === 'review' && dueCount > 0 && (
                    <span className="absolute top-2 right-2 text-[10px] bg-emerald-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">{dueCount}</span>
                  )}
                  <Icon size={17} className={`mb-2 ${COLOR_ICON[m.color]}`} />
                  <div className={`font-semibold text-sm ${COLOR_TEXT[m.color]}`}>{m.label}</div>
                  <div className="text-white/35 text-xs mt-0.5">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Source picker ── */}
        {!hideTopicDiff && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Question Source</p>
            <div className="flex gap-3">
              <button onClick={() => handleSourceChange('qbreader')}
                className={`flex-1 rounded-xl border p-3 text-left transition-all focus:outline-none ${
                  source === 'qbreader'
                    ? 'bg-amber-500/12 border-amber-500/40 ring-1 ring-amber-500/25'
                    : 'bg-white/[0.03] border-white/[0.07] hover:border-white/[0.14]'
                }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <Database size={12} className={source === 'qbreader' ? 'text-amber-400' : 'text-white/25'} />
                  <span className={`font-semibold text-sm ${source === 'qbreader' ? 'text-amber-200' : 'text-white/45'}`}>QBReader</span>
                </div>
                <div className="text-xs text-white/25">Real tournament questions</div>
              </button>
              <button onClick={() => handleSourceChange('ai')}
                className={`flex-1 rounded-xl border p-3 text-left transition-all focus:outline-none ${
                  source === 'ai'
                    ? 'bg-blue-500/12 border-blue-500/40 ring-1 ring-blue-500/25'
                    : 'bg-white/[0.03] border-white/[0.07] hover:border-white/[0.14]'
                }`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles size={12} className={source === 'ai' ? 'text-blue-400' : 'text-white/25'} />
                  <span className={`font-semibold text-sm ${source === 'ai' ? 'text-blue-200' : 'text-white/45'}`}>AI Generated</span>
                </div>
                <div className="text-xs text-white/25">Gemini · includes niche topics</div>
              </button>
            </div>
          </div>
        )}

        {/* ── 1v1 opponent picker ── */}
        {mode.id === '1v1' && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Opponent</p>
            <div className="grid grid-cols-4 gap-2">
              {BOT_ROSTER.map(bot => {
                const sel = selectedBot.id === bot.id;
                return (
                  <button key={bot.id} onClick={() => setSelectedBot(bot)}
                    className={`rounded-xl border p-2.5 text-left transition-all focus:outline-none ${BOT_BORDER[bot.color]} ${sel ? `ring-2 ${BOT_RING[bot.color]}` : ''}`}>
                    <div className={`font-bold text-[11px] ${BOT_TEXT[bot.color]} truncate`}>
                      {botCustomNames[bot.id] || bot.name}
                    </div>
                    <div className="text-white/25 text-[9px] mt-0.5 tracking-tighter">{'★'.repeat(bot.stars)}</div>
                    <div className="text-white/20 text-[10px] mt-1">{Math.round(bot.accuracy * 100)}% acc</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Practice bot selector ── */}
        {mode.id !== '1v1' && mode.id !== 'review' && mode.id !== 'lobby' && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">
              Competitors
              <span className="normal-case ml-2 text-white/20">({practiceBotIds.length} active)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {BOT_ROSTER.map(bot => {
                const sel = practiceBotIds.includes(bot.id);
                return (
                  <button key={bot.id} onClick={() => togglePracticeBot(bot.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all focus:outline-none ${
                      sel
                        ? `${BOT_BORDER[bot.color]} ring-1 ${BOT_RING[bot.color]}`
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]'
                    }`}>
                    <span className={`font-semibold text-xs ${sel ? BOT_TEXT[bot.color] : 'text-white/35'}`}>
                      {botCustomNames[bot.id] || bot.name}
                    </span>
                    <span className="text-[9px] text-white/20 tracking-tighter">{'★'.repeat(bot.stars)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Lobby mode info ── */}
        {mode.id === 'lobby' && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Users size={14} className="text-cyan-400" />
              <span className="text-sm font-semibold text-cyan-300">Full 8-Player Tournament Room</span>
            </div>
            <p className="text-xs text-white/40">
              All 7 AI players compete simultaneously. Everyone buzzes on every tossup —
              whoever answers correctly first scores. First to finish 20 questions wins most points.
            </p>
          </div>
        )}

        {/* ── Player name editor ── (all non-review modes) */}
        {!hideTopicDiff && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Player Names</p>
            <div className="grid grid-cols-4 gap-2">
              {/* You */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.07] px-3 py-2.5">
                <div className="text-[9px] text-white/20 mb-1">Player 1</div>
                <div className="text-xs text-blue-300 font-semibold">You</div>
              </div>
              {/* Bots */}
              {BOT_ROSTER.map((bot, i) => (
                <div key={bot.id} className={`rounded-xl border px-3 py-2.5 ${BOT_STATIC[bot.color]}`}>
                  <div className="text-[9px] text-white/20 mb-1 tracking-tighter">{'★'.repeat(bot.stars)}</div>
                  <input
                    value={botCustomNames[bot.id] ?? bot.name}
                    onChange={e => updateBotName(bot.id, e.target.value)}
                    placeholder={`Player ${i + 2}`}
                    className={`w-full bg-transparent text-xs ${BOT_TEXT[bot.color]} placeholder-white/20 focus:text-white outline-none transition-colors`}
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-white/20 mt-2 pl-1">Click any name to rename</p>
          </div>
        )}

        {/* ── SRS info ── */}
        {mode.id === 'review' && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
            <p className="text-sm font-semibold text-emerald-300 mb-1">SM-2 Spaced Repetition</p>
            <p className="text-xs text-white/40">
              {dueCount > 0
                ? `${dueCount} items due today. Questions you struggled with return sooner; mastered ones are spaced further out.`
                : 'No items due yet — play other modes first to build your review queue.'}
            </p>
          </div>
        )}

        {/* ── Topic picker ── */}
        {!hideTopicDiff && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Topic</p>
            <div className="flex flex-wrap gap-2">
              {STANDARD_TOPICS.map(t => (
                <button key={t} onClick={() => setTopic(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all focus:outline-none ${
                    topic === t
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-200 font-semibold'
                      : 'bg-white/[0.03] border-white/[0.07] text-white/45 hover:text-white/75 hover:border-white/18'
                  }`}>{t}</button>
              ))}
            </div>
            {source === 'ai' && (
              <>
                <p className="text-[10px] text-white/25 uppercase tracking-widest mt-3 mb-2 font-medium flex items-center gap-1.5">
                  <Sparkles size={9} /> Niche · AI Generated Only
                </p>
                <div className="flex flex-wrap gap-2">
                  {NICHE_TOPICS.map(t => (
                    <button key={t} onClick={() => setTopic(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all focus:outline-none ${
                        topic === t
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-200 font-semibold'
                          : 'bg-white/[0.02] border-white/[0.06] text-white/35 hover:text-white/65 hover:border-white/15'
                      }`}>{t}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Difficulty ── */}
        {!hideTopicDiff && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Difficulty</p>
            <div className="flex gap-3">
              {DIFFICULTIES.map(d => (
                <button key={d.id} onClick={() => setDifficulty(d.id)}
                  className={`flex-1 rounded-xl border p-3 text-center transition-all focus:outline-none ${
                    difficulty === d.id
                      ? 'bg-white/[0.07] border-white/[0.18] ring-1 ring-white/15'
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.13]'
                  }`}>
                  <div className="text-sm font-semibold text-white">{d.label}</div>
                  <div className="text-xs text-white/35 mt-0.5">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Scoring format ── */}
        {!hideTopicDiff && (
          <div>
            <p className="text-xs text-white/35 uppercase tracking-widest mb-3 font-medium">Scoring Format</p>
            <div className="grid grid-cols-2 gap-3">
              {SCORING_FORMATS.map(f => {
                const sel = scoringFormat.id === f.id;
                return (
                  <button key={f.id} onClick={() => setScoringFormat(f)}
                    className={`rounded-xl border p-3 text-left transition-all focus:outline-none ${
                      sel
                        ? 'bg-amber-500/12 border-amber-500/40 ring-1 ring-amber-500/25'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.13]'
                    }`}>
                    <div className={`text-sm font-semibold ${sel ? 'text-amber-200' : 'text-white'}`}>{f.label}</div>
                    <div className="text-xs text-white/35 mt-0.5">{f.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Start ── */}
        <Button onClick={startSession} size="lg" className="w-full">
          {mode.id === 'lobby'  ? <><Users    size={16} /> Start Lobby ({botCustomNames['biscuit'] || 'Player 2'} + 6 others)</> :
           mode.id === '1v1'    ? <><Swords   size={16} /> 1v1 vs {botCustomNames[selectedBot.id] || selectedBot.name}</> :
           mode.id === 'review' ? <><BookOpen size={16} /> Start Review{dueCount > 0 ? ` (${dueCount} due)` : ''}</> :
           source === 'qbreader'? <><Database size={16} /> Start · QBReader</> :
           <><Zap size={16} /> Start {mode.label}</>}
        </Button>

        {/* ── How it works ── */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-2">
          <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">How it works</p>
          <ul className="space-y-1.5">
            {[
              'Questions reveal word-by-word — buzz any time with BUZZ or Space bar',
              'Buzz early for more XP; late buzzes score fewer points',
              'Lobby Match: 8 simultaneous players (you + all 7 AI) — full tournament room',
              '1v1: head-to-head against one opponent, first to 10 pts wins',
              'QBReader pulls real past tournament questions from the live database',
              'AI Generated unlocks niche topics (Mythology, Quantum Physics, Opera…)',
              'SM-2 spaced repetition tracks every answer — weak topics come back sooner',
            ].map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/35">
                <span className="text-blue-500/50 flex-shrink-0 mt-0.5">•</span>{tip}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const tc = color === 'yellow' ? 'text-yellow-300' : color === 'emerald' ? 'text-emerald-300' : 'text-white';
  const ic = color === 'yellow' ? 'text-yellow-400' : color === 'emerald' ? 'text-emerald-400' : 'text-white/25';
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
      <Icon size={14} className={`mx-auto mb-1 ${ic}`} />
      <div className={`text-xl font-bold tabular-nums ${tc}`}>{value}</div>
      <div className="text-white/25 text-xs">{label}</div>
    </div>
  );
}
