export const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

export const LEARNING_STYLE_OPTIONS = [
  { value: 'conceptual', label: 'Conceptual' },
  { value: 'example-heavy', label: 'Example-Heavy' },
  { value: 'project-based', label: 'Project-Based' },
  { value: 'socratic', label: 'Socratic' },
];

export const LESSON_LENGTH_OPTIONS = [
  { value: 'short', label: 'Short', description: '~5 min' },
  { value: 'medium', label: 'Medium', description: '~10 min' },
  { value: 'long', label: 'Long', description: '~20 min' },
];

export const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual' },
  { value: 'academic', label: 'Academic' },
  { value: 'encouraging', label: 'Encouraging' },
];

export const RIGOR_OPTIONS = [
  { value: 'relaxed', label: 'Relaxed', description: 'Light, exploratory' },
  { value: 'standard', label: 'Standard', description: 'Balanced depth' },
  { value: 'rigorous', label: 'Rigorous', description: 'Deep, thorough' },
];

export const TEMPO_OPTIONS = [
  { value: 'fast', label: 'Fast', description: 'Skip the basics' },
  { value: 'normal', label: 'Normal', description: 'Steady pace' },
  { value: 'thorough', label: 'Thorough', description: 'Cover everything' },
];

export const PERSONALITY_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'concise', label: 'Concise' },
  { value: 'socratic', label: 'Socratic' },
  { value: 'strict', label: 'Strict' },
];

export const FLUFF_OPTIONS = [
  { value: 'minimal', label: 'Minimal', description: 'Just the facts' },
  { value: 'normal', label: 'Normal', description: 'Some context' },
  { value: 'detailed', label: 'Detailed', description: 'Full explanations' },
];

export const LESSON_PHASES = [
  { key: 'introduction', label: 'Intro', number: 1 },
  { key: 'explanation', label: 'Learn', number: 2 },
  { key: 'check_understanding', label: 'Check', number: 3 },
  { key: 'deeper_dive', label: 'Deepen', number: 4 },
  { key: 'practice', label: 'Practice', number: 5 },
];

export const DEFAULT_SETTINGS = {
  topic: '',
  difficulty: 'beginner',
  audience: '',
  learningStyle: 'conceptual',
  lessonLength: 'medium',
  tone: 'encouraging',
  includeExamples: true,
  includeExercises: true,
};
