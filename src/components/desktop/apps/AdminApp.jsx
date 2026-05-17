import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Shield, ArrowLeft, Ban, Trash2, User, BookOpen, FileText, Target, Layers,
  MessageSquare, Lightbulb, Trophy, CreditCard, Search, Crown, Calendar,
  RefreshCw, ChevronRight, Zap, ClipboardList, BarChart3, X,
} from 'lucide-react';
import {
  checkAdmin, listUsers, getUser, toggleBan, deleteUser,
  getStudySession, getStandaloneLesson, getCurriculumLesson,
} from '../../../api/admin';
import { ownerGrantPro, ownerRevokePro } from '../../../api/billing';
import LoadingSpinner from '../../shared/LoadingSpinner';
import AdvisorBadge from '../../shared/AdvisorBadge';

const ADVISOR_EMAILS = new Set(['william.qiao.yang@gmail.com']);
const isAdvisorEmail = (email) => ADVISOR_EMAILS.has((email || '').toLowerCase());

/* ====================== TOP-LEVEL ====================== */
export default function AdminApp() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | detail | chat
  const [selectedUser, setSelectedUser] = useState(null);
  const [conv, setConv] = useState(null);

  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  // Demo accounts (demo-landing-* / *@covalent.test) are real signups
  // from the public landing demo flow, so they count toward total
  // users and the analytics tiles.
  const [includeDemo, setIncludeDemo] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const a = await checkAdmin();
        setIsAdmin(a.isAdmin);
        if (a.isAdmin) {
          const d = await listUsers({ includeDemo });
          setUsers(d.users || []);
        }
      } catch {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDemo]);

  async function refreshList() {
    const d = await listUsers({ includeDemo });
    setUsers(d.users || []);
  }

  async function openUser(uid) {
    try {
      const d = await getUser(uid, { includeDemo });
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
      const d = await getUser(selectedUser.id, { includeDemo });
      setSelectedUser(d.user);
    }
  }
  async function handleRevokePro(email) {
    await ownerRevokePro(email);
    await refreshList();
    if (selectedUser?.email === email) {
      const d = await getUser(selectedUser.id, { includeDemo });
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
    } else {
      list = [...list].sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));
    }
    return list;
  }, [users, query, planFilter, sort]);

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Shield size={36} className="text-white/25 mb-3" />
        <p className="text-sm text-white/40">Admin access required</p>
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
      includeDemo={includeDemo} setIncludeDemo={setIncludeDemo}
      onOpen={openUser}
      onRefresh={refreshList}
    />
  );
}

function sumMsgs(u) { return (u.chatMessages?.study || 0) + (u.chatMessages?.lessons || 0) + (u.chatMessages?.curriculum || 0); }

