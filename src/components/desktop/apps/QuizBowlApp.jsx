import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Zap, Play, RotateCcw, Check, X, ArrowLeft, Loader2, Users, UserPlus, UserX,
  Crown, Trophy, Mail, LogOut, Plus, ChevronRight, Send, MessageSquare, Clock, XCircle,
} from 'lucide-react';
import { apiFetch } from '../../../api/client';
import {
  createParty, getMyParty, invitePlayer, acceptInvite, declineInvite,
  cancelInvite, leaveParty, disbandParty, kickMember, startGame,
  getGameState, buzz, submitAnswer, advanceQuestion, endGame,
  sendPartyChat,
} from '../../../api/parties';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
const CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];

const SYSTEM_PROMPT = `You are a quiz bowl question writer. Write pyramidal quiz bowl tossup questions.

RULES:
- Each question is a single paragraph that starts with hard clues and progressively gets easier
- The answer should be guessable from the first few clues by experts, but obvious by the end
- Write exactly the number of questions requested
- Output ONLY valid JSON, no markdown

Format:
{"questions":[{"text":"Full question text here, starting with obscure clues and ending with obvious giveaway clues.","answer":"Answer"}]}`;

function generatePrompt(category, difficulty, count, customInstructions) {
  const difficultyGuide = {
    Easy: 'Use well-known facts. Giveaway clue should be very obvious. Target: high school students.',
    Medium: 'Mix of common and uncommon knowledge. Standard college quiz bowl level.',
    Hard: 'Use obscure clues early. Require deep subject expertise. Only the giveaway should be accessible to non-experts.',
    Tournament: 'NAQT/ACF Nationals level. Opening clues should be nearly impossible except for top players. Use extremely obscure references, secondary works, lesser-known facts. Questions should be 5-7 sentences. Even the giveaway should require solid knowledge.',
  };
  return `Generate ${count} pyramidal quiz bowl tossup questions.
Category: ${category}
Difficulty: ${difficulty}
${difficultyGuide[difficulty] || ''}
${customInstructions ? `\nAdditional instructions from the user: ${customInstructions}` : ''}
Each question must be pyramidal (hardest clues first, easiest giveaway last).
Return JSON: {"questions":[{"text":"...","answer":"..."}]}`;
}

