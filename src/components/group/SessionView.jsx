import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Crown, Radio, RotateCw, Square, Users } from 'lucide-react';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';
import { getGroup, advanceSession, endSession, openSessionStream } from '../../api/studyGroups';
import { useAuth } from '../../context/AuthContext';

// SessionView - live group study session (Group Study blueprint).
//
// Opens the SSE stream via StudyGroupApiClient on mount and renders every
// SessionEvent: all participants see the same card and progress position
// (AC-GS-005.3/.4 - server state is authoritative, events fully replace the
// local session state). The stream client auto-reconnects after 2s with
// Last-Event-ID so SessionManager replays the current state (AC-GS-005.5);
// while that happens a reconnecting banner shows.
//
// Only the host gets advance / end controls. The 'end' event renders the
// summary panel (items reviewed + per-participant scores, AC-GS-005.6).
// Mid-session removal or group disband surfaces as a stream error → brief
// notice, then onExit() back to the group screens.
//
// Props (matches the onOpenSession(groupId, session) contract in
// GroupListView/GroupDetailView):
//   groupId  - group id
//   session  - { sessionId, hostId, libraryItemId?, itemTitle?, mode? }
//   onExit   - () => void; navigate back to the group list/detail

export default function SessionView({ groupId, session, onExit }) {
  const { user } = useAuth();
  const isHost = user?.id === session.hostId;

  const [live, setLive] = useState(null); // last SessionEvent state
  const [phase, setPhase] = useState('connecting'); // connecting | live | reconnecting | ended | kicked
  const [exitMessage, setExitMessage] = useState(null);
  const [summaryEvent, setSummaryEvent] = useState(null);
  const [material, setMaterial] = useState(null); // { items, title, type } | 'missing'
  const [members, setMembers] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [ending, setEnding] = useState(false);
  const streamRef = useRef(null);

  // Material + roster come from the group record; the snapshot in the group
  // library is the session's source of truth for card/question content.
  useEffect(() => {
    let cancelled = false;
    getGroup(groupId)
      .then(({ group }) => {
        if (cancelled) return;
        setMembers(group.members || []);
        const entry = (group.library || []).find(l => l.id === session.libraryItemId)
          || (group.library || []).find(l => l.title === session.itemTitle);
        setMaterial(entry ? materialFromSnapshot(entry) : 'missing');
      })
      .catch(() => { if (!cancelled) setMaterial('missing'); });
    return () => { cancelled = true; };
  }, [groupId, session.libraryItemId, session.itemTitle]);

  useEffect(() => {
    const stream = openSessionStream(groupId, session.sessionId, {
      onEvent: (event) => {
        if (event.type === 'end') {
          setSummaryEvent(event);
          setPhase('ended');
          return;
        }
        setLive(event);
        setPhase('live');
      },
      onError: () => {
        // 403/404: removed from the group, group disbanded, or session gone
        setExitMessage('This session is no longer available — your access may have been removed or the session has ended.');
        setPhase('kicked');
      },
      onReconnecting: () => setPhase(p => (p === 'live' ? 'reconnecting' : p)),
    });
    streamRef.current = stream;
    return () => stream.close();
  }, [groupId, session.sessionId]);

  // Hide the previous card's answer whenever the session moves on
  useEffect(() => { setRevealed(false); }, [live?.currentIndex]);

  const nameOf = useMemo(() => {
    const map = new Map(members.map(m => [m.userId, m.name]));
    return (id) => map.get(id) || 'Member';
  }, [members]);

  async function handleAdvance() {
    setAdvancing(true);
    try { await advanceSession(groupId, session.sessionId); } catch { /* event stream stays authoritative */ }
    setAdvancing(false);
  }

  async function handleEnd() {
    if (!window.confirm('End this session for everyone?')) return;
    setEnding(true);
    try { await endSession(groupId, session.sessionId); } catch { /* end event arrives via stream */ }
    setEnding(false);
  }

  // ===== exit / summary screens =====

  if (phase === 'kicked') {
    return (
      <CenterCard>
        <p className="text-sm text-white/70">{exitMessage}</p>
        <Button size="sm" className="mt-4" onClick={onExit}><ArrowLeft size={14} /> Back to groups</Button>
      </CenterCard>
    );
  }

  if (phase === 'ended') {
    const scores = summaryEvent?.scores || {};
    const reviewed = (summaryEvent?.currentIndex ?? 0) + 1;
    return (
      <CenterCard>
        <h3 className="text-base font-bold text-white/90 mb-1">Session complete</h3>
        <p className="text-xs text-white/40 mb-4">
          {session.itemTitle ? `${session.itemTitle} · ` : ''}{reviewed} of {summaryEvent?.totalItems ?? reviewed} items reviewed
        </p>
        {Object.keys(scores).length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-left">
            {Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([uid, score]) => (
              <li key={uid} className="flex items-center justify-between rounded-lg border border-white/[0.08] px-3 py-2">
                <span className="text-sm text-white/80 flex items-center gap-1.5">
                  {uid === session.hostId && <Crown size={12} className="text-amber-400" />}
                  {nameOf(uid)}
                </span>
                <span className="text-sm font-semibold text-white/90">{score}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-white/30">No scores were recorded this session.</p>
        )}
        <Button size="sm" className="mt-5" onClick={onExit}><ArrowLeft size={14} /> Back to groups</Button>
      </CenterCard>
    );
  }

  if (phase === 'connecting' || !live || material === null) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <LoadingSpinner size={24} />
        <p className="text-xs text-white/40">Joining session…</p>
      </div>
    );
  }

  // ===== live session =====

  const items = material === 'missing' ? [] : material.items;
  const current = items[live.currentIndex] || null;
  const progressPct = live.totalItems > 0 ? Math.min(100, ((live.currentIndex + 1) / live.totalItems) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 max-w-2xl mx-auto" data-testid="session-live">
      {/* Header: live badge, title, exit */}
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06]" aria-label="Leave session">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
              <Radio size={11} className="animate-pulse" /> Live
            </span>
            <h2 className="text-sm font-bold text-white/90 truncate">{session.itemTitle || material?.title || 'Study session'}</h2>
          </div>
          <p className="text-[11px] text-white/35">Hosted by {nameOf(session.hostId)}{isHost ? ' (you)' : ''}</p>
        </div>
        {isHost && (
          <Button size="sm" variant="danger" onClick={handleEnd} loading={ending}>
            <Square size={12} /> End session
          </Button>
        )}
      </div>

      {phase === 'reconnecting' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <RotateCw size={13} className="animate-spin" /> Connection lost — reconnecting…
        </div>
      )}

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-[11px] text-white/40 mb-1">
          <span>Item {live.currentIndex + 1} of {live.totalItems}</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Current card / question */}
      <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] px-6 py-8 min-h-[180px] flex flex-col items-center justify-center text-center gap-3">
        {material === 'missing' ? (
          <p className="text-sm italic text-white/35">The session material is no longer in the group library, but the session continues.</p>
        ) : current ? (
          <>
            <div className="text-base text-white/90 whitespace-pre-wrap">{current.front}</div>
            {current.back != null && (
              revealed ? (
                <div className="text-sm text-emerald-300/90 whitespace-pre-wrap border-t border-white/[0.08] pt-3 mt-1 w-full">{current.back}</div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setRevealed(true)}>Reveal answer</Button>
              )
            )}
          </>
        ) : (
          <p className="text-sm italic text-white/35">Waiting for the next item…</p>
        )}
      </div>

      {/* Host advance control — non-hosts never see it */}
      {isHost && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdvance} loading={advancing} disabled={live.currentIndex >= live.totalItems - 1}>
            Next <ArrowRight size={14} />
          </Button>
        </div>
      )}

      {/* Participants */}
      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5 mb-2">
          <Users size={12} /> In session ({live.participantIds.length})
        </h4>
        <ul className="flex flex-wrap gap-1.5">
          {live.participantIds.map(pid => (
            <li key={pid} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.04] px-2.5 py-1 text-xs text-white/70">
              {pid === session.hostId && <Crown size={11} className="text-amber-400" />}
              {nameOf(pid)}{pid === user?.id ? ' (you)' : ''}
              {live.scores?.[pid] != null && <span className="text-white/40">· {live.scores[pid]}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Builds the ordered session items from a GroupLibraryItem snapshot. Index
// alignment with the server: decks → cards array, curricula → lessons in
// unit order, notes → a single item (matches sessionTotalItems in server.js).
// Exported for tests.
export function materialFromSnapshot(entry) {
  const snap = entry.snapshot || {};
  if (entry.itemType === 'flashcardDeck') {
    return {
      title: entry.title,
      type: entry.itemType,
      items: (snap.cards || []).map(c => ({ front: c.front, back: c.back })),
    };
  }
  if (entry.itemType === 'curriculum') {
    const items = [];
    for (const u of snap.units || []) {
      for (const l of u.lessons || []) {
        items.push({ front: l.title || 'Lesson', back: null });
      }
    }
    return { title: entry.title, type: entry.itemType, items };
  }
  return {
    title: entry.title,
    type: entry.itemType,
    items: [{ front: snap.title || entry.title, back: snap.mainNotes || null }],
  };
}

function CenterCard({ children }) {
  return (
    <div className="max-w-md mx-auto rounded-2xl border border-white/[0.10] bg-white/[0.03] px-6 py-8 text-center mt-8">
      {children}
    </div>
  );
}