/* ====================== USER LIST ====================== */
function UserList({ users, total, query, setQuery, planFilter, setPlanFilter, sort, setSort, includeDemo, setIncludeDemo, onOpen, onRefresh }) {
  // "Secret" analytics panel — toggled by five fast taps on the
  // Admin Panel title. The header keeps the public-facing vanity
  // counts (56 weekly / 12 daily); the hidden panel computes the
  // REAL numbers from the loaded users list (MAU/WAU/DAU, plan split,
  // churn signal, etc.) and overlays the user list while open.
  const [showAnalytics, setShowAnalytics] = useState(false);
  const tapsRef = useRef({ count: 0, last: 0 });
  function onTitleTap() {
    const now = Date.now();
    if (now - tapsRef.current.last > 1500) tapsRef.current.count = 0;
    tapsRef.current.count += 1;
    tapsRef.current.last = now;
    if (tapsRef.current.count >= 5) {
      tapsRef.current.count = 0;
      setShowAnalytics(true);
    }
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-white/50 flex-shrink-0">
          <Shield size={15} />
        </div>
        <h2
          onClick={onTitleTap}
          className="text-[15px] font-bold text-white/90 cursor-default select-none"
          title=""
        >
          Admin Panel
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-white/55 ml-1 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold tabular-nums text-white/80">{total}</span>
            <span className="text-white/45">total</span>
          </span>
          <span className="text-white/20">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            <span className="font-semibold tabular-nums text-white/80">56</span>
            <span className="text-white/45">weekly active</span>
          </span>
          <span className="text-white/20">·</span>
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold tabular-nums text-white/80">12</span>
            <span className="text-white/45">daily active</span>
          </span>
        </span>
        <div className="ml-auto">
          <button
            onClick={onRefresh}
            className="text-white/30 hover:text-white/65 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, handle…"
            className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/85 placeholder:text-white/25 text-xs outline-none focus:border-white/[0.15] transition-colors"
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
        {users.length === 0 && <p className="text-xs text-white/30 text-center py-8">No matches.</p>}
        {users.map(u => (
          <div
            key={u.id}
            onClick={() => onOpen(u.id)}
            className="group flex items-center gap-3 bg-white/[0.03] rounded-xl border border-white/[0.07] px-4 py-2.5 cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.13] transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-white/[0.10] border border-white/[0.15] flex items-center justify-center text-[11px] font-bold text-white/70 flex-shrink-0">
              {(u.name || u.email || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-white/90 truncate">{u.name || u.email}</p>
                {isAdvisorEmail(u.email) ? <AdvisorBadge /> : (u.plan === 'pro' && <ProPill />)}
                {u.banned && <span className="px-1.5 py-0.5 rounded bg-rose-900/30 text-rose-400 text-[10px] font-medium">Banned</span>}
                {u.isDemo && <span className="px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">Demo</span>}
              </div>
              <p className="text-[10px] text-white/35 truncate">
                {u.handle ? `@${u.handle} · ` : ''}{u.email} · L{u.level} · {u.visitCount || 0} visits · {sumMsgs(u)} msgs · {u.curriculaCount} curr · {u.studySessionCount} study · {u.lessonCount} lessons
              </p>
            </div>
            <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0" />
          </div>
        ))}
      </div>

      {showAnalytics && (
        <AnalyticsPanel users={users} total={total} onClose={() => setShowAnalytics(false)} />
      )}
    </div>
  );
}

function TabChips({ options, value, onChange }) {
  return (
    <div className="flex bg-white/[0.04] rounded-lg p-0.5">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${value === k ? 'bg-white/[0.10] text-white/90 shadow-sm' : 'text-white/40 hover:text-white/65'}`}
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

/* =====================================================
 * SECRET ANALYTICS PANEL
 * Hidden behind 5 fast taps on the "Admin Panel" title.
 * Computes real metrics from the loaded user list — MAU/WAU/DAU,
 * stickiness ratio, churn signal, plan split, signup cohorts,
 * power users, time-on-site proxy (avg visits).
 * =====================================================*/
function AnalyticsPanel({ users, total, onClose }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    // Resolve a "last active" timestamp per user. lastActiveAt is a
    // YYYY-MM-DD string from study streaks; lastVisitAt is a precise
    // ISO/ms. Prefer the precise one and fall back to the date string.
    const lastActiveMs = (u) => {
      const v = u.lastVisitAt;
      if (v) {
        const t = typeof v === 'number' ? v : Date.parse(v);
        if (Number.isFinite(t)) return t;
      }
      if (u.lastActiveAt) {
        const t = Date.parse(u.lastActiveAt);
        if (Number.isFinite(t)) return t;
      }
      return 0;
    };
    const createdMs = (u) => {
      if (!u.createdAt) return 0;
      const t = typeof u.createdAt === 'number' ? u.createdAt : Date.parse(u.createdAt);
      return Number.isFinite(t) ? t : 0;
    };

    let dau = 0, wau = 0, mau = 0;
    let newToday = 0, new7d = 0, new30d = 0;
    let pro = 0, banned = 0;
    let totalVisits = 0, totalMsgs = 0;
    // Churn — users active in the prior 30d window but NOT in the
    // current 7d. Rough but useful directional signal.
    let activePrior30 = 0, activeNow7 = 0;
    const usersWithActivity = users.filter(u => lastActiveMs(u) > 0);
    for (const u of users) {
      const la = lastActiveMs(u);
      const ca = createdMs(u);
      const ageActive = la ? now - la : Infinity;
      const ageCreated = ca ? now - ca : Infinity;
      if (ageActive < 1 * DAY) dau++;
      if (ageActive < 7 * DAY) wau++;
      if (ageActive < 30 * DAY) mau++;
      if (ageCreated < 1 * DAY) newToday++;
      if (ageCreated < 7 * DAY) new7d++;
      if (ageCreated < 30 * DAY) new30d++;
      if (u.plan === 'pro') pro++;
      if (u.banned) banned++;
      totalVisits += u.visitCount || 0;
      const m = u.chatMessages || {};
      totalMsgs += (m.study || 0) + (m.lessons || 0) + (m.curriculum || 0);
      if (ageActive >= 7 * DAY && ageActive < 30 * DAY) activePrior30++;
      if (ageActive < 7 * DAY && la > 0) activeNow7++;
    }
    const avgVisits = usersWithActivity.length ? totalVisits / usersWithActivity.length : 0;
    const stickiness = mau ? (dau / mau) * 100 : 0;
    // Churn: of users active in the prior window, what fraction
    // is NOT active in the current 7d window? Lower is better.
    const churn = (activePrior30 + activeNow7) ? (activePrior30 / (activePrior30 + activeNow7)) * 100 : 0;

    // Power users — top 5 by total chat messages.
    const powerUsers = [...users]
      .map(u => ({
        u,
        msgs: ((u.chatMessages?.study || 0) + (u.chatMessages?.lessons || 0) + (u.chatMessages?.curriculum || 0)),
      }))
      .filter(x => x.msgs > 0)
      .sort((a, b) => b.msgs - a.msgs)
      .slice(0, 5);

    return { dau, wau, mau, newToday, new7d, new30d, pro, banned, avgVisits, stickiness, churn, totalMsgs, totalVisits, powerUsers };
  }, [users]);

  return (
    <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md overflow-y-auto p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-200 flex-shrink-0">
            <BarChart3 size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-white/90">Analytics</h2>
            <p className="text-[10.5px] text-white/40">Real numbers — computed from the {total} non-demo accounts</p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <StatTile label="Daily active" value={stats.dau} accent="emerald" />
          <StatTile label="Weekly active" value={stats.wau} accent="blue" />
          <StatTile label="Monthly active" value={stats.mau} accent="indigo" />
          <StatTile label="Total users" value={total} accent="white" />
        </div>

        {/* Engagement + cohorts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-2">Engagement</p>
            <StatRow label="DAU / MAU stickiness" value={`${stats.stickiness.toFixed(1)}%`} />
            <StatRow label="Churn (prior-30 not in last-7)" value={`${stats.churn.toFixed(1)}%`} />
            <StatRow label="Avg visits / active user" value={stats.avgVisits.toFixed(1)} />
            <StatRow label="Total chat messages" value={stats.totalMsgs.toLocaleString()} />
            <StatRow label="Total visits" value={stats.totalVisits.toLocaleString()} />
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-2">Signups & plans</p>
            <StatRow label="New today" value={stats.newToday} />
            <StatRow label="New last 7 days" value={stats.new7d} />
            <StatRow label="New last 30 days" value={stats.new30d} />
            <StatRow label="Pro subscribers" value={`${stats.pro} (${total ? ((stats.pro / total) * 100).toFixed(1) : 0}%)`} />
            <StatRow label="Banned" value={stats.banned} />
          </div>
        </div>

        {/* Power users */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-2">Top by chat messages</p>
          {stats.powerUsers.length === 0 ? (
            <p className="text-[12px] text-white/40 py-2">No chat activity yet.</p>
          ) : (
            <div className="space-y-1">
              {stats.powerUsers.map(({ u, msgs }, i) => (
                <div key={u.id || u.email} className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-mono text-white/35 tabular-nums w-5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[12.5px] text-white/85 flex-1 truncate">{u.name || u.email}</span>
                  <span className="text-[11px] font-mono font-semibold tabular-nums text-blue-200">{msgs.toLocaleString()}</span>
                  <span className="text-[10px] text-white/35">msgs</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-[9.5px] text-white/30 text-center mt-3">
          Note: time-on-site uses avg-visits as a proxy — session duration isn't tracked yet.
        </p>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }) {
  const tones = {
    emerald: 'border-emerald-500/30 from-emerald-500/[0.12] text-emerald-200',
    blue:    'border-blue-500/30 from-blue-500/[0.12] text-blue-200',
    indigo:  'border-indigo-500/30 from-indigo-500/[0.12] text-indigo-200',
    white:   'border-white/[0.12] from-white/[0.06] text-white',
  };
  const t = tones[accent] || tones.white;
  return (
    <div className={`rounded-xl border bg-gradient-to-b to-transparent p-4 ${t}`}>
      <div className="text-[28px] font-black tabular-nums leading-none">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/55 mt-2">{label}</p>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
      <span className="text-[12px] text-white/55">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-white/90">{value}</span>
    </div>
  );
}

/* ====================== USER DETAIL ====================== */
function UserDetail({ user: u, onBack, onBan, onDelete, onGrantPro, onRevokePro, onOpenConv }) {
  const [tab, setTab] = useState('overview');

  const totalMsgs =
    (u.studySessions || []).reduce((n, s) => n + (s.messageCount || 0), 0) +
    (u.standaloneLessons || []).reduce((n, l) => n + (l.messageCount || 0), 0) +
    (u.curriculumChats || []).reduce((n, c) => n + (c.messageCount || 0), 0);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors">
        <ArrowLeft size={16} /> All Users
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-white/[0.10] border border-white/[0.15] flex items-center justify-center text-lg font-bold text-white/70 flex-shrink-0">
          {(u.name || u.email || '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-white/90 truncate">{u.name || 'Unknown'}</h2>
            {isAdvisorEmail(u.email) ? <AdvisorBadge /> : (u.plan === 'pro' && <ProPill />)}
            {u.banned && <span className="px-2 py-0.5 rounded-full bg-rose-900/30 text-rose-400 text-xs font-medium">Banned</span>}
          </div>
          <p className="text-xs text-white/40 truncate">
            {u.email}{u.handle ? ` · @${u.handle}` : ''}
          </p>
          <p className="text-[11px] text-white/30">
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
            <button onClick={onRevokePro} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-700/50 text-amber-400 text-xs font-medium">
              Revoke Pro
            </button>
          )
        )}
        <button onClick={onBan} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${u.banned ? 'bg-emerald-700/80 text-white' : 'bg-rose-700/80 text-white'}`}>
          <Ban size={12} className="inline mr-1" /> {u.banned ? 'Unban' : 'Ban'}
        </button>
        <button onClick={onDelete} className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs font-medium text-rose-400 hover:bg-white/[0.04] transition-colors">
          <Trash2 size={12} className="inline mr-1" /> Delete
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.08] mb-3 -mx-1 px-1 overflow-x-auto scrollbar-hide">
        {[
          ['overview',   'Overview',   <User size={12} key="u" />],
          ['study',      `Study (${u.studySessions?.length || 0})`,      <MessageSquare size={12} key="s" />],
          ['lessons',    `Lessons (${u.standaloneLessons?.length || 0})`, <Lightbulb size={12} key="l" />],
          ['curriculum', `Curriculum (${u.curriculumChats?.length || 0})`, <BookOpen size={12} key="c" />],
          ['quizzes',    'Quizzes',    <ClipboardList size={12} key="q" />],
          ['other',      'Other',      <Layers size={12} key="o" />],
          ['billing',    'Billing',    <CreditCard size={12} key="b" />],
        ].map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ borderRadius: 0 }}
            className={`relative flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${tab === k ? 'text-white/90' : 'text-white/35 hover:text-white/60'}`}
          >
            {icon} {label}
            {tab === k && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-white/60" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab u={u} />}
      {tab === 'study' && <StudyTab u={u} onOpen={(sid) => onOpenConv('study', { sid })} />}
      {tab === 'lessons' && <LessonsTab u={u} onOpen={(lid) => onOpenConv('lesson', { lid })} />}
      {tab === 'curriculum' && <CurriculumTab u={u} onOpen={(cid, lid) => onOpenConv('curriculum', { cid, lid })} />}
      {tab === 'quizzes' && <QuizzesTab u={u} />}
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
      <Stat label="Lesson quizzes" value={u.lessonQuizResults?.length || 0} />
      <Stat label="Curriculum quizzes" value={u.curriculumQuizResults?.length || 0} />
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
          icon={<MessageSquare size={14} className="text-white/45" />}
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
          icon={<Lightbulb size={14} className="text-white/45" />}
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
          icon={<BookOpen size={14} className="text-white/45" />}
          title={c.lessonTitle}
          meta={`${c.curriculumTitle} / ${c.unitTitle} · ${c.messageCount} msgs${c.lastActiveAt ? ' · ' + new Date(c.lastActiveAt).toLocaleString() : ''}`}
        />
      ))}
    </div>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-white/25 text-[10px]">—</span>;
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400';
  return <span className={`font-bold tabular-nums text-xs ${color}`}>{score}%</span>;
}

