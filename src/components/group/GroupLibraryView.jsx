import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, BookOpen, FileText, Layers, Plus, Loader2, Trash2, Play, Library,
} from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { useToast } from '../shared/Toast';
import { useAuth } from '../../context/AuthContext';
import { getGroup, contributeItem, removeContribution, startSession } from '../../api/studyGroups';
import { listNotes } from '../../api/notes';
import { listDecks } from '../../api/flashcards';
import { listCurricula } from '../../api/curriculum';

// GroupLibraryView - the shared library of one study group (Group Study, WO-9):
// browse contributed materials, contribute from the personal library, remove
// contributions, open items in read-only study mode, and start a live session
// pre-selected on an item.
//
// Props:
//   groupId:       string
//   onBack:        () => void - return to the host's previous screen
//   onChanged:     () => void - tell the host the library/session state changed
//   onOpenSession: (groupId, session) => void - hand off to SessionView
//                  (separate WO); session is the POST /sessions response
//
// Group copies are immutable snapshots (Group Study ADR-002): the server
// deep-copies on contribution and exposes no snapshot-update endpoint, so all
// members study read-only. The contributor and Group Admins hold the one
// supported group-copy mutation - removal (AC-GS-004.4/.5); the contributor's
// personal original is never touched.

const TYPE_META = {
  note: { label: 'Note', icon: FileText },
  flashcardDeck: { label: 'Flashcard deck', icon: Layers },
  curriculum: { label: 'Curriculum', icon: BookOpen },
};

// Contributions outlive membership (AC-GS-004.6), so a contributorId may no
// longer resolve against the current roster.
const FORMER_MEMBER = 'Former member';

function itemDetail(item) {
  const snap = item.snapshot || {};
  if (item.itemType === 'flashcardDeck') {
    const n = (snap.cards || []).length;
    return `${n} card${n === 1 ? '' : 's'}`;
  }
  if (item.itemType === 'curriculum') {
    const n = (snap.units || []).reduce((sum, u) => sum + ((u.lessons || []).length), 0);
    return `${n} lesson${n === 1 ? '' : 's'}`;
  }
  return null;
}

