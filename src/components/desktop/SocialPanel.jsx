import { useEffect, useRef, useState } from 'react';
import { X, Search, Check, UserPlus, MessageCircle, Users } from 'lucide-react';
import {
  listDMs, getDM, sendDM, getFriendRequests, getFriends, searchUsers,
  acceptFriendRequest, declineFriendRequest, sendFriendRequest, getMyProfile,
} from '../../api/social';

// SocialPanel — menu-bar dropdown for the Social experience.
//
// Anchored to the bell icon in MenuBar. Single click on the bell
// opens it; clicking the bell again, clicking outside the panel, or
// hitting Escape closes it. There is intentionally no "expand to
// full window" affordance — Social lives only in the menu bar
// dropdown per the user's spec.
//
// Layout (top → bottom):
//   • Compact header with the user's @handle
//   • Friend requests (if any) with Accept / Decline
//   • Search-by-handle box (debounced, results inline)
//   • Friends list with quick-DM
//   • Active DM thread (when one is selected) — composer at the
//     bottom of the panel
//
// We intentionally don't surface group chats here — they need more
// canvas than a popover can provide. The bell is for friend
// requests and 1:1 DMs.
export default function SocialPanel({ open, onClose, anchorRect }) {
  const panelRef = useRef(null);
  const [profile, setProfile] = useState(null);

  // Lists
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [conversations, setConversations] = useState([]);

  // Search
  const [q, setQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Active DM
  const [chatPeer, setChatPeer] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const pollRef = useRef(null);

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    function onClick(e) { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); }
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClick);
    };
  }, [open, onClose]);

  // Load lists when the panel opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [pRes, frRes, fRes, dmRes] = await Promise.allSettled([
          getMyProfile(), getFriendRequests(), getFriends(), listDMs(),
        ]);
        if (cancelled) return;
        if (pRes.status === 'fulfilled') setProfile(pRes.value?.profile || null);
        if (frRes.status === 'fulfilled') setRequests(frRes.value?.requests || []);
        if (fRes.status === 'fulfilled') setFriends(fRes.value?.friends || []);
        if (dmRes.status === 'fulfilled') setConversations(dmRes.value?.conversations || []);
      } catch {/* soft fail */}
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Debounced search by handle.
  useEffect(() => {
    if (!q.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const data = await searchUsers(q.trim());
        setSearchResults(data?.users || []);
      } catch { setSearchResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Poll the active chat every 3s — same cadence as the full Social app.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!chatPeer) return;
    async function tick() {
      try { const d = await getDM(chatPeer.userId); setChatMessages(d?.messages || []); }
      catch {/* */}
    }
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [chatPeer]);

  // ─────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────
  async function accept(req) {
    try {
      await acceptFriendRequest(req.id);
      setRequests((r) => r.filter((x) => x.id !== req.id));
      const f = await getFriends();
      setFriends(f?.friends || []);
    } catch {/* */}
  }
  async function decline(req) {
    try {
      await declineFriendRequest(req.id);
      setRequests((r) => r.filter((x) => x.id !== req.id));
    } catch {/* */}
  }
  async function add(user) {
    try {
      await sendFriendRequest(user.userId || user.id);
      setQ('');
      setSearchResults([]);
    } catch {/* */}
  }
  async function send() {
    const t = draft.trim();
    if (!t || !chatPeer) return;
    setDraft('');
    try {
      await sendDM(chatPeer.userId, t);
      const d = await getDM(chatPeer.userId);
      setChatMessages(d?.messages || []);
    } catch {/* */}
  }

  if (!open) return null;

  // Anchor the panel below the bell. Falls back to top-right of the
  // viewport if no rect was supplied.
  const top = (anchorRect?.bottom ?? 28) + 6;
  const right = Math.max(8, window.innerWidth - (anchorRect?.right ?? window.innerWidth - 8));

  return (
    <div
      ref={panelRef}
      className="fixed z-[1300] w-[340px] max-h-[70vh] flex flex-col rounded-2xl overflow-hidden text-[12.5px] text-gray-200"
      style={{
        top, right,
        background: 'rgba(20, 20, 28, 0.55)',
        backdropFilter: 'blur(48px) saturate(2)',
        WebkitBackdropFilter: 'blur(48px) saturate(2)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.55), 0 8px 20px -8px rgba(0,0,0,0.40)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        <Users size={14} className="text-gray-400" />
        <span className="font-semibold text-gray-100">Social</span>
        {profile?.handle && (
          <span className="text-[11px] text-gray-500">@{profile.handle}</span>
        )}
        <span className="flex-1" />
        <button onClick={onClose} className="text-gray-500 hover:text-gray-200" aria-label="Close">
          <X size={13} />
        </button>
      </div>

      {/* Active DM view replaces the list while a peer is selected. */}
      {chatPeer ? (
        <DmView
          peer={chatPeer}
          messages={chatMessages}
          onBack={() => setChatPeer(null)}
          draft={draft}
          setDraft={setDraft}
          send={send}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Friend requests */}
          {requests.length > 0 && (
            <Section label="Friend requests">
              {requests.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <Avatar name={r.fromDisplayName || r.fromHandle} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-gray-100 truncate">{r.fromDisplayName || r.fromHandle}</p>
                    <p className="text-[10.5px] text-gray-500 truncate">@{r.fromHandle}</p>
                  </div>
                  <button onClick={() => accept(r)} className="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10.5px] font-semibold">
                    Accept
                  </button>
                  <button onClick={() => decline(r)} className="text-gray-500 hover:text-rose-400 px-1.5">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </Section>
          )}

          {/* Search by handle */}
          <Section label="Find people">
            <div className="px-3 py-1.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <Search size={12} className="text-gray-300 shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by handle or name"
                  className="flex-1 bg-transparent text-[12.5px] text-gray-100 placeholder-gray-300 outline-none"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {searchResults.slice(0, 6).map((u) => (
                    <div key={u.userId || u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/[0.04]">
                      <Avatar name={u.displayName || u.handle} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-gray-100 truncate">{u.displayName || u.handle}</p>
                        <p className="text-[10.5px] text-gray-500 truncate">@{u.handle}</p>
                      </div>
                      <button onClick={() => add(u)} className="text-gray-400 hover:text-emerald-400" title="Send friend request">
                        <UserPlus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Friends with quick-DM */}
          {friends.length > 0 && (
            <Section label="Friends">
              {friends.map((f) => {
                const conv = conversations.find((c) => c.userId === (f.userId || f.id));
                const lastSnippet = conv?.lastMessage?.content?.slice(0, 32) || '';
                return (
                  <button
                    key={f.userId || f.id}
                    onClick={() => setChatPeer(f)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] text-left"
                  >
                    <Avatar name={f.displayName || f.handle} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-gray-100 truncate">{f.displayName || f.handle}</p>
                      <p className="text-[10.5px] text-gray-500 truncate">{lastSnippet || `@${f.handle}`}</p>
                    </div>
                    {conv?.unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                    <MessageCircle size={12} className="text-gray-500 shrink-0" />
                  </button>
                );
              })}
            </Section>
          )}

          {/* Empty state */}
          {requests.length === 0 && friends.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Users size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-[12px] text-gray-100">No friends yet.</p>
              <p className="text-[10.5px] text-gray-300 mt-0.5">Search above to connect with someone.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div className="border-b border-white/[0.04] last:border-b-0">
      <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">{label}</p>
      <div className="pb-1.5">{children}</div>
    </div>
  );
}

function Avatar({ name }) {
  const init = String(name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 grid place-items-center text-[11px] font-bold text-white shrink-0 border border-white/10">
      {init}
    </div>
  );
}

function DmView({ peer, messages, onBack, draft, setDraft, send }) {
  const scrollerRef = useRef(null);
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-200">
          <X size={12} />
        </button>
        <Avatar name={peer.displayName || peer.handle} />
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-medium text-gray-100 truncate">{peer.displayName || peer.handle}</p>
          <p className="text-[10.5px] text-gray-500 truncate">@{peer.handle}</p>
        </div>
      </div>
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5 max-h-[300px]">
        {messages.length === 0 && (
          <p className="text-[11px] text-gray-500 text-center py-4">No messages yet. Say hi.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.from === m.myId || m.fromMe;
          return (
            <div key={m.id || i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] px-2.5 py-1.5 rounded-2xl text-[12px] ${mine ? 'bg-blue-600 text-white' : 'bg-white/[0.06] text-gray-100'}`}>
                {m.content}
              </div>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06]"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5 text-[12px] text-gray-100 placeholder-gray-500 outline-none"
        />
        <button type="submit" disabled={!draft.trim()} className="px-2.5 py-1.5 rounded-lg border border-white/[0.12] disabled:opacity-40 text-gray-100 text-[11px] font-semibold transition-colors" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}>
          Send
        </button>
      </form>
    </div>
  );
}
