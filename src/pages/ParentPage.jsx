import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, UserPlus, Trash2, ArrowRight, KeyRound, BookOpen, Award,
  CheckCircle2, Settings2, MessageCircle, Lock, Eye, ChevronDown,
  Users, Activity, LayoutDashboard, AlertTriangle, RefreshCw, Brain, Ban,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getParentStatus, setupParentMode, verifyPin, exitChild,
  addStudent, removeStudent, switchToStudent, getParentDashboard,
  updateStudentControls, listStudentChats, getStudentChat,
  changePin, disableParentMode, getParentActivity,
} from '../api/parent';
import Button from '../components/shared/Button';
import Input from '../components/shared/Input';
import Modal from '../components/shared/Modal';
import Toggle from '../components/shared/Toggle';
import LoadingSpinner from '../components/shared/LoadingSpinner';

const BLOCKABLE_APPS = [
  { id: 'study',     label: 'Study Mode',   description: 'Open-ended AI chat outside curricula.' },
  { id: 'mathtutor', label: 'Math Tutor',   description: 'Handwriting-canvas math practice.' },
  { id: 'notes',     label: 'Notes',        description: 'Free-form notes app.' },
];
const DIFFICULTY_FLOORS = [
  { value: null,           label: 'No minimum' },
  { value: 'beginner',     label: 'Beginner+' },
  { value: 'intermediate', label: 'Intermediate+' },
  { value: 'advanced',     label: 'Advanced+' },
];

const COLORS = ['#3B82F6', '#A855F7', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];

