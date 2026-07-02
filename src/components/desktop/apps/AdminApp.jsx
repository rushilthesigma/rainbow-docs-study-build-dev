import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Shield, ArrowLeft, Ban, Trash2, User, BookOpen, FileText, Target, Layers,
  MessageSquare, Lightbulb, Trophy, CreditCard, Search, Crown, Calendar,
  RefreshCw, ChevronRight, Zap, ClipboardList, BarChart3, X, Check,
  Swords, Activity, ChevronDown, Sparkles, TrendingDown, Clock,
  Lock, Unlock, GraduationCap, Globe, AlertTriangle, Wand2, Edit3,
  Gift, Users, Network,
} from 'lucide-react';
import {
  checkAdmin, getMetrics, listUsers, getUser, toggleBan, deleteUser,
  getStudySession, getStandaloneLesson, getCurriculumLesson, getUserQuizBowl,
  unlockExam,
} from '../../../api/admin';
import { listWikiReports, resolveWikiReport, deleteWikiPage } from '../../../api/wiki';
import { ownerGrantPro, ownerRevokePro } from '../../../api/billing';
import LoadingSpinner from '../../shared/LoadingSpinner';
import AdvisorBadge from '../../shared/AdvisorBadge';
import { peek, fetchOnce, bust, bustPrefix } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import { useToast } from '../../shared/Toast';

/* ====================== TOP-LEVEL ====================== */
export default function AdminApp() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [canBan, setCanBan] = useState(false);
  const [users, setUsers] = useState([]);
  // Global product metrics (landing-page visits etc.) — separate from the
  // per-user list since landing visits are anonymous/pre-signup.
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | analytics | detail | chat | wiki | referrals
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
    const cacheKey = `admin:users:${includeDemo ? '1' : '0'}`;
    const cachedUsers = peek(cacheKey);
    const cachedAdmin = peek('admin:check');
    const cachedMetrics = peek('admin:metrics');
    // If we have prior caches, paint immediately - refresh runs in parallel below.
    if (cachedAdmin?.isAdmin !== undefined) { setIsAdmin(!!cachedAdmin.isAdmin); setCanBan(!!cachedAdmin.canBan); }
    if (cachedUsers?.users) setUsers(cachedUsers.users);
    if (cachedMetrics) setMetrics(cachedMetrics);
    if (cachedAdmin && cachedUsers) setLoading(false);
    // Always re-validate. checkAdmin + listUsers + metrics are independent - fire in parallel.
    (async () => {
      try {
        const [a, d, m] = await Promise.all([
          fetchOnce('admin:check', checkAdmin),
          // listUsers depends on admin check passing, but the API rejects
          // non-admins anyway - racing them is safe and shaves ~150ms.
          fetchOnce(cacheKey, () => listUsers({ includeDemo })).catch(() => ({ users: [] })),
          fetchOnce('admin:metrics', getMetrics).catch(() => null),
        ]);
        setIsAdmin(!!a.isAdmin);
        setCanBan(!!a.canBan);
        if (a.isAdmin) { setUsers(d.users || []); if (m) setMetrics(m); }
      } catch {}
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeDemo]);

  async function refreshList() {
    const cacheKey = `admin:users:${includeDemo ? '1' : '0'}`;
    bust(cacheKey);
    bust('admin:metrics');
    const [d, m] = await Promise.all([
      fetchOnce(cacheKey, () => listUsers({ includeDemo })),
      fetchOnce('admin:metrics', getMetrics).catch(() => null),
    ]);
    setUsers(d.users || []);
    if (m) setMetrics(m);
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
    bustPrefix('admin:users:');
    if (selectedUser?.id === uid) { setView('list'); setSelectedUser(null); }
  }
  async function handleSetPlan(email, tier) {
    if (tier === 'free') {
      await ownerRevokePro(email);
    } else {
      await ownerGrantPro(email, tier);
    }
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
    if (sort === 'real') {
      // "Real" activity = the user actually produced something (chats, notes,
      // debates) - server-computed. Users who only ever logged in drop out.
      list = list
        .filter(u => u.lastRealActivityAt)
        .sort((a, b) => (b.lastRealActivityAt || '').localeCompare(a.lastRealActivityAt || ''));
    } else if (sort === 'messages') {
      list = [...list].sort((a, b) => (sumMsgs(b) - sumMsgs(a)));
    } else if (sort === 'created') {
      list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } else if (sort === 'active') {
      list = [...list].sort((a, b) => activenessScore(b) - activenessScore(a));
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
      <ViewFade viewKey="chat" className="h-full flex flex-col">
        <ConversationViewer
          conv={conv}
          onBack={() => { setConv(null); setView('detail'); }}
        />
      </ViewFade>
    );
  }

  if (view === 'detail' && selectedUser) {
    return (
      <ViewFade viewKey="detail" className="h-full flex flex-col">
        <UserDetail
          user={selectedUser}
          onBack={() => { setView('list'); setSelectedUser(null); }}
          onBan={() => handleBan(selectedUser.id)}
          canBan={canBan}
          onDelete={() => handleDelete(selectedUser.id)}
          onSetPlan={(tier) => handleSetPlan(selectedUser.email, tier)}
          onOpenConv={openConv}
          onRefreshUser={async () => {
            const d = await getUser(selectedUser.id, { includeDemo });
            setSelectedUser(d.user);
          }}
        />
      </ViewFade>
    );
  }

  if (view === 'analytics') {
    return (
      <ViewFade viewKey="analytics" className="h-full flex flex-col">
        <AnalyticsPanel
          users={users}
          total={users.length}
          landing={metrics}
          onClose={() => setView('list')}
          standalone
        />
      </ViewFade>
    );
  }

  if (view === 'wiki') {
    return (
      <ViewFade viewKey="wiki" className="h-full flex flex-col">
        <WikiReportsPanel onClose={() => setView('list')} />
      </ViewFade>
    );
  }

  if (view === 'referrals') {
    return (
      <ViewFade viewKey="referrals" className="h-full flex flex-col">
        <ReferralsPanel users={users} onClose={() => setView('list')} />
      </ViewFade>
    );
  }

  return (
    <ViewFade viewKey="list" className="h-full flex flex-col">
    <UserList
      users={filtered}
      total={users.length}
      metrics={metrics}
      query={query} setQuery={setQuery}
      planFilter={planFilter} setPlanFilter={setPlanFilter}
      sort={sort} setSort={setSort}
      includeDemo={includeDemo} setIncludeDemo={setIncludeDemo}
      onOpen={openUser}
      onRefresh={refreshList}
      onAnalytics={() => setView('analytics')}
      onWiki={() => setView('wiki')}
      onReferrals={() => setView('referrals')}
    />
    </ViewFade>
  );
}

