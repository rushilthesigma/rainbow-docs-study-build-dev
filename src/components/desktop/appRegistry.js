import { BookOpen, MessageSquare, FileText, Settings, Shield, Zap, Lightbulb, Calculator, Swords } from 'lucide-react';

// Mobile Preview was removed from the registry once App.jsx wired up
// width-based mobile rendering - real phones get MobileShell directly,
// so a dedicated preview app on the dock was redundant clutter. The
// MobilePreview component still exists in the tree (admin/MobilePreview.jsx)
// in case we want to re-surface it; just nothing references it from
// the visible UI anymore.
// Slides was axed - the AI deck-builder app was retired so the dock,
// AppWindow router, and the WindowManager / Window slides-specific
// maximize behaviour were all stripped. The SlideshowApp component and
// /api/slideshows client file still exist on disk but nothing imports
// them anymore, so they are dead code.
const APP_REGISTRY = [
  { id: 'curricula', label: 'Curricula', icon: BookOpen, color: '#3b82f6', gradient: 'from-blue-500 to-blue-700' },
  { id: 'lessons', label: 'Lessons', icon: Lightbulb, color: '#eab308', gradient: 'from-yellow-400 to-amber-600' },
  { id: 'study', label: 'Study Mode', icon: MessageSquare, color: '#3b82f6', gradient: 'from-sky-400 to-blue-600' },
  // Note Map is now a view inside Notes (sidebar Maps section). The
  // standalone `notemap` dock entry was removed; users open Notes and
  // pick a map there.
  { id: 'notes', label: 'Notes', icon: FileText, color: '#10b981', gradient: 'from-emerald-400 to-emerald-600' },
  { id: 'mathtutor', label: 'Math Tutor', icon: Calculator, color: '#4f46e5', gradient: 'from-indigo-500 to-violet-600' },
{ id: 'debate', label: 'Debate', icon: Swords, color: '#ef4444', gradient: 'from-rose-500 to-red-700' },
  { id: 'quizbowl', label: 'Quiz Bowl', icon: Zap, color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
  { id: 'admin', label: 'Admin', icon: Shield, color: '#dc2626', gradient: 'from-red-500 to-red-700', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#6b7280', gradient: 'from-gray-400 to-gray-600' },
];

export default APP_REGISTRY;
export function getApp(id) { return APP_REGISTRY.find(a => a.id === id); }