export default function ParentPage() {
  const navigate = useNavigate();
  const { fetchUser, setProfilePicked } = useAuth();
  const [status, setStatus] = useState(null);     // null while loading
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false); // PIN has been entered this session
  const [pinForSession, setPinForSession] = useState(''); // held in memory so add/remove can re-use it
  const [error, setError] = useState(null);

  // Setup form (first-time)
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [seedStudents, setSeedStudents] = useState([{ name: '', color: COLORS[0], grade: '' }]);
  const [submitting, setSubmitting] = useState(false);

  // Unlock form (returning parent)
  const [pinInput, setPinInput] = useState('');

  // Dashboard
  const [dashboard, setDashboard] = useState(null);
  const [activity, setActivity] = useState(null);
  const [showAddChild, setShowAddChild] = useState(false);
  // Which top-level admin tab is showing.
  const [tab, setTab] = useState('overview'); // 'overview' | 'activity' | 'settings'
  // Open modals — at most one of these is set at a time.
  const [controlsStudent, setControlsStudent] = useState(null);
  const [chatsStudent, setChatsStudent] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getParentStatus();
      setStatus(data.parent || null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-unlock from sessionStorage. When the ProfilePicker collected the
  // PIN and called /api/parent/select-admin, it stashed the PIN here so
  // the admin panel can skip its own unlock screen — the parent already
  // proved who they were one screen earlier. We clear the stash on
  // logout / browser close (sessionStorage handles the latter).
  useEffect(() => {
    if (unlocked) return;
    const cached = sessionStorage.getItem('cov-parent-pin');
    if (cached && /^[0-9]{4,6}$/.test(cached)) {
      setPinForSession(cached);
      setUnlocked(true);
    }
  }, [unlocked]);

  // Load dashboard + activity whenever we unlock. Activity is a separate
  // PIN-gated call so we re-fetch it any time we have a valid session.
  useEffect(() => {
    if (!unlocked) return;
    getParentDashboard().then(d => setDashboard(d)).catch(e => setError(e.message));
    if (pinForSession) {
      getParentActivity(pinForSession).then(a => setActivity(a.events || [])).catch(() => setActivity([]));
    }
  }, [unlocked, pinForSession]);

  async function refreshDashboard() {
    try {
      const d = await getParentDashboard();
      setDashboard(d);
      if (pinForSession) {
        const a = await getParentActivity(pinForSession);
        setActivity(a.events || []);
      }
    } catch (e) { setError(e.message); }
  }

  async function handleSetup(e) {
    e?.preventDefault?.();
    setError(null);
    if (!/^[0-9]{4,6}$/.test(newPin)) { setError('PIN must be 4–6 digits.'); return; }
    if (newPin !== newPinConfirm) { setError('PINs do not match.'); return; }
    const students = seedStudents.filter(s => s.name.trim());
    if (!students.length) { setError('Add at least one child profile.'); return; }
    setSubmitting(true);
    try {
      const result = await setupParentMode(newPin, students);
      setStatus(result.parent);
      setPinForSession(newPin);
      setUnlocked(true);
      // Stash PIN + mark profile picked so ProfilePicker doesn't re-appear
      sessionStorage.setItem('cov-parent-pin', newPin);
      setProfilePicked(true);
      await fetchUser();
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  }

  async function handleUnlock(e) {
    e?.preventDefault?.();
    setError(null);
    if (!/^[0-9]{4,6}$/.test(pinInput)) { setError('PIN must be 4–6 digits.'); return; }
    setSubmitting(true);
    try {
      // When a child profile is currently active the server refuses verifyPin
      // and requires exitChild (same PIN, but also clears activeStudentId).
      if (status?.activeStudentId) {
        await exitChild(pinInput);
        const refreshed = await getParentStatus();
        setStatus(refreshed.parent || null);
      } else {
        const result = await verifyPin(pinInput);
        setStatus(result.parent);
      }
      setPinForSession(pinInput);
      setUnlocked(true);
      setPinInput('');
      await fetchUser();
    } catch (e) { setError('Incorrect PIN.'); }
    setSubmitting(false);
  }

  async function handleSwitchChild(sid) {
    try {
      await switchToStudent(sid);
      await fetchUser();
      navigate('/dashboard');
    } catch (e) { setError(e.message); }
  }

  async function handleAddChild(form) {
    setError(null);
    try {
      await addStudent(pinForSession, form);
      const d = await getParentDashboard();
      setDashboard(d);
      setShowAddChild(false);
    } catch (e) { setError(e.message); }
  }

  async function handleRemoveChild(sid) {
    if (!confirm('Remove this child profile? Their courses will be hidden but not deleted.')) return;
    try {
      await removeStudent(pinForSession, sid);
      const d = await getParentDashboard();
      setDashboard(d);
    } catch (e) { setError(e.message); }
  }

  async function handleSaveControls(sid, controls) {
    setError(null);
    try {
      await updateStudentControls(pinForSession, sid, controls);
      const d = await getParentDashboard();
      setDashboard(d);
      // Keep the modal open so the parent can see the saved state, but
      // refresh the local copy with the latest from the server.
      const fresh = d.students.find(s => s.id === sid);
      if (fresh) setControlsStudent(fresh);
      await fetchUser();
    } catch (e) { setError(e.message); }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  }

  // ---------- First-time setup ----------
  if (!status?.enabled) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/[0.12] border border-blue-400/[0.20] flex items-center justify-center">
            <Shield size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white/90">Set up parent mode</h1>
            <p className="text-[13px] text-white/40">Create a PIN and add a profile for each child.</p>
          </div>
        </div>

        <form onSubmit={handleSetup} className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="PIN (4–6 digits)"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPin}
              onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • •"
            />
            <Input
              label="Confirm PIN"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPinConfirm}
              onChange={e => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • •"
            />
          </div>

          <div>
            <label className="text-[13px] font-medium text-white/75 block mb-2">Child profiles</label>
            <div className="space-y-2">
              {seedStudents.map((s, i) => (
                <ChildRow
                  key={i}
                  student={s}
                  onChange={(next) => setSeedStudents(prev => prev.map((x, j) => j === i ? next : x))}
                  onRemove={seedStudents.length > 1 ? () => setSeedStudents(prev => prev.filter((_, j) => j !== i)) : null}
                />
              ))}
            </div>
            {seedStudents.length < 6 && (
              <button
                type="button"
                onClick={() => setSeedStudents(prev => [...prev, { name: '', color: COLORS[prev.length % COLORS.length], grade: '' }])}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-blue-300 hover:text-blue-200"
              >
                <UserPlus size={13} /> Add another child
              </button>
            )}
          </div>

          {error && (
            <div className="text-[13px] text-rose-300 bg-rose-900/20 border border-rose-700/30 rounded-lg px-3 py-2">{error}</div>
          )}

          <Button type="submit" loading={submitting} className="w-full" size="lg">
            <Shield size={16} /> Enable parent mode
          </Button>
        </form>
      </div>
    );
  }

  // ---------- Locked (PIN required) ----------
  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-500/[0.12] border border-blue-400/[0.20] flex items-center justify-center mb-3">
            <KeyRound size={22} className="text-blue-300" />
          </div>
          <h1 className="text-[22px] font-bold text-white/90">Enter parent PIN</h1>
          <p className="text-[13px] text-white/40 mt-1">Unlock the parental dashboard.</p>
        </div>

        <form onSubmit={handleUnlock} className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-6 space-y-4">
          <Input
            label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pinInput}
            onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • •"
          />
          {error && <div className="text-[13px] text-rose-300">{error}</div>}
          <Button type="submit" loading={submitting} className="w-full">
            <KeyRound size={15} /> Unlock
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-[12px] text-white/40 mb-2">Just want to keep learning?</p>
          <div className="flex flex-col gap-2">
            {status.students?.map(s => (
              <button
                key={s.id}
                onClick={() => handleSwitchChild(s.id)}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-left transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.avatar || s.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-white/85">{s.name}</div>
                  {s.grade && <div className="text-[11px] text-white/45">{s.grade}</div>}
                </div>
                <ArrowRight size={14} className="text-white/35" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Unlocked: parental dashboard ----------
  if (!dashboard) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner size={28} /></div>;
  }

  // Roll-up stats across all children for the header pills.
  const students = dashboard.students || [];
  const totalCourses = students.reduce((n, s) => n + (s.summary?.totalCurricula || 0), 0);
  const totalLessonsDone = students.reduce((n, s) => n + (s.summary?.completedLessons || 0), 0);
  const totalLessons = students.reduce((n, s) => n + (s.summary?.totalLessons || 0), 0);
  const averageGradeAcrossKids = (() => {
    const withGrades = students.filter(s => s.summary?.avgGrade != null);
    if (!withGrades.length) return null;
    return Math.round(withGrades.reduce((n, s) => n + s.summary.avgGrade, 0) / withGrades.length);
  })();

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header — clarifies that the parent is signed in as admin, not a kid */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/[0.12] border border-blue-400/[0.20] flex items-center justify-center">
            <Shield size={20} className="text-blue-300" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white/90">Parent Admin Panel</h1>
            <p className="text-[13px] text-white/40">
              {students.length} child profile{students.length === 1 ? '' : 's'} · signed in as parent
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={refreshDashboard}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddChild(true)}>
            <UserPlus size={14} /> Add child
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-[13px] text-rose-300 bg-rose-900/20 border border-rose-700/30 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Top stats — at-a-glance roll-ups across every child */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <HeaderStat icon={Users}        label="Children"      value={students.length} />
        <HeaderStat icon={BookOpen}     label="Total courses" value={totalCourses} />
        <HeaderStat icon={CheckCircle2} label="Lessons done"  value={`${totalLessonsDone}/${totalLessons}`} />
        <HeaderStat icon={Award}        label="Avg grade"     value={averageGradeAcrossKids != null ? `${averageGradeAcrossKids}%` : '—'} />
      </div>

      {/* Tab bar — Overview, Activity feed, Settings */}
      <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06]">
        <AdminTab id="overview" current={tab} onClick={setTab} icon={LayoutDashboard} label="Overview" />
        <AdminTab id="activity" current={tab} onClick={setTab} icon={Activity}        label={`Activity${activity?.length ? ` (${activity.length})` : ''}`} />
        <AdminTab id="settings" current={tab} onClick={setTab} icon={Settings2}       label="Settings" />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4">
          {students.map(s => (
            <StudentCard
              key={s.id}
              student={s}
              onSwitch={() => handleSwitchChild(s.id)}
              onRemove={() => handleRemoveChild(s.id)}
              onManage={() => setControlsStudent(s)}
              onViewChats={() => setChatsStudent(s)}
            />
          ))}
          {students.length === 0 && (
            <div className="text-center py-12 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02]">
              <p className="text-[14px] text-white/55">No child profiles yet.</p>
              <Button size="sm" className="mt-3" onClick={() => setShowAddChild(true)}>
                <UserPlus size={14} /> Add your first child
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <ActivityFeed events={activity} />
      )}

      {tab === 'settings' && (
        <SettingsTab
          pinForSession={pinForSession}
          onPinChanged={(newPin) => {
            setPinForSession(newPin);
            sessionStorage.setItem('cov-parent-pin', newPin);
          }}
          onDisabled={async () => {
            await fetchUser();
            sessionStorage.removeItem('cov-parent-pin');
            sessionStorage.removeItem('cov-profile-picked');
            navigate('/dashboard');
          }}
        />
      )}

      <AddChildModal
        open={showAddChild}
        onClose={() => setShowAddChild(false)}
        onAdd={handleAddChild}
        existingCount={students.length}
      />

      <ControlsModal
        student={controlsStudent}
        onClose={() => setControlsStudent(null)}
        onSave={(controls) => handleSaveControls(controlsStudent.id, controls)}
      />

      <ChatsModal
        student={chatsStudent}
        pin={pinForSession}
        onClose={() => setChatsStudent(null)}
      />
    </div>
  );
}

