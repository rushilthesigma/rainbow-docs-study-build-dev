import { useState, useEffect, useCallback, useContext } from 'react';
import { Users, Plus, Loader2, Radio, ChevronRight, Check, X, Mail, Info } from 'lucide-react';
import Button from '../shared/Button';
import { useToast } from '../shared/Toast';
import { listGroups, createGroup, joinGroup, declineGroup } from '../../api/studyGroups';
import { GroupNotificationContext } from '../../context/GroupNotificationContext';
import GroupDetailView from './GroupDetailView';

// GroupListView - the user's study groups, pending invitations, and group
// creation (Group Study, WO-8). Owns list<->detail navigation: selecting a
// group renders GroupDetailView in place, passing the list summary so the
// detail screen knows the live `activeSession` (the detail endpoint omits it).
//
// Notification state comes from GroupNotificationContext (WO-11, null-safe
// when no provider is mounted): per-group unread counts drive the activity
// indicator (AC-GS-006.5), and removal/disband events detected during polling
// surface as dismissible inline notices above the list (AC-GS-006.3/006.4).
//
// Props (all optional):
//   onOpenLibrary: (groupId) => void          - GroupLibraryView (separate WO)
//   onOpenSession: (groupId, session) => void  - SessionView (separate WO)
//   unreadByGroup: Record<groupId, number>     - explicit unread counts;
//                  overrides the context when provided.
const NAME_MAX = 100;

// Inline notice copy per group event type (see GroupNotificationContext).
function groupEventMessage(event) {
  const name = event.groupName || 'A group';
  if (event.type === 'group_removed') {
    return `You were removed from ${name}${event.fromName ? ` by ${event.fromName}` : ''}.`;
  }
  if (event.type === 'group_disbanded') {
    return `${name} was disbanded and no longer exists.`;
  }
  return `${name} is no longer available.`;
}