function sumMsgs(u) { return (u.chatMessages?.study || 0) + (u.chatMessages?.lessons || 0) + (u.chatMessages?.curriculum || 0); }

// Composite "activeness" score for the user list sort. Recency dominates
// (a user seen today beats a one-shot whale from last month), engagement
// volume breaks ties. Scale is unitless - only the ordering matters.
function activenessScore(u) {
  const HOUR = 3_600_000, DAY = 86_400_000, WEEK = 7 * DAY, MONTH = 30 * DAY;
  const lastV = u.lastVisitAt ? Date.parse(u.lastVisitAt) || 0 : 0;
  const lastA = u.lastActiveAt ? Date.parse(u.lastActiveAt) || 0 : 0;
  const t = Math.max(lastV, lastA);
  const dt = t ? Date.now() - t : Infinity;
  let recency;
  if (dt < HOUR) recency = 5;
  else if (dt < DAY) recency = 3;
  else if (dt < WEEK) recency = 2;
  else if (dt < MONTH) recency = 1;
  else recency = 0.25;
  const volume = (u.visitCount || 0)
    + sumMsgs(u)
    + (u.studySessionCount || 0) * 3
    + (u.lessonCount || 0) * 3
    + (u.curriculaCount || 0) * 5;
  return recency * (volume + 1);
}

