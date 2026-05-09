import { useState, useEffect, useRef } from 'react';
import { Users, Search, MessageCircle, UserPlus, UserMinus, ArrowLeft, Send, Plus, Hash, X, Check, Bell, Loader2 } from 'lucide-react';
import { getMyProfile, setProfile, searchUsers, getFriends, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getFriendRequests, removeFriend, listDMs, getDM, sendDM, listGroups, createGroup, getGroup, sendGroupMessage } from '../../../api/social';
import { useAuth } from '../../../context/AuthContext';
import LoadingSpinner from '../../shared/LoadingSpinner';

const inputCls = 'flex-1 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors';
const sectionLabel = 'text-[9px] font-black uppercase tracking-[0.20em] text-white/25 mb-2';
const rowHover = 'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-white/[0.05] transition-colors';

function Avatar({ name, size = 8 }) {
  const sz = `w-${size} h-${size}`;
  return (
    <div className={`${sz} rounded-full bg-white/[0.10] border border-white/[0.12] flex items-center justify-center text-[11px] font-bold text-white/60 flex-shrink-0`}>
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
    <div className="flex flex-col items-center justify-center h-full p-6 gap-5">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
        <Users size={22} className="text-white/35" />
      </div>
      <div className="text-center">
        <h2 className="text-[17px] font-bold text-white/90 mb-1">Set Up Your Profile</h2>
        <p className="text-[13px] text-white/40 max-w-xs">Choose a handle and display name to connect with others.</p>
      </div>
      {error && <p className="text-[12px] text-rose-400 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">{error}</p>}
      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Handle</label>
          <div className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] focus-within:border-white/[0.20] focus-within:bg-white/[0.07] transition-colors">
            <span className="text-[13px] text-white/30">@</span>
            <input
              value={handle}
              onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="yourhandle"
              className="flex-1 bg-transparent text-[13px] text-white/85 placeholder:text-white/25 outline-none"
              maxLength={20}
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Display Name</label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Your Name"
            className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !handle.trim() || !displayName.trim()}
          className="w-full py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          Save Profile
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <button onClick={onBack} className="text-white/30 hover:text-white/65 transition-colors"><ArrowLeft size={15} /></button>
        <span className="text-[14px] font-semibold text-white/85 truncate">{title}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {messages.length === 0 && <p className="text-[12px] text-white/25 text-center py-8">No messages yet</p>}
        {messages.map(msg => {
          const isMine = msg.from === myId;
          const sender = profiles?.[msg.from];
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-[13px] ${isMine ? 'bg-white/[0.14] text-white/90 rounded-br-md' : 'bg-white/[0.06] text-white/75 rounded-bl-md'}`}>
                {!isMine && sender && <p className="text-[10px] font-semibold text-white/45 mb-0.5">{sender.displayName}</p>}
                <p className="break-words">{msg.content}</p>
                <p className="text-[9px] mt-0.5 text-white/25">{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2.5 border-t border-white/[0.07] flex-shrink-0">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message…" className={inputCls} />
        <button type="submit" disabled={!text.trim()} className="p-2.5 rounded-xl bg-white/[0.10] border border-white/[0.16] text-white/60 hover:bg-white/[0.16] hover:text-white/85 disabled:opacity-30 transition-colors">
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
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-white/30 hover:text-white/65 transition-colors"><ArrowLeft size={15} /></button>
          <span className="text-[14px] font-semibold text-white/85">Friends ({friends.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {friends.length === 0 && <p className="text-[12px] text-white/25 text-center py-8">No friends yet. Search to add people.</p>}
          {friends.map(f => (
            <div key={f.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
              <Avatar name={f.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/80 truncate">{f.displayName}</p>
                <p className="text-[10px] text-white/30">@{f.handle}</p>
              </div>
              <button onClick={() => openDM(f)} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"><MessageCircle size={13} /></button>
              <button onClick={() => { removeFriend(f.userId); setFriends(p => p.filter(x => x.userId !== f.userId)); }} className="p-1.5 rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><UserMinus size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-white/30 hover:text-white/65 transition-colors"><ArrowLeft size={15} /></button>
          <span className="text-[14px] font-semibold text-white/85">Find People</span>
        </div>
        <div className="px-3 py-2.5 flex gap-2">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search by handle or name…" className={inputCls} />
          <button onClick={handleSearch} disabled={searching} className="p-2.5 rounded-xl bg-white/[0.08] border border-white/[0.14] text-white/50 hover:bg-white/[0.14] hover:text-white/80 disabled:opacity-40 transition-colors">
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {searchResults.map(u => {
            const isFriend = friends.some(f => f.userId === u.userId);
            const s = addedStatus[u.userId];
            return (
              <div key={u.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors">
                <Avatar name={u.displayName} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/80 truncate">{u.displayName}</p>
                  <p className="text-[10px] text-white/30">@{u.handle}</p>
                </div>
                {(isFriend || s === 'accepted' || s === 'already_friends') ? (
                  <span className="text-[10px] text-emerald-400 font-semibold">Friends</span>
                ) : (s === 'sent' || s === 'already_sent') ? (
                  <span className="text-[10px] text-white/35 font-medium px-2 py-1">Requested</span>
                ) : (
                  <button
                    onClick={() => handleSendRequest(u.userId)}
                    disabled={s === 'pending'}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white/70 bg-white/[0.08] border border-white/[0.14] hover:bg-white/[0.14] disabled:opacity-50 transition-colors"
                  >
                    <UserPlus size={11} /> {s === 'pending' ? 'Adding…' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-[12px] text-white/25 text-center py-4">No results</p>
          )}
        </div>
      </div>
    );
  }

  if (view === 'newGroup') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-white/30 hover:text-white/65 transition-colors"><ArrowLeft size={15} /></button>
          <span className="text-[14px] font-semibold text-white/85">New Group</span>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Group Name</label>
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="e.g., Study Group"
              className="w-full px-3.5 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/85 placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] focus:bg-white/[0.07] transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Add Friends</label>
            <div className="flex flex-col gap-1">
              {friends.map(f => {
                const selected = newGroupMembers.includes(f.userId);
                return (
                  <button
                    key={f.userId}
                    onClick={() => setNewGroupMembers(prev => selected ? prev.filter(id => id !== f.userId) : [...prev, f.userId])}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${selected ? 'bg-white/[0.10] border border-white/[0.18]' : 'hover:bg-white/[0.05]'}`}
                  >
                    <Avatar name={f.displayName} size={6} />
                    <span className="text-[13px] text-white/75 flex-1">{f.displayName}</span>
                    {selected && <span className="text-[10px] text-white/50 font-semibold">Added</span>}
                  </button>
                );
              })}
              {friends.length === 0 && <p className="text-[12px] text-white/25 py-2">Add friends first</p>}
            </div>
          </div>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim()}
            className="py-2.5 rounded-2xl font-bold text-[13px] text-white/85 bg-white/[0.10] border border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.16] disabled:opacity-40 transition-colors"
          >
            Create Group
          </button>
        </div>
      </div>
    );
  }

  // Home
  return (
    <div className="flex flex-col h-full">
      {/* Profile header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <Avatar name={profile.displayName} size={8} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/85">{profile.displayName}</p>
          <p className="text-[10px] text-white/30">@{profile.handle}</p>
        </div>
      </div>

      {/* Nav actions */}
      <div className="flex gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
        {[
          { label: `Friends (${friends.length})`, icon: Users, action: () => setView('friends') },
          { label: 'Add People', icon: UserPlus, action: () => setView('search') },
          { label: 'New Group', icon: Plus, action: () => setView('newGroup') },
        ].map(({ label, icon: Icon, action }) => (
          <button key={label} onClick={action} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/50 bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.09] hover:text-white/75 transition-colors">
            <Icon size={11} /> {label}
          </button>
        ))}
      </div>

      {/* Friend requests */}
      {friendRequests.length > 0 && (
        <div className="px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
          <p className={sectionLabel}><Bell size={9} className="inline mr-1" />Requests ({friendRequests.length})</p>
          {friendRequests.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-2 py-1.5 rounded-xl">
              <Avatar name={r.fromProfile?.displayName} size={7} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-white/75 truncate">{r.fromProfile?.displayName || 'Unknown'}</p>
                <p className="text-[10px] text-white/30">@{r.fromProfile?.handle}</p>
              </div>
              <button onClick={() => handleAccept(r.id)} className="p-1.5 rounded-lg text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"><Check size={12} /></button>
              <button onClick={() => handleDecline(r.id)} className="p-1.5 rounded-lg text-white/25 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><X size={12} /></button>
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
                <div className="w-8 h-8 rounded-xl bg-white/[0.07] border border-white/[0.09] flex items-center justify-center flex-shrink-0">
                  <Hash size={13} className="text-white/40" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/80 truncate">{g.name}</p>
                  <p className="text-[10px] text-white/30">{g.memberCount} members{g.lastMessage ? ` · ${g.lastMessage.content?.slice(0, 25)}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="px-4 pt-3 pb-3">
          <p className={sectionLabel}>Messages</p>
          {conversations.length === 0 && friends.length === 0 && (
            <p className="text-[12px] text-white/25 py-4 text-center">Search for people to start chatting!</p>
          )}
          {conversations.map(c => (
            <button key={c.peerId} onClick={() => openDM(c.peer)} className={rowHover}>
              <Avatar name={c.peer.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-white/80 truncate">{c.peer.displayName}</p>
                <p className="text-[10px] text-white/30 truncate">{c.lastMessage?.content?.slice(0, 40)}</p>
              </div>
              {c.lastMessage && <span className="text-[9px] text-white/25 flex-shrink-0">{new Date(c.lastMessage.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
            </button>
          ))}
          {friends.filter(f => !conversations.some(c => c.peerId === f.userId)).map(f => (
            <button key={f.userId} onClick={() => openDM(f)} className={rowHover}>
              <Avatar name={f.displayName} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white/55 truncate">{f.displayName}</p>
                <p className="text-[10px] text-white/25">Start a conversation</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
