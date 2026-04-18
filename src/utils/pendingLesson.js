// Cross-app bridge for "open Lessons with a specific topic prefilled".
// Any app can call setPendingLesson({ topic, difficulty }) and then
// openApp('lessons', 'Lessons') — LessonsApp listens for the event and
// auto-creates a lesson for that topic on mount.

let pending = null;

export function setPendingLesson(req) {
  pending = req || null;
  try { window.dispatchEvent(new CustomEvent('cov-pending-lesson')); } catch {}
}

export function consumePendingLesson() {
  const r = pending;
  pending = null;
  return r;
}
