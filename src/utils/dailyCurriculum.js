const TASK_DETAILS = {
  lesson: { kind: 'notes', label: 'Lesson notes', estimate: '15–20 min' },
  quiz_bowl: { kind: 'quiz_bowl', label: 'Quiz Bowl', estimate: '10–15 min' },
  unit_test: { kind: 'assessment', label: 'Assessment', estimate: '10–20 min' },
  essay: { kind: 'writing', label: 'Writing', estimate: '20–30 min' },
};

const REMOVED_TASK_TYPES = new Set(['math_tutor', 'practice', 'problem_set']);

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function curriculumTasks(curriculum) {
  const tasks = [];
  for (const [unitIndex, unit] of (curriculum?.units || []).entries()) {
    for (const [lessonIndex, lesson] of (unit.lessons || []).entries()) {
      if (REMOVED_TASK_TYPES.has(lesson.type) || lesson.tool === 'math_tutor' || lesson.tool === 'math_canvas') continue;
      const details = TASK_DETAILS[lesson.type] || TASK_DETAILS.lesson;
      tasks.push({
        ...lesson,
        ...details,
        unit,
        unitIndex,
        lessonIndex,
        taskNumber: tasks.length + 1,
      });
    }
  }
  return tasks;
}

// A curriculum exposes one focused item per local calendar day. Once any
// curriculum item is completed today, the card stays in its completed state
// until tomorrow instead of immediately turning the course into another queue.
export function getDailyCurriculumTask(curriculum, now = new Date()) {
  const tasks = curriculumTasks(curriculum);
  const today = localDateKey(now);
  const completedToday = tasks.find(task => (
    task.isCompleted && task.completedAt && localDateKey(task.completedAt) === today
  ));
  const nextTask = tasks.find(task => !task.isCompleted) || null;

  if (completedToday) {
    return {
      task: completedToday,
      state: 'complete',
      total: tasks.length,
      remaining: tasks.filter(task => !task.isCompleted).length,
    };
  }

  if (nextTask) {
    return {
      task: nextTask,
      state: 'ready',
      total: tasks.length,
      remaining: tasks.filter(task => !task.isCompleted).length,
    };
  }

  return {
    task: tasks[tasks.length - 1] || null,
    state: 'course-complete',
    total: tasks.length,
    remaining: 0,
  };
}
