import { BookOpen, MessageSquare, Layers, FileText, Target, ClipboardCheck, PenTool, Settings, Swords, GraduationCap, Users, Shield, Zap } from 'lucide-react';

const APP_REGISTRY = [
  { id: 'curricula', label: 'Curricula', icon: BookOpen, color: '#3b82f6', gradient: 'from-blue-500 to-blue-700' },
  { id: 'study', label: 'Study Mode', icon: MessageSquare, color: '#3b82f6', gradient: 'from-sky-400 to-blue-600' },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, color: '#a855f7', gradient: 'from-purple-500 to-purple-700' },
  { id: 'notes', label: 'Notes', icon: FileText, color: '#10b981', gradient: 'from-emerald-400 to-emerald-600' },
  { id: 'goals', label: 'Goals', icon: Target, color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
  { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, color: '#ef4444', gradient: 'from-rose-400 to-red-600' },
  { id: 'math', label: 'Math Canvas', icon: PenTool, color: '#6366f1', gradient: 'from-indigo-400 to-indigo-600' },
  { id: 'textbook', label: 'Textbooks', icon: GraduationCap, color: '#8b5cf6', gradient: 'from-violet-400 to-purple-600' },
  { id: 'social', label: 'Social', icon: Users, color: '#06b6d4', gradient: 'from-cyan-400 to-teal-500' },
  { id: 'quizbowl', label: 'Quiz Bowl', icon: Zap, color: '#f59e0b', gradient: 'from-amber-400 to-orange-500' },
  { id: 'debate', label: 'Debate', icon: Swords, color: '#3b82f6', gradient: 'from-blue-500 to-indigo-600' },
  { id: 'admin', label: 'Admin', icon: Shield, color: '#dc2626', gradient: 'from-red-500 to-red-700', adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#6b7280', gradient: 'from-gray-400 to-gray-600' },
];

export default APP_REGISTRY;
export function getApp(id) { return APP_REGISTRY.find(a => a.id === id); }