// Word-by-word display (solo mode — driven locally)
function useWordReveal(text, speed = 140, active = false) {
  const [wordIndex, setWordIndex] = useState(0);
  const words = text ? text.split(/\s+/) : [];
  const timerRef = useRef(null);

  useEffect(() => {
    setWordIndex(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, [text]);

  useEffect(() => {
    if (!active || !words.length) return;
    timerRef.current = setInterval(() => {
      setWordIndex(prev => {
        if (prev >= words.length - 1) { clearInterval(timerRef.current); return prev; }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [active, words.length, speed]);

  function stop() { if (timerRef.current) clearInterval(timerRef.current); }
  const revealed = words.slice(0, wordIndex + 1).join(' ');
  const done = wordIndex >= words.length - 1;
  return { revealed, done, wordIndex, totalWords: words.length, stop };
}

// ============= SHARED HELPERS =============
function fmtPlayer(p) { return p?.displayName || p?.handle || 'Player'; }

// ============= MULTIPLAYER: Party lobby =============
function PartyLobby({ onStartGame, onJoinLiveGame, currentUserId }) {
  const [party, setParty] = useState(null);
  const [invites, setInvites] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [partyName, setPartyName] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [createError, setCreateError] = useState(null);
  // Let any handler trigger an immediate refresh so the UI reflects
  // their action without waiting for the 1-second poll tick.
  const pokeRef = useRef(() => {});

  // Load party + invites; also poll the game state so non-leaders auto-join
  // the game when the leader starts one.
  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (creatingRef.current) return;
      try {
        const d = await getMyParty();
        if (!alive || creatingRef.current) return;
        setParty(d.party);
        setInvites(d.invites || []);
        setOutgoing(d.outgoingInvites || []);
        if (d.party?.id) {
          try {
            const st = await getGameState(d.party.id);
            if (st.game && st.game.status === 'playing' && onJoinLiveGame) {
              onJoinLiveGame(d.party);
            }
          } catch {}
        }
      } catch {}
    }
    pokeRef.current = refresh;
    refresh();
    setLoading(false);
    const t = setInterval(refresh, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [onJoinLiveGame]);

  // Debounced search across ALL users (not just friends)
  useEffect(() => {
    if (!showInvite) return;
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/social/search?q=${encodeURIComponent(q)}`);
        setSearchResults(d.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery, showInvite]);

  async function handleCreate() {
    // Hard-guard against double clicks / Enter-spamming — re-entry was
    // letting two createParty calls race, so the second would clobber
    // the first and the UI would flash empty.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true); setCreateError(null);
    const nameSnapshot = partyName;
    setPartyName('');
    try {
      const { party: bare } = await createParty(nameSnapshot || '');
      // Fetch the hydrated party + pending invites/outgoing in one go.
      // Retry once if the read is faster than the filesystem write.
      let hydrated = null;
      for (let attempt = 0; attempt < 3 && !hydrated; attempt++) {
        try {
          const d = await getMyParty();
          if (d.party?.id) {
            hydrated = d;
          } else if (attempt < 2) {
            await new Promise(r => setTimeout(r, 100));
          }
        } catch {}
      }
      if (hydrated) {
        setParty(hydrated.party);
        setInvites(hydrated.invites || []);
        setOutgoing(hydrated.outgoingInvites || []);
      } else {
        // Fallback: use the bare create response so the user sees SOMETHING
        setParty({ ...bare, leader: { userId: bare.leaderId }, memberProfiles: [{ userId: bare.leaderId }] });
      }
    } catch (e) {
      setCreateError(e.message || 'Failed to create party');
      setPartyName(nameSnapshot);  // put the name back so the user can retry
    } finally {
      creatingRef.current = false;
      setCreating(false);
      pokeRef.current();
    }
  }

  async function handleInvite(friendUserId) {
    try { await invitePlayer(party.id, friendUserId); } catch (e) { alert(e.message); }
    pokeRef.current();
  }
  async function handleAccept(inviteId) {
    if (party && party.leaderId === currentUserId) {
      if (!confirm(`Accepting this invite will disband your current party "${party.name}". Continue?`)) return;
    }
    await acceptInvite(inviteId);
    pokeRef.current();
  }
  async function handleDecline(inviteId) {
    // Optimistically remove so the invite disappears instantly.
    setInvites(p => p.filter(i => i.id !== inviteId));
    try { await declineInvite(inviteId); } catch {}
    pokeRef.current();
  }
  async function handleLeave() {
    if (!party) return;
    setParty(null);   // optimistic
    try { await leaveParty(party.id); } catch {}
    pokeRef.current();
  }
  async function handleDisband() {
    if (!party) return;
    if (!confirm('Disband the party? Everyone will be kicked out.')) return;
    setParty(null); setOutgoing([]);  // optimistic
    try { await disbandParty(party.id); } catch {}
    pokeRef.current();
  }
  async function handleKick(userId) {
    // Optimistically drop from member list
    setParty(p => p ? { ...p, memberProfiles: (p.memberProfiles || []).filter(m => m.userId !== userId), members: (p.members || []).filter(m => m !== userId) } : p);
    try { await kickMember(party.id, userId); } catch {}
    pokeRef.current();
  }
  async function handleCancelInvite(inviteId) {
    setOutgoing(prev => prev.filter(i => i.id !== inviteId));  // optimistic
    try { await cancelInvite(inviteId); } catch (e) { console.error(e); }
    pokeRef.current();
  }

  const isLeader = party && party.leaderId === currentUserId;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-400" /></div>;

  // === PENDING INVITES (always visible when any exist) ===
  const invitesSection = invites.length > 0 && (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-3 space-y-2">
      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
        <Mail size={12} /> Party requests ({invites.length})
      </p>
      {invites.map(inv => (
        <div key={inv.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{inv.partyName}</p>
            <p className="text-[11px] text-gray-500">from {fmtPlayer(inv.from)}</p>
          </div>
          <button onClick={() => handleAccept(inv.id)} className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-medium">Accept</button>
          <button onClick={() => handleDecline(inv.id)} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-xs text-gray-600 dark:text-gray-300">Decline</button>
        </div>
      ))}
    </div>
  );

  // === NO PARTY YET ===
  if (!party) {
    return (
      <div className="space-y-4">
        {invitesSection}
        <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-5 text-center">
          <Users size={28} className="text-blue-500 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No party yet</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Create a party to play Quiz Bowl with friends.</p>
          <div className="flex gap-2">
            <input
              value={partyName}
              onChange={e => setPartyName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !creating) handleCreate(); }}
              disabled={creating}
              placeholder="Party name (optional)"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none disabled:opacity-60"
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-[11px] text-rose-500">{createError}</p>
          )}
        </div>
      </div>
    );
  }

  // === HAVE A PARTY ===
  return (
    <div className="space-y-4">
      {invitesSection}

      <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Party</p>
            <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">{party.name}</h3>
          </div>
          {isLeader ? (
            <button onClick={handleDisband} title="Disband party" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 dark:border-rose-900/40 transition-colors">
              <XCircle size={12} /> Disband
            </button>
          ) : (
            <button onClick={handleLeave} title="Leave party" className="p-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20"><LogOut size={14} /></button>
          )}
        </div>

        {/* Members */}
        <div className="space-y-1.5 mb-3">
          {(party.memberProfiles || []).map(m => (
            <div key={m.userId} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                {fmtPlayer(m).slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm text-gray-900 dark:text-white flex-1 truncate">{fmtPlayer(m)}</span>
              {m.plan === 'pro' && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 text-white">
                  <Crown size={8} /> PRO
                </span>
              )}
              {party.leaderId === m.userId && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  <Crown size={10} /> LEADER
                </span>
              )}
              {isLeader && party.leaderId !== m.userId && (
                <button onClick={() => handleKick(m.userId)} title="Kick" className="p-1 text-gray-300 hover:text-rose-500"><UserX size={12} /></button>
              )}
            </div>
          ))}
        </div>

        {/* Invite button (leader only) */}
        {isLeader && (party.memberProfiles?.length || 1) < 8 && (
          <button onClick={() => setShowInvite(v => !v)} className="w-full py-2 rounded-lg border border-dashed border-gray-300 dark:border-[#2A2A40] text-xs font-medium text-gray-500 hover:text-blue-600 hover:border-blue-400 flex items-center justify-center gap-1.5">
            <UserPlus size={13} /> Invite a player
          </button>
        )}
        {showInvite && isLeader && (
          <div className="mt-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] p-2 space-y-2">
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by @handle or name…"
              autoFocus
              className="w-full px-2.5 py-1.5 rounded border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-xs outline-none focus:border-blue-400"
            />
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searching && <p className="text-[11px] text-gray-400 text-center py-2">Searching…</p>}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-3">No players match "{searchQuery}".</p>
              )}
              {!searching && !searchQuery.trim() && (
                <p className="text-[11px] text-gray-400 text-center py-3">Type a name or handle to find anyone.</p>
              )}
              {searchResults.map(u => {
                const already = (party.memberProfiles || []).some(m => m.userId === u.userId);
                return (
                  <button
                    key={u.userId}
                    disabled={already}
                    onClick={() => { handleInvite(u.userId); setSearchQuery(''); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-[#1e1e2e]'}`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {(u.displayName || u.handle || '?').slice(0,1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 dark:text-gray-100 truncate">{u.displayName}</p>
                      {u.handle && <p className="text-[10px] text-gray-400 truncate">@{u.handle}</p>}
                    </div>
                    {already ? <span className="text-[10px] text-gray-400">in party</span> : <ChevronRight size={12} className="text-gray-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Outgoing invites (leader view) */}
        {isLeader && outgoing.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Clock size={9} /> Pending invites ({outgoing.length})
            </p>
            {outgoing.map(inv => (
              <div key={inv.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-[#0D0D14] border border-gray-200 dark:border-[#2A2A40]">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                  {fmtPlayer(inv.to)[0]?.toUpperCase()}
                </div>
                <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-200">{fmtPlayer(inv.to)}</span>
                <span className="text-[10px] text-gray-400">waiting</span>
                <button onClick={() => handleCancelInvite(inv.id)} title="Cancel invite" className="p-1 text-gray-400 hover:text-rose-500">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Party chat */}
      <PartyChat party={party} currentUserId={currentUserId} />

      {/* Generating banner — visible to ALL members as soon as leader hits Start Round */}
      {party.generating && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/15 px-4 py-3 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Generating questions…</p>
            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
              {party.generating.count} {party.generating.difficulty} {party.generating.category} tossups · the game starts automatically.
            </p>
          </div>
        </div>
      )}

      {/* Start game CTA — leader only, hide while generating */}
      {isLeader && !party.generating && (
        <button onClick={() => onStartGame(party)} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2">
          <Zap size={16} /> Set Up Quiz Bowl Game
        </button>
      )}
      {!isLeader && !party.generating && (
        <p className="text-xs text-gray-500 text-center py-2">Waiting for the party leader to start a game…</p>
      )}
    </div>
  );
}

// ============= MULTIPLAYER: Lobby chat =============
function PartyChat({ party, currentUserId }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const messages = Array.isArray(party?.chat) ? party.chat : [];
  const memberById = useMemo(() => {
    const m = {};
    for (const p of (party?.memberProfiles || [])) m[p.userId] = p;
    return m;
  }, [party?.memberProfiles]);

  // Space shortcut: focus the chat input from anywhere in the lobby,
  // unless focus is already on an input / textarea.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== ' ') return;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto-scroll as new messages appear
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try { await sendPartyChat(party.id, body); setText(''); }
    catch (e) { console.error(e); }
    setSending(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-[#2A2A40]">
        <MessageSquare size={12} className="text-blue-500" />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Party chat</span>
        <span className="ml-auto text-[10px] text-gray-400">Press Space to type</span>
      </div>
      <div ref={scrollRef} className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
        {messages.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-3">No messages yet. Say hi!</p>
        )}
        {messages.map(m => {
          const mine = m.userId === currentUserId;
          const profile = memberById[m.userId];
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-xs ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-800 dark:text-gray-100'}`}>
                {!mine && (
                  <p className="text-[10px] font-semibold opacity-80 mb-0.5">{fmtPlayer(profile) || 'Player'}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 p-2 border-t border-gray-200 dark:border-[#2A2A40]">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          placeholder="Message the party…"
          maxLength={500}
          className="flex-1 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#0D0D14] border border-gray-200 dark:border-[#2A2A40] text-xs text-gray-900 dark:text-gray-100 outline-none"
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className={`p-1.5 rounded-lg flex-shrink-0 ${text.trim() && !sending ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 dark:bg-[#2A2A40] text-gray-400 cursor-not-allowed'}`}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}

// ============= MULTIPLAYER: Live synced game =============
function MultiplayerGame({ party, onExit, currentUserId }) {
  const [state, setState] = useState(null);
  const [serverOffset, setServerOffset] = useState(0); // localTime - serverTime
  const [answer, setAnswer] = useState('');
  const [tab, setTab] = useState('game'); // 'game' | 'leaderboard'
  const pollRef = useRef(null);

  // Poll state every 300ms. pokeRef lets action handlers trigger an
  // immediate poll so the UI reflects their action without waiting for
  // the next 300ms tick (that was the felt lag on every button click).
  const pokeRef = useRef(() => {});
  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const sent = Date.now();
        const d = await getGameState(party.id);
        if (!alive) return;
        setState(d);
        setServerOffset(Math.floor((sent + Date.now()) / 2) - d.serverNow);
      } catch {}
    }
    pokeRef.current = poll;
    poll();
    pollRef.current = setInterval(poll, 300);
    return () => { alive = false; clearInterval(pollRef.current); };
  }, [party.id]);

  const g = state?.game;
  const isLeader = state?.party?.leaderId === currentUserId;
  const members = state?.party?.memberProfiles || [];
  const profileFor = id => members.find(m => m.userId === id);

  // ----- Local-clock word reveal synced to server questionStartedAt -----
  const [wordIndex, setWordIndex] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  useEffect(() => {
    if (!g) return;
    const q = g.questions?.[g.currentQ];
    if (!q) return;
    const words = q.text.split(/\s+/).length;
    setTotalWords(words);

    // Resolved → jump to end of text
    if (g.questionResolved) { setWordIndex(Math.max(words - 1, 0)); return; }

    // Someone buzzed → freeze the reveal at the word they buzzed on
    if (g.buzzedBy) {
      const frozen = typeof g.buzzedWord === 'number' ? Math.min(words - 1, Math.max(0, g.buzzedWord)) : 0;
      setWordIndex(frozen);
      return;
    }

    const speed = g.revealSpeedMs || 140;
    function tick() {
      const elapsed = Date.now() - serverOffset - g.questionStartedAt;
      const w = Math.min(words - 1, Math.max(0, Math.floor(elapsed / speed)));
      setWordIndex(w);
    }
    tick();
    const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [g?.currentQ, g?.questionStartedAt, g?.questionResolved, g?.revealSpeedMs, g?.buzzedBy, g?.buzzedWord, serverOffset]);

  if (!g) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-5">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <p className="text-sm text-gray-500">Loading game…</p>
        <button onClick={onExit} className="text-xs text-gray-400 hover:text-gray-600">Back</button>
      </div>
    );
  }

  if (g.status === 'finished') {
    const ranked = members.map(m => ({ ...m, score: g.scores[m.userId] || 0 })).sort((a, b) => b.score - a.score);
    const winner = ranked[0];
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <div className="text-center mb-6">
          <Trophy size={40} className="text-amber-500 mx-auto mb-2" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Game Over</h2>
          <p className="text-sm text-gray-500 mt-1">{winner ? `${fmtPlayer(winner)} wins with ${winner.score} pts` : ''}</p>
        </div>
        <div className="space-y-2 max-w-sm mx-auto mb-6">
          {ranked.map((r, i) => (
            <div key={r.userId} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/15 dark:border-amber-700' : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]'}`}>
              <span className={`w-6 text-center text-sm font-bold ${i === 0 ? 'text-amber-600' : 'text-gray-400'}`}>#{i + 1}</span>
              <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{fmtPlayer(r)}</span>
              <span className="text-lg font-bold text-blue-600">{r.score}</span>
            </div>
          ))}
        </div>
        <button
          onClick={async () => {
            // Leader clears the server game so the next "Start Round" begins clean.
            if (isLeader) { try { await endGame(party.id); } catch {} }
            onExit();
          }}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const question = g.questions[g.currentQ] || { text: '' };
  const words = question.text.split(/\s+/);
  const revealed = words.slice(0, wordIndex + 1).join(' ');
  const iBuzzed = g.buzzedBy === currentUserId;
  const someoneBuzzed = !!g.buzzedBy && !g.questionResolved;
  const lockedOut = (g.answeredBy?.[g.currentQ] || []).includes(currentUserId);

  async function handleBuzz() {
    if (someoneBuzzed || g.questionResolved || lockedOut) return;
    try { await buzz(party.id); } catch {}
    pokeRef.current();  // refresh immediately; don't wait for 300ms poll
  }
  async function handleSubmit() {
    if (!answer.trim() || !iBuzzed) return;
    const snapshot = answer;
    setAnswer('');
    try { await submitAnswer(party.id, snapshot); } catch { setAnswer(snapshot); }
    pokeRef.current();
  }
  async function handleAdvance() {
    try { await advanceQuestion(party.id); } catch {}
    pokeRef.current();
  }
  async function handleEnd() {
    if (!confirm('End this game early?')) return;
    await endGame(party.id); onExit();
  }

  const ranked = members.map(m => ({ ...m, score: g.scores[m.userId] || 0 })).sort((a, b) => b.score - a.score);
  const myScore = g.scores[currentUserId] || 0;
  const highest = ranked[0]?.score || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
        <Zap size={16} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Q{g.currentQ + 1}/{g.count}</span>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs text-gray-400">{g.category} / {g.difficulty}</span>
        <div className="flex-1" />
        <span className={`text-xs font-bold ${myScore === highest && highest > 0 ? 'text-amber-500' : 'text-blue-500'}`}>{myScore} pts</span>
        {isLeader && <button onClick={handleEnd} title="End game" className="text-gray-400 hover:text-rose-500 p-1"><X size={14} /></button>}
      </div>

      {/* Sub-tabs — underline is a separate div so per-OS rounded-button rules can't curve it */}
      <div className="flex border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0 relative">
        {[
          { key: 'game', label: 'Game' },
          { key: 'leaderboard', label: `Leaderboard (${members.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ borderRadius: 0 }}
            className={`flex-1 py-2 text-xs font-medium relative ${tab === t.key ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {tab === t.key && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-blue-600" />}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {ranked.map((r, i) => (
            <div key={r.userId} className={`flex items-center gap-3 p-3 rounded-xl border ${r.userId === currentUserId ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/15 dark:border-blue-700' : 'border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]'}`}>
              <span className="w-5 text-center text-xs font-bold text-gray-400">#{i + 1}</span>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
                {fmtPlayer(r).slice(0, 1).toUpperCase()}
              </div>
              <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">
                {fmtPlayer(r)}
                {r.userId === party.leaderId && <Crown size={10} className="inline ml-1 text-amber-500" />}
              </span>
              <span className="text-lg font-bold text-blue-600 tabular-nums">{r.score}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'game' && (
        <>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="min-h-[120px]">
              <p className="text-base leading-relaxed text-gray-900 dark:text-gray-100">
                {revealed}
                {!g.questionResolved && wordIndex < totalWords - 1 && <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />}
              </p>
            </div>

            {/* Who buzzed banner */}
            {someoneBuzzed && !g.questionResolved && (
              <div className={`mt-4 rounded-lg p-3 text-sm font-medium ${iBuzzed ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-700 dark:text-gray-300'}`}>
                {iBuzzed ? 'You buzzed! Type your answer.' : `${fmtPlayer(profileFor(g.buzzedBy))} buzzed first…`}
              </div>
            )}

            {/* Reveal after resolve */}
            {g.questionResolved && (
              <div className={`mt-4 rounded-lg p-3 border-2 ${g.lastAnswer?.correct ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/15' : 'border-rose-500 bg-rose-50 dark:bg-rose-900/15'}`}>
                <p className={`text-sm font-bold ${g.lastAnswer?.correct ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {g.lastAnswer?.correct ? `${fmtPlayer(profileFor(g.lastAnswer.userId))} got it +1` : g.lastAnswer?.userId ? `${fmtPlayer(profileFor(g.lastAnswer.userId))} got it wrong` : 'No one got it'}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Answer: <strong>{g.questions[g.currentQ]?.answer}</strong></p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-2">
            {/* Not yet buzzed, question live, not locked out */}
            {!someoneBuzzed && !g.questionResolved && !lockedOut && (
              <>
                <button onClick={handleBuzz} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wider active:scale-95 transition-transform">BUZZ</button>
                <p className="text-[10px] text-gray-400 text-center">Press SPACE to buzz</p>
              </>
            )}

            {lockedOut && !g.questionResolved && (
              <div className="text-center py-3 text-xs text-gray-500">You answered wrong — locked out this question.</div>
            )}

            {/* I have the buzz */}
            {iBuzzed && !g.questionResolved && (
              <div className="flex gap-2">
                <input
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="Type your answer..."
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none"
                />
                <button onClick={handleSubmit} disabled={!answer.trim()} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Submit</button>
              </div>
            )}

            {/* Someone else buzzed — wait */}
            {someoneBuzzed && !iBuzzed && !g.questionResolved && (
              <div className="text-center py-3 text-xs text-gray-500">Waiting for {fmtPlayer(profileFor(g.buzzedBy))}…</div>
            )}

            {/* Resolved — leader advances */}
            {g.questionResolved && (
              isLeader ? (
                <button onClick={handleAdvance} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium">
                  {g.currentQ < g.count - 1 ? 'Next Question' : 'See Results'}
                </button>
              ) : (
                <div className="text-center py-3 text-xs text-gray-500">Waiting for leader to advance…</div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============= MULTIPLAYER: Game setup (leader sees before starting) =============
function MultiplayerSetup({ party, onCancel, onStarted, category, setCategory, difficulty, setDifficulty, questionCount, setQuestionCount, customInstructions, setCustomInstructions, revealSpeedMs, setRevealSpeedMs }) {
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState(null);
  async function go() {
    setGenerating(true); setErr(null);
    try {
      await startGame(party.id, { category, difficulty, count: questionCount, customInstructions, revealSpeedMs });
      onStarted();
    } catch (e) { setErr(e.message || 'Failed to start'); }
    setGenerating(false);
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-5">
        <button onClick={onCancel} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"><ArrowLeft size={12} /> Back to party</button>
        <div className="text-center">
          <Zap size={28} className="text-amber-500 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Set up multiplayer game</h2>
          <p className="text-xs text-gray-500 mt-1">{party.memberProfiles?.length || 1} player{(party.memberProfiles?.length || 1) === 1 ? '' : 's'} · 1 pt per correct answer</p>
        </div>
        {err && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{err}</p>}
        <Selector label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
        <Selector label="Difficulty" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} grid="grid-cols-4" />
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Questions: {questionCount}</label>
          <input type="range" min="5" max="30" step="5" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Reading speed: {revealSpeedMs}ms/word <span className="text-gray-400">({revealSpeedMs <= 90 ? 'fast' : revealSpeedMs <= 160 ? 'normal' : revealSpeedMs <= 250 ? 'slow' : 'very slow'})</span>
          </label>
          <input type="range" min="60" max="400" step="10" value={revealSpeedMs} onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Custom Instructions (optional)</label>
          <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm resize-none outline-none" />
        </div>
        <button onClick={go} disabled={generating} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Play size={16} /> Start Round</>}
        </button>
      </div>
    </div>
  );
}

function Selector({ label, options, value, onChange, grid = 'flex flex-wrap gap-1.5' }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">{label}</label>
      <div className={grid.startsWith('grid') ? `grid ${grid} gap-2` : grid}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${value === o ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#1e1e2e] text-gray-600 dark:text-gray-300'}`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

// ============= TOP-LEVEL =============
export default function QuizBowlApp() {
  const [mode, setMode] = useState('solo'); // 'solo' | 'multiplayer'
  const [mpView, setMpView] = useState('lobby'); // 'lobby' | 'setup' | 'game'
  const [activeParty, setActiveParty] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [myHandle, setMyHandle] = useState(undefined); // undefined = still loading; null = no handle; string = handle

  // Solo state
  const [view, setView] = useState('setup'); // 'setup' | 'playing' | 'review'
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('Mixed');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [customInstructions, setCustomInstructions] = useState('');
  const [revealSpeedMs, setRevealSpeedMs] = useState(140);
  const [buzzed, setBuzzed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [correct, setCorrect] = useState(null);
  const [scores, setScores] = useState([]);
  const [reading, setReading] = useState(true);

  const q = questions[currentQ];
  const { revealed, done, stop, wordIndex, totalWords } = useWordReveal(q?.text || '', revealSpeedMs, reading && !buzzed && view === 'playing' && mode === 'solo');

  // Get current user id + social handle (required for multiplayer)
  useEffect(() => {
    apiFetch('/api/auth/me').then(d => setCurrentUserId(d?.id || d?.user?.id)).catch(() => {});
    apiFetch('/api/social/profile').then(d => setMyHandle(d?.profile?.handle || null)).catch(() => setMyHandle(null));
  }, []);

  // Auto-advance mp view based on party.game
  useEffect(() => {
    if (mode !== 'multiplayer' || !activeParty) return;
    let alive = true;
    async function tick() {
      try {
        const d = await getGameState(activeParty.id);
        if (!alive) return;
        // Only jump into the game view when an active PLAYING game exists.
        // (A finished game lingering on the server used to drag the leader
        // back into the end screen as soon as they opened Setup.)
        if (d.game?.status === 'playing' && mpView === 'setup') setMpView('game');
        if (!d.game && mpView === 'game') setMpView('lobby');
      } catch {}
    }
    tick();
    const t = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(t); };
  }, [mode, activeParty?.id, mpView]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: generatePrompt(category, difficulty, questionCount, customInstructions) }],
          max_tokens: 8192,
        }),
      });
      const text = result.content?.[0]?.text || '';
      let parsed;
      try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); }
      if (parsed?.questions?.length) {
        setQuestions(parsed.questions);
        setCurrentQ(0); setScores([]); setBuzzed(false); setShowResult(false); setReading(true);
        setView('playing');
      } else setError('Failed to generate questions. Try again.');
    } catch (err) { setError(err.message || 'Generation failed'); }
    setGenerating(false);
  }

  function handleBuzz() {
    if (buzzed || !reading) return;
    setBuzzed(true); setReading(false); stop();
  }

  function handleSubmit() {
    if (!answer.trim()) return;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
    const a = norm(answer); const ca = norm(q.answer);
    function lev(s1, s2) {
      const m = s1.length, n = s2.length;
      if (m === 0) return n; if (n === 0) return m;
      const d = Array.from({ length: m + 1 }, (_, i) => [i]);
      for (let j = 1; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (s1[i-1] !== s2[j-1] ? 1 : 0));
      return d[m][n];
    }
    const dist = lev(a, ca);
    const threshold = Math.max(1, Math.floor(ca.length * 0.25));
    const isCorrect = a === ca || ca.includes(a) || a.includes(ca) || dist <= threshold ||
      ca.split(/[\s,]+/).some(w => w.length > 2 && (a.includes(w) || lev(a, w) <= 1)) ||
      a.split(/[\s,]+/).some(w => w.length > 2 && (ca.includes(w) || lev(ca, w) <= 1));
    setCorrect(isCorrect); setShowResult(true);
    setScores(prev => [...prev, { question: currentQ, correct: isCorrect, buzzWord: wordIndex, totalWords, answer: answer.trim(), correctAnswer: q.answer }]);
  }

  function handleTimeout() {
    setScores(prev => [...prev, { question: currentQ, correct: false, buzzWord: -1, totalWords, answer: '', correctAnswer: q.answer }]);
    setShowResult(true); setCorrect(false); setBuzzed(true);
  }

  useEffect(() => {
    if (mode !== 'solo') return;
    if (done && !buzzed && view === 'playing') {
      const t = setTimeout(handleTimeout, 2000);
      return () => clearTimeout(t);
    }
  }, [done, buzzed, view, mode]);

  function nextQuestion() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setBuzzed(false); setShowResult(false); setCorrect(null); setAnswer(''); setReading(true);
    } else setView('review');
  }

  // Solo keyboard (space/enter)
  const justSubmitted = useRef(false);
  useEffect(() => {
    if (view !== 'playing' || mode !== 'solo') return;
    function handleKey(e) {
      if (e.key === ' ' && !buzzed) { e.preventDefault(); handleBuzz(); }
      if (e.key === 'Enter' && buzzed && !showResult) { e.preventDefault(); handleSubmit(); justSubmitted.current = true; }
      else if (e.key === 'Enter' && showResult) {
        if (justSubmitted.current) { justSubmitted.current = false; return; }
        e.preventDefault(); nextQuestion();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, buzzed, showResult, answer, mode]);

  // Multiplayer keyboard (space to buzz)
  useEffect(() => {
    if (mode !== 'multiplayer' || mpView !== 'game') return;
    function onKey(e) {
      if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (activeParty) buzz(activeParty.id).catch(() => {});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, mpView, activeParty]);

  // ====== MULTIPLAYER BRANCH ======
  if (mode === 'multiplayer') {
    // Require a social handle to play multiplayer
    if (myHandle === null) {
      return (
        <div className="flex flex-col h-full">
          <TopTabs mode={mode} onChange={setMode} />
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Users size={40} className="text-blue-500 mb-3" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Set a handle to play multiplayer</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-5">
              You need a public <span className="font-medium">@handle</span> so party members can find and invite you.
              Open the <span className="font-medium">Social</span> app to pick one.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMode('solo')} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] text-sm text-gray-700 dark:text-gray-300">Back to Solo</button>
              <button
                onClick={async () => {
                  try {
                    const d = await apiFetch('/api/social/profile');
                    setMyHandle(d?.profile?.handle || null);
                  } catch {}
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                I set my handle — refresh
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (myHandle === undefined) {
      return (
        <div className="flex flex-col h-full">
          <TopTabs mode={mode} onChange={setMode} />
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full">
        {mpView === 'lobby' && (
          <>
            <TopTabs mode={mode} onChange={setMode} />
            <div className="flex-1 overflow-y-auto p-5">
              <PartyLobby
                currentUserId={currentUserId}
                onStartGame={(party) => { setActiveParty(party); setMpView('setup'); }}
                onJoinLiveGame={(party) => {
                  // Non-host auto-join when leader starts a game
                  setActiveParty(prev => prev?.id === party.id ? prev : party);
                  setMpView('game');
                }}
              />
            </div>
          </>
        )}
        {mpView === 'setup' && activeParty && (
          <MultiplayerSetup
            party={activeParty}
            onCancel={() => setMpView('lobby')}
            onStarted={() => setMpView('game')}
            category={category} setCategory={setCategory}
            difficulty={difficulty} setDifficulty={setDifficulty}
            questionCount={questionCount} setQuestionCount={setQuestionCount}
            customInstructions={customInstructions} setCustomInstructions={setCustomInstructions}
            revealSpeedMs={revealSpeedMs} setRevealSpeedMs={setRevealSpeedMs}
          />
        )}
        {mpView === 'game' && activeParty && (
          <MultiplayerGame
            party={activeParty}
            currentUserId={currentUserId}
            onExit={() => setMpView('lobby')}
          />
        )}
      </div>
    );
  }

  // ====== SOLO — original flow ======
  if (view === 'review') {
    const totalCorrect = scores.filter(s => s.correct).length;
    const earlyBuzzes = scores.filter(s => s.correct && s.buzzWord < s.totalWords * 0.5).length;
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-5">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{totalCorrect}/{questions.length}</h2>
            <p className="text-sm text-gray-500 mt-1">{earlyBuzzes} early buzzes</p>
            <p className="text-xs text-gray-400 mt-0.5">{category} / {difficulty}</p>
          </div>
          <div className="space-y-2 mb-6">
            {scores.map((s, i) => (
              <div key={i} className={`rounded-xl p-3 border ${s.correct ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {s.correct ? <Check size={14} className="text-emerald-500" /> : <X size={14} className="text-rose-500" />}
                  <span className="text-xs font-medium text-gray-900 dark:text-white">Q{i + 1}</span>
                  {s.buzzWord >= 0 && <span className="text-[10px] text-gray-400">Buzzed at word {s.buzzWord + 1}/{s.totalWords}</span>}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">Answer: <strong>{s.correctAnswer}</strong></p>
                {s.answer && !s.correct && <p className="text-[10px] text-gray-400 mt-0.5">You said: {s.answer}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setView('setup'); setQuestions([]); setScores([]); }} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] text-sm font-medium text-gray-700 dark:text-gray-300">New Set</button>
            <button onClick={() => { setCurrentQ(0); setBuzzed(false); setShowResult(false); setReading(true); setScores([]); setAnswer(''); setView('playing'); }} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium">Replay</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'playing' && q) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
          <Zap size={16} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Q{currentQ + 1}/{questions.length}</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{category} / {difficulty}</span>
          <span className={`text-xs font-bold ${scores.filter(s => s.correct).length > 0 ? 'text-emerald-500' : 'text-gray-400'}`}>{scores.filter(s => s.correct).length} pts</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="min-h-[120px]">
            <p className="text-base leading-relaxed text-gray-900 dark:text-gray-100">
              {revealed}
              {reading && !done && <span className="inline-block w-0.5 h-4 bg-blue-500 animate-pulse ml-1 align-middle" />}
            </p>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-[#2A2A40] flex-shrink-0 space-y-2">
          {!buzzed && (
            <>
              <button onClick={handleBuzz} className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold uppercase tracking-wider active:scale-95 transition-transform">BUZZ</button>
              <p className="text-[10px] text-gray-400 text-center">Press SPACE to buzz</p>
            </>
          )}
          {buzzed && !showResult && (
            <div className="flex gap-2">
              <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer..." autoFocus className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm outline-none" />
              <button onClick={handleSubmit} disabled={!answer.trim()} className="px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium disabled:opacity-40">Submit</button>
            </div>
          )}
          {showResult && (
            <>
              <div className={`p-4 rounded-xl text-center ${correct ? 'bg-emerald-500/10 border-2 border-emerald-500' : 'bg-rose-500/10 border-2 border-rose-500'}`}>
                <p className={`text-lg font-bold ${correct ? 'text-emerald-500' : 'text-rose-500'}`}>{correct ? 'CORRECT' : 'WRONG'}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">Answer: <strong>{q.answer}</strong></p>
                {!correct && answer && <p className="text-xs text-gray-400 mt-0.5">You said: {answer}</p>}
              </div>
              <button onClick={nextQuestion} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium">
                {currentQ < questions.length - 1 ? 'Next Question' : 'See Results'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Setup (solo default)
  return (
    <div className="flex flex-col h-full">
      <TopTabs mode={mode} onChange={setMode} />
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          <div className="text-center">
            <Zap size={32} className="text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quiz Bowl</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pyramidal tossups — buzz when you know</p>
          </div>
          {error && <p className="text-xs text-rose-500 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/15">{error}</p>}
          <Selector label="Category" options={CATEGORIES} value={category} onChange={setCategory} />
          <Selector label="Difficulty" options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} grid="grid-cols-4" />
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Questions: {questionCount}</label>
            <input type="range" min="5" max="30" step="5" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
              Reading speed: {revealSpeedMs}ms/word <span className="text-gray-400">({revealSpeedMs <= 90 ? 'fast' : revealSpeedMs <= 160 ? 'normal' : revealSpeedMs <= 250 ? 'slow' : 'very slow'})</span>
            </label>
            <input type="range" min="60" max="400" step="10" value={revealSpeedMs} onChange={e => setRevealSpeedMs(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Custom Instructions (optional)</label>
            <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} placeholder="e.g., Focus on organic chemistry, only 20th century events..." rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#0D0D14] text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none" />
          </div>
          <button onClick={handleGenerate} disabled={generating} className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Play size={16} /> Start Round</>}
          </button>
          {scores.length > 0 && (
            <div className="text-center text-xs text-gray-400">Last round: {scores.filter(s => s.correct).length}/{scores.length} correct</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TopTabs({ mode, onChange }) {
  const items = [
    { key: 'solo', label: 'Solo', Icon: Zap },
    { key: 'multiplayer', label: 'Multiplayer', Icon: Users },
  ];
  return (
    <div className="flex border-b border-gray-200 dark:border-[#2A2A40] flex-shrink-0">
      {items.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{ borderRadius: 0 }}
          className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 relative ${mode === key ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Icon size={12} /> {label}
          {mode === key && <span className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-blue-500" />}
        </button>
      ))}
    </div>
  );
}
