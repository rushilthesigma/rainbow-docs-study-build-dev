import { Flame, Trophy } from 'lucide-react';

export default function StreakWidget({ streaks }) {
  const { currentStreak = 0, longestStreak = 0, weeklyActivity = {} } = streaks || {};
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Study Streak</h3>
        <div className="flex items-center gap-1 text-amber-500">
          <Flame size={18} />
          <span className="font-bold text-lg">{currentStreak}</span>
        </div>
      </div>

      {/* Weekly dots */}
      <div className="flex items-center justify-between mb-4">
        {days.map((day, i) => {
          const active = (weeklyActivity[i] || 0) > 0;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-400 dark:text-gray-500'
              }`}>
                {day}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Trophy size={14} />
        <span>Best: {longestStreak} day{longestStreak !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
