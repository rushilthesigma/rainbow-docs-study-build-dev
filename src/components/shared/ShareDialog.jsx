import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Check, X, Loader2, Trash2, UserPlus, Eye, Pencil, ArrowLeft } from 'lucide-react';
import Modal from './Modal';
import { searchUsers } from '../../api/social';
import { createShare, revokeShare, updatePermission, listOutgoing } from '../../api/share';

// ShareDialog - modal for sharing a note / flashcard deck / curriculum with
// another Covalent user, and for managing existing access.
//
// Props:
//   item:    { id, type, title } - type is the server itemType
//            ('note' | 'flashcardDeck' | 'curriculum')
//   onClose: () => void
//   asPanel: when true, render as a docked side panel (same shell as the
//            note editor's quiz panel) instead of a centered modal.
//
// Talks to the API via ShareApiClient (src/api/share.js). The user search uses
// the existing /api/social/search, which already excludes the requester, so
// the owner never appears in their own results; the API also rejects self- and
// duplicate-shares and those errors are surfaced inline.

const TYPE_LABEL = { note: 'note', flashcardDeck: 'flashcard deck', curriculum: 'curriculum', noteMap: 'note map' };

export default function ShareDialog({ item, onClose, asPanel = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [level, setLevel] = useState('view');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [outgoing, setOutgoing] = useState([]);
  const [loadingOutgoing, setLoadingOutgoing] = useState(true);
  const [busyShareId, setBusyShareId] = useState(null);

  // userIds that already have an active share - excluded from search results
  // so the owner can't double-share the same item to the same person.
  const sharedUserIds = new Set(outgoing.map((s) => s.recipientId));

  const refreshOutgoing = useCallback(async () => {
    setLoadingOutgoing(true);
    try {
      const list = await listOutgoing(item.id);
      // listOutgoing only filters out 'revoked', so it can still include
      // 'declined' shares. Keep only active ones (pending/accepted) so a
      // declined recipient is neither mislabeled "Accepted" nor left blocking
      // a re-share via sharedUserIds.
      const active = (Array.isArray(list) ? list : []).filter(
        (s) => s.status === 'pending' || s.status === 'accepted',
      );
      setOutgoing(active);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOutgoing(false);
    }
  }, [item.id]);

  useEffect(() => { refreshOutgoing(); }, [refreshOutgoing]);

  // Debounced, race-safe user search. The latest query wins; stale responses
  // are dropped via the request token.
  const searchTokenRef = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    const token = ++searchTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const { users } = await searchUsers(q);
        if (token !== searchTokenRef.current) return;
        setResults((users || []).filter((u) => !sharedUserIds.has(u.userId)));
      } catch {
        if (token !== searchTokenRef.current) return;
        setResults([]);
      } finally {
        if (token === searchTokenRef.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
    // sharedUserIds is derived from outgoing; re-run when access list changes too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, outgoing]);

  function pick(user) {
    setSelected(user);
    setError(null);
    setSuccess(null);
    setResults([]);
    setQuery('');
  }

  async function handleSubmit() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await createShare(item.id, item.type, selected.userId, level);
      setSuccess(`Shared with ${selected.displayName || selected.handle}.`);
      setSelected(null);
      setLevel('view');
      await refreshOutgoing();
    } catch (e) {
      // Surfaces API messages: self-share, duplicate (409), network/server failure.
      setError(e.message || 'Could not share. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(share) {
    if (busyShareId) return;
    setBusyShareId(share.id);
    setError(null);
    setSuccess(null);
    try {
      await revokeShare(share.id);
      await refreshOutgoing();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyShareId(null);
    }
  }

  async function handleToggleLevel(share) {
    if (busyShareId) return;
    const next = share.permissionLevel === 'edit' ? 'view' : 'edit';
    setBusyShareId(share.id);
    setError(null);
    setSuccess(null);
    try {
      await updatePermission(share.id, next);
      await refreshOutgoing();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyShareId(null);
    }
  }

  const noResults = query.trim() && !searching && results.length === 0;
  const title = `Share ${TYPE_LABEL[item.type] || 'item'}`;

  const body = (
    <div className="flex flex-col gap-4">
        <p className="text-[12px] text-gray-500 dark:text-white/45 -mt-1 truncate">{item.title}</p>

        {/* Selected recipient + permission + confirm */}
        {selected ? (
          <div className="rounded-xl border border-gray-200 dark:border-white/[0.10] bg-gray-50 dark:bg-white/[0.04] p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-[12px] font-bold text-blue-700 dark:text-blue-200">
                {(selected.displayName || selected.handle || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white/90 truncate">{selected.displayName || selected.handle}</p>
                {selected.handle && <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">@{selected.handle}</p>}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:text-white/30 dark:hover:text-white/70 transition-colors"
                title="Choose someone else"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <PermissionToggle value={level} onChange={setLevel} />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-semibold transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                {submitting ? 'Sharing…' : 'Share'}
              </button>
            </div>
          </div>
        ) : (
          /* Search field */
          <div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setError(null); setSuccess(null); }}
                placeholder="Search by name or @handle…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/[0.10] text-[13px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 outline-none focus:border-blue-400/50 transition-colors"
              />
              {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 animate-spin" />}
            </div>

            {results.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                {results.map((u) => (
                  <button
                    key={u.userId}
                    onClick={() => pick(u)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/[0.08] flex items-center justify-center text-[11px] font-bold text-gray-600 dark:text-white/70">
                      {(u.displayName || u.handle || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-gray-800 dark:text-white/85 truncate">{u.displayName || u.handle}</p>
                      {u.handle && <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">@{u.handle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {noResults && (
              <p className="mt-2 text-[12px] text-gray-500 dark:text-white/40">No account found for “{query.trim()}”.</p>
            )}
          </div>
        )}

        {error && <p className="text-[12px] text-rose-400">{error}</p>}
        {success && (
          <p className="text-[12px] text-emerald-400 inline-flex items-center gap-1.5">
            <Check size={13} /> {success}
          </p>
        )}

        {/* Existing access */}
        <div className="border-t border-gray-200 dark:border-white/[0.08] pt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35 mb-2">People with access</p>
          {loadingOutgoing ? (
            <div className="flex items-center gap-2 text-[12px] text-gray-500 dark:text-white/40 py-1">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : outgoing.length === 0 ? (
            <p className="text-[12px] text-gray-400 dark:text-white/35 py-1">Not shared with anyone yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {outgoing.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-white/[0.08] flex items-center justify-center text-[11px] font-bold text-gray-600 dark:text-white/70">
                    {(s.recipientName || s.recipientHandle || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-gray-800 dark:text-white/85 truncate">{s.recipientName || s.recipientHandle}</p>
                    <p className="text-[10.5px] text-gray-400 dark:text-white/35">{s.status === 'pending' ? 'Invited' : 'Accepted'}</p>
                  </div>
                  <button
                    onClick={() => handleToggleLevel(s)}
                    disabled={busyShareId === s.id}
                    title={`Permission: ${s.permissionLevel} — click to switch to ${s.permissionLevel === 'edit' ? 'view' : 'edit'}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-[11px] font-semibold text-gray-600 dark:text-white/70 transition-colors disabled:opacity-50"
                  >
                    {s.permissionLevel === 'edit' ? <Pencil size={11} /> : <Eye size={11} />}
                    {s.permissionLevel === 'edit' ? 'Edit' : 'View'}
                  </button>
                  <button
                    onClick={() => handleRevoke(s)}
                    disabled={busyShareId === s.id}
                    title="Revoke access"
                    className="p-1 rounded text-gray-400 hover:text-rose-500 dark:text-white/25 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                  >
                    {busyShareId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );

  // Docked side panel — mirrors the note editor's quiz panel shell so Share
  // and Quiz look like siblings sharing the same column.
  if (asPanel) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-white dark:bg-[#141414] border border-gray-200 dark:border-white/[0.08] rounded-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-3 flex-shrink-0 border-b border-gray-200 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 dark:text-white/40 dark:hover:text-white/80 transition-colors text-sm"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white/90 flex-1 truncate">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {body}
        </div>
      </div>
    );
  }

  return (
    <Modal open onClose={onClose} title={title} size="md">
      {body}
    </Modal>
  );
}

// Segmented View / Edit selector (View is the default for new shares).
function PermissionToggle({ value, onChange }) {
  const opt = (val, label, Icon) => (
    <button
      onClick={() => onChange(val)}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
        value === val ? 'bg-blue-500/25 text-blue-100' : 'text-gray-500 hover:text-gray-900 dark:text-white/50 dark:hover:text-white/80'
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/[0.10] overflow-hidden divide-x divide-gray-200 dark:divide-white/[0.10]">
      {opt('view', 'View', Eye)}
      {opt('edit', 'Edit', Pencil)}
    </div>
  );
}
