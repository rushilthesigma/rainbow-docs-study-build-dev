import { useState, useEffect, useRef } from 'react';
import { Users, Search, MessageCircle, UserPlus, UserMinus, ArrowLeft, Send, Plus, Hash, X, Check, Bell, Loader2 } from 'lucide-react';
import { getMyProfile, setProfile, searchUsers, getFriends, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getFriendRequests, removeFriend, listDMs, getDM, sendDM, listGroups, createGroup, getGroup, sendGroupMessage } from '../../../api/social';
import { useAuth } from '../../../context/AuthContext';
import LoadingSpinner from '../../shared/LoadingSpinner';

const inputCls = 'flex-1 px-3.5 py-2 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] text-[13px] text-white/85 placeholder:text-white/30 focus:outline-none focus:border-blue-500/45 focus:bg-blue-500/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-colors';
const sectionLabel = 'text-[9px] font-black uppercase tracking-[0.20em] text-blue-400/70 mb-2';
const rowHover = 'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-blue-500/[0.08] transition-colors';

function Avatar({ name, size = 8 }) {
  const sz = `w-${size} h-${size}`;
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-400/30 flex items-center justify-center text-[11px] font-bold text-blue-100 flex-shrink-0`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

function ProfileSetup({ onDone }) {
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!handle.trim() || !displayName.trim()) return;
    setSaving(true); setError(null);
    try {
      await setProfile(handle.trim(), displayName.trim());
      onDone();
    } catch (err) { setError(err.message || 'Failed'); }
    setSaving(false);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
      <h2 className="text-[15px] font-bold text-white/90">Your profile</h2>
      {error && <p className="text-[12px] text-rose-400 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">{error}</p>}
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <div className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] focus-within:border-blue-500/45 focus-within:bg-blue-500/[0.08] focus-within:ring-2 focus-within:ring-blue-500/20 transition-colors">
          <span className="text-[13px] text-blue-300/60">@</span>
          <input
            value={handle}
            onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="handle"
            className="flex-1 bg-transparent text-[13px] text-white/85 placeholder:text-white/30 outline-none"
            maxLength={20}
          />
        </div>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Display name"
          className="w-full px-3.5 py-2.5 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] text-[13px] text-white/85 placeholder:text-white/30 focus:outline-none focus:border-blue-500/45 focus:bg-blue-500/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-colors"
        />
        <button
          type="submit"
          disabled={saving || !handle.trim() || !displayName.trim()}
          className="w-full py-2.5 rounded-2xl font-bold text-[13px] text-white bg-blue-500 hover:bg-blue-400 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </form>
    </div>
  );
}

function ChatView({ messages, profiles, myId, onSend, title, onBack }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-500/[0.12] flex-shrink-0">
        <button onClick={onBack} className="text-blue-300/60 hover:text-blue-200 transition-colors"><ArrowLeft size={15} /></button>
        <span className="text-[14px] font-semibold text-white/85 truncate">{title}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-blue-300/40">
            <MessageCircle size={20} />
            <p className="text-[12px]">No messages yet</p>
          </div>
        )}
        {messages.map(msg => {
          const isMine = msg.from === myId;
          const sender = profiles?.[msg.from];
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[13px] ${isMine ? 'bg-blue-500 text-white border border-blue-400/40 rounded-br-md' : 'bg-blue-500/[0.08] text-white/80 border border-blue-500/15 rounded-bl-md'}`}>
                {!isMine && sender && <p className="text-[10px] font-semibold text-blue-300/80 mb-0.5">{sender.displayName}</p>}
                <p className="break-words">{msg.content}</p>
                <p className={`text-[9px] mt-0.5 ${isMine ? 'text-white/60' : 'text-blue-300/45'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5 border-t border-blue-500/[0.12] flex-shrink-0">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message…" className={inputCls} />
        <button type="submit" disabled={!text.trim()} className="p-2.5 rounded-xl bg-blue-500 text-white border border-blue-400/40 hover:bg-blue-400 disabled:opacity-30 disabled:shadow-none transition-all">
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}

export default function SocialApp() {
  const { user } = useAuth();
  const [profile, setProfileState] = useState(undefined);
  const [view, setView] = useState('home');
  const [friends, setFriends] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatPeer, setChatPeer] = useState(null);
  const [chatGroup, setChatGroup] = useState(null);
  const [chatProfiles, setChatProfiles] = useState({});
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [addedStatus, setAddedStatus] = useState({});
  const pollRef = useRef(null);

  useEffect(() => {
    getMyProfile().then(d => setProfileState(d.profile)).catch(() => setProfileState(null));
  }, []);

  function refreshHome() {
    getFriends().then(d => setFriends(d.friends || [])).catch(() => {});
    listDMs().then(d => setConversations(d.conversations || [])).catch(() => {});
    listGroups().then(d => setGroups(d.groups || [])).catch(() => {});
  }

  function refreshRequests() {
    getFriendRequests().then(d => setFriendRequests(d.requests || [])).catch(() => {});
  }

  useEffect(() => { if (profile) { refreshHome(); refreshRequests(); } }, [profile]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (view === 'dmChat' && chatPeer) {
      pollRef.current = setInterval(async () => {
        try { const d = await getDM(chatPeer.userId); setChatMessages(d.messages || []); } catch {}
      }, 3000);
    }
    if (view === 'groupChat' && chatGroup) {
      pollRef.current = setInterval(async () => {
        try {
          const d = await getGroup(chatGroup.id);
          setChatMessages(d.group.messages || []);
          const profs = {};
          (d.group.memberProfiles || []).forEach(p => { profs[p.userId] = p; });
          setChatProfiles(profs);
        } catch {}
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [view, chatPeer, chatGroup]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try { const d = await searchUsers(searchQuery.trim()); setSearchResults(d.users || []); } catch {}
    setSearching(false);
  }

  async function handleSendRequest(userId) {
    setAddedStatus(p => ({ ...p, [userId]: 'pending' }));
    try {
      const result = await sendFriendRequest(userId);
      setAddedStatus(p => ({ ...p, [userId]: result.status || 'sent' }));
      if (result.status === 'accepted') refreshHome();
    } catch { setAddedStatus(p => ({ ...p, [userId]: 'error' })); }
  }

  async function handleAccept(requestId) {
    await acceptFriendRequest(requestId);
    refreshHome(); refreshRequests();
  }

  async function handleDecline(requestId) {
    await declineFriendRequest(requestId);
    refreshRequests();
  }

  async function openDM(peer) {
    setChatPeer(peer); setChatMessages([]); setView('dmChat');
    try { const d = await getDM(peer.userId); setChatMessages(d.messages || []); } catch {}
  }

  async function handleSendDM(content) {
    if (!chatPeer) return;
    await sendDM(chatPeer.userId, content);
    try { const d = await getDM(chatPeer.userId); setChatMessages(d.messages || []); } catch {}
  }

  async function openGroup(groupSummary) {
    setChatGroup(groupSummary); setChatMessages([]); setView('groupChat');
    try {
      const d = await getGroup(groupSummary.id);
      setChatMessages(d.group.messages || []);
      setChatGroup(d.group);
      const profs = {};
      (d.group.memberProfiles || []).forEach(p => { profs[p.userId] = p; });
      setChatProfiles(profs);
    } catch {}
  }

  async function handleSendGroup(content) {
    if (!chatGroup) return;
    await sendGroupMessage(chatGroup.id, content);
    try { const d = await getGroup(chatGroup.id); setChatMessages(d.group.messages || []); } catch {}
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName.trim(), newGroupMembers);
      setNewGroupName(''); setNewGroupMembers([]);
      setView('home'); refreshHome();
    } catch {}
  }

  if (profile === undefined) return <div className="flex items-center justify-center h-full"><LoadingSpinner size={24} /></div>;
  if (!profile) return <ProfileSetup onDone={() => getMyProfile().then(d => setProfileState(d.profile))} />;

  if (view === 'dmChat' && chatPeer) {
    return <ChatView messages={chatMessages} profiles={{ [chatPeer.userId]: chatPeer, [profile.userId]: profile }} myId={profile.userId} onSend={handleSendDM} title={chatPeer.displayName} onBack={() => { setView('home'); refreshHome(); }} />;
  }

  if (view === 'groupChat' && chatGroup) {
    return <ChatView messages={chatMessages} profiles={{ ...chatProfiles, [profile.userId]: profile }} myId={profile.userId} onSend={handleSendGroup} title={`# ${chatGroup.name}`} onBack={() => { setView('home'); refreshHome(); }} />;
  }

  if (view === 'friends') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-500/[0.12] flex-shrink-0">
          <button onClick={() => setView('home')} title="Back" className="text-blue-300/60 hover:text-blue-200 transition-colors"><ArrowLeft size={15} /></button>
          <Users size={14} className="text-blue-300" />
          <span className="text-[14px] font-semibold text-white/85">Friends</span>
          <span className="text-[11px] text-blue-300/55 tabular-nums">· {friends.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {friends.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-blue-300/40">
              <Users size={20} />
              <p className="text-[12px]">No friends yet</p>
            </div>
          )}
          {friends.map(f => (
            <div key={f.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-blue-500/[0.08] transition-colors">
              <Avatar name={f.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/85 truncate">{f.displayName}</p>
                <p className="text-[10px] text-blue-300/50">@{f.handle}</p>
              </div>
              <button onClick={() => openDM(f)} className="p-1.5 rounded-lg text-blue-300/60 hover:text-blue-200 hover:bg-blue-500/15 transition-colors"><MessageCircle size={13} /></button>
              <button onClick={() => { removeFriend(f.userId); setFriends(p => p.filter(x => x.userId !== f.userId)); }} className="p-1.5 rounded-lg text-white/25 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><UserMinus size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-500/[0.12] flex-shrink-0">
          <button onClick={() => setView('home')} title="Back" className="text-blue-300/60 hover:text-blue-200 transition-colors"><ArrowLeft size={15} /></button>
          <Search size={14} className="text-blue-300" />
          <span className="text-[14px] font-semibold text-white/85">Find people</span>
        </div>
        <div className="px-3 py-2.5 flex gap-2">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="@handle or name" className={inputCls} />
          <button onClick={handleSearch} disabled={searching} className="p-2.5 rounded-xl bg-blue-500 text-white border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none transition-all">
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {searchResults.map(u => {
            const isFriend = friends.some(f => f.userId === u.userId);
            const s = addedStatus[u.userId];
            return (
              <div key={u.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-blue-500/[0.08] transition-colors">
                <Avatar name={u.displayName} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/85 truncate">{u.displayName}</p>
                  <p className="text-[10px] text-blue-300/50">@{u.handle}</p>
                </div>
                {(isFriend || s === 'accepted' || s === 'already_friends') ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><Check size={11} /> Friends</span>
                ) : (s === 'sent' || s === 'already_sent') ? (
                  <span className="text-[10px] font-medium text-blue-300/60 px-1.5 py-1">Requested</span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(u.userId)}
                    disabled={s === 'pending'}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/20 border border-blue-400/40 hover:bg-blue-500/30 hover:text-blue-100 disabled:opacity-50 transition-colors"
                  >
                    {s === 'pending' ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                    Add
                  </button>
                )}
              </div>
            );
          })}
          {searchResults.length === 0 && searchQuery && !searching && (
            <div className="flex flex-col items-center gap-2 py-4 text-blue-300/40">
              <Search size={16} />
              <p className="text-[12px]">No results</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'newGroup') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-500/[0.12] flex-shrink-0">
          <button onClick={() => setView('home')} title="Back" className="text-blue-300/60 hover:text-blue-200 transition-colors"><ArrowLeft size={15} /></button>
          <Hash size={14} className="text-blue-300" />
          <span className="text-[14px] font-semibold text-white/85">New group</span>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <input
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="w-full px-3.5 py-2.5 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] text-[13px] text-white/85 placeholder:text-white/30 focus:outline-none focus:border-blue-500/45 focus:bg-blue-500/[0.08] focus:ring-2 focus:ring-blue-500/20 transition-colors"
          />
          <div>
            <p className={sectionLabel}>Members</p>
            <div className="flex flex-col gap-1">
              {friends.map(f => {
                const selected = newGroupMembers.includes(f.userId);
                return (
                  <button
                    key={f.userId}
                    onClick={() => setNewGroupMembers(prev => selected ? prev.filter(id => id !== f.userId) : [...prev, f.userId])}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${selected ? 'bg-blue-500/[0.18] border border-blue-400/40' : 'hover:bg-blue-500/[0.08]'}`}
                  >
                    <Avatar name={f.displayName} size={6} />
                    <span className="text-[13px] text-white/85 flex-1">{f.displayName}</span>
                    {selected && <Check size={13} className="text-blue-200" />}
                  </button>
                );
              })}
              {friends.length === 0 && (
                <p className="text-[12px] text-blue-300/40 py-2">Add friends first</p>
              )}
            </div>
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            className="py-2.5 rounded-2xl font-bold text-[13px] text-white bg-blue-500 border border-blue-400/40 hover:bg-blue-400 disabled:opacity-40 disabled:shadow-none transition-all inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Create
          </button>
        </div>
      </div>
    );
  }

  // Home
  return (
    <div className="flex flex-col h-full">
      {/* Profile header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-blue-500/[0.12] flex-shrink-0">
        <Avatar name={profile.displayName} size={8} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/90">{profile.displayName}</p>
          <p className="text-[10px] text-blue-300/55">@{profile.handle}</p>
        </div>
      </div>

      {/* Nav actions */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-blue-500/[0.10] flex-shrink-0">
        <button onClick={() => setView('friends')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors">
          <Users size={12} className="text-blue-300" /> Friends <span className="tabular-nums text-blue-300/70">{friends.length}</span>
        </button>
        <button onClick={() => setView('search')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors">
          <UserPlus size={12} className="text-blue-300" /> Add
        </button>
        <button onClick={() => setView('newGroup')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-blue-200 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 hover:border-blue-500/45 hover:text-blue-100 transition-colors">
          <Plus size={12} className="text-blue-300" /> Group
        </button>
      </div>

      {/* Friend requests */}
      {friendRequests.length > 0 && (
        <div className="px-4 py-2.5 border-b border-blue-500/[0.10] flex-shrink-0">
          <p className={sectionLabel}><Bell size={9} className="inline mr-1" />Requests · {friendRequests.length}</p>
          {friendRequests.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-2 py-1.5 rounded-xl">
              <Avatar name={r.fromProfile?.displayName} size={7} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white/85 truncate">{r.fromProfile?.displayName || 'Unknown'}</p>
                <p className="text-[10px] text-blue-300/50">@{r.fromProfile?.handle}</p>
              </div>
              <button onClick={() => handleAccept(r.id)} className="p-1.5 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"><Check size={12} /></button>
              <button onClick={() => handleDecline(r.id)} className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className={sectionLabel}>Groups</p>
            {groups.map(g => (
              <button key={g.id} onClick={() => openGroup(g)} className={rowHover}>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/25 to-blue-600/15 border border-blue-400/30 flex items-center justify-center flex-shrink-0">
                  <Hash size={13} className="text-blue-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/85 truncate">{g.name}</p>
                  <p className="text-[10px] text-blue-300/50 inline-flex items-center gap-1">
                    <Users size={9} />{g.memberCount}
                    {g.lastMessage ? <span className="text-white/40">· {g.lastMessage.content?.slice(0, 25)}</span> : null}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-3">
          <p className={sectionLabel}>Messages</p>
          {conversations.length === 0 && friends.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-blue-300/40">
              <Search size={18} />
              <p className="text-[12px]">Find someone to chat</p>
            </div>
          )}
          {conversations.map(c => (
            <button key={c.peerId} onClick={() => openDM(c.peer)} className={rowHover}>
              <Avatar name={c.peer.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/85 truncate">{c.peer.displayName}</p>
                <p className="text-[10px] text-white/40 truncate">{c.lastMessage?.content?.slice(0, 40)}</p>
              </div>
              {c.lastMessage && <span className="text-[9px] text-blue-300/40 flex-shrink-0">{new Date(c.lastMessage.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            </button>
          ))}
          {friends.filter(f => !conversations.some(c => c.peerId === f.userId)).map(f => (
            <button key={f.userId} onClick={() => openDM(f)} className={rowHover}>
              <Avatar name={f.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white/65 truncate">{f.displayName}</p>
                <p className="text-[10px] text-blue-300/40">Say hi</p>
              </div>
              <MessageCircle size={12} className="text-blue-300/40" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