/* ====================== USER LIST ====================== */
function UserList({ users, total, metrics, query, setQuery, planFilter, setPlanFilter, sort, setSort, includeDemo, setIncludeDemo, onOpen, onRefresh, onAnalytics, onWiki, onReferrals }) {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const now = Date.now();

  // Helper to resolve a user's "last seen" timestamp uniformly.
  const lastSeen = (u) => {
    const v = u.lastVisitAt ?? u.lastActiveAt;
    if (!v) return 0;
    return typeof v === 'number' ? v : Date.parse(v) || 0;
  };

  const dau = users.filter(u => { const t = lastSeen(u); return t && (now - t) < DAY; }).length;
  const wau = users.filter(u => { const t = lastSeen(u); return t && (now - t) < 7 * DAY; }).length;
  const activeNow = users.filter(u => { const t = lastSeen(u); return t && (now - t) < HOUR; }).length;
  const proCount = users.filter(u => ['paid', 'pro', 'plus', 'lifetime'].includes(u.plan)).length;
  const bannedCount = users.filter(u => u.banned).length;
  const demoCount = users.filter(u => u.isDemo).length;
  const totalMsgs = users.reduce((s, u) => s + sumMsgs(u), 0);
  const totalReferrals = users.reduce((s, u) => s + (u.referralsUsed || 0), 0);

  return (
    <div>
      {/* Header strip - keeps the icon + title compact and pushes the
          action cluster to the right. Stats live in their own dense card
          row below so the title bar stays scannable. */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.10] flex items-center justify-center text-white/55 flex-shrink-0">
          <Shield size={15} />
        </div>
        <h2 className="text-[15px] font-bold text-white/90">Admin Panel</h2>
        {activeNow > 0 && (
          <span className="inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full bg-emerald-500/[0.12] border border-emerald-500/25 text-[10px] font-semibold text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {activeNow} active now
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-[11px] text-white/45 hover:text-white/70 px-2 py-1.5 rounded-lg hover:bg-white/[0.05] cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={e => setIncludeDemo(e.target.checked)}
              className="w-3 h-3 accent-blue-500"
            />
            Demo
          </label>
          <button
            onClick={onWiki}
            className="flex items-center gap-1 text-white/35 hover:text-white/75 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-[11px] font-medium"
            title="QBpedia Reports"
          >
            <Globe size={13} /> Wiki
          </button>
          <button
            onClick={onReferrals}
            className="flex items-center gap-1 text-white/35 hover:text-white/75 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-[11px] font-medium"
            title="Referrals"
          >
            <Gift size={13} /> Referrals
          </button>
          <button
            onClick={onAnalytics}
            className="flex items-center gap-1 text-white/35 hover:text-white/75 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-[11px] font-medium"
            title="Analytics"
          >
            <BarChart3 size={13} /> Analytics
          </button>
          <button
            onClick={onRefresh}
            className="text-white/35 hover:text-white/75 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Stat card row - six glanceable tiles. The accent dot color
          encodes status: green = activity, amber = paid, rose = blocked. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <AdminStatCard label="Total users" value={total} />
        <AdminStatCard label="Daily active" value={dau} sub={total ? `${Math.round((dau/total)*100)}%` : null} dot="emerald" />
        <AdminStatCard label="Weekly active" value={wau} sub={total ? `${Math.round((wau/total)*100)}%` : null} dot="emerald" />
        <AdminStatCard label="Landing visits" value={(metrics?.landingVisits ?? 0).toLocaleString()} sub={metrics?.landingVisitsToday ? `+${metrics.landingVisitsToday} today` : null} icon={<Globe size={11} />} />
        <AdminStatCard label="Pro" value={proCount} sub={total ? `${Math.round((proCount/total)*100)}%` : null} dot="amber" />
        <AdminStatCard label="Total messages" value={totalMsgs.toLocaleString()} icon={<MessageSquare size={11} />} />
        <AdminStatCard label="Referrals" value={totalReferrals} icon={<Gift size={11} />} dot={totalReferrals ? 'emerald' : null} />
        <AdminStatCard label="Blocked" value={bannedCount} sub={demoCount ? `${demoCount} demo` : null} dot={bannedCount ? 'rose' : null} />
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
          options={[['active', 'Activeness'], ['real', 'Newest real'], ['recent', 'Recent'], ['messages', 'Most chats'], ['created', 'Newest']]}
          value={sort}
          onChange={setSort}
        />
      </div>

      <div className="space-y-1.5">
        {users.length === 0 && (
          <div className="text-center py-12 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02]">
            <Search size={22} className="text-white/20 mx-auto mb-2" />
            <p className="text-xs text-white/35">No users match the current filter.</p>
            {query && (
              <button onClick={() => setQuery('')} className="text-[11px] text-blue-400 hover:text-blue-300 mt-2">Clear search</button>
            )}
          </div>
        )}
        {users.map(u => {
          // In "Newest real" mode the trailing timestamp shows when the user
          // last produced something, not when they last logged in.
          const t = sort === 'real'
            ? (Date.parse(u.lastRealActivityAt) || 0)
            : lastSeen(u);
          // Force boolean - otherwise `t = 0` (no last-seen recorded) cascades
          // through `t && ...` as the value `0`, which React then renders as
          // a literal "0" text node under the avatar.
          const isActiveNow = t > 0 && (now - t) < HOUR;
          const isActiveToday = t > 0 && (now - t) < DAY;
          return (
            <div
              key={u.id}
              onClick={() => onOpen(u.id)}
              className="group flex items-center gap-3 bg-white/[0.03] rounded-xl border border-white/[0.07] px-4 py-2.5 cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.13] transition-colors"
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-white/[0.10] border border-white/[0.15] flex items-center justify-center text-[11px] font-bold text-white/70">
                  {(u.name || u.email || '?')[0]?.toUpperCase()}
                </div>
                {/* Presence dot - lit green when seen in the last hour,
                    dim when active today, hidden otherwise. */}
                {(isActiveNow || isActiveToday) && (
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161622] ${
                      isActiveNow ? 'bg-emerald-400' : 'bg-emerald-700'
                    }`}
                    title={isActiveNow ? 'Active in the last hour' : 'Active today'}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-white/90 truncate">{u.name || u.email}</p>
                  {u.isAdvisor ? <AdvisorBadge /> : <PlanPill plan={u.plan} />}
                  {u.banned && <span className="px-1.5 py-0.5 rounded bg-rose-900/30 text-rose-400 text-[10px] font-medium">Banned</span>}
                  {u.isDemo && <span className="px-1.5 py-0.5 rounded bg-amber-900/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider">Demo</span>}
                </div>
                <p className="text-[10px] text-white/35 truncate">
                  {u.handle ? `@${u.handle} · ` : ''}{u.email} · L{u.level} · {u.visitCount || 0} visits · {sumMsgs(u)} msgs · {u.curriculaCount} curr · {u.studySessionCount} study · {u.lessonCount} lessons · {u.noteMapsCount ?? 0} maps
                </p>
              </div>
              {/* Compact last-seen timestamp + chevron */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {t ? (
                  <span className="text-[10px] text-white/35 tabular-nums hidden md:inline">{formatRelativeShort(now - t)}</span>
                ) : null}
                <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Stat card: dense, glanceable tile with an optional accent dot + sub-line.
function AdminStatCard({ label, value, sub, dot, icon }) {
  const dotCls = dot === 'emerald' ? 'bg-emerald-400'
    : dot === 'amber' ? 'bg-amber-400'
    : dot === 'rose' ? 'bg-rose-400'
    : null;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/35 mb-1">
        {dotCls && <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />}
        {icon && <span className="text-white/40">{icon}</span>}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-bold text-white/90 tabular-nums leading-none">{value}</span>
        {sub && <span className="text-[10px] text-white/35 tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

// "5m ago" / "2h" / "3d" / "Jan 12" - kept terse for the user-list density.
function formatRelativeShort(deltaMs) {
  const m = Math.floor(deltaMs / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(Date.now() - deltaMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

// Owner-only inline plan switcher. Click to expand, pick a tier,
// server applies it (revoke for free, grant + tier for the rest).
function PlanPicker({ plan, onSetPlan }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [open]);
  const TIERS = [
    { id: 'free', label: 'Free' },
    { id: 'paid', label: 'Paid' },
  ];
  async function pick(tier) {
    if (busy || tier === plan) { setOpen(false); return; }
    setBusy(true);
    try { await onSetPlan(tier); } catch (e) { toast.error(e?.message || 'Failed to set plan'); }
    setBusy(false);
    setOpen(false);
  }
  const currentLabel = TIERS.find(t => t.id === plan)?.label || 'Free';
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.10] bg-white/[0.04] hover:bg-white/[0.08] text-white/85 text-xs font-medium disabled:opacity-40"
      >
        <Crown size={11} className="text-white/55" />
        Plan: <span className="font-semibold">{currentLabel}</span>
        <ChevronDown size={11} className="text-white/45" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 w-44 rounded-lg border border-white/[0.10] bg-[#1a1a26]/95 backdrop-blur-xl shadow-xl py-1 z-20">
          {TIERS.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`w-full text-left px-3 py-1.5 text-[12px] flex items-center justify-between transition-colors ${
                t.id === plan
                  ? 'text-white/95 font-medium bg-white/[0.06]'
                  : 'text-white/70 hover:bg-white/[0.06] hover:text-white/95'
              }`}
            >
              <span>{t.label}</span>
              {t.id === plan && <Check size={11} className="text-emerald-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Plan badge - 'paid' shows a single PAID pill (legacy tier strings still map
// to it via getPlan on the server, but the client now only sees free|paid).
function PlanPill({ plan }) {
  if (plan === 'paid' || plan === 'pro' || plan === 'plus' || plan === 'lifetime') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500 text-white">
        <Zap size={8} /> PAID
      </span>
    );
  }
  return null;
}

/* =====================================================
 * SECRET ANALYTICS PANEL
 * Hidden behind 5 fast taps on the "Admin Panel" title.
 * Computes real metrics from the loaded user list - MAU/WAU/DAU,
 * stickiness ratio, churn signal, plan split, signup cohorts,
 * power users, time-on-site proxy (avg visits).
 * =====================================================*/
function AnalyticsPanel({ users, total, landing, onClose, standalone }) {
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
    // Churn - users active in the prior 30d window but NOT in the
    // current 7d. Rough but useful directional signal.
    let activePrior30 = 0, activeNow7 = 0;
    let totalNoteMaps = 0;
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
      if (['paid', 'pro', 'plus', 'lifetime'].includes(u.plan)) pro++;
      if (u.banned) banned++;
      totalVisits += u.visitCount || 0;
      totalNoteMaps += u.noteMapsCount || 0;
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

    // Power users - top 5 by total chat messages.
    const powerUsers = [...users]
      .map(u => ({
        u,
        msgs: ((u.chatMessages?.study || 0) + (u.chatMessages?.lessons || 0) + (u.chatMessages?.curriculum || 0)),
      }))
      .filter(x => x.msgs > 0)
      .sort((a, b) => b.msgs - a.msgs)
      .slice(0, 5);

    return { dau, wau, mau, newToday, new7d, new30d, pro, banned, avgVisits, stickiness, churn, totalMsgs, totalVisits, totalNoteMaps, powerUsers };
  }, [users]);

  return (
    <div className={standalone ? undefined : 'absolute inset-0 z-30 bg-black/80 backdrop-blur-md overflow-y-auto p-5'} onClick={standalone ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-w-3xl mx-auto">
        {standalone ? (
          <button onClick={onClose} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors">
            <ArrowLeft size={16} /> Users
          </button>
        ) : null}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-200 flex-shrink-0">
            <BarChart3 size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-white/90">Analytics</h2>
            <p className="text-[10.5px] text-white/40">Computed from {total} accounts</p>
          </div>
          {!standalone && (
            <button onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white/55 hover:text-white hover:bg-white/[0.06] transition-colors">
              <X size={14} />
            </button>
          )}
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
            <StatRow label="Total note maps" value={stats.totalNoteMaps.toLocaleString()} />
            <StatRow label="Total visits (signed-in)" value={stats.totalVisits.toLocaleString()} />
            <StatRow label="Landing page visits" value={(landing?.landingVisits ?? 0).toLocaleString()} />
            <StatRow label="Landing visits · today" value={(landing?.landingVisitsToday ?? 0).toLocaleString()} />
            <StatRow label="Landing visits · last 7 days" value={(landing?.landingVisits7d ?? 0).toLocaleString()} />
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
          Note: time-on-site uses avg-visits as a proxy - session duration isn't tracked yet.
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
function UserDetail({ user: u, onBack, onBan, canBan, onDelete, onSetPlan, onOpenConv, onRefreshUser }) {
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
            {u.isAdvisor ? <AdvisorBadge /> : <PlanPill plan={u.plan} />}
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
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PlanPicker plan={u.plan || 'free'} onSetPlan={onSetPlan} />
        {canBan && (
          <button onClick={onBan} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${u.banned ? 'bg-emerald-700/80 text-white' : 'bg-rose-700/80 text-white'}`}>
            <Ban size={12} className="inline mr-1" /> {u.banned ? 'Unban' : 'Ban'}
          </button>
        )}
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
          ['exams',      `Exams (${u.curricula?.length || 0})`,           <GraduationCap size={12} key="e" />],
          ['quizzes',    'Quizzes',    <ClipboardList size={12} key="q" />],
          ['debates',    `Debates (${u.debateHistory?.length || 0})`,    <Swords size={12} key="d" />],
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

      <ViewFade viewKey={tab}>
        {tab === 'overview' && <OverviewTab u={u} />}
        {tab === 'study' && <StudyTab u={u} onOpen={(sid) => onOpenConv('study', { sid })} />}
        {tab === 'lessons' && <LessonsTab u={u} onOpen={(lid) => onOpenConv('lesson', { lid })} />}
        {tab === 'curriculum' && <CurriculumTab u={u} onOpen={(cid, lid) => onOpenConv('curriculum', { cid, lid })} />}
        {tab === 'exams' && <ExamsTab u={u} onRefresh={onRefreshUser} />}
        {tab === 'quizzes' && <QuizzesTab u={u} />}
        {tab === 'debates' && <DebatesTab u={u} />}
        {tab === 'other' && <OtherTab u={u} />}
        {tab === 'billing' && <BillingTab u={u} />}
      </ViewFade>
    </div>
  );
}

/* ---------- Tabs ---------- */
function OverviewTab({ u }) {
  const s = u.studyStreaks;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Visits" value={u.visitCount || 0} />
      <Stat label="Last visit" value={u.lastVisitAt ? new Date(u.lastVisitAt).toLocaleDateString() : '-'} />
      <Stat label="Level" value={u.profile?.level || 1} />
      <Stat label="XP" value={u.profile?.xp || 0} />
      <Stat label="Current streak" value={s?.currentStreak || 0} />
      <Stat label="Longest streak" value={s?.longestStreak || 0} />
      <Stat label="Study sessions" value={u.studySessions?.length || 0} />
      <Stat label="Lesson chats (standalone)" value={u.standaloneLessons?.length || 0} />
      <Stat label="Curriculum chats" value={u.curriculumChats?.length || 0} />
      <Stat label="Curricula" value={u.curricula?.length || 0} />
      <Stat label="Notes" value={u.notes?.length || 0} />
      <Stat label="Note maps" value={u.noteMaps?.length || 0} />
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
  if (!list.length) return <Empty msg="No lessons generated" />;
  return (
    <div className="space-y-1.5">
      {list.map(l => <LessonRow key={l.id} l={l} onOpenChat={() => onOpen(l.id)} />)}
    </div>
  );
}

// Expandable row - collapsed shows the lesson chrome, expanded reveals
// the actual blocks the lesson generator produced (titles + previews).
function LessonRow({ l, onOpenChat }) {
  const [open, setOpen] = useState(false);
  const blocks = l.blocks || [];
  const meta = `${l.difficulty || 'beginner'} · ${l.blockCount ?? blocks.length} blocks · ${l.messageCount || 0} msgs${l.isCompleted ? ' · completed' : ''}${l.lastActiveAt ? ' · ' + new Date(l.lastActiveAt).toLocaleString() : ''}`;
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Lightbulb size={14} className="text-white/45 flex-shrink-0" />
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm text-white/85 truncate">{l.title || l.topic || '(untitled)'}</p>
          <p className="text-[10px] text-white/35 truncate">{meta}</p>
        </button>
        <button
          onClick={onOpenChat}
          className="text-[10px] uppercase tracking-wider text-white/45 hover:text-white/80 px-2 py-1 rounded border border-white/[0.08] hover:border-white/[0.18] transition-colors flex-shrink-0"
          title="Open the lesson chat transcript"
        >
          Chat
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors"
          title={open ? 'Hide blocks' : 'Show generated blocks'}
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-white/[0.05] bg-black/20 px-3 py-2 space-y-1.5">
          {blocks.length === 0 ? (
            <p className="text-[11px] text-white/30 italic">No generated blocks recorded for this lesson.</p>
          ) : blocks.map((b, i) => (
            <div key={i} className="text-[11px] leading-snug">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-white/55 font-semibold">{b.type}</span>
                {b.title && <span className="text-white/80 font-medium truncate">{b.title}</span>}
                {b.score != null && <ScoreBadge score={b.score} />}
              </div>
              {b.preview && (
                <p className="text-white/45 line-clamp-2 pl-1">{b.preview}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Debates tab - finished multiplayer / tournament matches the user has
// played, with score, side, opponent, verdict summary.
function DebatesTab({ u }) {
  const list = u.debateHistory || [];
  if (!list.length) return <Empty msg="No debate matches finished yet" />;
  return (
    <div className="space-y-1.5">
      {list.map(d => <DebateRow key={d.code + d.finishedAt} d={d} />)}
    </div>
  );
}

function DebateRow({ d }) {
  const [open, setOpen] = useState(false);
  const resultCls = d.result === 'win' ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
    : d.result === 'loss' ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
    : 'text-white/70 bg-white/[0.06] border-white/[0.12]';
  const oppName = d.opponent?.name || 'unknown';
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <Swords size={14} className="text-white/45 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/85 truncate">{d.topic || '(no topic)'}</p>
          <p className="text-[10px] text-white/35 truncate">
            {d.mode}{d.tournament ? ` · ${d.tournament.name || 'tournament'}` : ''}
            {' · '}{(d.mySide || '?').toUpperCase()} vs {oppName} ({(d.opponent?.side || '?').toUpperCase()})
            {' · '}{d.myScore}-{d.opponentScore}
            {d.finishedAt ? ' · ' + new Date(d.finishedAt).toLocaleString() : ''}
          </p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${resultCls} flex-shrink-0`}>
          {d.result || '-'}
        </span>
        <ChevronDown size={14} className={`text-white/40 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-white/[0.05] bg-black/20 px-3 py-2 text-[11px] space-y-1">
          {d.verdict?.winner && (
            <p><span className="text-white/45 uppercase tracking-wider text-[9px] font-bold mr-1.5">Verdict</span>
              <span className="text-white/80">winner: {d.verdict.winner}</span>
            </p>
          )}
          {d.verdict?.summary && (
            <p className="text-white/55 leading-snug">{d.verdict.summary}</p>
          )}
          <p className="text-white/35">{d.turnCount} turns · code {d.code}</p>
        </div>
      )}
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

function ExamsTab({ u, onRefresh }) {
  const curricula = u.curricula || [];
  const toast = useToast();
  const [unlocking, setUnlocking] = useState({});

  async function handleUnlock(curriculumId, kind) {
    const key = `${curriculumId}:${kind}`;
    setUnlocking(prev => ({ ...prev, [key]: true }));
    try {
      await unlockExam(u.id, curriculumId, kind);
      toast.success(`${kind.charAt(0).toUpperCase() + kind.slice(1)} unlocked`);
      await onRefresh?.();
    } catch (e) {
      toast.error(e.message || 'Unlock failed');
    } finally {
      setUnlocking(prev => ({ ...prev, [key]: false }));
    }
  }

  if (!curricula.length) return <Empty msg="No curricula enrolled" />;

  return (
    <div className="space-y-3">
      {curricula.map(c => {
        const pct = Math.round((c.progressFraction ?? 0) * 100);
        const midtermEligible = pct >= 50;
        const finalEligible = pct >= 90;

        return (
          <div key={c.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2.5">
            {/* Curriculum header */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/85 truncate">{c.title}</p>
                <p className="text-[10px] text-white/35 mt-0.5">
                  {c.completedLessons}/{c.lessonCount} lessons · {pct}% complete
                </p>
              </div>
              {/* Progress pill */}
              <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                pct >= 90 ? 'bg-emerald-900/40 text-emerald-400' :
                pct >= 50 ? 'bg-amber-900/40 text-amber-400' :
                'bg-white/[0.06] text-white/30'
              }`}>{pct}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-white/25'}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Exam rows */}
            {[
              { kind: 'midterm', label: 'Midterm', data: c.midterm, eligible: midtermEligible, threshold: 50 },
              { kind: 'final',   label: 'Final',   data: c.final,   eligible: finalEligible,   threshold: 90 },
            ].map(({ kind, label, data, eligible, threshold }) => {
              const isUnlocked = data?.adminUnlocked || eligible;
              const isCompleted = data?.completed;
              const isUnlocking = !!unlocking[`${c.id}:${kind}`];

              return (
                <div key={kind} className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-white/75">{label}</span>
                      {isCompleted && (
                        <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">
                          <Check size={8} /> Done · {data.score != null ? `${Math.round(data.score)}%` : ''}
                        </span>
                      )}
                      {data?.adminUnlocked && !isCompleted && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-900/40 text-violet-400">Admin unlocked</span>
                      )}
                      {!isUnlocked && (
                        <span className="flex items-center gap-0.5 text-[9px] text-white/30">
                          <Lock size={8} /> needs {threshold}%
                        </span>
                      )}
                    </div>
                    {data?.adminUnlockedAt && (
                      <p className="text-[9px] text-white/25 mt-0.5">
                        Unlocked {new Date(data.adminUnlockedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {/* Unlock icon — only show if not already admin-unlocked and not completed */}
                  {!data?.adminUnlocked && !isCompleted && (
                    <button
                      onClick={() => handleUnlock(c.id, kind)}
                      disabled={isUnlocking}
                      title={`Admin-unlock ${label}`}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-violet-300 hover:bg-violet-500/[0.12] disabled:opacity-40 transition-colors flex-shrink-0"
                    >
                      {isUnlocking ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Unlock size={13} />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-white/25 text-[10px]">-</span>;
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400';
  return <span className={`font-bold tabular-nums text-xs ${color}`}>{score}%</span>;
}

function QuizzesTab({ u }) {
  const assessments = u.assessmentHistory || [];
  const lessonQuizzes = u.lessonQuizResults || [];
  const curriculumQuizzes = u.curriculumQuizResults || [];

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

      {/* Quiz Bowl - rich admin view, lazy-loaded */}
      <QuizBowlAdminSection uid={u.id} quizBowlGamesToday={u.usage?.quizBowlGames ?? 0} />
    </div>
  );
}

/* =====================================================================
 * QUIZ BOWL ADMIN SECTION
 * Lazy-loads the full quiz bowl dataset for a user via the admin
 * endpoint. Shows: aggregate stats, per-category accuracy bars, the
 * hidden student profile (strengths / weaknesses / buzz style /
 * struggle + mastery topics), and an expandable per-set history with
 * per-question breakdowns.
 * ===================================================================*/
function QuizBowlAdminSection({ uid, quizBowlGamesToday }) {
  const [qbData, setQbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadErr(null);
    getUserQuizBowl(uid)
      .then(d => setQbData(d))
      .catch(e => setLoadErr(e?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [uid]);

  const hdr = (
    <div className="flex items-center gap-1.5 mb-2">
      <Zap size={10} className="text-white/40" />
      <h3 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Quiz Bowl</h3>
      {!loading && qbData?.stats?.totalSets > 0 && (
        <span className="text-[10px] text-white/20 font-normal">({qbData.stats.totalSets} sets)</span>
      )}
      {quizBowlGamesToday > 0 && (
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-300 text-[9px] font-bold tabular-nums">
          {quizBowlGamesToday} today
        </span>
      )}
    </div>
  );

  if (loading) return (
    <div>
      {hdr}
      <div className="flex items-center justify-center py-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <LoadingSpinner size={16} />
      </div>
    </div>
  );

  if (loadErr) return (
    <div>
      {hdr}
      <p className="text-[11px] text-rose-400 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20">{loadErr}</p>
    </div>
  );

  const stats = qbData?.stats;
  const sets = qbData?.sets || [];
  const profile = qbData?.secretProfile;

  if (!stats?.totalSets) return (
    <div>
      {hdr}
      <div className="px-3 py-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/35 text-center">
        No completed sets yet
        {quizBowlGamesToday > 0 && (
          <span className="ml-1 text-white/50">&middot; {quizBowlGamesToday} game{quizBowlGamesToday !== 1 ? 's' : ''} started today</span>
        )}
      </div>
    </div>
  );

  // Category accuracy bars (sorted by question volume)
  const catEntries = Object.entries(stats.categoryStats || {})
    .map(([cat, v]) => ({ cat, acc: v.total ? Math.round((v.correct / v.total) * 100) : 0, total: v.total }))
    .sort((a, b) => b.total - a.total);

  // Buzz style styling
  const buzzStyle = profile?.buzzStyle;
  const buzzStyleCls = buzzStyle?.style === 'aggressive'
    ? 'text-rose-300 bg-rose-500/15 border-rose-400/30'
    : buzzStyle?.style === 'balanced'
    ? 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30'
    : buzzStyle?.style === 'cautious'
    ? 'text-amber-300 bg-amber-500/15 border-amber-400/30'
    : 'text-white/45 bg-white/[0.06] border-white/[0.12]';

  const visibleSets = showAll ? sets : sets.slice(0, 6);

  return (
    <div className="space-y-3">
      {hdr}

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <QBStatTile label="Sets" value={stats.totalSets} />
        <QBStatTile
          label="Accuracy"
          value={`${stats.accuracy}%`}
          accent={stats.accuracy >= 70 ? 'emerald' : stats.accuracy >= 50 ? 'amber' : 'rose'}
        />
        <QBStatTile label="NAQT pts" value={stats.totalPoints.toLocaleString()} />
        <QBStatTile label="Study time" value={fmtDur(stats.totalDurationMs)} />
      </div>

      {/* Category breakdown */}
      {catEntries.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <p className="text-[9.5px] uppercase tracking-[0.15em] font-bold text-white/30 mb-2.5 flex items-center gap-1">
            <TrendingDown size={9} /> Category Breakdown
          </p>
          <div className="space-y-1.5">
            {catEntries.map(({ cat, acc, total }) => {
              const barCls = acc >= 70 ? 'bg-emerald-400/70' : acc >= 50 ? 'bg-amber-400/70' : 'bg-rose-400/70';
              return (
                <div key={cat} className="grid grid-cols-[72px_1fr_56px] items-center gap-2">
                  <span className="text-[11px] text-white/70 font-medium truncate">{cat}</span>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.max(4, acc)}%` }} />
                  </div>
                  <span className="text-[10px] text-white/40 tabular-nums text-right">{acc}% · {total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Student profile */}
      {profile && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 space-y-3">
          <p className="text-[9.5px] uppercase tracking-[0.15em] font-bold text-white/30">Student Profile</p>

          {/* Buzz style */}
          {buzzStyle && buzzStyle.style !== 'unknown' && buzzStyle.samples > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/40">Buzz style</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${buzzStyleCls}`}>
                {buzzStyle.style}
              </span>
              <span className="text-[10px] text-white/30 tabular-nums">
                avg {buzzStyle.avgPosition}% through &middot; {buzzStyle.samples} samples
              </span>
            </div>
          )}

          {/* Strengths */}
          {profile.strengths?.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[10px] text-white/40 flex-shrink-0 pt-0.5">Strengths</span>
              <div className="flex flex-wrap gap-1">
                {profile.strengths.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold">
                    {s.category}
                    <span className="text-emerald-300/60 font-normal">{s.accuracy}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {profile.weaknesses?.length > 0 && (
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[10px] text-white/40 flex-shrink-0 pt-0.5">Weaknesses</span>
              <div className="flex flex-wrap gap-1">
                {profile.weaknesses.map((w, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rose-400/30 bg-rose-500/10 text-rose-300 text-[10px] font-semibold">
                    {w.category}
                    <span className="text-rose-300/60 font-normal">{w.accuracy}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Struggle topics */}
          {profile.struggleTopics?.length > 0 && (
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.14em] font-bold text-white/25 mb-1.5">Keeps Missing</p>
              <div className="flex flex-wrap gap-1">
                {profile.struggleTopics.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-[10px] text-white/55">
                    {t.topic}
                    <span className="ml-1.5 text-rose-300/70 tabular-nums">{t.correct}/{t.seen}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mastery topics */}
          {profile.masteryTopics?.length > 0 && (
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.14em] font-bold text-white/25 mb-1.5">Mastered</p>
              <div className="flex flex-wrap gap-1">
                {profile.masteryTopics.map((t, i) => (
                  <span key={i} className="px-2 py-0.5 rounded border border-emerald-400/20 bg-emerald-500/[0.08] text-[10px] text-emerald-300/70">
                    {t.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Set history */}
      <div>
        <p className="text-[9.5px] uppercase tracking-[0.15em] font-bold text-white/30 mb-1.5 flex items-center gap-1">
          <Clock size={9} /> Set History
        </p>
        <div className="space-y-1">
          {visibleSets.map(s => <QBSetRow key={s.id} s={s} />)}
        </div>
        {sets.length > 6 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="mt-1.5 w-full text-[11px] text-white/35 hover:text-white/60 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors"
          >
            {showAll ? 'Show fewer' : `Show all ${sets.length} sets`}
          </button>
        )}
      </div>
    </div>
  );
}

/* Compact stat tile matching AdminApp visual language */
function QBStatTile({ label, value, accent }) {
  const valCls = accent === 'emerald' ? 'text-emerald-300'
    : accent === 'amber' ? 'text-amber-300'
    : accent === 'rose' ? 'text-rose-300'
    : 'text-white/90';
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="text-[9.5px] uppercase tracking-[0.14em] font-bold text-white/30 mb-0.5">{label}</div>
      <div className={`text-[16px] font-bold tabular-nums leading-none ${valCls}`}>{value}</div>
    </div>
  );
}

/* Expandable set row with per-question breakdown */
function QBSetRow({ s }) {
  const [open, setOpen] = useState(false);
  const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
  const hasPoints = typeof s.points === 'number';
  const ago = fmtRelative(Date.now() - new Date(s.finishedAt).getTime());
  const scoreCls = pct >= 70
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
    : pct >= 50
    ? 'text-white/80 bg-white/[0.06] border-white/[0.12]'
    : 'text-rose-300 bg-rose-500/10 border-rose-500/25';

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left">
        <div className={`min-w-[54px] px-2 py-0.5 rounded border text-center text-[11px] font-bold tabular-nums flex-shrink-0 ${scoreCls}`}>
          {hasPoints ? `${s.points}pt` : `${s.score}/${s.total}`}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-white/85 truncate">
            {s.category} <span className="text-white/35 font-normal">&middot; {s.difficulty}</span>
          </p>
          <p className="text-[10px] text-white/35">
            {ago} &middot; {s.source === 'ai' ? 'AI' : 'QB'} &middot; {s.score}/{s.total} &middot; {fmtDur(s.durationMs)}
          </p>
        </div>
        {s.perQuestion?.length > 0 && (
          <ChevronDown size={13} className={`text-white/30 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {open && s.perQuestion?.length > 0 && (
        <div className="border-t border-white/[0.05] bg-black/20 px-3 py-2 space-y-1">
          {s.perQuestion.map((q, i) => {
            const pts = q.points;
            const ptsCls = pts === 15 ? 'text-amber-300'
              : pts === 10 ? 'text-emerald-300'
              : pts === -5 ? 'text-rose-300'
              : 'text-white/35';
            return (
              <div key={i} className="flex items-start gap-2 text-[11px] py-0.5">
                <span className={`mt-0.5 flex-shrink-0 ${q.correct ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {q.correct ? <Check size={10} /> : <X size={10} />}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-white/80">{q.correctAnswer}</span>
                  {!q.correct && q.answer && (
                    <span className="text-white/35 ml-1.5">&rarr; {q.answer}</span>
                  )}
                  <span className="text-white/25 ml-1.5 text-[9px]">{q.category}</span>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1.5">
                  {q.buzzWord >= 0 && (
                    <span className="text-[9px] text-white/25 tabular-nums">w{q.buzzWord + 1}/{q.totalWords}</span>
                  )}
                  {typeof pts === 'number' && (
                    <span className={`text-[10px] font-bold tabular-nums ${ptsCls}`}>
                      {pts > 0 ? `+${pts}` : pts}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtDur(ms) {
  const total = Math.round((ms || 0) / 1000);
  if (total < 60) return `${total}s`;
  const min = Math.floor(total / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function fmtRelative(deltaMs) {
  const m = Math.floor(deltaMs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(Date.now() - deltaMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function OtherTab({ u }) {
  return (
    <div className="space-y-4">
      <ListBlock title="Curricula"          items={u.curricula}          render={c => `${c.title} · ${c.completedLessons}/${c.lessonCount} lessons`} icon={<BookOpen size={10} />} />
      <ListBlock title="Notes"              items={u.notes}              render={n => `${n.title} · ${n.type}`}                                       icon={<FileText size={10} />} />
      <ListBlock title="Note maps"          items={u.noteMaps}           render={m => `${m.name || 'Untitled'}${m.isDefault ? ' · default' : ''} · ${m.nodeCount} node${m.nodeCount === 1 ? '' : 's'} · ${m.edgeCount} edge${m.edgeCount === 1 ? '' : 's'}`} icon={<Network size={10} />} />
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
            {u.isAdvisor ? <AdvisorBadge /> : (u.plan && u.plan !== 'free' ? <PlanPill plan={u.plan} /> : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] text-white/40">FREE</span>)}
          </div>
        </div>
        <KV label="Granted by" value={u.proGrantedBy || '-'} />
        <KV label="Pro until" value={u.proUntil ? new Date(u.proUntil).toLocaleString() : '-'} />
        <KV label="Stripe customer" value={u.stripeCustomerId || '-'} mono />
        <KV label="Stripe subscription" value={u.stripeSubscriptionId || '-'} mono />
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
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-4 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Gift size={12} className="text-white/45" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/40">Referrals</span>
        </div>
        <KV label="Their code" value={u.referralCode || '-'} mono />
        <KV label="Referrals given" value={u.referralsUsed ?? 0} />
        <KV label="Referred by code" value={u.referredBy || 'none'} mono />
        {u.referredUsers?.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] text-white/35 mb-1">Users who used their code:</p>
            <div className="space-y-0.5">
              {u.referredUsers.map((ru, i) => (
                <div key={i} className="text-[11px] text-white/65 font-mono truncate">{ru.email}</div>
              ))}
            </div>
          </div>
        )}
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

/* ====================== REFERRALS PANEL ====================== */
function ReferralsPanel({ users, onClose }) {
  const stats = useMemo(() => {
    const referrers = users.filter(u => (u.referralsUsed || 0) > 0);
    const referred = users.filter(u => u.referredBy);
    const totalReferrals = users.reduce((s, u) => s + (u.referralsUsed || 0), 0);
    const top = [...referrers].sort((a, b) => (b.referralsUsed || 0) - (a.referralsUsed || 0)).slice(0, 10);
    return { referrers: referrers.length, referred: referred.length, totalReferrals, top };
  }, [users]);

  const all = useMemo(() =>
    [...users]
      .filter(u => u.referralCode || u.referredBy || (u.referralsUsed || 0) > 0)
      .sort((a, b) => (b.referralsUsed || 0) - (a.referralsUsed || 0)),
    [users]
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 pb-8">
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors">
          <ArrowLeft size={16} /> Admin Panel
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 flex-shrink-0">
            <Gift size={15} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-white/90">Referrals</h2>
            <p className="text-[10.5px] text-white/40">{stats.totalReferrals} total referrals from {stats.referrers} users</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <StatTile label="Total referrals" value={stats.totalReferrals} accent="emerald" />
          <StatTile label="Referrers" value={stats.referrers} accent="blue" />
          <StatTile label="Referred users" value={stats.referred} accent="indigo" />
        </div>

        {stats.top.length > 0 && (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-300/70 mb-2 flex items-center gap-1">
              <Users size={10} /> Top Referrers
            </p>
            <div className="space-y-1">
              {stats.top.map((u, i) => (
                <div key={u.id || u.email} className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-mono text-white/35 tabular-nums w-5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[12.5px] text-white/85 flex-1 truncate">{u.name || u.email}</span>
                  <span className="text-[11px] font-mono font-semibold tabular-nums text-emerald-300">{u.referralsUsed}</span>
                  <span className="text-[10px] text-white/35">referrals</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] grid grid-cols-[1fr_80px_80px_80px] gap-2 text-[10px] font-bold uppercase tracking-wider text-white/30">
            <span>User</span>
            <span className="text-center">Code</span>
            <span className="text-center">Given</span>
            <span className="text-center">Referred by</span>
          </div>
          {all.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-white/30">No referral activity yet.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {all.map((u, i) => (
                <div key={u.id || i} className="px-4 py-2 grid grid-cols-[1fr_80px_80px_80px] gap-2 items-center">
                  <div className="min-w-0">
                    <p className="text-[12px] text-white/85 truncate">{u.name || u.email}</p>
                    <p className="text-[10px] text-white/35 truncate">{u.email}</p>
                  </div>
                  <span className="text-[10px] font-mono text-white/50 text-center truncate">{u.referralCode || '-'}</span>
                  <span className={`text-[12px] font-bold tabular-nums text-center ${(u.referralsUsed || 0) > 0 ? 'text-emerald-300' : 'text-white/25'}`}>
                    {u.referralsUsed || 0}
                  </span>
                  <span className="text-[10px] font-mono text-white/40 text-center truncate">{u.referredBy || '-'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

/* =====================================================================
 * WIKI REPORTS PANEL
 * Lists open QBpedia error reports. Admin can AI-rewrite or dismiss.
 * ===================================================================*/
function WikiReportsPanel({ onClose }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState({});
  const [expanded, setExpanded] = useState(null);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    listWikiReports()
      .then(d => setReports(d.reports || []))
      .catch(e => toast.error(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function resolve(id, resolution) {
    setResolving(prev => ({ ...prev, [id]: resolution }));
    try {
      await resolveWikiReport(id, resolution);
      setReports(prev => prev.filter(r => r.id !== id));
      toast.success(resolution === 'ai' ? 'Page rewritten by AI' : 'Report dismissed');
    } catch (e) {
      toast.error(e.message || 'Failed to resolve');
    }
    setResolving(prev => ({ ...prev, [id]: null }));
  }

  async function handleDeletePage(slug) {
    try {
      await deleteWikiPage(slug);
      toast.success('Page deleted — will regenerate on next visit');
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 pb-8">
        <button onClick={onClose} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-4 transition-colors">
          <ArrowLeft size={16} /> Admin Panel
        </button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300 flex-shrink-0">
            <Globe size={15} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-white/90">QBpedia Reports</h2>
            <p className="text-[10.5px] text-white/40">{reports.length} open report{reports.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size={20} />
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <Check size={22} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-white/70">All clear</p>
            <p className="text-[11px] text-white/35 mt-1">No open QBpedia reports.</p>
          </div>
        )}

        <div className="space-y-2">
          {reports.map(r => {
            const busy = resolving[r.id];
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full flex items-start gap-3 px-3.5 py-3 text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <AlertTriangle size={12} className="text-amber-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white/90 truncate">{r.pageTitle}</p>
                    <p className="text-[11px] text-white/45 line-clamp-1 mt-0.5">{r.reason}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      {r.reportedBy} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <ChevronDown size={14} className={`text-white/30 transition-transform flex-shrink-0 mt-1 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-white/[0.05] bg-black/20 px-3.5 py-3 space-y-3">
                    <div className="rounded-lg bg-amber-500/[0.07] border border-amber-400/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300/70 mb-1">Report</p>
                      <p className="text-[12px] text-white/75 leading-relaxed">{r.reason}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => resolve(r.id, 'ai')}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-violet-500/20 border border-violet-400/30 text-violet-200 hover:bg-violet-500/30 disabled:opacity-40 transition-colors"
                      >
                        {busy === 'ai' ? <RefreshCw size={11} className="animate-spin" /> : <Wand2 size={11} />}
                        AI Rewrite
                      </button>
                      <button
                        onClick={() => resolve(r.id, 'dismiss')}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/55 hover:bg-white/[0.09] disabled:opacity-40 transition-colors"
                      >
                        {busy === 'dismiss' ? <RefreshCw size={11} className="animate-spin" /> : <X size={11} />}
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleDeletePage(r.slug)}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/[0.10] border border-rose-400/25 text-rose-300 hover:bg-rose-500/[0.18] disabled:opacity-40 transition-colors"
                      >
                        <Trash2 size={11} /> Delete page
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
