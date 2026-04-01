import { BookOpen, CheckCircle2, Layers, Clock } from 'lucide-react';

export default function StatCards({ curriculum }) {
  const units = curriculum.units || [];
  const totalLessons = units.reduce((sum, u) => sum + (u.lessons || []).length, 0);
  const completedLessons = units.reduce((sum, u) => sum + (u.lessons || []).filter(l => l.isCompleted).length, 0);
  const generatedLessons = units.reduce((sum, u) => sum + (u.lessons || []).filter(l => l.content).length, 0);

  const stats = [
    { label: 'Units', value: units.length, icon: Layers, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
    { label: 'Lessons', value: totalLessons, icon: BookOpen, color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
    { label: 'Completed', value: completedLessons, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' },
    { label: 'Generated', value: generatedLessons, icon: Clock, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
            <Icon size={16} />
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      ))}
    </div>
  );
}
