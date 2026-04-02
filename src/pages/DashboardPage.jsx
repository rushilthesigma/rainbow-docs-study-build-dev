import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Target, Layers, FileText, MessageSquare, ArrowRight, Send, PenTool, ClipboardCheck, Swords, Users, GraduationCap } from 'lucide-react';
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
  const activeGoals = goals.filter(g => g.status === 'active').length;

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{greeting}, {firstName}</h1>
          {profile && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Level {profile.level} · {profile.xp}/{profile.xpToNextLevel} XP</p>}
        </div>
        <Button onClick={() => navigate('/new')}><Plus size={16} /> New Curriculum</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Study Mode */}
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Study Mode</span>
              </div>
              <button onClick={() => navigate('/study')} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">Open <ArrowRight size={12} /></button>
            </div>
            <form onSubmit={handleStudySubmit} className="flex gap-2">
              <input value={studyInput} onChange={e => setStudyInput(e.target.value)} placeholder="What do you want to study?" className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-gray-50 dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/40" />
              <button type="submit" className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Send size={16} /></button>
            </form>
          </div>

          {/* Curricula */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">My Curricula</h2>
              <button onClick={() => navigate('/new')} className="text-xs text-blue-500 hover:text-blue-600">+ New</button>
            </div>
            {curricula.length === 0 ? (
              <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-8 text-center">
                <BookOpen size={24} className="text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No curricula yet</p>
                <Button onClick={() => navigate('/new')} size="sm"><Plus size={14} /> Create</Button>
              </div>
            ) : (
              <div className="grid gap-3">{curricula.map(c => <CurriculumCard key={c.id} curriculum={c} />)}</div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <StreakWidget streaks={streaks} />

          {/* Quick access */}
          <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quick Access</h3>
            <div className="space-y-1">
              {[
                { to: '/goals', icon: Target, color: 'text-amber-500', label: 'Goals', sub: `${activeGoals} active` },
                { to: '/flashcards', icon: Layers, color: 'text-purple-500', label: 'Flashcards', sub: 'Review cards' },
                { to: '/notes', icon: FileText, color: 'text-emerald-500', label: 'Notes', sub: 'Cornell notes' },
                { to: '/assessments', icon: ClipboardCheck, color: 'text-rose-500', label: 'Assessments', sub: 'Take a quiz' },
                { to: '/math', icon: PenTool, color: 'text-indigo-500', label: 'Math Canvas', sub: 'Practice problems' },
                { to: '/debate', icon: Swords, color: 'text-blue-500', label: 'Debate', sub: 'Challenge yourself' },
                { to: '/social', icon: Users, color: 'text-cyan-500', label: 'Social', sub: 'Friends & chats' },
              ].map(item => (
                <button key={item.to} onClick={() => navigate(item.to)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#0D0D14] transition-colors text-left">
                  <item.icon size={16} className={item.color} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
                    <p className="text-[10px] text-gray-400">{item.sub}</p>
                  </div>
                  <ArrowRight size={12} className="text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        </div>
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
