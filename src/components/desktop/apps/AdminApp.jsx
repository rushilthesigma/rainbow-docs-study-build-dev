import { useState, useEffect, useMemo } from 'react';
import {
  Shield, ArrowLeft, Ban, Trash2, User, BookOpen, FileText, Target, Layers,
  MessageSquare, Lightbulb, Trophy, CreditCard, Search, Crown, Calendar,
  RefreshCw, ChevronRight, Zap,
} from 'lucide-react';
import {
  checkAdmin, listUsers, getUser, toggleBan, deleteUser,
  getStudySession, getStandaloneLesson, getCurriculumLesson,
} from '../../../api/admin';
import { ownerGrantPro, ownerRevokePro } from '../../../api/billing';
import LoadingSpinner from '../../shared/LoadingSpinner';

/* ====================== TOP-LEVEL ====================== */
export default function AdminApp() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | detail | chat
  const [selectedUser, setSelectedUser] = useState(null);
  const [conv, setConv] = useState(null); // active conversation viewer payload

  // List view filters
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all'); // all | free | pro
  const [sort, setSort] = useState('recent'); // recent | messages | created

  useEffect(() => {
    (async () => {
      try {
        const a = await checkAdmin();
        setIsAdmin(a.isAdmin);
        if (a.isAdmin) {
          const d = await listUsers();
          setUsers(d.users || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function refreshList() {
    const d = await listUsers();
    setUsers(d.users || []);
  }

  async function openUser(uid) {
    try {
      const d = await getUser(uid);
      setSelectedUser(d.user);
      setView('detail');
    } catch {}
  }

  async function handleBan(uid) {
    const r = await toggleBan(uid);
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, banned: r.banned } : u));
    if (selectedUser?.id === uid) setSelectedUser(prev => ({ ...prev, banned: r.banned }));
  }
  async function handleDelete(uid) {
    if (!confirm('Permanently delete this user and all their data?')) return;
    await deleteUser(uid);
    setUsers(prev => prev.filter(u => u.id !== uid));
    if (selectedUser?.id === uid) { setView('list'); setSelectedUser(null); }
  }
  async function handleGrantPro(email) {
    await ownerGrantPro(email);
    await refreshList();
    if (selectedUser?.email === email) {
      const d = await getUser(selectedUser.id);
      setSelectedUser(d.user);
    }
  }
  async function handleRevokePro(email) {
    await ownerRevokePro(email);
    await refreshList();
    if (selectedUser?.email === email) {
      const d = await getUser(selectedUser.id);
      setSelectedUser(d.user);
    }
  }

  async function openConv(kind, payload) {
    try {
      setConv({ kind, loading: true, user: selectedUser });
      setView('chat');
      let data;
      if (kind === 'study') data = await getStudySession(selectedUser.id, payload.sid);
      else if (kind === 'lesson') data = await getStandaloneLesson(selectedUser.id, payload.lid);
      else if (kind === 'curriculum') data = await getCurriculumLesson(selectedUser.id, payload.cid, payload.lid);
      setConv({ kind, loading: false, user: selectedUser, data });
    } catch (e) {
      setConv(c => ({ ...c, loading: false, error: e.message }));
    }
  }

  /* ---------- Filtering / sorting ---------- */
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = users.filter(u => {
      if (planFilter !== 'all' && u.plan !== planFilter) return false;
      if (!q) return true;
      return (u.email || '').toLowerCase().includes(q)
          || (u.name || '').toLowerCase().includes(q)
          || (u.handle || '').toLowerCase().includes(q);
    });
    if (sort === 'messages') {
      list = [...list].sort((a, b) => (sumMsgs(b) - sumMsgs(a)));
    } else if (sort === 'created') {
      list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } else { // recent
      list = [...list].sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
    }
    return list;
  }, [users, query, planFilter, sort]);

  /* ---------- Renders ---------- */
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Shield size={36} className="text-gray-400 mb-3" />
        <p className="text-sm text-gray-500">Admin access required</p>
      </div>
    );
  }

  if (view === 'chat' && conv) {
    return (
      <ConversationViewer
        conv={conv}
        onBack={() => { setConv(null); setView('detail'); }}
      />
    );
  }

  if (view === 'detail' && selectedUser) {
    return (
      <UserDetail
        user={selectedUser}
        onBack={() => { setView('list'); setSelectedUser(null); }}
        onBan={() => handleBan(selectedUser.id)}
        onDelete={() => handleDelete(selectedUser.id)}
        onGrantPro={() => handleGrantPro(selectedUser.email)}
        onRevokePro={() => handleRevokePro(selectedUser.email)}
        onOpenConv={openConv}
      />
    );
  }

  return (
    <UserList
      users={filtered}
      total={users.length}
      query={query} setQuery={setQuery}
      planFilter={planFilter} setPlanFilter={setPlanFilter}
      sort={sort} setSort={setSort}
      onOpen={openUser}
      onRefresh={refreshList}
    />
  );
}

