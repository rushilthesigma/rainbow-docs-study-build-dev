import { useState, useEffect } from 'react';
import { Users, ArrowLeft, Plus, BookOpen, Target, X, Check } from 'lucide-react';
import { getParentStatus, getStudent, assignCurriculum, unassignCurriculum, addStudyTopic, addStudent, verifyPin } from '../../../api/parent';
import { listCurricula } from '../../../api/curriculum';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import LoadingSpinner from '../../shared/LoadingSpinner';

export default function ParentApp() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [allCurricula, setAllCurricula] = useState([]);
  const [newTopic, setNewTopic] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [pinForAdd, setPinForAdd] = useState('');

  useEffect(() => {
    Promise.all([getParentStatus(), listCurricula()])
      .then(([ps, cs]) => {
        setStudents(ps.students || []);
        setAllCurricula(cs.curricula || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function openStudent(sid) {
    try {
      const d = await getStudent(sid);
      setSelectedStudent(d);
      setView('detail');
    } catch {}
  }

  async function handleAssign(curriculumId) {
    if (!selectedStudent) return;
    await assignCurriculum(selectedStudent.student.id, curriculumId);
    const d = await getStudent(selectedStudent.student.id);
    setSelectedStudent(d);
  }

  async function handleUnassign(curriculumId) {
    if (!selectedStudent) return;
    await unassignCurriculum(selectedStudent.student.id, curriculumId);
    const d = await getStudent(selectedStudent.student.id);
    setSelectedStudent(d);
  }

  async function handleAddTopic() {
    if (!newTopic.trim() || !selectedStudent) return;
    await addStudyTopic(selectedStudent.student.id, newTopic.trim());
    const d = await getStudent(selectedStudent.student.id);
    setSelectedStudent(d);
    setNewTopic('');
  }

  async function handleAddStudent() {
    if (!newStudentName.trim() || !pinForAdd) return;
    try {
      await addStudent(pinForAdd, newStudentName.trim());
      const ps = await getParentStatus();
      setStudents(ps.students || []);
      setNewStudentName('');
      setPinForAdd('');
      setAddingStudent(false);
    } catch {}
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Users size={36} className="text-gray-400 mb-3" />
        <p className="text-sm text-gray-500">Parent mode is not set up.</p>
        <p className="text-xs text-gray-400 mt-1">Set it up during onboarding.</p>
      </div>
    );
  }

  // Student detail
  if (view === 'detail' && selectedStudent) {
    const s = selectedStudent.student;
    const assignedIds = new Set(s.assignedCurricula || []);
    const unassigned = allCurricula.filter(c => !assignedIds.has(c.id));

    return (
      <div>
        <button onClick={() => { setView('list'); setSelectedStudent(null); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Students
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white">
            {s.avatar}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{s.name}</h2>
            <p className="text-xs text-gray-400">{s.performance?.lessonsCompleted || 0} lessons completed</p>
          </div>
        </div>

        {/* Assigned Curricula */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Assigned Curricula</h3>
          {(selectedStudent.curricula || []).length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No curricula assigned yet.</p>
          ) : (
            <div className="space-y-1.5">
              {(selectedStudent.curricula || []).map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40]">
                  <BookOpen size={14} className="text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{c.title}</span>
                  <button onClick={() => handleUnassign(c.id)} className="text-gray-300 hover:text-rose-500"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Assign more */}
          {unassigned.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-gray-400 mb-1.5">Add curriculum:</p>
              <div className="space-y-1">
                {unassigned.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => handleAssign(c.id)} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#161622] transition-colors">
                    <Plus size={12} className="text-blue-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Study Topics */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Study Topics</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(s.studyTopics || []).map((t, i) => (
              <span key={i} className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-600 dark:text-blue-400">{t}</span>
            ))}
            {(s.studyTopics || []).length === 0 && <p className="text-xs text-gray-400">No topics set.</p>}
          </div>
          <div className="flex gap-2">
            <input value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTopic()} placeholder="Add a study topic..." className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-xs outline-none" />
            <button onClick={handleAddTopic} disabled={!newTopic.trim()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs disabled:opacity-40"><Plus size={12} /></button>
          </div>
        </div>

        {/* Performance */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Performance</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3 text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{s.performance?.lessonsCompleted || 0}</p>
              <p className="text-[10px] text-gray-400">Lessons</p>
            </div>
            <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3 text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{s.performance?.quizzesTaken || 0}</p>
              <p className="text-[10px] text-gray-400">Quizzes</p>
            </div>
            <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3 text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{s.performance?.averageScore || 0}%</p>
              <p className="text-[10px] text-gray-400">Avg Score</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Student list
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-purple-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Students</h2>
        </div>
        <Button size="sm" onClick={() => setAddingStudent(true)}><Plus size={14} /> Add Student</Button>
      </div>

      {addingStudent && (
        <div className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 mb-4 space-y-3">
          <Input label="Student Name" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} placeholder="Name" />
          <Input label="Parent PIN" type="password" value={pinForAdd} onChange={e => setPinForAdd(e.target.value)} placeholder="Enter PIN to confirm" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddStudent} disabled={!newStudentName.trim() || !pinForAdd}><Plus size={14} /> Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingStudent(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {students.map(s => (
          <button key={s.id} onClick={() => openStudent(s.id)} className="w-full flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 hover:border-purple-300 dark:hover:border-purple-700 transition-colors text-left">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
              {s.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{s.name}</p>
              <p className="text-xs text-gray-400">View profile and assignments</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