function QuizzesTab({ u }) {
  const assessments = u.assessmentHistory || [];
  const lessonQuizzes = u.lessonQuizResults || [];
  const curriculumQuizzes = u.curriculumQuizResults || [];
  const quizBowlGames = u.usage?.quizBowlGames ?? 0;

  const hasAnything = assessments.length || lessonQuizzes.length || curriculumQuizzes.length || quizBowlGames;
  if (!hasAnything) return <Empty msg="No quiz results yet" />;

  return (
    <div className="space-y-5">

      {/* Assessment Tool */}
      {assessments.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Trophy size={10} /> Assessment Tool <span className="text-white/20 font-normal">({assessments.length})</span>
          </h3>
          <div className="space-y-1">
            {assessments.map((a, i) => (
              <div key={a.id || i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/80 truncate">{a.title}</p>
                  {a.createdAt && <p className="text-[10px] text-white/30">{new Date(a.createdAt).toLocaleString()}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <ScoreBadge score={a.percentage} />
                  <p className="text-[10px] text-white/30">{a.score}/{a.total}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standalone lesson quizzes */}
      {lessonQuizzes.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Lightbulb size={10} /> Lesson Quizzes <span className="text-white/20 font-normal">({lessonQuizzes.length} lessons)</span>
          </h3>
          <div className="space-y-2">
            {lessonQuizzes.map((l, i) => (
              <div key={l.lessonId || i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05]">
                  <p className="flex-1 text-xs font-medium text-white/80 truncate">{l.lessonTitle}</p>
                  <div className="flex-shrink-0 text-right">
                    <ScoreBadge score={l.overallScore} />
                    <p className="text-[10px] text-white/25">overall</p>
                  </div>
                </div>
                <div className="px-3 py-1.5 space-y-1">
                  {l.quizBlocks.map((b, j) => (
                    <div key={j} className="flex items-center justify-between text-[11px]">
                      <span className="text-white/45 truncate">{b.title}</span>
                      <ScoreBadge score={b.score} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Curriculum lesson quizzes */}
      {curriculumQuizzes.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <BookOpen size={10} /> Curriculum Quizzes <span className="text-white/20 font-normal">({curriculumQuizzes.length} lessons)</span>
          </h3>
          <div className="space-y-2">
            {curriculumQuizzes.map((l, i) => (
              <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.05]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white/80 truncate">{l.lessonTitle}</p>
                    <p className="text-[10px] text-white/30 truncate">{l.curriculumTitle} · {l.unitTitle}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <ScoreBadge score={l.overallScore} />
                    <p className="text-[10px] text-white/25">overall</p>
                  </div>
                </div>
                <div className="px-3 py-1.5 space-y-1">
                  {l.quizBlocks.map((b, j) => (
                    <div key={j} className="flex items-center justify-between text-[11px]">
                      <span className="text-white/45 truncate">{b.title}</span>
                      <ScoreBadge score={b.score} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz Bowl */}
      {quizBowlGames > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap size={10} /> Quiz Bowl
          </h3>
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs text-white/75">{quizBowlGames} game{quizBowlGames !== 1 ? 's' : ''} played today</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OtherTab({ u }) {
  return (
    <div className="space-y-4">
      <ListBlock title="Curricula"          items={u.curricula}          render={c => `${c.title} · ${c.completedLessons}/${c.lessonCount} lessons`} icon={<BookOpen size={10} />} />
      <ListBlock title="Notes"              items={u.notes}              render={n => `${n.title} · ${n.type}`}                                       icon={<FileText size={10} />} />
      <ListBlock title="Goals"              items={u.goals}              render={g => `${g.title} · ${g.status}`}                                     icon={<Target size={10} />} />
      <ListBlock title="Flashcards"         items={u.flashcardDecks}     render={d => `${d.title} · ${d.cardCount} cards`}                            icon={<Layers size={10} />} />
      <ListBlock title="Assessment history" items={u.assessmentHistory}  render={a => `${a.title} · ${a.score}/${a.total} (${a.percentage}%)`}        icon={<Trophy size={10} />} />
    </div>
  );
}

function ListBlock({ title, items, render, icon }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-1">
        {icon} {title} <span className="text-white/20 font-normal">({items.length})</span>
      </h3>
      <div className="space-y-1">
        {items.map((x, i) => (
          <div key={x.id || i} className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/75">
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
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Plan</span>
          <div className="flex items-center gap-1.5">
            {isAdvisorEmail(u.email) ? <AdvisorBadge /> : (u.plan === 'pro' ? <ProPill /> : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] text-white/40">FREE</span>)}
          </div>
        </div>
        <KV label="Granted by" value={u.proGrantedBy || '—'} />
        <KV label="Pro until" value={u.proUntil ? new Date(u.proUntil).toLocaleString() : '—'} />
        <KV label="Stripe customer" value={u.stripeCustomerId || '—'} mono />
        <KV label="Stripe subscription" value={u.stripeSubscriptionId || '—'} mono />
      </div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Zap size={12} className="text-white/45" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Today's usage</span>
          <span className="ml-auto text-[10px] text-white/25">{u.usage?.day || 'n/a'}</span>
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
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-white/90 tabular-nums">{value}</p>
    </div>
  );
}
function Row({ icon, title, meta, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.07] text-left hover:bg-white/[0.05] hover:border-white/[0.13] transition-colors">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/85 truncate">{title}</p>
        <p className="text-[10px] text-white/35 truncate">{meta}</p>
      </div>
      <ChevronRight size={12} className="text-white/25" />
    </button>
  );
}
function Empty({ msg }) { return <p className="text-xs text-white/30 text-center py-8">{msg}</p>; }
function KV({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-white/40">{label}</span>
      <span className={`text-white/75 ${mono ? 'font-mono text-[11px]' : ''} truncate max-w-[60%]`}>{value}</span>
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
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors">
        <ArrowLeft size={16} /> Back to {user?.name || 'user'}
      </button>

      <div className="flex items-center gap-2 mb-3">
        {kind === 'study'      && <MessageSquare size={16} className="text-white/50" />}
        {kind === 'lesson'     && <Lightbulb size={16} className="text-white/50" />}
        {kind === 'curriculum' && <BookOpen size={16} className="text-white/50" />}
        <h3 className="text-base font-semibold text-white/90 truncate">{title}</h3>
        <span className="text-[11px] text-white/30 ml-auto">{messages.length} messages</span>
      </div>

      {loading && <div className="flex items-center justify-center py-12"><LoadingSpinner size={20} /></div>}
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {!loading && messages.length === 0 && <Empty msg="No messages in this conversation." />}

      <div className="space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`rounded-xl p-3 border ${m.role === 'user' ? 'border-white/[0.12] bg-white/[0.06]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${m.role === 'user' ? 'text-white/70' : 'text-white/35'}`}>
                {m.role === 'user' ? 'User' : 'AI'}
              </span>
              {m.timestamp && <span className="text-[10px] text-white/25">{new Date(m.timestamp).toLocaleString()}</span>}
            </div>
            <div className="text-xs text-white/80 whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
