import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Target, Layers, Brain, MessageSquare, ArrowRight, Send } from 'lucide-react';
import { listCurricula, getStreak } from '../api/curriculum';
import { listGoals } from '../api/goals';
import Button from '../components/shared/Button';
import CurriculumCard from '../components/curriculum/CurriculumCard';
import StreakWidget from '../components/study/StreakWidget';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

const card = 'rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [curricula, setCurricula] = useState([]);
  const [streaks, setStreaks] = useState(null);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studyInput, setStudyInput] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [currData, streakData, goalsData] = await Promise.all([
          listCurricula(), getStreak(), listGoals(),
        ]);
        setCurricula(currData.curricula || []);
        setStreaks(streakData.streaks || null);
        setGoals(goalsData.goals || []);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  function handleStudySubmit(e) {
    e.preventDefault();
    const q = studyInput.trim();
    navigate(q ? `/study?q=${encodeURIComponent(q)}` : '/study');
  }

  const greeting = getGreeting();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const profile = user?.data?.profile;

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-white/90">{greeting}, {firstName}</h1>
          {profile && <p className="text-[13px] text-white/40 mt-0.5">Level {profile.level} · {profile.xp}/{profile.xpToNextLevel} XP</p>}
        </div>
        <Button onClick={() => navigate('/new')}><Plus size={16} /> New Curriculum</Button>
      </div>

      {/* Study mode quick input */}
      <div className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-white/35" />
            <span className="text-[13px] font-semibold text-white/75">Study Mode</span>
          </div>
          <button onClick={() => navigate('/study')} className="inline-flex items-center gap-1 text-[12px] text-white/40 hover:text-white/70 transition-colors">
            Open <ArrowRight size={11} />
          </button>
        </div>
        <form onSubmit={handleStudySubmit} className="flex gap-2">
          <input
            value={studyInput}
            onChange={e => setStudyInput(e.target.value)}
            placeholder="What do you want to study?"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors"
          />
          <button
            type="submit"
            className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/80 transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      <StreakWidget streaks={streaks} />

      {/* Quick nav */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { to: '/goals', icon: Target, label: `${goals.filter(g => g.status === 'active').length} Goals`, sub: 'Active' },
          { to: '/flashcards', icon: Layers, label: 'Flashcards', sub: 'Review due' },
          { to: '/notes', icon: Brain, label: 'Notes', sub: 'Cornell notes' },
        ].map(item => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={`${card} p-4 text-left hover:border-white/[0.15] hover:bg-white/[0.06] transition-colors group`}
          >
            <item.icon size={17} className="text-white/30 mb-2.5 group-hover:text-white/50 transition-colors" />
            <p className="text-[13px] font-semibold text-white/75">{item.label}</p>
            <p className="text-[11px] text-white/30">{item.sub}</p>
          </button>
        ))}
      </div>

      {/* Curricula */}
      <div>
        <h2 className="text-[13px] font-semibold text-white/55 mb-3">My Curricula</h2>
        {curricula.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <BookOpen size={22} className="text-white/20 mx-auto mb-3" />
            <p className="text-[13px] text-white/35 mb-4">No curricula yet</p>
            <Button onClick={() => navigate('/new')} size="sm"><Plus size={14} /> Create</Button>
          </div>
        ) : (
          <div className="grid gap-3">{curricula.map(c => <CurriculumCard key={c.id} curriculum={c} />)}</div>
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