// Small pill on the header. Compact so four fit on a tablet row.
function HeaderStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
        <Icon size={11} /> {label}
      </div>
      <div className="text-[18px] font-semibold text-white/90 mt-0.5">{value}</div>
    </div>
  );
}

function AdminTab({ id, current, onClick, icon: Icon, label }) {
  const active = current === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium transition-colors ${
        active ? 'text-white/90' : 'text-white/45 hover:text-white/75'
      }`}
    >
      <Icon size={13} />
      {label}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-[2px] rounded-full bg-blue-400" />
      )}
    </button>
  );
}

// Stream of recent events — newest first. Each row shows the child it
// belongs to (avatar dot in their color), a one-line description, and a
// relative timestamp.
function ActivityFeed({ events }) {
  if (events == null) {
    return <div className="flex items-center justify-center h-32"><LoadingSpinner size={20} /></div>;
  }
  if (events.length === 0) {
    return (
      <div className="text-center py-12 rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02]">
        <Activity size={20} className="mx-auto mb-2 text-white/30" />
        <p className="text-[14px] text-white/55">No activity yet.</p>
        <p className="text-[12px] text-white/35">Events will appear here as your children complete lessons + assignments.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] divide-y divide-white/[0.05]">
      {events.map((ev, i) => (
        <div key={`${ev.kind}-${ev.lessonId || ev.curriculumId || ev.sessionId}-${i}`} className="flex items-start gap-3 px-4 py-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: ev.studentColor || '#3B82F6' }}
            title={ev.studentName}
          >
            {ev.studentName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-white/85">
              <span className="font-semibold">{ev.studentName}</span>
              {' '}
              {eventDescription(ev)}
            </div>
            {ev.curriculumTitle && (
              <div className="text-[11px] text-white/40 truncate">{ev.curriculumTitle}</div>
            )}
          </div>
          {ev.letter && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${gradeBadgeStyle(ev.score)}`}>
              {ev.letter} · {ev.score}
            </span>
          )}
          <span className="text-[11px] text-white/35 whitespace-nowrap">{relativeTime(ev.at)}</span>
        </div>
      ))}
    </div>
  );
}