export default function GroupLibraryView({ groupId, onBack, onChanged, onOpenSession }) {
  const toast = useToast();
  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showContribute, setShowContribute] = useState(false);
  const [viewing, setViewing] = useState(null); // GroupLibraryItem
  const [removing, setRemoving] = useState(null); // GroupLibraryItem awaiting confirm
  const [removeBusy, setRemoveBusy] = useState(false);
  const [sessionItem, setSessionItem] = useState(null); // GroupLibraryItem for the mode prompt

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

  const library = group?.library || [];
  const isAdmin = !!group && (group.adminIds || []).includes(currentUserId);
  const nameById = useMemo(() => {
    const map = {};
    for (const m of group?.members || []) map[m.userId] = m.name;
    return map;
  }, [group]);
  const contributorName = (id) => nameById[id] || FORMER_MEMBER;
  const canManage = (item) => item.contributorId === currentUserId || isAdmin;
  // Item ids the current user already contributed - the server rejects a
  // duplicate (itemId, contributor) pair with a 409, so the picker disables them.
  const contributedByMe = useMemo(
    () => new Set(library.filter((l) => l.contributorId === currentUserId).map((l) => l.itemId)),
    [library, currentUserId],
  );

  async function confirmRemove() {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    try {
      await removeContribution(groupId, removing.id);
      toast.success(`Removed “${removing.title}” from the group library.`);
      setViewing((v) => (v && v.id === removing.id ? null : v));
      setRemoving(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Could not remove the item.');
      setRemoving(null);
      // Self-heal a stale row (e.g. someone else already removed the entry).
      await load();
    } finally {
      setRemoveBusy(false);
    }
  }

  function handleContributed(item) {
    toast.success(`Added “${item.title}” to the group library.`);
    load();
    onChanged?.();
  }

  function handleSessionStarted(session) {
    setSessionItem(null);
    toast.success(`Session started — you’re the host.`);
    onChanged?.();
    onOpenSession?.(groupId, session);
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
          <ArrowLeft size={13} /> Back
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
          <ArrowLeft size={13} /> {group.name}
        </button>
      </div>

      <div className="shrink-0 mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold text-white/90 inline-flex items-center gap-2">
            <Library size={17} className="text-white/55" /> Group Library
          </h2>
          <p className="text-[11.5px] text-white/35 mt-1">
            {library.length === 0
              ? 'Shared materials for everyone in the group.'
              : `${library.length} item${library.length === 1 ? '' : 's'} · contributed copies stay independent of personal originals`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowContribute(true)}>
          <Plus size={14} /> Contribute
        </Button>
      </div>

      {/* Library list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {library.length === 0 ? (
          // Empty state (AC-GS-004.2)
          <div className="text-center py-10">
            <Library size={28} className="text-white/15 mx-auto mb-2" />
            <p className="text-[13px] text-white/45">No materials have been contributed yet.</p>
            <p className="text-[12px] text-white/30 mt-0.5 mb-4">Add a note, flashcard deck, or curriculum from your library to get the group started.</p>
            <Button size="sm" variant="secondary" onClick={() => setShowContribute(true)}>
              <Plus size={14} /> Contribute the first item
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {library.map((item) => {
              const meta = TYPE_META[item.itemType] || TYPE_META.note;
              const Icon = meta.icon;
              const detail = itemDetail(item);
              return (
                <div
                  key={item.id}
                  onClick={() => setViewing(item)}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.18] hover:bg-white/[0.07] px-3.5 py-2.5 cursor-pointer transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-white/55" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-white/85 truncate">{item.title}</p>
                    {/* Contributor name, item type, and date (AC-GS-004.1) */}
                    <p className="text-[11.5px] text-white/40 truncate">
                      {meta.label}{detail ? ` · ${detail}` : ''} · {contributorName(item.contributorId)} · {new Date(item.contributedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSessionItem(item); }}
                    title="Start a group session with this material"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 text-[10.5px] font-bold hover:bg-emerald-500/25 transition-colors"
                  >
                    <Play size={11} /> Start session
                  </button>
                  {canManage(item) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRemoving(item); }}
                      title="Remove from group library"
                      className="p-1.5 rounded-md text-white/30 hover:text-rose-400 hover:bg-white/[0.06] transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contribute picker */}
      {showContribute && (
        <ContributePicker
          groupId={groupId}
          contributedItemIds={contributedByMe}
          onClose={() => setShowContribute(false)}
          onContributed={handleContributed}
        />
      )}

      {/* Read-only study viewer */}
      {viewing && (
        <LibraryItemViewer
          item={viewing}
          contributorName={contributorName(viewing.contributorId)}
          canManage={canManage(viewing)}
          onClose={() => setViewing(null)}
          onRemove={() => setRemoving(viewing)}
        />
      )}

      {/* Remove confirmation (AC-GS-004.5) */}
      {removing && (
        <Modal open onClose={() => !removeBusy && setRemoving(null)} title="Remove from group library" size="sm">
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-white/70">
              Remove <span className="font-semibold text-white/90">“{removing.title}”</span> from the group library?
              {removing.contributorId === currentUserId
                ? ' Your personal copy is not affected.'
                : ` ${contributorName(removing.contributorId)}’s personal copy is not affected.`}
            </p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <Button variant="ghost" size="sm" onClick={() => setRemoving(null)} disabled={removeBusy}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={confirmRemove} loading={removeBusy}>Remove</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Session mode prompt (AC-GS-005.1) */}
      {sessionItem && (
        <StartSessionModal
          groupId={groupId}
          item={sessionItem}
          onClose={() => setSessionItem(null)}
          onStarted={handleSessionStarted}
        />
      )}
    </div>
  );
}

