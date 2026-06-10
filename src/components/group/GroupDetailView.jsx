import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {
  ArrowLeft, Users, UserPlus, Search, Shield, Crown, Trash2, LogOut,
  Loader2, BookOpen, Radio, ChevronRight,
} from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { useToast } from '../shared/Toast';
import { useAuth } from '../../context/AuthContext';
import { GroupNotificationContext } from '../../context/GroupNotificationContext';
import { searchUsers } from '../../api/social';
import {
  getGroup, inviteMember, removeMember, promoteMember, disbandGroup,
} from '../../api/studyGroups';

// GroupDetailView - roster, role management, and lifecycle controls for one
// study group (Group Study, WO-8).
//
// Props:
//   groupId:       string
//   summary:       the list-row summary it was opened with - carries the live
//                  `activeSession` ({ sessionId, hostId, itemTitle, mode }|null),
//                  since GET /api/study-groups/:id does not include it.
//   onBack:        () => void   - return to GroupListView
//   onChanged:     () => void   - tell the list to re-fetch (counts/membership)
//   onOpenLibrary: (groupId) => void          - navigate to GroupLibraryView (separate WO)
//   onOpenSession: (groupId, session) => void  - navigate to SessionView (separate WO)
//
// The last-admin guard is enforced here before calling the API (the server also
// returns 422): a sole admin must name a successor to leave or disband.
export default function GroupDetailView({ groupId, summary, onBack, onChanged, onOpenLibrary, onOpenSession }) {
  const toast = useToast();
  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSearching, setInviteSearching] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null); // { kind: 'error'|'success', text }
  const [invitingId, setInvitingId] = useState(null);
  // true only when the server returned zero accounts - distinct from "all
  // matches were filtered out as existing members/invitees" (no false positive).
  const [inviteNoAccount, setInviteNoAccount] = useState(false);

  const [actingMemberId, setActingMemberId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null); // member pending remove-confirm
  // { action: 'leave'|'disband', needsSuccessor: boolean }
  const [prompt, setPrompt] = useState(null);
  const [successorId, setSuccessorId] = useState('');
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState(null);

  const activeSession = summary?.activeSession || null;

  // Tell GroupNotificationContext this group's detail screen is open: marks
  // it seen (lastSeenAt baseline, clears its unread count) and shortens the
  // activity poll to 5s for the duration. null-safe without a provider.
  const groupNotifications = useContext(GroupNotificationContext);
  const setGroupDetailOpen = groupNotifications?.setGroupDetailOpen;
  useEffect(() => {
    if (!setGroupDetailOpen) return undefined;
    setGroupDetailOpen(groupId);
    return () => setGroupDetailOpen(null);
  }, [groupId, setGroupDetailOpen]);

  const load = useCallback(async () => {
    try {
      const { group: g } = await getGroup(groupId);
      setGroup(g);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const members = group?.members || [];
  const isAdmin = !!group && group.adminIds?.includes(currentUserId);
  const isSoleAdmin = !!group && group.adminIds?.length === 1 && group.adminIds[0] === currentUserId;
  const otherMembers = members.filter((m) => m.userId !== currentUserId);
  const pendingInvites = (group?.invitations || []).filter((i) => i.status === 'pending');

  // Debounced, race-safe invite search excluding existing members + pending invitees.
  const searchTokenRef = useRef(0);
  useEffect(() => {
    const q = inviteQuery.trim();
    if (!q) { setInviteResults([]); setInviteSearching(false); setInviteNoAccount(false); return undefined; }
    setInviteSearching(true);
    const token = ++searchTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const { users } = await searchUsers(q);
        if (token !== searchTokenRef.current) return;
        const raw = users || [];
        const excluded = new Set([
          ...members.map((m) => m.userId),
          ...pendingInvites.map((i) => i.userId),
        ]);
        setInviteResults(raw.filter((u) => !excluded.has(u.userId)));
        setInviteNoAccount(raw.length === 0);
      } catch {
        if (token === searchTokenRef.current) { setInviteResults([]); setInviteNoAccount(false); }
      } finally {
        if (token === searchTokenRef.current) setInviteSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteQuery, group]);

  async function handleInvite(u) {
    if (invitingId) return;
    setInvitingId(u.userId);
    setInviteMsg(null);
    try {
      await inviteMember(groupId, u.userId);
      setInviteMsg({ kind: 'success', text: `Invitation sent to ${u.displayName || u.handle}.` });
      setInviteQuery('');
      setInviteResults([]);
      await load();
    } catch (e) {
      setInviteMsg({ kind: 'error', text: e.message });
    } finally {
      setInvitingId(null);
    }
  }

  async function handleRemove(member) {
    if (actingMemberId) return;
    setActingMemberId(member.userId);
    try {
      await removeMember(groupId, member.userId);
      toast.success(`Removed ${member.name}.`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Could not remove member.');
    } finally {
      setActingMemberId(null);
    }
  }

  async function handlePromote(member) {
    if (actingMemberId) return;
    setActingMemberId(member.userId);
    try {
      await promoteMember(groupId, member.userId);
      toast.success(`${member.name} is now an admin.`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Could not promote member.');
    } finally {
      setActingMemberId(null);
    }
  }

  function startLeave() {
    if (isSoleAdmin && otherMembers.length > 0) {
      setSuccessorId(''); setPromptError(null);
      setPrompt({ action: 'leave', needsSuccessor: true });
    } else {
      runLifecycle('leave', false, null);
    }
  }

  function startDisband() {
    // Disband is destructive - always confirm. Sole admin with others must also
    // pick a successor (who is promoted before deletion, per the API).
    setSuccessorId(''); setPromptError(null);
    setPrompt({ action: 'disband', needsSuccessor: isSoleAdmin && otherMembers.length > 0 });
  }

  async function runLifecycle(action, needsSuccessor, succId) {
    try {
      if (action === 'leave') {
        await removeMember(groupId, currentUserId, needsSuccessor ? succId : undefined);
        toast.success('You left the group.');
      } else {
        await disbandGroup(groupId, needsSuccessor ? succId : undefined);
        toast.success('Group disbanded.');
      }
      onChanged?.();
      onBack?.();
    } catch (e) {
      throw e;
    }
  }

  async function submitPrompt() {
    if (!prompt) return;
    if (prompt.needsSuccessor && !successorId) {
      setPromptError('Choose who should become the new admin.');
      return;
    }
    setPromptBusy(true);
    setPromptError(null);
    try {
      await runLifecycle(prompt.action, prompt.needsSuccessor, successorId);
      setPrompt(null);
    } catch (e) {
      setPromptError(e.message || 'Action failed.');
    } finally {
      setPromptBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-white/40">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (error || !group) {
    return (
      <div className="p-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 mb-3">
          <ArrowLeft size={13} /> Groups
        </button>
        <p className="text-[13px] text-rose-400">{error || 'Group not found.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors">
          <ArrowLeft size={13} /> Groups
        </button>
      </div>

      <div className="shrink-0 mb-4">
        <h2 className="text-[18px] font-bold text-white/90">{group.name}</h2>
        {group.description && <p className="text-[12.5px] text-white/45 mt-0.5">{group.description}</p>}
        <p className="text-[11.5px] text-white/35 mt-1 inline-flex items-center gap-1.5">
          <Users size={12} /> {group.memberIds.length} member{group.memberIds.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Session status + navigation */}
      <div className="shrink-0 flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
          {activeSession ? (
            <>
              <Radio size={15} className="text-emerald-400 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-white/85 truncate">Live session in progress</p>
                {activeSession.itemTitle && <p className="text-[11px] text-white/40 truncate">{activeSession.itemTitle}</p>}
              </div>
              <Button size="sm" onClick={() => onOpenSession?.(groupId, activeSession)}>Join</Button>
            </>
          ) : (
            <>
              <Radio size={15} className="text-white/25" />
              <p className="flex-1 text-[12.5px] text-white/45">No active session</p>
            </>
          )}
        </div>
        <button
          onClick={() => onOpenLibrary?.(groupId)}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 transition-colors text-left"
        >
          <BookOpen size={15} className="text-white/45" />
          <span className="flex-1 text-[12.5px] font-medium text-white/80">Group Library</span>
          <span className="text-[11px] text-white/35">{group.library?.length || 0}</span>
          <ChevronRight size={14} className="text-white/30" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5">
        {/* Invite (admin only) */}
        {isAdmin && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-2">Invite a member</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={inviteQuery}
                onChange={(e) => { setInviteQuery(e.target.value); setInviteMsg(null); }}
                placeholder="Search by name or @handle…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white placeholder-white/25 outline-none focus:border-blue-400/50 transition-colors"
              />
              {inviteSearching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />}
            </div>
            {inviteResults.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 max-h-40 overflow-y-auto">
                {inviteResults.map((u) => (
                  <div key={u.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.05]">
                    <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[11px] font-bold text-white/70">
                      {(u.displayName || u.handle || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-white/85 truncate">{u.displayName || u.handle}</p>
                      {u.handle && <p className="text-[11px] text-white/40 truncate">@{u.handle}</p>}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleInvite(u)} loading={invitingId === u.userId}>
                      <UserPlus size={12} /> Invite
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {inviteQuery.trim() && !inviteSearching && inviteNoAccount && (
              <p className="mt-2 text-[12px] text-white/40">No account found for “{inviteQuery.trim()}”.</p>
            )}
            {inviteMsg && (
              <p className={`mt-2 text-[12px] ${inviteMsg.kind === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{inviteMsg.text}</p>
            )}
          </section>
        )}

        {/* Roster */}
        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-2">Members</p>
          <div className="flex flex-col gap-1.5">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const busy = actingMemberId === m.userId;
              return (
                <div key={m.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-full bg-white/[0.08] flex items-center justify-center text-[12px] font-bold text-white/70">
                    {(m.name || m.handle || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/85 truncate">
                      {m.name}{isSelf && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-blue-300/60">you</span>}
                    </p>
                    {m.handle && <p className="text-[11px] text-white/40 truncate">@{m.handle}</p>}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold ${m.role === 'admin' ? 'text-amber-300/80' : 'text-white/40'}`}>
                    {m.role === 'admin' ? <Shield size={11} /> : null}
                    {m.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                  {isAdmin && !isSelf && (
                    <>
                      {m.role !== 'admin' && (
                        <button
                          onClick={() => handlePromote(m)}
                          disabled={busy}
                          title="Promote to admin"
                          className="p-1.5 rounded-md text-white/30 hover:text-amber-300 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                        >
                          <Crown size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setRemoveTarget(m)}
                        disabled={busy}
                        title="Remove member"
                        className="p-1.5 rounded-md text-white/30 hover:text-rose-400 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Pending / declined invitations (admin visibility) */}
        {isAdmin && (group.invitations || []).length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-2">Invitations</p>
            <div className="flex flex-col gap-1.5">
              {group.invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.02]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-white/70 truncate">{inv.userName}</p>
                  </div>
                  <span className={`text-[10.5px] font-semibold ${inv.status === 'declined' ? 'text-rose-400/70' : 'text-white/40'}`}>
                    {inv.status === 'declined' ? 'Declined' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Danger zone */}
        <section className="border-t border-white/[0.08] pt-3 flex items-center gap-2">
          <button
            onClick={startLeave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white/60 hover:text-white/90 hover:bg-white/[0.06] transition-colors"
          >
            <LogOut size={13} /> Leave group
          </button>
          {isAdmin && (
            <button
              onClick={startDisband}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/[0.10] transition-colors"
            >
              <Trash2 size={13} /> Disband group
            </button>
          )}
        </section>
      </div>

      {/* Remove-member confirmation (admin action is destructive: target loses
          library + session access immediately, AC-GS-003.2) */}
      {removeTarget && (
        <Modal
          open
          onClose={() => actingMemberId !== removeTarget.userId && setRemoveTarget(null)}
          title="Remove member"
          size="sm"
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-white/70">
              Remove <span className="font-semibold text-white/90">{removeTarget.name}</span> from the group?
              They lose access to the group library and any live session right away.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(null)} disabled={actingMemberId === removeTarget.userId}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                loading={actingMemberId === removeTarget.userId}
                onClick={async () => { const m = removeTarget; await handleRemove(m); setRemoveTarget(null); }}
              >
                Remove
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Leave / disband confirmation + successor assignment */}
      {prompt && (
        <Modal
          open
          onClose={() => !promptBusy && setPrompt(null)}
          title={prompt.action === 'disband' ? 'Disband group' : 'Leave group'}
          size="sm"
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-white/70">
              {prompt.action === 'disband'
                ? 'This deletes the group and its library for everyone. This cannot be undone.'
                : 'You will lose access to this group’s library and sessions.'}
            </p>
            {prompt.needsSuccessor && (
              <div>
                <p className="text-[12px] text-white/55 mb-1.5">
                  You’re the only admin. Choose a member to become the new admin:
                </p>
                <select
                  value={successorId}
                  onChange={(e) => { setSuccessorId(e.target.value); setPromptError(null); }}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[13px] text-white outline-none focus:border-blue-400/50"
                >
                  <option value="">Select a member…</option>
                  {otherMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.name}{m.handle ? ` (@${m.handle})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            {promptError && <p className="text-[12px] text-rose-400">{promptError}</p>}
            <div className="flex items-center justify-end gap-2 mt-1">
              <Button variant="ghost" size="sm" onClick={() => setPrompt(null)} disabled={promptBusy}>Cancel</Button>
              <Button
                variant={prompt.action === 'disband' ? 'danger' : 'primary'}
                size="sm"
                onClick={submitPrompt}
                loading={promptBusy}
              >
                {prompt.action === 'disband' ? 'Disband' : 'Leave'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
