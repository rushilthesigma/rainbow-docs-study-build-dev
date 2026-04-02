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
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  function handleStudySubmit(e) {
    e.preventDefault();
    const q = studyInput.trim();
    if (q) navigate(`/study?q=${encodeURIComponent(q)}`);
    else navigate('/study');
  }

  const greeting = getGreeting();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const profile = user?.data?.profile;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{greeting}, {firstName}</h1>
          {profile && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Level {profile.level} &middot; {profile.xp}/{profile.xpToNextLevel} XP
            </p>
          )}
        </div>
        <Button onClick={() => navigate('/new')}>
          <Plus size={16} /> New Curriculum
        </Button>
      </div>

      {/* Study Mode quick-start */}
      <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Study Mode</span>
          </div>
          <button onClick={() => navigate('/study')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors">
            Open <ArrowRight size={12} />
          </button>
        </div>
        <form onSubmit={handleStudySubmit} className="flex gap-2">
          <input
            value={studyInput}
            onChange={e => setStudyInput(e.target.value)}
            placeholder="What do you want to study?"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button type="submit" className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <Send size={16} />
          </button>
        </form>
      </div>

      <StreakWidget streaks={streaks} />

      {/* Quick access row */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <button onClick={() => navigate('/goals')} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <Target size={18} className="text-amber-500 mb-2" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{goals.filter(g => g.status === 'active').length} Goals</p>
          <p className="text-xs text-gray-400">Active</p>
        </button>
        <button onClick={() => navigate('/flashcards')} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <Layers size={18} className="text-purple-500 mb-2" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Flashcards</p>
          <p className="text-xs text-gray-400">Review due</p>
        </button>
        <button onClick={() => navigate('/notes')} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
          <Brain size={18} className="text-emerald-500 mb-2" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Notes</p>
          <p className="text-xs text-gray-400">Cornell notes</p>
        </button>
      </div>

      {/* Curricula */}
      <div className="mt-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">My Curricula</h2>
        {curricula.length === 0 ? (
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-8 text-center">
            <BookOpen size={24} className="text-blue-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No curricula yet</p>
            <Button onClick={() => navigate('/new')} size="sm"><Plus size={14} /> Create</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {curricula.map(c => <CurriculumCard key={c.id} curriculum={c} />)}
          </div>
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
