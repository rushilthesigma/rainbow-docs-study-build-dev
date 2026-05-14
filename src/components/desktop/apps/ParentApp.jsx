import { useState, useEffect } from 'react';
import { Users, ArrowLeft, ArrowRight, Plus, BookOpen, X, Loader2 } from 'lucide-react';
import { getParentStatus, getStudent, assignCurriculum, unassignCurriculum, addStudyTopic, addStudent } from '../../../api/parent';
import { listCurricula } from '../../../api/curriculum';
import LoadingSpinner from '../../shared/LoadingSpinner';

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors';
const sectionLabel = 'text-[9px] font-black uppercase tracking-[0.20em] text-white/25 mb-2';

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
  const [saving, setSaving] = useState(false);

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
    try { const d = await getStudent(sid); setSelectedStudent(d); setView('detail'); } catch {}
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
    setSaving(true);
    try {
      await addStudent(pinForAdd, newStudentName.trim());
      const ps = await getParentStatus();
      setStudents(ps.students || []);
      setNewStudentName(''); setPinForAdd(''); setAddingStudent(false);
    } catch {}
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
          <Users size={20} className="text-white/30" />
        </div>
        <p className="text-[13px] text-white/40">Parent mode is not set up.</p>
        <p className="text-[12px] text-white/25">Configure it during onboarding.</p>
      </div>
    );
  }

  if (view === 'detail' && selectedStudent) {
    const s = selectedStudent.student;
    const assignedIds = new Set(s.assignedCurricula || []);
    const unassigned = allCurricula.filter(c => !assignedIds.has(c.id));

    return (
      <div className="flex flex-col gap-5">
        <button
          onClick={() => { setView('list'); setSelectedStudent(null); }}
          className="inline-flex items-center gap-1.5 text-[12px] text-white/35 hover:text-white/65 transition-colors"
        >
          <ArrowLeft size={13} /> Students
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-xl font-bold text-white/70">
            {s.avatar}
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-white/90">{s.name}</h2>
            <p className="text-[11px] text-white/35">{s.performance?.lessonsCompleted || 0} lessons completed</p>
          </div>
        </div>

        {/* Performance stats */}
        <div>
          <p className={sectionLabel}>Performance</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Lessons', val: s.performance?.lessonsCompleted || 0 },
              { label: 'Quizzes', val: s.performance?.quizzesTaken || 0 },
              { label: 'Avg Score', val: `${s.performance?.averageScore || 0}%` },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
                <p className="text-[18px] font-bold text-white/85">{val}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Assigned Curricula */}
        <div>
          <p className={sectionLabel}>Assigned Curricula</p>
          {(selectedStudent.curricula || []).length === 0 ? (
            <p className="text-[12px] text-white/25 py-2">No curricula assigned yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(selectedStudent.curricula || []).map(c => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03]">
                  <BookOpen size={13} className="text-white/35 flex-shrink-0" />
                  <span className="text-[13px] text-white/75 flex-1 truncate">{c.title}</span>
                  <button onClick={() => handleUnassign(c.id)} className="text-white/20 hover:text-rose-400 transition-colors"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
          {unassigned.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-white/25 mb-1.5">Add curriculum:</p>
              <div className="flex flex-col gap-0.5">
                {unassigned.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleAssign(c.id)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-white/[0.05] transition-colors"
                  >
                    <Plus size={11} className="text-white/30" />
                    <span className="text-[12px] text-white/55 truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Study Topics */}
        <div>
          <p className={sectionLabel}>Study Topics</p>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {(s.studyTopics || []).map((t, i) => (
              <span key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/[0.10] text-[11px] text-white/60">{t}</span>
            ))}
            {(s.studyTopics || []).length === 0 && <p className="text-[12px] text-white/25">No topics set.</p>}
          </div>
          <div className="flex gap-2">
            <input
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTopic()}
              placeholder="Add a study topic…"
              className="flex-1 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[12px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors"
            />
            <button
              onClick={handleAddTopic}
              disabled={!newTopic.trim()}
              className="px-3 py-2 rounded-xl bg-white/[0.08] border border-white/[0.14] text-white/55 hover:bg-white/[0.14] hover:text-white/80 disabled:opacity-35 transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-black text-white/90 leading-tight">Students</h1>
        <button
          onClick={() => setAddingStudent(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] hover:text-white transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {addingStudent && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 flex flex-col gap-3">
          <input className={inputCls} placeholder="Student name" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Parent PIN" value={pinForAdd} onChange={e => setPinForAdd(e.target.value)} />
          <div className="flex gap-2">
            <button
              onClick={handleAddStudent}
              disabled={saving || !newStudentName.trim() || !pinForAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white/85 bg-white/[0.10] border border-white/[0.18] hover:bg-white/[0.16] disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Add
            </button>
            <button onClick={() => setAddingStudent(false)} className="px-3 py-2 rounded-xl text-[12px] text-white/35 hover:text-white/60 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {students.map(s => (
          <button
            key={s.id}
            onClick={() => openStudent(s.id)}
            className="text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.06] backdrop-blur-sm px-4 py-3.5 transition-all group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-lg font-bold text-white/60 flex-shrink-0">
              {s.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-white/80 group-hover:text-white/90 truncate">{s.name}</p>
            </div>
            <ArrowRight size={13} className="text-white/25 flex-shrink-0 group-hover:text-white/45 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