// Read-only study mode for a contributed snapshot (AC-GS-004.4). Renders the
// group copy directly from `item.snapshot` - no fetch, no editable fields.
// Managers (contributor / Group Admin) get the remove action; the snapshot
// itself is immutable by design (ADR-002).
function LibraryItemViewer({ item, contributorName, canManage, onClose, onRemove }) {
  const meta = TYPE_META[item.itemType] || TYPE_META.note;
  const Icon = meta.icon;
  const snap = item.snapshot || {};

  return (
    <Modal open onClose={onClose} title={item.title} size="lg">
      <div className="flex flex-col gap-4">
        {/* Header strip: type, contributor, date, access level */}
        <div className="flex items-center gap-2 text-[11.5px] text-white/50 flex-wrap">
          <Icon size={14} />
          <span>{meta.label}</span>
          <span aria-hidden>·</span>
          <span>Contributed by {contributorName}</span>
          <span aria-hidden>·</span>
          <span>{new Date(item.contributedAt).toLocaleDateString()}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${canManage ? 'bg-emerald-500/15 text-emerald-400' : 'bg-sky-500/15 text-sky-400'}`}>
            {canManage ? 'Manage' : 'View only'}
          </span>
        </div>

        <ViewerBody itemType={item.itemType} snap={snap} />

        <div className="flex items-center justify-between gap-2 pt-1">
          {canManage ? (
            <button
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/[0.10] transition-colors"
            >
              <Trash2 size={13} /> Remove from library
            </button>
          ) : <span />}
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function ViewerSection({ label, children }) {
  return (
    <div>
      {label && <div className="text-[11px] font-semibold uppercase tracking-wider text-white/30 mb-1">{label}</div>}
      <div className="text-[13px] text-white/80">{children}</div>
    </div>
  );
}

function ViewerBody({ itemType, snap }) {
  if (itemType === 'note') {
    return (
      <div className="flex flex-col gap-3">
        {snap.type === 'cornell' && (snap.cues || []).length > 0 && (
          <ViewerSection label="Cues">
            <ul className="list-disc pl-5 space-y-0.5">
              {snap.cues.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </ViewerSection>
        )}
        <ViewerSection label={snap.type === 'cornell' ? 'Notes' : null}>
          <div className="whitespace-pre-wrap">{snap.mainNotes || <span className="italic opacity-60">This note is empty.</span>}</div>
        </ViewerSection>
        {snap.summary && (
          <ViewerSection label="Summary">
            <div className="whitespace-pre-wrap">{snap.summary}</div>
          </ViewerSection>
        )}
      </div>
    );
  }

  if (itemType === 'flashcardDeck') {
    const cards = snap.cards || [];
    return cards.length === 0 ? (
      <div className="text-[13px] italic text-white/30 py-4 text-center">This deck has no cards.</div>
    ) : (
      <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
        {cards.map((c, i) => (
          <li key={c.id || i} className="rounded-lg border border-white/[0.08] px-3 py-2 text-[13px]">
            <div className="font-medium text-white/90">{c.front}</div>
            <div className="text-white/50 mt-0.5">{c.back}</div>
          </li>
        ))}
      </ul>
    );
  }

  // curriculum - unit/lesson outline
  const units = snap.units || [];
  return (
    <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
      {snap.description && <div className="text-[12px] text-white/40">{snap.description}</div>}
      {units.length === 0 ? (
        <div className="text-[13px] italic text-white/30 py-4 text-center">This curriculum has no units.</div>
      ) : units.map((u, i) => (
        <div key={u.id || i} className="rounded-lg border border-white/[0.08] px-3 py-2">
          <div className="text-[13px] font-semibold text-white/90">{u.title || `Unit ${i + 1}`}</div>
          {(u.lessons || []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {u.lessons.map((l, j) => (
                <li key={l.id || j} className="text-[11.5px] text-white/50">• {l.title || `Lesson ${j + 1}`}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

const PICKER_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'flashcardDeck', label: 'Decks' },
  { value: 'curriculum', label: 'Curricula' },
];

// Personal library picker (AC-GS-004.3). Stays open after a contribution so
// several items can be added in one sitting; rows the user already contributed
// flip to an "In library" tag (the server 409s duplicates).
function ContributePicker({ groupId, contributedItemIds, onClose, onContributed }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [pickError, setPickError] = useState(null);
  // Ids contributed from this picker session: flips rows to "In library"
  // immediately, before the parent's group re-fetch lands.
  const [addedIds, setAddedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, d, c] = await Promise.all([listNotes(), listDecks(), listCurricula()]);
        if (cancelled) return;
        setItems([
          ...(n.notes || []).map((x) => ({
            id: x.id, itemType: 'note', title: x.title || 'Untitled',
            detail: x.type === 'cornell' ? 'Cornell note' : 'Note',
          })),
          ...(d.decks || []).map((x) => ({
            id: x.id, itemType: 'flashcardDeck', title: x.title || 'Untitled',
            detail: `${x.cardCount ?? 0} card${(x.cardCount ?? 0) === 1 ? '' : 's'}`,
          })),
          ...(c.curricula || []).map((x) => ({
            id: x.id, itemType: 'curriculum', title: x.title || 'Untitled',
            detail: `${x.totalLessons ?? 0} lesson${(x.totalLessons ?? 0) === 1 ? '' : 's'}`,
          })),
        ]);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = (items || []).filter((it) => filter === 'all' || it.itemType === filter);

  async function handlePick(it) {
    if (busyId) return;
    setBusyId(it.id);
    setPickError(null);
    try {
      await contributeItem(groupId, it.id, it.itemType);
      setAddedIds((prev) => new Set(prev).add(it.id));
      onContributed(it);
    } catch (e) {
      setPickError(e.message || 'Could not contribute this item.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open onClose={() => !busyId && onClose()} title="Contribute from your library" size="md">
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-white/45">
          The group gets its own copy — later edits to your original won’t change it.
        </p>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          {PICKER_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold transition-colors ${
                filter === f.value ? 'bg-blue-500/20 text-blue-200' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-white/40">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : error ? (
          <p className="text-[12.5px] text-rose-400 py-4 text-center">{error}</p>
        ) : visible.length === 0 ? (
          <p className="text-[12.5px] text-white/35 py-6 text-center">
            {filter === 'all' ? 'Your library is empty — create a note, deck, or curriculum first.' : 'Nothing of this type in your library.'}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
            {visible.map((it) => {
              const meta = TYPE_META[it.itemType] || TYPE_META.note;
              const Icon = meta.icon;
              const already = contributedItemIds.has(it.id) || addedIds.has(it.id);
              return (
                <div key={`${it.itemType}:${it.id}`} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-white/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white/85 truncate">{it.title}</p>
                    <p className="text-[11px] text-white/40 truncate">{it.detail}</p>
                  </div>
                  {already ? (
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-white/30 px-2">In library</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => handlePick(it)} loading={busyId === it.id}>
                      <Plus size={12} /> Add
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {pickError && <p className="text-[12px] text-rose-400">{pickError}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={!!busyId}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

// Session mode prompt (AC-GS-005.1): the material is pre-selected by the row's
// Start-session button; the caller becomes Session Host server-side. Mode
// semantics are rendered by SessionView (separate WO); the server stores the
// string and sizes the session from the snapshot.
function StartSessionModal({ groupId, item, onClose, onStarted }) {
  const isDeck = item.itemType === 'flashcardDeck';
  const modes = [
    ...(isDeck ? [{ value: 'flashcards', label: 'Flashcard review', desc: 'Flip through the cards together, host advances' }] : []),
    { value: 'quiz', label: 'Quiz', desc: 'Question-and-answer round with scores' },
  ];
  const [mode, setMode] = useState(modes[0].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const meta = TYPE_META[item.itemType] || TYPE_META.note;
  const Icon = meta.icon;
  const detail = itemDetail(item);

  async function handleStart() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { session } = await startSession(groupId, item.id, mode);
      onStarted(session);
    } catch (e) {
      setError(e.message || 'Could not start the session.');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Start a group session" size="sm">
      <div className="flex flex-col gap-3">
        {/* Pre-selected material */}
        <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <Icon size={15} className="text-white/50 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white/85 truncate">{item.title}</p>
            <p className="text-[11px] text-white/40">{meta.label}{detail ? ` · ${detail}` : ''}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35 mb-1.5">Session mode</p>
          <div className="flex flex-col gap-1.5">
            {modes.map((m) => (
              <label
                key={m.value}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  mode === m.value ? 'border-blue-400/50 bg-blue-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                <input
                  type="radio"
                  name="session-mode"
                  value={m.value}
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  className="mt-0.5 accent-blue-500"
                />
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-white/85">{m.label}</span>
                  <span className="block text-[11px] text-white/40">{m.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="text-[11.5px] text-white/35">Everyone in the group is notified and can join; you control the pace as host.</p>

        {error && <p className="text-[12px] text-rose-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={handleStart} loading={busy}>
            <Play size={13} /> Start session
          </Button>
        </div>
      </div>
    </Modal>
  );
}