function eventDescription(ev) {
  switch (ev.kind) {
    case 'curriculum_created':
      return <>started a new course: <span className="text-white/65">"{ev.title}"</span></>;
    case 'lesson_completed':
      return <>completed <span className="text-white/65">"{ev.lessonTitle}"</span></>;
    case 'assignment_graded':
      return <>submitted an assignment on <span className="text-white/65">"{ev.lessonTitle}"</span></>;
    case 'study_session':
      return <>chatted in Study Mode <span className="text-white/45">({ev.messageCount} msgs)</span></>;
    default:
      return null;
  }
}

function relativeTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60 * 1000) return 'just now';
  if (ms < 60 * 60 * 1000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(ms / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Parent-account settings: rotate the PIN, fully turn parent mode off.
// Sits behind the same PIN gate as everything else — but every individual
// action also re-verifies via its own endpoint.
function SettingsTab({ pinForSession, onPinChanged, onDisabled }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinError, setPinError] = useState(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  const [showDisable, setShowDisable] = useState(false);
  const [disablePin, setDisablePin] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState(null);

  async function handleChangePin(e) {
    e?.preventDefault?.();
    setPinError(null);
    setPinSuccess(false);
    if (!/^[0-9]{4,6}$/.test(newPin)) { setPinError('New PIN must be 4–6 digits.'); return; }
    if (newPin !== newPinConfirm) { setPinError('PINs do not match.'); return; }
    setSavingPin(true);
    try {
      await changePin(oldPin || pinForSession, newPin);
      onPinChanged?.(newPin);
      setPinSuccess(true);
      setOldPin(''); setNewPin(''); setNewPinConfirm('');
    } catch (err) {
      setPinError(err.message || 'Failed to update PIN.');
    }
    setSavingPin(false);
  }

  async function handleDisable() {
    setDisableError(null);
    if (!/^[0-9]{4,6}$/.test(disablePin)) { setDisableError('Enter your PIN to confirm.'); return; }
    setDisabling(true);
    try {
      await disableParentMode(disablePin);
      onDisabled?.();
    } catch (err) {
      setDisableError(err.message || 'Failed to disable parent mode.');
    }
    setDisabling(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={15} className="text-blue-300" />
          <h3 className="text-[14px] font-semibold text-white/90">Change PIN</h3>
        </div>
        <p className="text-[12px] text-white/45 mb-3">
          The PIN protects the admin panel, child controls, and chat viewer. Choose 4–6 digits.
        </p>
        <form onSubmit={handleChangePin} className="grid sm:grid-cols-3 gap-3">
          <Input
            label="Current PIN"
            type="password"
            inputMode="numeric"
            value={oldPin}
            onChange={e => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={pinForSession ? '• • • •' : 'Current PIN'}
          />
          <Input
            label="New PIN"
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="4–6 digits"
          />
          <Input
            label="Confirm new"
            type="password"
            inputMode="numeric"
            value={newPinConfirm}
            onChange={e => setNewPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Repeat"
          />
          <div className="sm:col-span-3 flex items-center gap-3">
            <Button type="submit" loading={savingPin}>
              <KeyRound size={13} /> Update PIN
            </Button>
            {pinError   && <span className="text-[12px] text-rose-300">{pinError}</span>}
            {pinSuccess && <span className="text-[12px] text-emerald-300">PIN updated.</span>}
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-rose-500/[0.18] bg-rose-500/[0.05] p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={15} className="text-rose-300" />
          <h3 className="text-[14px] font-semibold text-white/90">Disable parent mode</h3>
        </div>
        <p className="text-[12px] text-white/55 mb-3">
          Removes all child profiles and clears the PIN. Existing curricula stay on your account but stop being scoped per child. You can re-enable parent mode later.
        </p>
        {!showDisable ? (
          <Button variant="ghost" size="sm" onClick={() => setShowDisable(true)} className="text-rose-300 hover:text-rose-200">
            <AlertTriangle size={13} /> I want to disable parent mode
          </Button>
        ) : (
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
            <Input
              label="Confirm with your PIN"
              type="password"
              inputMode="numeric"
              value={disablePin}
              onChange={e => setDisablePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • •"
            />
            <Button variant="danger" onClick={handleDisable} loading={disabling}>
              Disable
            </Button>
            <Button variant="ghost" onClick={() => { setShowDisable(false); setDisablePin(''); setDisableError(null); }}>
              Cancel
            </Button>
            {disableError && <span className="sm:col-span-3 text-[12px] text-rose-300">{disableError}</span>}
          </div>
        )}
      </section>
    </div>
  );
}

// Shared grade-badge color helper — keeps the dashboard and activity feed visually consistent.
function gradeBadgeStyle(score) {
  if (score == null) return 'bg-white/[0.06] text-white/55';
  if (score >= 90) return 'bg-emerald-500/[0.18] border border-emerald-400/[0.30] text-emerald-200';
  if (score >= 80) return 'bg-blue-500/[0.18] border border-blue-400/[0.30] text-blue-200';
  if (score >= 70) return 'bg-amber-500/[0.18] border border-amber-400/[0.30] text-amber-200';
  return 'bg-rose-500/[0.18] border border-rose-400/[0.30] text-rose-200';
}

function ChildRow({ student, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <div className="flex gap-1">
        {COLORS.slice(0, 4).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ ...student, color: c })}
            className={`w-5 h-5 rounded-full transition-all ${student.color === c ? 'ring-2 ring-white/60 scale-110' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Pick color ${c}`}
          />
        ))}
      </div>
      <input
        type="text"
        value={student.name}
        onChange={e => onChange({ ...student, name: e.target.value })}
        placeholder="Child's name"
        className="flex-1 bg-transparent text-[13px] text-white/85 placeholder-white/30 focus:outline-none"
      />
      <input
        type="text"
        value={student.grade}
        onChange={e => onChange({ ...student, grade: e.target.value })}
        placeholder="Grade"
        className="w-20 bg-transparent text-[12px] text-white/65 placeholder-white/25 focus:outline-none"
      />
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-white/30 hover:text-rose-400" aria-label="Remove">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function StudentCard({ student, onSwitch, onRemove, onManage, onViewChats }) {
  const s = student.summary || {};
  const blockedCount = student.controls?.blockedApps?.length || 0;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-5">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-[18px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: student.color }}
        >
          {student.avatar || student.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-[16px] font-semibold text-white/90">{student.name}</h3>
              {student.grade && <span className="text-[12px] text-white/45">{student.grade}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onViewChats} title="View chats">
                <MessageCircle size={13} /> Chats
              </Button>
              <Button variant="ghost" size="sm" onClick={onManage} title="Controls">
                <Settings2 size={13} /> Manage
              </Button>
              <Button variant="secondary" size="sm" onClick={onSwitch}>
                Open <ArrowRight size={13} />
              </Button>
              <button onClick={onRemove} className="text-white/30 hover:text-rose-400 p-1.5" aria-label="Remove child">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Active restrictions summary chips */}
          {(blockedCount > 0 || student.controls?.requireGraded || student.controls?.difficultyFloor || student.controls?.socraticMode || student.controls?.blockAnswerHints) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {student.controls?.requireGraded && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-blue-500/[0.12] border border-blue-400/[0.20] text-blue-200">
                  <Award size={10} /> Graded only
                </span>
              )}
              {student.controls?.difficultyFloor && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-purple-500/[0.12] border border-purple-400/[0.20] text-purple-200">
                  <Lock size={10} /> {student.controls.difficultyFloor}+
                </span>
              )}
              {student.controls?.socraticMode && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-amber-500/[0.12] border border-amber-400/[0.20] text-amber-200">
                  <Brain size={10} /> Socratic
                </span>
              )}
              {student.controls?.blockAnswerHints && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-orange-500/[0.12] border border-orange-400/[0.20] text-orange-200">
                  <Ban size={10} /> No hints
                </span>
              )}
              {blockedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-rose-500/[0.12] border border-rose-400/[0.20] text-rose-200">
                  <Lock size={10} /> {blockedCount} blocked
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Stat icon={BookOpen} label="Courses" value={s.totalCurricula ?? 0} />
            <Stat icon={CheckCircle2} label="Lessons done" value={`${s.completedLessons || 0}/${s.totalLessons || 0}`} />
            <Stat icon={Award} label="Avg grade" value={s.avgGrade != null ? `${s.avgGrade}%` : '—'} />
          </div>

          {s.courses?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] text-white/35 uppercase tracking-wide">Courses</div>
              {s.courses.slice(0, 4).map(c => (
                <div key={c.id} className="flex items-center justify-between text-[12px] py-1">
                  <span className="text-white/75 truncate">{c.title}</span>
                  <span className="flex items-center gap-2 text-white/45">
                    <span>{c.completedLessons}/{c.totalLessons}</span>
                    {c.graded && c.percent != null && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/[0.15] border border-blue-400/[0.25] text-blue-200 font-medium">
                        {c.letter} · {c.percent}%
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {s.recentAssignments?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] text-white/35 uppercase tracking-wide">Recent assignments</div>
              {s.recentAssignments.slice(0, 3).map(a => (
                <div key={`${a.lessonId}-${a.gradedAt}`} className="flex items-center justify-between text-[12px] py-1">
                  <span className="text-white/65 truncate">
                    <span className="text-white/35">{a.curriculumTitle} · </span>
                    {a.lessonTitle}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded font-semibold ${gradeBadgeStyle(a.score)}`}>
                    {a.letter} · {a.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-white/40 uppercase tracking-wide">
        <Icon size={11} /> {label}
      </div>
      <div className="text-[15px] font-semibold text-white/85 mt-0.5">{value}</div>
    </div>
  );
}

const DEFAULT_CONTROLS = {
  blockedApps: [], requireGraded: false, difficultyFloor: null,
  allowChats: true, socraticMode: false, blockAnswerHints: false,
};

function ControlsModal({ student, onClose, onSave }) {
  const [controls, setControls] = useState(() => ({ ...DEFAULT_CONTROLS, ...(student?.controls || {}) }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) setControls({ ...DEFAULT_CONTROLS, ...(student.controls || {}) });
  }, [student?.id]);

  if (!student) return null;

  function toggleBlock(appId) {
    setControls(prev => {
      const cur = new Set(prev.blockedApps || []);
      if (cur.has(appId)) cur.delete(appId); else cur.add(appId);
      return { ...prev, blockedApps: [...cur] };
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave(controls);
    setSaving(false);
  }

  return (
    <Modal open={!!student} onClose={onClose} title={`Controls — ${student.name}`} size="lg">
      <div className="space-y-5">

        {/* ── Learning & Difficulty ─────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">Learning &amp; Difficulty</h4>
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
            <Toggle
              label="Require graded mode"
              description="Every new course this child creates will automatically include AI-graded assignments — the form toggle is locked."
              checked={!!controls.requireGraded}
              onChange={v => setControls(prev => ({ ...prev, requireGraded: v }))}
            />
            <div>
              <label className="text-[13px] font-medium text-white/75 block mb-1.5">Minimum difficulty</label>
              <p className="text-[11px] text-white/40 mb-2">Child cannot create courses below this level.</p>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTY_FLOORS.map(opt => (
                  <button
                    key={opt.value || 'none'}
                    type="button"
                    onClick={() => setControls(prev => ({ ...prev, difficultyFloor: opt.value }))}
                    className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      controls.difficultyFloor === opt.value
                        ? 'bg-blue-500/[0.18] border border-blue-400/[0.35] text-blue-100'
                        : 'bg-white/[0.04] border border-white/[0.08] text-white/65 hover:bg-white/[0.07]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Anti-Cheat ───────────────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">Anti-Cheat</h4>
          <div className="rounded-lg border border-amber-400/[0.12] bg-amber-500/[0.04] p-3 space-y-3">
            <Toggle
              label="Socratic mode"
              description="The AI will never give direct answers — it guides through questions only. If your child asks for the answer, the AI asks another question instead."
              checked={!!controls.socraticMode}
              onChange={v => setControls(prev => ({ ...prev, socraticMode: v }))}
            />
            <Toggle
              label="Block answer hints on assessments"
              description="During graded assignments, the AI refuses to give hints, partial answers, or confirmations of correctness. It encourages trying independently."
              checked={!!controls.blockAnswerHints}
              onChange={v => setControls(prev => ({ ...prev, blockAnswerHints: v }))}
            />
          </div>
        </section>

        {/* ── App Access ───────────────────────────────────────── */}
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">App Access</h4>
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-3">
            <Toggle
              label="Allow Study Mode chat"
              description="When off, this child can't start free-form Study Mode conversations. Lesson chats are always available."
              checked={controls.allowChats !== false}
              onChange={v => setControls(prev => ({ ...prev, allowChats: v }))}
            />
            <div className="pt-1 border-t border-white/[0.05]">
              <p className="text-[12px] font-medium text-white/70 mb-2">Block specific features</p>
              <div className="space-y-2">
                {BLOCKABLE_APPS.map(app => {
                  const blocked = (controls.blockedApps || []).includes(app.id);
                  return (
                    <label key={app.id} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blocked}
                        onChange={() => toggleBlock(app.id)}
                        className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/[0.05] text-rose-500 focus:ring-rose-400/40 focus:ring-offset-0"
                      />
                      <span className="flex-1">
                        <span className="block text-[13px] font-medium text-white/85">{app.label}</span>
                        <span className="block text-[11px] text-white/45">{app.description}</span>
                      </span>
                      {blocked && <span className="text-[10px] uppercase tracking-wide text-rose-300 font-semibold">Blocked</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} loading={saving} className="flex-1">Save controls</Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">Done</Button>
        </div>
      </div>
    </Modal>
  );
}

// Chats modal — list pane + reader pane. Lists every lesson chat + study
// session belonging to this child; clicking one loads the full transcript.
function ChatsModal({ student, pin, onClose }) {
  const [chats, setChats] = useState(null);
  const [selected, setSelected] = useState(null); // selected list entry
  const [transcript, setTranscript] = useState(null);
  const [loadingT, setLoadingT] = useState(false);
  const [error, setError] = useState(null);

  // Reload list whenever a different student is opened.
  useEffect(() => {
    if (!student) { setChats(null); setSelected(null); setTranscript(null); return; }
    setError(null);
    listStudentChats(pin, student.id)
      .then(d => setChats(d.chats || []))
      .catch(e => setError(e.message));
  }, [student?.id, pin]);

  // Auto-load the first chat's transcript so the reader pane isn't blank
  // when there's content.
  useEffect(() => {
    if (!selected || !student) return;
    setLoadingT(true);
    setTranscript(null);
    getStudentChat(pin, student.id, selected.kind, selected.id)
      .then(d => setTranscript(d))
      .catch(e => setError(e.message))
      .finally(() => setLoadingT(false));
  }, [selected, student?.id, pin]);

  if (!student) return null;

  return (
    <Modal open={!!student} onClose={onClose} title={`${student.name}'s chats`} size="xl">
      {error && (
        <div className="mb-3 text-[13px] text-rose-300 bg-rose-900/20 border border-rose-700/30 rounded-lg px-3 py-2">{error}</div>
      )}

      {chats == null ? (
        <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>
      ) : chats.length === 0 ? (
        <div className="text-center py-10 text-[13px] text-white/55">
          No chats yet — {student.name} hasn't started any lessons or study sessions.
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-3 h-[440px]">
          <div className="overflow-y-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
            {chats.map(c => (
              <button
                key={`${c.kind}-${c.id}`}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-3 py-2 border-b border-white/[0.05] transition-colors ${
                  selected?.id === c.id ? 'bg-blue-500/[0.10]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/35">
                  {c.kind === 'lesson' ? <BookOpen size={10} /> : <MessageCircle size={10} />}
                  {c.kind === 'lesson' ? 'Lesson' : 'Study mode'}
                </div>
                <div className="text-[13px] font-medium text-white/85 truncate">
                  {c.kind === 'lesson' ? c.lessonTitle : c.title}
                </div>
                {c.kind === 'lesson' && (
                  <div className="text-[11px] text-white/40 truncate">{c.curriculumTitle}</div>
                )}
                {c.preview && <div className="text-[11px] text-white/35 truncate mt-0.5">"{c.preview}"</div>}
                <div className="text-[10px] text-white/30 mt-0.5">{c.messageCount} messages</div>
              </button>
            ))}
          </div>

          <div className="overflow-y-auto rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
            {!selected ? (
              <div className="text-center text-[13px] text-white/45 py-12">
                <Eye size={18} className="mx-auto mb-2 text-white/25" />
                Select a chat to read the transcript.
              </div>
            ) : loadingT ? (
              <div className="flex items-center justify-center h-32"><LoadingSpinner size={20} /></div>
            ) : !transcript ? (
              <div className="text-[13px] text-white/45">No transcript available.</div>
            ) : (
              <div className="space-y-2.5">
                <h4 className="text-[13px] font-semibold text-white/80 pb-2 border-b border-white/[0.06]">{transcript.title}</h4>
                {(transcript.messages || []).map((m, i) => (
                  <div key={i} className={`rounded-md px-3 py-2 ${m.role === 'user' ? 'bg-blue-500/[0.08] border border-blue-400/[0.15]' : 'bg-white/[0.03] border border-white/[0.05]'}`}>
                    <div className="text-[10px] uppercase tracking-wide text-white/35 mb-0.5">
                      {m.role === 'user' ? student.name : 'AI'}
                      {m.timestamp && <span className="ml-2 normal-case text-white/25">{new Date(m.timestamp).toLocaleString()}</span>}
                    </div>
                    <div className="text-[12.5px] text-white/80 whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  </div>
                ))}
                {(transcript.messages || []).length === 0 && (
                  <div className="text-[13px] text-white/45 text-center py-6">Empty transcript.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function AddChildModal({ open, onClose, onAdd, existingCount }) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [color, setColor] = useState(COLORS[existingCount % COLORS.length]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setGrade(''); setColor(COLORS[existingCount % COLORS.length]); } }, [open, existingCount]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onAdd({ name: name.trim(), grade: grade.trim(), color });
    setSaving(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add child profile">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter name" autoFocus />
        <Input label="Grade / age (optional)" value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. 7th grade" />
        <div>
          <label className="text-[13px] font-medium text-white/75 block mb-2">Color</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-white/60 scale-110' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="submit" loading={saving} className="flex-1">Add child</Button>
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
