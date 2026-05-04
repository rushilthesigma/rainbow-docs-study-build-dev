import { BookOpen, MessageSquare, FileText, ClipboardCheck, Settings, Users, Shield, Zap, Lightbulb, Calculator } from 'lucide-react';

const APP_REGISTRY = [
  { id: 'curricula', label: 'Curricula', icon: BookOpen, color: '#3b82f6', gradient: 'from-blue-500 to-blue-700' },
  { id: 'lessons', label: 'Lessons', icon: Lightbulb, color: '#eab308', gradient: 'from-yellow-400 to-amber-600' },
  { id: 'study', label: 'Study Mode', icon: MessageSquare, color: '#3b82f6', gradient: 'from-sky-400 to-blue-600' },
  { id: 'notes', label: 'Notes', icon: FileText, color: '#10b981', gradient: 'from-emerald-400 to-emerald-600' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, color: '#ef4444', gradient: 'from-rose-400 to-red-600' },
  { id: 'mathtutor', label: 'Math Tutor', icon: Calculator, color: '#4f46e5', gradient: 'from-indigo-500 to-violet-600' },
  { id: 'social', label: 'Social', icon: Users, color: '#06b6d4', gradient: 'from-cyan-400 to-teal-500' },
  { id: 'quizbowl', label: 'Quiz Bowl', icon: Zap, color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
  // Debate is no longer a top-level app — it's a button inside Study Mode.
  { id: 'admin', label: 'Admin', icon: Shield, color: '#dc2626', gradient: 'from-red-500 to-red-700', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#6b7280', gradient: 'from-gray-400 to-gray-600' },
];

export default APP_REGISTRY;
export function getApp(id) { return APP_REGISTRY.find(a => a.id === id); }