function sumMsgs(u) { return (u.chatMessages?.study || 0) + (u.chatMessages?.lessons || 0) + (u.chatMessages?.curriculum || 0); }

/* ====================== USER LIST ====================== */
function UserList({ users, total, query, setQuery, planFilter, setPlanFilter, sort, setSort, onOpen, onRefresh }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Shield size={20} className="text-blue-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</h2>
        <span className="text-xs text-gray-400 ml-2">{users.length} of {total}</span>
        <button onClick={onRefresh} className="ml-auto text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1e1e2e]" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, handle…"
            className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-xs outline-none"
          />
        </div>
        <TabChips
          options={[['all', 'All'], ['pro', 'Pro'], ['free', 'Free']]}
          value={planFilter}
          onChange={setPlanFilter}
        />
        <TabChips
          options={[['recent', 'Recent'], ['messages', 'Most chats'], ['created', 'Newest']]}
          value={sort}
          onChange={setSort}
        />
      </div>

      <div className="space-y-1.5">
        {users.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No matches.</p>}
        {users.map(u => (
          <div
            key={u.id}
            onClick={() => onOpen(u.id)}
            className="group flex items-center gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-2.5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
              {(u.name || u.email || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.name || u.email}</p>
                {u.plan === 'pro' && <ProPill />}
                {u.banned && <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/30 text-rose-500 text-[10px] font-medium">Banned</span>}
              </div>
              <p className="text-[10px] text-gray-400 truncate">
                {u.handle ? `@${u.handle} · ` : ''}{u.email} · L{u.level} · {u.visitCount || 0} visits · {sumMsgs(u)} msgs · {u.curriculaCount} curr · {u.studySessionCount} study · {u.lessonCount} lessons
              </p>
            </div>
            <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TabChips({ options, value, onChange }) {
  return (
    <div className="flex bg-gray-100 dark:bg-[#1e1e2e] rounded-lg p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${value === k ? 'bg-white dark:bg-[#2A2A40] text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ProPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
      <Crown size={8} /> PRO
    </span>
  );
}

/* ====================== USER DETAIL ====================== */
function UserDetail({ user: u, onBack, onBan, onDelete, onGrantPro, onRevokePro, onOpenConv }) {
  const [tab, setTab] = useState('overview'); // overview | study | lessons | curriculum | other | billing

  const totalMsgs =
    (u.studySessions || []).reduce((n, s) => n + (s.messageCount || 0), 0) +
    (u.standaloneLessons || []).reduce((n, l) => n + (l.messageCount || 0), 0) +
    (u.curriculumChats || []).reduce((n, c) => n + (c.messageCount || 0), 0);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
        <ArrowLeft size={16} /> All Users
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
          {(u.name || u.email || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{u.name || 'Unknown'}</h2>
            {u.plan === 'pro' && <ProPill />}
            {u.banned && <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 text-xs font-medium">Banned</span>}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {u.email}{u.handle ? ` · @${u.handle}` : ''}
          </p>
          <p className="text-[11px] text-gray-400">
            L{u.profile?.level || 1} · {u.profile?.xp || 0} XP · {totalMsgs} total AI messages
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {u.plan !== 'pro' ? (
          <button onClick={onGrantPro} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-white text-xs font-semibold">
            <Crown size={12} /> Grant Pro
          </button>
        ) : (
          u.proGrantedBy === 'owner' && (
            <button onClick={onRevokePro} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-600 text-xs font-medium">
              Revoke Pro
            </button>
          )
        )}
        <button onClick={onBan} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${u.banned ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          <Ban size={12} className="inline mr-1" /> {u.banned ? 'Unban' : 'Ban'}
        </button>
        <button onClick={onDelete} className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs font-medium text-rose-500">
          <Trash2 size={12} className="inline mr-1" /> Delete
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-[#2A2A40] mb-3 -mx-1 px-1 overflow-x-auto scrollbar-hide">
        {[
          ['overview',   'Overview',   <User size={12} key="u" />],
          ['study',      `Study (${u.studySessions?.length || 0})`,      <MessageSquare size={12} key="s" />],
          ['lessons',    `Lessons (${u.standaloneLessons?.length || 0})`, <Lightbulb size={12} key="l" />],
          ['curriculum', `Curriculum (${u.curriculumChats?.length || 0})`, <BookOpen size={12} key="c" />],
          ['other',      'Other',      <Layers size={12} key="o" />],
          ['billing',    'Billing',    <CreditCard size={12} key="b" />],
        ].map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ borderRadius: 0 }}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap ${tab === k ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {icon} {label}
            {tab === k && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-blue-600" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab u={u} />}
      {tab === 'study' && <StudyTab u={u} onOpen={(sid) => onOpenConv('study', { sid })} />}
      {tab === 'lessons' && <LessonsTab u={u} onOpen={(lid) => onOpenConv('lesson', { lid })} />}
      {tab === 'curriculum' && <CurriculumTab u={u} onOpen={(cid, lid) => onOpenConv('curriculum', { cid, lid })} />}
      {tab === 'other' && <OtherTab u={u} />}
      {tab === 'billing' && <BillingTab u={u} />}
    </div>
  );
}

/* ---------- Tabs ---------- */
function OverviewTab({ u }) {
  const s = u.studyStreaks;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Visits" value={u.visitCount || 0} />
      <Stat label="Last visit" value={u.lastVisitAt ? new Date(u.lastVisitAt).toLocaleDateString() : '—'} />
      <Stat label="Level" value={u.profile?.level || 1} />
      <Stat label="XP" value={u.profile?.xp || 0} />
      <Stat label="Current streak" value={s?.currentStreak || 0} />
      <Stat label="Longest streak" value={s?.longestStreak || 0} />
      <Stat label="Study sessions" value={u.studySessions?.length || 0} />
      <Stat label="Lesson chats (standalone)" value={u.standaloneLessons?.length || 0} />
      <Stat label="Curriculum chats" value={u.curriculumChats?.length || 0} />
      <Stat label="Curricula" value={u.curricula?.length || 0} />
      <Stat label="Notes" value={u.notes?.length || 0} />
      <Stat label="Flashcard decks" value={u.flashcardDecks?.length || 0} />
      <Stat label="Goals" value={u.goals?.length || 0} />
      <Stat label="Assessments" value={u.assessmentHistory?.length || 0} />
    </div>
  );
}

function StudyTab({ u, onOpen }) {
  const list = u.studySessions || [];
  if (!list.length) return <Empty msg="No study sessions" />;
  return (
    <div className="space-y-1.5">
      {list.map(s => (
        <Row key={s.id} onClick={() => onOpen(s.id)}
          icon={<MessageSquare size={14} className="text-blue-500" />}
          title={s.title || '(untitled session)'}
          meta={`${s.messageCount || 0} messages · ${s.updatedAt ? new Date(s.updatedAt).toLocaleString() : 'no activity'}`}
        />
      ))}
    </div>
  );
}

function LessonsTab({ u, onOpen }) {
  const list = u.standaloneLessons || [];
  if (!list.length) return <Empty msg="No single-lesson chats" />;
  return (
    <div className="space-y-1.5">
      {list.map(l => (
        <Row key={l.id} onClick={() => onOpen(l.id)}
          icon={<Lightbulb size={14} className="text-yellow-500" />}
          title={l.title || l.topic}
          meta={`${l.difficulty || 'beginner'} · ${l.messageCount || 0} msgs${l.isCompleted ? ' · completed' : ''}${l.lastActiveAt ? ' · ' + new Date(l.lastActiveAt).toLocaleString() : ''}`}
        />
      ))}
    </div>
  );
}

function CurriculumTab({ u, onOpen }) {
  const list = u.curriculumChats || [];
  if (!list.length) return <Empty msg="No curriculum lesson chats yet" />;
  return (
    <div className="space-y-1.5">
      {list.map(c => (
        <Row key={`${c.curriculumId}-${c.lessonId}`}
          onClick={() => onOpen(c.curriculumId, c.lessonId)}
          icon={<BookOpen size={14} className="text-blue-500" />}
          title={c.lessonTitle}
          meta={`${c.curriculumTitle} / ${c.unitTitle} · ${c.messageCount} msgs${c.lastActiveAt ? ' · ' + new Date(c.lastActiveAt).toLocaleString() : ''}`}
        />
      ))}
    </div>
  );
}

function OtherTab({ u }) {
  return (
    <div className="space-y-4">
      <ListBlock title="Curricula" items={u.curricula} render={c => `${c.title} · ${c.completedLessons}/${c.lessonCount} lessons`} icon={<BookOpen size={10} />} />
      <ListBlock title="Notes"     items={u.notes}     render={n => `${n.title} · ${n.type}`} icon={<FileText size={10} />} />
      <ListBlock title="Goals"     items={u.goals}     render={g => `${g.title} · ${g.status}`} icon={<Target size={10} />} />
      <ListBlock title="Flashcards" items={u.flashcardDecks} render={d => `${d.title} · ${d.cardCount} cards`} icon={<Layers size={10} />} />
      <ListBlock title="Assessment history" items={u.assessmentHistory} render={a => `${a.title} · ${a.score}/${a.total} (${a.percentage}%)`} icon={<Trophy size={10} />} />
    </div>
  );
}

function ListBlock({ title, items, render, icon }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
        {icon} {title} <span className="text-gray-300 dark:text-gray-600 font-normal">({items.length})</span>
      </h3>
      <div className="space-y-1">
        {items.map((x, i) => (
          <div key={x.id || i} className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-xs text-gray-800 dark:text-gray-200">
            {render(x)}
          </div>
        ))}
      </div>
    </div>
  );
}

function BillingTab({ u }) {
  return (
    <div className="space-y-2">
      <div className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Plan</span>
          <div className="flex items-center gap-1.5">
            {u.plan === 'pro' ? <ProPill /> : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2A2A40] text-gray-500">FREE</span>}
          </div>
        </div>
        <KV label="Granted by" value={u.proGrantedBy || '—'} />
        <KV label="Pro until" value={u.proUntil ? new Date(u.proUntil).toLocaleString() : '—'} />
        <KV label="Stripe customer" value={u.stripeCustomerId || '—'} mono />
        <KV label="Stripe subscription" value={u.stripeSubscriptionId || '—'} mono />
      </div>
      <div className="bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-4 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap size={12} className="text-blue-500" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Today's usage</span>
          <span className="ml-auto text-[10px] text-gray-400">{u.usage?.day || 'n/a'}</span>
        </div>
        <KV label="AI messages" value={u.usage?.messages ?? 0} />
        <KV label="Quiz Bowl games" value={u.usage?.quizBowlGames ?? 0} />
      </div>
    </div>
  );
}

/* ---------- Small UI bits ---------- */
function Stat({ label, value }) {
  return (
    <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </div>
  );
}
function Row({ icon, title, meta, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-left hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-white truncate">{title}</p>
        <p className="text-[10px] text-gray-400 truncate">{meta}</p>
      </div>
      <ChevronRight size={12} className="text-gray-400" />
    </button>
  );
}
function Empty({ msg }) { return <p className="text-xs text-gray-400 text-center py-8">{msg}</p>; }
function KV({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={`text-gray-800 dark:text-gray-200 ${mono ? 'font-mono text-[11px]' : ''} truncate max-w-[60%]`}>{value}</span>
    </div>
  );
}

/* ====================== CONVERSATION VIEWER ====================== */
function ConversationViewer({ conv, onBack }) {
  const { kind, loading, data, error, user } = conv;
  const messages = (
    kind === 'study'      ? data?.session?.messages :
    kind === 'lesson'     ? data?.lesson?.chatHistory :
    kind === 'curriculum' ? data?.lesson?.chatHistory :
    null
  ) || [];
  const title = (
    kind === 'study'      ? (data?.session?.title || 'Study session') :
    kind === 'lesson'     ? (data?.lesson?.title || data?.lesson?.topic) :
    kind === 'curriculum' ? `${data?.curriculum?.title} · ${data?.lesson?.title}` :
    'Conversation'
  );

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
        <ArrowLeft size={16} /> Back to {user?.name || 'user'}
      </button>

      <div className="flex items-center gap-2 mb-3">
        {kind === 'study' && <MessageSquare size={16} className="text-blue-500" />}
        {kind === 'lesson' && <Lightbulb size={16} className="text-yellow-500" />}
        {kind === 'curriculum' && <BookOpen size={16} className="text-blue-500" />}
        <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
        <span className="text-[11px] text-gray-400 ml-auto">{messages.length} messages</span>
      </div>

      {loading && <div className="flex items-center justify-center py-12"><LoadingSpinner size={20} /></div>}
      {error && <p className="text-xs text-rose-500">{error}</p>}

      {!loading && messages.length === 0 && <Empty msg="No messages in this conversation." />}

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-xl p-3 border ${m.role === 'user' ? 'border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/10' : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#1e1e2e]'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${m.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`}>
                {m.role === 'user' ? 'User' : 'AI'}
              </span>
              {m.timestamp && <span className="text-[10px] text-gray-400">{new Date(m.timestamp).toLocaleString()}</span>}
            </div>
            <div className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
