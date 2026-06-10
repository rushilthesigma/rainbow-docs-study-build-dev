import { useState, useEffect } from 'react';
import { FileText, Layers, BookOpen, Share2, Check, X } from 'lucide-react';
import Button from '../shared/Button';
import { useToast } from '../shared/Toast';
import SharedItemViewer from './SharedItemViewer';
import { useSharing } from '../../context/SharingContext';

// SharedWithMeView - the "Shared With Me" section of the user's library.
//
// Reads invitation + accepted-share state from SharingContext (WO-4), which
// polls /api/share/incoming. Mounting this section switches the context to
// its faster 10-second cadence via setLibraryOpen (blueprint polling spec).
//
// Pending invitations are actionable here (accept / decline - AC-FNS-002.2);
// accepted shares list item type, owner name, and permission level
// (AC-FNS-003.3) and open in SharedItemViewer.

const TYPE_META = {
  note: { label: 'Note', icon: FileText },
  flashcardDeck: { label: 'Deck', icon: Layers },
  curriculum: { label: 'Curriculum', icon: BookOpen },
};

export default function SharedWithMeView({ className = '' }) {
  const { incomingShares, acceptShare, declineShare, refresh, setLibraryOpen } = useSharing();
  const toast = useToast();
  const [openShare, setOpenShare] = useState(null);
  const [actingId, setActingId] = useState(null);

  // Faster poll cadence while the library section is on screen
  useEffect(() => {
    setLibraryOpen(true);
    return () => setLibraryOpen(false);
  }, [setLibraryOpen]);

  const pending = incomingShares.filter(s => s.status === 'pending');
  const accepted = incomingShares.filter(s => s.status === 'accepted');

  async function act(fn, id) {
    setActingId(id);
    try {
      await fn(id);
    } catch (e) {
      toast.error(e.message || 'That didn\'t work — please try again.');
      refresh();
    }
    setActingId(null);
  }

  return (
    <section className={className} aria-label="Shared with me">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-white/40 flex items-center gap-1.5 mb-2">
        <Share2 size={12} /> Shared with me
      </h3>

      {pending.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {pending.map(s => {
            const meta = TYPE_META[s.itemType] || TYPE_META.note;
            const Icon = meta.icon;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-500/[0.06] px-3 py-2.5"
              >
                <Icon size={16} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{s.itemTitle}</div>
                  <div className="text-xs text-gray-500 dark:text-white/40">
                    {s.ownerName} wants to share this {meta.label.toLowerCase()} · {s.permissionLevel === 'edit' ? 'can edit' : 'view only'}
                  </div>
                </div>
                <Button size="sm" onClick={() => act(acceptShare, s.id)} loading={actingId === s.id}>
                  <Check size={13} /> Accept
                </Button>
                <Button size="sm" variant="ghost" aria-label="Decline" onClick={() => act(declineShare, s.id)} disabled={actingId === s.id}>
                  <X size={13} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {accepted.length === 0 && pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/[0.08] px-4 py-6 text-center text-sm text-gray-400 dark:text-white/30 italic">
          Nothing has been shared with you yet.
        </div>
      ) : accepted.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {accepted.map(s => {
            const meta = TYPE_META[s.itemType] || TYPE_META.note;
            const Icon = meta.icon;
            const gone = s.itemExists === false;
            return (
              <li key={s.id}>
                <button
                  onClick={() => !gone && setOpenShare(s)}
                  disabled={gone}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    gone
                      ? 'border-gray-200 dark:border-white/[0.05] opacity-50 cursor-not-allowed'
                      : 'border-gray-200 dark:border-white/[0.08] hover:border-blue-400/40 hover:bg-blue-500/[0.04]'
                  }`}
                >
                  <Icon size={16} className="text-gray-400 dark:text-white/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{s.itemTitle}</div>
                    <div className="text-xs text-gray-500 dark:text-white/40">
                      {meta.label} · from {s.ownerName}{gone ? ' · no longer available' : ''}
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                    s.permissionLevel === 'edit' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-sky-500/15 text-sky-500'
                  }`}>
                    {s.permissionLevel === 'edit' ? 'Edit' : 'View'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openShare && (
        <SharedItemViewer
          key={openShare.id}
          share={openShare}
          onClose={() => setOpenShare(null)}
          onAccessLost={refresh}
        />
      )}
    </section>
  );
}
