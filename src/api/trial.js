import { apiFetch } from './client';

export async function generateQuestions(topic, count = 5, difficulty = 'medium') {
  return apiFetch('/api/trial/generate', {
    method: 'POST',
    body: JSON.stringify({ topic, count, difficulty }),
  });
}

// Map Trial topic → QBReader category name
const TOPIC_TO_QB_CAT = {
  'World History': 'History', 'American History': 'History',
  'Science': 'Science', 'Biology': 'Science', 'Chemistry': 'Science',
  'Physics': 'Science', 'Computer Science': 'Science', 'Math': 'Math',
  'Literature': 'Literature', 'Geography': 'Geography',
  'Classical Music': 'Fine Arts', 'Fine Arts': 'Fine Arts',
  'Philosophy': 'Philosophy',
  'Current Events': 'Mixed', 'Economics': 'Mixed',
};
// Map Trial difficulty → QBReader difficulty label
const DIFF_TO_QB = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export async function fetchQBReaderQuestions(topic, count = 10, difficulty = 'medium') {
  const category = TOPIC_TO_QB_CAT[topic] || 'Mixed';
  const qbDiff = DIFF_TO_QB[difficulty] || 'Medium';
  const data = await apiFetch(`/api/quizbowl/tossups?count=${count}&category=${encodeURIComponent(category)}&difficulty=${qbDiff}`);
  // Normalise QBReader format → Trial format
  const questions = (data.tossups || []).map(t => ({
    id: t.qbId || crypto.randomUUID(),
    question: t.text,
    answer: t.answer,
    topic: t.category || topic,
    difficulty,
    source: 'qbreader',
    setName: t.setName,
    year: t.year,
  }));
  return { questions };
}

export async function getTrialQueue() {
  return apiFetch('/api/trial/queue');
}

export async function saveTrialSession(results) {
  return apiFetch('/api/trial/save', {
    method: 'POST',
    body: JSON.stringify({ results }),
  });
}

export async function getTrialStats() {
  return apiFetch('/api/trial/stats');
}
