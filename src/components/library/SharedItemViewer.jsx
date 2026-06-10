import { useState, useEffect, useCallback } from 'react';
import { FileText, Layers, BookOpen, AlertTriangle, ShieldOff, RefreshCw } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import LoadingSpinner from '../shared/LoadingSpinner';
import MarkdownNoteEditor from '../notes/MarkdownNoteEditor';
import { getSharedItem, updateSharedItem } from '../../api/share';
import { useAuth } from '../../context/AuthContext';

// SharedItemViewer - opens a shared item through the shareId access path.
//
// View permission renders pure read-only presentations with no mutation
// controls at all (AC-FNS-003.4). Edit permission renders editable fields
// whose saves route to the OWNER's item via ?shareId= (AC-FNS-003.5,
// ADR-001 - the server stamps lastEditedBy/lastEditedAt).
//
// Conflict banner (AC-FNS-003.6): we remember the updatedAt we last saw per
// share in localStorage; if the freshly loaded copy is newer AND the last
// editor wasn't us, the other party changed it since our last look.
//
// Revoked access (AC-FNS-004.4): any 403 from load or save flips the viewer
// into a blocked state - message shown, editing disabled, saves impossible.

const SEEN_KEY_PREFIX = 'covalent-share-seen:';

const TYPE_META = {
  note: { label: 'Note', icon: FileText },
  flashcardDeck: { label: 'Flashcard Deck', icon: Layers },
  curriculum: { label: 'Curriculum', icon: BookOpen },
};

function getSeenStamp(shareId) {
  try { return localStorage.getItem(SEEN_KEY_PREFIX + shareId); } catch { return null; }
}
function setSeenStamp(shareId, updatedAt) {
  try { if (updatedAt) localStorage.setItem(SEEN_KEY_PREFIX + shareId, updatedAt); } catch {}
}