export default function GroupListView({ onOpenLibrary, onOpenSession, unreadByGroup }) {
  const toast = useToast();
  // null-safe: works without a GroupNotificationProvider (no dots, no notices).
  const groupNotifications = useContext(GroupNotificationContext);
  const unreadMap = unreadByGroup ?? groupNotifications?.unreadCountByGroup ?? {};
  const groupEvents = groupNotifications?.groupEvents ?? [];
  const [view, setView] = useState('list');
  const [selected, setSelected] = useState(null);

  const [groups, setGroups] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameErr, setNameErr] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [creating, setCreating] = useState(false);

  const [actingInviteId, setActingInviteId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { groups: g, invitations: inv } = await listGroups();
      setGroups(Array.isArray(g) ? g : []);
      setInvitations(Array.isArray(inv) ? inv : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A removal/disband notice means the polled state diverged from this view's
  // last load - refresh so the affected group drops out of the list.
  useEffect(() => {
    if (groupEvents.length > 0) load();
  }, [groupEvents.length, load]);

  function openGroup(summary) {
    setSelected(summary);
    setView('detail');
  }

  async function handleCreate(e) {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) { setNameErr('Group name is required.'); return; }
    if (trimmed.length > NAME_MAX) { setNameErr(`Group name must be ${NAME_MAX} characters or fewer.`); return; }
    setNameErr(null);
    setCreateError(null);
    setCreating(true);
    try {
      const { group } = await createGroup(trimmed, description.trim());
      // Reset the form, refresh the list, and navigate to the new group
      // (creator is admin) per AC-GS-001.2.
      setName(''); setDescription(''); setShowCreate(false);
      await load();
      openGroup({ id: group.id, name: group.name, role: 'admin', memberCount: 1, activeSession: null });
    } catch (err) {
      setCreateError(err.message || 'Could not create group.');
    } finally {
      setCreating(false);
    }
  }

  async function respondInvite(inv, accept) {
    if (actingInviteId) return;
    setActingInviteId(inv.id);
    try {
      if (accept) {
        await joinGroup(inv.groupId);
        toast.success(`Joined ${inv.groupName}.`);
      } else {
        await declineGroup(inv.groupId);
        toast.success(`Declined ${inv.groupName}.`);
      }
      await load();
    } catch (e) {
      toast.error(e.message || 'Could not respond to invitation.');
    } finally {
      setActingInviteId(null);
    }
  }

  if (view === 'detail' && selected) {
    return (
      <GroupDetailView
        groupId={selected.id}
        summary={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onChanged={load}
        onOpenLibrary={onOpenLibrary}
        onOpenSession={onOpenSession}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h2 className="text-[18px] font-bold text-white/90 inline-flex items-center gap-2">
          <Users size={17} className="text-white/55" /> Study Groups
        </h2>
        <Button size="sm" onClick={() => { setShowCreate((v) => !v); setNameErr(null); setCreateError(null); }}>
          <Plus size={14} /> New group
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="shrink-0 mb-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 flex flex-col gap-2.5">
          <div>
            <input
              autoFocus
              value={name}
              onChange={(e) => { setName(e.target.value); setNameErr(null); }}
              placeholder="Group name"
              maxLength={NAME_MAX + 20}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white placeholder-white/25 outline-none focus:border-blue-400/50 transition-colors"
            />
            <div className="flex items-center justify-between mt-1">
              {nameErr ? <p className="text-[11px] text-rose-400">{nameErr}</p> : <span />}
              <span className={`text-[10.5px] tabular-nums ${name.trim().length > NAME_MAX ? 'text-rose-400' : 'text-white/30'}`}>
                {name.trim().length}/{NAME_MAX}
              </span>
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white placeholder-white/25 outline-none focus:border-blue-400/50 transition-colors resize-none"
          />
          {createError && <p className="text-[12px] text-rose-400">{createError}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
            <Button type="submit" size="sm" loading={creating}>Create group</Button>
          </div>
        </form>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-white/40"><Loader2 size={20} className="animate-spin" /></div>
        ) : error ? (
          <p className="text-[13px] text-rose-400">{error}</p>
        ) : (
          <>
            {/* Group event notices (removal / disband, AC-GS-006.3/006.4) */}
            {groupEvents.length > 0 && (
              <section className="flex flex-col gap-2">
                {groupEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2.5">
                    <Info size={16} className="text-amber-300 shrink-0" />
                    <p className="flex-1 min-w-0 text-[13px] text-white/80">{groupEventMessage(event)}</p>
                    <button
                      onClick={() => groupNotifications?.dismissGroupEvent(event.id)}
                      title="Dismiss"
                      aria-label="Dismiss notification"
                      className="p-1 rounded-md text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </section>
            )}

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <section>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-2">Invitations</p>
                <div className="flex flex-col gap-2">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-blue-400/25 bg-blue-500/[0.06] px-3 py-2.5">
                      <Mail size={16} className="text-blue-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white/90 truncate">{inv.groupName}</p>
                        <p className="text-[11px] text-white/45">{inv.invitedByName} invited you · {inv.memberCount} member{inv.memberCount === 1 ? '' : 's'}</p>
                      </div>
                      <Button size="sm" onClick={() => respondInvite(inv, true)} loading={actingInviteId === inv.id}>
                        <Check size={13} /> Join
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => respondInvite(inv, false)} disabled={actingInviteId === inv.id}>
                        <X size={13} />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Groups */}
            {groups.length === 0 ? (
              <div className="text-center py-10">
                <Users size={28} className="text-white/15 mx-auto mb-2" />
                <p className="text-[13px] text-white/45">No study groups yet.</p>
                <p className="text-[12px] text-white/30 mt-0.5">Create one to start sharing materials and running live sessions.</p>
              </div>
            ) : (
              <section>
                {invitations.length > 0 && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-2">Your groups</p>}
                <div className="flex flex-col gap-2">
                  {groups.map((g) => {
                    const unread = unreadMap[g.id] || 0;
                    return (
                      <div
                        key={g.id}
                        onClick={() => openGroup(g)}
                        className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.18] hover:bg-white/[0.07] px-4 py-3 cursor-pointer transition-colors"
                      >
                        <div className="relative w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                          <Users size={16} className="text-white/55" />
                          {unread > 0 && (
                            <span
                              className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold inline-flex items-center justify-center"
                              title={`${unread} unread`}
                            >
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-white/85 truncate">{g.name}</p>
                          <p className="text-[11.5px] text-white/40">
                            {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                            {g.role === 'admin' ? ' · Admin' : ''}
                            {g.libraryCount ? ` · ${g.libraryCount} item${g.libraryCount === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                        {g.activeSession && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenSession?.(g.id, g.activeSession); }}
                            title="Join live session"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 text-[10.5px] font-bold hover:bg-emerald-500/25 transition-colors"
                          >
                            <Radio size={11} className="animate-pulse" /> Live
                          </button>
                        )}
                        <ChevronRight size={15} className="text-white/25 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
