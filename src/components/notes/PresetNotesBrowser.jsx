import { useState, useEffect, useMemo } from 'react';
import { Globe, FlaskConical, Check, Search } from 'lucide-react';
import { listNotePresets, addNotePreset } from '../../api/notes';
import LoadingSpinner from '../shared/LoadingSpinner';

const GEO_REGION_ORDER = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const SCIENCE_COURSE_ORDER = ['Biology', 'Chemistry', 'Physics'];

export default function PresetNotesBrowser({ notes, onOpenNote, onAdded }) {
  const [presets, setPresets] = useState(null);
  const [query, setQuery] = useState('');
  const [addingSlug, setAddingSlug] = useState(null);
  const [tab, setTab] = useState('science');

  useEffect(() => {
    listNotePresets().then(d => setPresets(d.presets || [])).catch(() => setPresets([]));
  }, []);

  const addedBySlug = useMemo(() => {
    const map = {};
    for (const n of notes || []) if (n.presetSlug) map[n.presetSlug] = n.id;
    return map;
  }, [notes]);

  const { geoGrouped, scienceGrouped } = useMemo(() => {
    if (!presets) return { geoGrouped: [], scienceGrouped: [] };
    const q = query.trim().toLowerCase();

    const geoPresets = presets.filter(p => !p.category || p.category === 'geo');
    const sciPresets = presets.filter(p => p.category === 'science');

    const filteredGeo = q
      ? geoPresets.filter(p => (p.label || p.country || '').toLowerCase().includes(q) || (p.subgroup || p.subregion || '').toLowerCase().includes(q))
      : geoPresets;

    const filteredSci = q
      ? sciPresets.filter(p => (p.label || '').toLowerCase().includes(q) || (p.group || '').toLowerCase().includes(q) || (p.subgroup || '').toLowerCase().includes(q))
      : sciPresets;

    const geoGrouped = GEO_REGION_ORDER
      .map(region => ({ region, items: filteredGeo.filter(p => (p.region || p.group) === region) }))
      .filter(g => g.items.length > 0);

    const scienceGrouped = SCIENCE_COURSE_ORDER
      .map(course => ({ course, items: filteredSci.filter(p => p.group === course) }))
      .filter(g => g.items.length > 0);

    return { geoGrouped, scienceGrouped };
  }, [presets, query]);

  async function handlePick(preset) {
    const slug = preset.slug;
    const existingId = addedBySlug[slug];
    if (existingId) { onOpenNote(existingId); return; }
    if (addingSlug) return;
    setAddingSlug(slug);
    try {
      const data = await addNotePreset(slug);
      onAdded?.(data.note);
      onOpenNote(data.note.id);
    } catch (err) { console.error(err); }
    setAddingSlug(null);
  }

  if (!presets) return <div className="flex items-center justify-center py-12"><LoadingSpinner size={22} /></div>;

  const tabs = [
    { id: 'science', label: 'Science', icon: FlaskConical },
    { id: 'geo', label: 'Geography', icon: Globe },
  ];

  const grouped = tab === 'geo' ? geoGrouped : scienceGrouped;
  const groupKey = tab === 'geo' ? 'region' : 'course';
  const emptyMsg = tab === 'geo' ? 'No countries match that search' : 'No topics match that search';

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setQuery(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              tab === id
                ? 'bg-white/[0.1] text-white/90'
                : 'text-white/35 hover:text-white/60'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'geo' ? 'Search countries' : 'Search topics'}
          className="w-full rounded-lg bg-white/[0.05] border border-white/[0.08] focus:border-white/[0.2] outline-none pl-9 pr-3 py-2 text-[13px] text-white/85 placeholder-white/25 transition-colors"
        />
      </div>

      {/* List */}
      <div className="max-h-[52vh] overflow-y-auto flex flex-col gap-4 pr-1">
        {grouped.length === 0 && (
          <p className="text-[12px] text-white/35 text-center py-8">{emptyMsg}</p>
        )}
        {grouped.map((group) => {
          const key = group[groupKey];
          const items = group.items;
          const Icon = tab === 'geo' ? Globe : FlaskConical;
          return (
            <div key={key}>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/30 mb-1.5 px-1">
                {key} <span className="text-white/20 normal-case tracking-normal font-normal">&middot; {items.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map(p => {
                  const slug = p.slug;
                  const added = Boolean(addedBySlug[slug]);
                  const adding = addingSlug === slug;
                  const displayName = p.label || p.country || p.subject || p.title;
                  const displaySub = p.subgroup || p.subregion || '';
                  return (
                    <button
                      key={slug}
                      onClick={() => handlePick(p)}
                      disabled={adding}
                      title={p.preview}
                      className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.16] hover:bg-white/[0.07] transition-colors px-3 py-2 text-left disabled:opacity-60"
                    >
                      <Icon size={13} className="text-white/30 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-medium text-white/80 truncate">{displayName}</span>
                        <span className="block text-[10px] text-white/30 truncate">{displaySub}</span>
                      </span>
                      {adding ? (
                        <LoadingSpinner size={12} />
                      ) : added ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400/80 flex-shrink-0"><Check size={11} /> Added</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
