import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Search, MessageCircle, UserPlus, UserMinus, ArrowLeft, Send, Plus, Hash, X, Check, Bell } from 'lucide-react';
import { getMyProfile, setProfile, searchUsers, getFriends, sendFriendRequest, acceptFriendRequest, declineFriendRequest, getFriendRequests, removeFriend, listDMs, getDM, sendDM, listGroups, createGroup, getGroup, sendGroupMessage } from '../../../api/social';
import { useAuth } from '../../../context/AuthContext';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import LoadingSpinner from '../../shared/LoadingSpinner';

// ===== PROFILE SETUP =====
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
    <div className="flex flex-col items-center justify-center h-full p-6">
      <Users size={36} className="text-blue-400 mb-4" />
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Set Up Your Profile</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">Choose a handle and display name to connect with others.</p>
      {error && <p className="text-xs text-rose-500 mb-3 px-4 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Handle</label>
          <div className="flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
            <span className="text-sm text-gray-400">@</span>
            <input value={handle} onChange={e => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="yourhandle" className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none" maxLength={20} />
          </div>
        </div>
        <Input label="Display Name" placeholder="Your Name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        <Button type="submit" loading={saving} className="w-full">Save Profile</Button>
      </form>
    </div>
  );
}

// ===== CHAT VIEW =====
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
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No messages yet</p>}
        {messages.map(msg => {
          const isMine = msg.from === myId;
          const sender = profiles?.[msg.from];
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-900 dark:text-gray-100 rounded-bl-md'}`}>
                {!isMine && sender && <p className="text-[10px] font-semibold text-blue-400 mb-0.5">{sender.displayName}</p>}
                <p className="break-words">{msg.content}</p>
                <p className={`text-[9px] mt-0.5 ${isMine ? 'text-blue-200' : 'text-gray-400'}`}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Message..." className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm text-gray-900 dark:text-white outline-none" />
        <button type="submit" disabled={!text.trim()} className="p-2 rounded-xl bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"><Send size={14} /></button>
      </form>
    </div>
  );
}

// ===== MAIN SOCIAL APP =====
export default function SocialApp() {
  const { user } = useAuth();
  const [profile, setProfileState] = useState(undefined); // undefined=loading, null=no profile
  const [view, setView] = useState('home'); // home, friends, search, dm, dmChat, groups, groupChat, newGroup
  const [friends, setFriends] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatPeer, setChatPeer] = useState(null);
  const [chatGroup, setChatGroup] = useState(null);
  const [chatProfiles, setChatProfiles] = useState({});

  // New group
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState([]);

  // Polling ref
  const pollRef = useRef(null);

  useEffect(() => {
    getMyProfile().then(d => setProfileState(d.profile)).catch(() => setProfileState(null));
  }, []);

  function refreshHome() {
    getFriends().then(d => setFriends(d.friends || [])).catch(() => {});
    listDMs().then(d => setConversations(d.conversations || [])).catch(() => {});
    listGroups().then(d => setGroups(d.groups || [])).catch(() => {});
  }

  useEffect(() => { if (profile) refreshHome(); }, [profile]);

  // Poll active chat every 3s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (view === 'dmChat' && chatPeer) {
      pollRef.current = setInterval(async () => {
        try { const d = await getDM(chatPeer.userId); setChatMessages(d.messages || []); } catch {}
      }, 3000);
    }
    if (view === 'groupChat' && chatGroup) {
      pollRef.current = setInterval(async () => {
        try { const d = await getGroup(chatGroup.id); setChatMessages(d.group.messages || []); const profs = {}; (d.group.memberProfiles || []).forEach(p => { profs[p.userId] = p; }); setChatProfiles(profs); } catch {}
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

  // Friend requests
  const [friendRequests, setFriendRequests] = useState([]);
  // Track per-user add status for in-search-results feedback
  const [addedStatus, setAddedStatus] = useState({}); // { userId: 'sent' | 'accepted' | 'already_friends' | 'already_sent' | 'error' }

  function refreshRequests() {
    getFriendRequests().then(d => setFriendRequests(d.requests || [])).catch(() => {});
  }

  useEffect(() => { if (profile) refreshRequests(); }, [profile]);

  async function handleSendRequest(userId) {
    setAddedStatus(p => ({ ...p, [userId]: 'pending' }));
    try {
      const result = await sendFriendRequest(userId);
      setAddedStatus(p => ({ ...p, [userId]: result.status || 'sent' }));
      if (result.status === 'accepted') refreshHome();
    } catch (err) {
      setAddedStatus(p => ({ ...p, [userId]: 'error' }));
      console.error('Add friend failed', err);
    }
  }

  async function handleAccept(requestId) {
    await acceptFriendRequest(requestId);
    refreshHome();
    refreshRequests();
  }

  async function handleDecline(requestId) {
    await declineFriendRequest(requestId);
    refreshRequests();
  }

  async function handleRemoveFriend(userId) {
    await removeFriend(userId);
    setFriends(prev => prev.filter(f => f.userId !== userId));
  }

  async function openDM(peer) {
    setChatPeer(peer);
    setChatMessages([]);
    setView('dmChat');
    try { const d = await getDM(peer.userId); setChatMessages(d.messages || []); } catch {}
  }

  async function handleSendDM(content) {
    if (!chatPeer) return;
    await sendDM(chatPeer.userId, content);
    try { const d = await getDM(chatPeer.userId); setChatMessages(d.messages || []); } catch {}
  }

  async function openGroup(groupSummary) {
    setChatGroup(groupSummary);
    setChatMessages([]);
    setView('groupChat');
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

  // Loading
  if (profile === undefined) return <div className="flex items-center justify-center h-full"><LoadingSpinner size={24} /></div>;

  // Setup
  if (!profile) return <ProfileSetup onDone={() => getMyProfile().then(d => setProfileState(d.profile))} />;

  // DM Chat
  if (view === 'dmChat' && chatPeer) {
    return <ChatView messages={chatMessages} profiles={{ [chatPeer.userId]: chatPeer, [profile.userId]: profile }} myId={profile.userId} onSend={handleSendDM} title={chatPeer.displayName} onBack={() => { setView('home'); refreshHome(); }} />;
  }

  // Group Chat
  if (view === 'groupChat' && chatGroup) {
    return <ChatView messages={chatMessages} profiles={{ ...chatProfiles, [profile.userId]: profile }} myId={profile.userId} onSend={handleSendGroup} title={`# ${chatGroup.name}`} onBack={() => { setView('home'); refreshHome(); }} />;
  }

  // Friends view
  if (view === 'friends') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Friends ({friends.length})</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {friends.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No friends yet. Search to add people!</p>}
          {friends.map(f => (
            <div key={f.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e1e2e]">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">{f.displayName?.[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{f.displayName}</p>
                <p className="text-[10px] text-gray-400">@{f.handle}</p>
              </div>
              <button onClick={() => openDM(f)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/15"><MessageCircle size={14} /></button>
              <button onClick={() => handleRemoveFriend(f.userId)} className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500"><UserMinus size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Search
  if (view === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Find People</span>
        </div>
        <div className="px-3 py-2 flex gap-2">
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Search by handle or name..." className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm outline-none" />
          <button onClick={handleSearch} disabled={searching} className="p-2 rounded-xl bg-blue-600 text-white"><Search size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {searchResults.map(u => {
            const isFriend = friends.some(f => f.userId === u.userId);
            return (
              <div key={u.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1e1e2e]">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">{u.displayName?.[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.displayName}</p>
                  <p className="text-[10px] text-gray-400">@{u.handle}</p>
                </div>
                {isFriend ? (
                  <span className="text-[10px] text-emerald-500 font-medium">Friends</span>
                ) : (() => {
                  const s = addedStatus[u.userId];
                  if (s === 'accepted') return <span className="text-[10px] text-emerald-500 font-medium">Friends</span>;
                  if (s === 'sent' || s === 'already_sent') return <span className="text-[10px] text-gray-400 font-medium px-2 py-1">Requested</span>;
                  if (s === 'already_friends') return <span className="text-[10px] text-emerald-500 font-medium">Friends</span>;
                  if (s === 'error') return (
                    <button onClick={() => handleSendRequest(u.userId)} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-600 text-white text-xs">Retry</button>
                  );
                  const pending = s === 'pending';
                  return (
                    <button
                      onClick={() => handleSendRequest(u.userId)}
                      disabled={pending}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs disabled:opacity-60"
                    >
                      <UserPlus size={12} /> {pending ? 'Adding…' : 'Add'}
                    </button>
                  );
                })()}
              </div>
            );
          })}
          {searchResults.length === 0 && searchQuery && !searching && <p className="text-xs text-gray-400 text-center py-4">No results</p>}
        </div>
      </div>
    );
  }

  // New Group
  if (view === 'newGroup') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
          <button onClick={() => setView('home')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">New Group</span>
        </div>
        <div className="p-4 space-y-3">
          <Input label="Group Name" placeholder="e.g., Study Group" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Add Friends</label>
            <div className="space-y-1">
              {friends.map(f => {
                const selected = newGroupMembers.includes(f.userId);
                return (
                  <button key={f.userId} onClick={() => setNewGroupMembers(prev => selected ? prev.filter(id => id !== f.userId) : [...prev, f.userId])} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selected ? 'bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800' : 'hover:bg-gray-50 dark:hover:bg-[#1e1e2e]'}`}>
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-bold text-blue-600">{f.displayName?.[0]?.toUpperCase()}</div>
                    <span className="text-sm text-gray-900 dark:text-white">{f.displayName}</span>
                    {selected && <span className="ml-auto text-blue-500 text-xs">Added</span>}
                  </button>
                );
              })}
              {friends.length === 0 && <p className="text-xs text-gray-400 py-2">Add friends first to create a group</p>}
            </div>
          </div>
          <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>Create Group</Button>
        </div>
      </div>
    );
  }

  // Home view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">{profile.displayName?.[0]?.toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{profile.displayName}</p>
          <p className="text-[10px] text-gray-400">@{profile.handle}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-gray-100 dark:border-[#2A2A40] flex-shrink-0">
        <button onClick={() => setView('friends')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#1e1e2e] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]">
          <Users size={12} /> Friends ({friends.length})
        </button>
        <button onClick={() => setView('search')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#1e1e2e] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]">
          <UserPlus size={12} /> Add People
        </button>
        <button onClick={() => setView('newGroup')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#1e1e2e] text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-[#2A2A40]">
          <Plus size={12} /> New Group
        </button>
      </div>

      {/* Friend Requests */}
      {friendRequests.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-[#2A2A40] flex-shrink-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            <Bell size={10} className="inline mr-1" /> Friend Requests ({friendRequests.length})
          </p>
          {friendRequests.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-[10px] font-bold text-cyan-600">{r.fromProfile?.displayName?.[0]?.toUpperCase() || '?'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{r.fromProfile?.displayName || 'Unknown'}</p>
                <p className="text-[10px] text-gray-400">@{r.fromProfile?.handle}</p>
              </div>
              <button onClick={() => handleAccept(r.id)} className="p-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700"><Check size={12} /></button>
              <button onClick={() => handleDecline(r.id)} className="p-1 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/15"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Conversations + Groups */}
      <div className="flex-1 overflow-y-auto">
        {/* Groups */}
        {groups.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Groups</p>
            {groups.map(g => (
              <button key={g.id} onClick={() => openGroup(g)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center"><Hash size={14} className="text-indigo-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                  <p className="text-[10px] text-gray-400">{g.memberCount} members{g.lastMessage ? ` · ${g.lastMessage.content?.slice(0, 30)}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* DMs */}
        <div className="px-4 pt-3 pb-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Messages</p>
          {conversations.length === 0 && friends.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">Search for people to start chatting!</p>}
          {conversations.length === 0 && friends.length > 0 && <p className="text-xs text-gray-400 py-2 text-center">Tap a friend to start a conversation</p>}
          {conversations.map(c => (
            <button key={c.peerId} onClick={() => openDM(c.peer)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">{c.peer.displayName?.[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.peer.displayName}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.lastMessage?.content?.slice(0, 40)}</p>
              </div>
              <span className="text-[9px] text-gray-400 flex-shrink-0">{c.lastMessage ? new Date(c.lastMessage.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>
            </button>
          ))}

          {/* Quick DM from friends who don't have convos yet */}
          {friends.filter(f => !conversations.some(c => c.peerId === f.userId)).map(f => (
            <button key={f.userId} onClick={() => openDM(f)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-[#1e1e2e] transition-colors">
              <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500">{f.displayName?.[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{f.displayName}</p>
                <p className="text-[10px] text-gray-300 dark:text-gray-600">Start a conversation</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
