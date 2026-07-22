import { BookOpen, MessageSquare, FileText, Settings, Shield, Zap, Lightbulb, Calculator, Scale, Globe, LayoutGrid } from 'lucide-react';

// Mobile Preview was removed from the registry once App.jsx wired up
// width-based mobile rendering - real phones get MobileShell directly,
// so a dedicated preview app on the dock was redundant clutter. The
// MobilePreview component still exists in the tree (admin/MobilePreview.jsx)
// in case we want to re-surface it; just nothing references it from
// the visible UI anymore.
const APP_REGISTRY = [
  // Literal-hex blue stops (not `blue-*` tokens) so the user's accent-hue
  // picker, which rotates the global blue scale, never recolors this icon.
  { id: 'curricula', label: 'Curricula', icon: BookOpen, color: '#3b82f6', gradient: 'from-[#3b82f6] to-[#1d4ed8]' },
  { id: 'lessons', label: 'Lessons', icon: Lightbulb, color: '#eab308', gradient: 'from-yellow-400 to-amber-600' },
  { id: 'study', label: 'Study Mode', icon: MessageSquare, color: '#3b82f6', gradient: 'from-sky-400 to-[#2563eb]' },
  // Note Map is now a view inside Notes (sidebar Maps section). The
  // standalone `notemap` dock entry was removed; users open Notes and
  // pick a map there.
  { id: 'notes', label: 'Notes', icon: FileText, color: '#10b981', gradient: 'from-emerald-400 to-emerald-600' },
  // Study Groups was removed entirely (feature deleted).
  { id: 'mathtutor', label: 'Math Tutor', icon: Calculator, color: '#4f46e5', gradient: 'from-indigo-500 to-violet-600' },
{ id: 'debate', label: 'Debate', icon: Scale, color: '#ef4444', gradient: 'from-rose-500 to-red-700' },
  { id: 'quizbowl', label: 'Quiz Bowl', icon: Zap, color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
  { id: 'qbpedia', label: 'QBpedia', icon: Globe, color: '#8b5cf6', gradient: 'from-violet-500 to-purple-700' },
  { id: 'widgets', label: 'Widgets', icon: LayoutGrid, color: '#6366f1', gradient: 'from-indigo-400 to-indigo-600' },
  { id: 'admin', label: 'Admin', icon: Shield, color: '#dc2626', gradient: 'from-red-500 to-red-700', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#6b7280', gradient: 'from-gray-400 to-gray-600' },
];

export default APP_REGISTRY;
export function getApp(id) { return APP_REGISTRY.find(a => a.id === id); }