export default function SharedItemViewer({ share, onClose, onAccessLost }) {
  const { user } = useAuth();
  const canEdit = share.permissionLevel === 'edit';
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revoked, setRevoked] = useState(false);
  // 'edit' permission was withdrawn but the share itself still grants view
  const [downgraded, setDowngraded] = useState(false);
  const [conflict, setConflict] = useState(null); // null | { byOwner: boolean }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // Editable fields (notes + deck title)
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);

  const editDraft = useCallback((updater) => {
    setDraft(updater);
    setDirty(true);
  }, []);

  const load = useCallback(async ({ confirmDiscard = false } = {}) => {
    if (confirmDiscard && dirty && !window.confirm('Reload and discard your unsaved changes?')) return;
    setLoading(true);
    setError(null);
    setConflict(null);
    try {
      const fresh = await getSharedItem(share.itemType, share.itemId, share.id);
      const seen = getSeenStamp(share.id);
      if (seen && fresh.updatedAt && fresh.updatedAt > seen) {
        // Who made the newer edit? Shared writes always stamp
        // lastEditedAt === updatedAt, so a mismatch (or no stamp at all)
        // means the OWNER saved last; a matching stamp from another user
        // means a collaborator did. Our own edits (any device) stay quiet.
        const byOwner = !fresh.lastEditedAt || fresh.updatedAt !== fresh.lastEditedAt;
        const byOtherCollaborator = !byOwner && fresh.lastEditedBy && fresh.lastEditedBy !== user?.id;
        if (byOwner || byOtherCollaborator) setConflict({ byOwner });
      }
      setSeenStamp(share.id, fresh.updatedAt);
      setItem(fresh);
      setDraft({
        title: fresh.title || '',
        mainNotes: fresh.mainNotes || '',
        cues: Array.isArray(fresh.cues) ? fresh.cues.join('\n') : '',
        summary: fresh.summary || '',
      });
      setDirty(false);
    } catch (e) {
      if (e.status === 403) {
        setRevoked(true);
        onAccessLost?.();
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [share, user?.id, onAccessLost, dirty]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!canEdit || revoked || downgraded) return;
    setSaving(true);
    setSaveError(null);
    try {
      let updates;
      if (share.itemType === 'note') {
        updates = {
          title: draft.title,
          mainNotes: draft.mainNotes,
          summary: draft.summary,
        };
        if (item.type === 'cornell') {
          updates.cues = draft.cues.split('\n').map(c => c.trim()).filter(Boolean);
        }
      } else if (share.itemType === 'flashcardDeck') {
        updates = { title: draft.title };
      } else {
        return; // curriculum stays read-only by design
      }
      const saved = await updateSharedItem(share.itemType, share.itemId, share.id, updates);
      setItem(saved);
      setSeenStamp(share.id, saved.updatedAt);
      setConflict(null);
      // Re-sync draft from the server response (e.g. deck rename to an empty
      // title is a server-side no-op) so the form never diverges from truth.
      setDraft({
        title: saved.title || '',
        mainNotes: saved.mainNotes || '',
        cues: Array.isArray(saved.cues) ? saved.cues.join('\n') : '',
        summary: saved.summary || '',
      });
      setDirty(false);
    } catch (e) {
      if (e.status === 403) {
        if (/permission required/i.test(e.message)) {
          // Downgraded to view-only: the share still grants read access
          setDowngraded(true);
        } else {
          setRevoked(true);
        }
        onAccessLost?.();
      } else {
        setSaveError(e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const meta = TYPE_META[share.itemType] || TYPE_META.note;
  const Icon = meta.icon;

  return (
    <Modal open onClose={onClose} title={share.itemTitle || 'Shared item'} size="lg">
      <div className="flex flex-col gap-4">
        {/* Header strip: type, owner, permission */}
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/50">
          <Icon size={14} />
          <span>{meta.label}</span>
          <span aria-hidden>·</span>
          <span>Shared by {share.ownerName}</span>
          <span aria-hidden>·</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${canEdit ? 'bg-emerald-500/15 text-emerald-500' : 'bg-sky-500/15 text-sky-500'}`}>
            {canEdit ? 'Can edit' : 'View only'}
          </span>
        </div>

        {revoked && (
          <div className="flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-500">
            <ShieldOff size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Access removed</div>
              <div className="text-red-400/90">The owner has removed your access to this item. Further changes cannot be saved.</div>
            </div>
          </div>
        )}

        {downgraded && !revoked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
            <ShieldOff size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Now view-only</div>
              <div className="text-amber-400/90">The owner changed your permission to view-only, so your edits can no longer be saved.</div>
            </div>
          </div>
        )}

        {conflict && !revoked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-500">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Changed since you last opened it</div>
              <div className="text-amber-400/90">
                {conflict.byOwner ? `${share.ownerName} edited this item` : 'Another collaborator edited this item'} after your last visit. Review before saving — the latest save wins.
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => load({ confirmDiscard: true })}><RefreshCw size={13} /> Reload</Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12"><LoadingSpinner size={22} /></div>
        ) : error ? (
          <div className="text-sm text-red-500 py-6 text-center">{error}</div>
        ) : revoked && !item ? null : item && (
          <SharedItemBody
            itemType={share.itemType}
            item={item}
            editable={canEdit && !revoked && !downgraded}
            draft={draft}
            setDraft={editDraft}
          />
        )}

        {saveError && <div className="text-sm text-red-500">{saveError}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          {canEdit && !revoked && !downgraded && item && share.itemType !== 'curriculum' && (
            <Button size="sm" onClick={handleSave} loading={saving}>Save changes</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SharedItemBody({ itemType, item, editable, draft, setDraft }) {
  if (itemType === 'note') {
    if (!editable) {
      return (
        <div className="flex flex-col gap-3">
          {item.type === 'cornell' && (item.cues || []).length > 0 && (
            <ReadOnlySection label="Cues">
              <ul className="list-disc pl-5 space-y-0.5">
                {item.cues.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </ReadOnlySection>
          )}
          <ReadOnlySection label={item.type === 'cornell' ? 'Notes' : null}>
            <div className="whitespace-pre-wrap">{item.mainNotes || <span className="italic opacity-60">This note is empty.</span>}</div>
          </ReadOnlySection>
          {item.summary && (
            <ReadOnlySection label="Summary">
              <div className="whitespace-pre-wrap">{item.summary}</div>
            </ReadOnlySection>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        <input
          value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder="Title"
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white/90 outline-none focus:border-blue-400/60"
        />
        {item.type === 'cornell' && (
          <label className="text-xs text-gray-500 dark:text-white/40 flex flex-col gap-1">
            Cues (one per line)
            <textarea
              value={draft.cues}
              onChange={e => setDraft(d => ({ ...d, cues: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white/90 outline-none focus:border-blue-400/60"
            />
          </label>
        )}
        <MarkdownNoteEditor
          value={draft.mainNotes}
          onChange={v => setDraft(d => ({ ...d, mainNotes: v }))}
          placeholder="Shared note content…"
        />
        {item.type === 'cornell' && (
          <label className="text-xs text-gray-500 dark:text-white/40 flex flex-col gap-1">
            Summary
            <textarea
              value={draft.summary}
              onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white/90 outline-none focus:border-blue-400/60"
            />
          </label>
        )}
      </div>
    );
  }

  if (itemType === 'flashcardDeck') {
    const cards = item.cards || [];
    return (
      <div className="flex flex-col gap-3">
        {editable && (
          <input
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            placeholder="Deck title"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white/90 outline-none focus:border-blue-400/60"
          />
        )}
        {cards.length === 0 ? (
          <div className="text-sm italic text-gray-400 dark:text-white/30 py-4 text-center">This deck has no cards yet.</div>
        ) : (
          <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
            {cards.map((c, i) => (
              <li key={c.id || i} className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-2 text-sm">
                <div className="font-medium text-gray-900 dark:text-white/90">{c.front}</div>
                <div className="text-gray-500 dark:text-white/50 mt-0.5">{c.back}</div>
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <p className="text-[11px] text-gray-400 dark:text-white/30">
            Card contents are managed by the owner; you can rename the deck.
          </p>
        )}
      </div>
    );
  }

  // curriculum — read-only outline regardless of permission (course-content
  // editing stays with the owner; shared edit covers notes and deck titles)
  const units = item.units || [];
  return (
    <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
      {item.subject && <div className="text-xs text-gray-500 dark:text-white/40">{item.subject}</div>}
      {units.length === 0 ? (
        <div className="text-sm italic text-gray-400 dark:text-white/30 py-4 text-center">This curriculum has no units yet.</div>
      ) : units.map((u, i) => (
        <div key={u.id || i} className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-2">
          <div className="text-sm font-semibold text-gray-900 dark:text-white/90">{u.title || `Unit ${i + 1}`}</div>
          {(u.lessons || []).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {u.lessons.map((l, j) => (
                <li key={l.id || j} className="text-xs text-gray-500 dark:text-white/50">• {l.title || `Lesson ${j + 1}`}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ReadOnlySection({ label, children }) {
  return (
    <div>
      {label && <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30 mb-1">{label}</div>}
      <div className="text-sm text-gray-800 dark:text-white/80">{children}</div>
    </div>
  );
}
