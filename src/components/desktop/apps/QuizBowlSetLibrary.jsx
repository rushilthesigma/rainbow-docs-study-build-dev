import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, Flag, Globe2, Landmark, Loader2, Pencil, Play, Plus, Save, Search, Send, Sparkles, Store, Trash2, Upload, UserRound, Users } from 'lucide-react';
import {
  fetchQuizBowlCollection,
  fetchQuizBowlCountryPresets,
  fetchQuizBowlPresetSet,
  reportQuizBowlCollectionSet,
  updateSavedQuizBowlSet,
} from '../../../api/quizMatch';
import ProgressBar from '../../shared/ProgressBar';
import Dropdown from '../../shared/Dropdown';
import QbModelPicker from '../../shared/QbModelPicker';
import Modal from '../../shared/Modal';
import Button from '../../shared/Button';

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
const SET_CATEGORIES = ['Mixed', 'History', 'Science', 'Literature', 'Geography', 'Art', 'Music', 'Philosophy', 'Math', 'Pop Culture'];
const SET_COUNTS = [5, 10, 15];
const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate or offensive content' },
  { value: 'inaccurate', label: 'Inaccurate or misleading questions' },
  { value: 'spam', label: 'Spam or low-quality content' },
  { value: 'copyright', label: 'Copyright or copied material' },
  { value: 'other', label: 'Something else' },
];

function normalizeCountryPreset(preset) {
  const isHistory = String(preset?.slug || '').startsWith('history-')
    || String(preset?.title || '').toLowerCase().startsWith('history of ');
  return { ...preset, category: preset?.category || (isHistory ? 'History' : 'Geography') };
}

export function CountryPracticeBrowser({ onBack, onPractice }) {
  const [presets, setPresets] = useState(null);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('All');
  const [loadingSlug, setLoadingSlug] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQuizBowlCountryPresets().then(data => setPresets((data.presets || []).map(normalizeCountryPreset))).catch(err => {
      setError(err.message || 'Could not load countries.'); setPresets([]);
    });
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (presets || []).filter(preset => {
      const matchesSubject = subject === 'All' || preset.category === subject;
      const matchesQuery = !q || [preset.label, preset.title, preset.category, preset.region, preset.subregion]
        .some(value => String(value || '').toLowerCase().includes(q));
      return matchesSubject && matchesQuery;
    });
    const subjects = subject === 'All' ? ['Geography', 'History'] : [subject];
    return subjects.flatMap(category => REGIONS.map(region => ({
      category,
      region,
      items: filtered.filter(preset => preset.category === category && preset.region === region),
    }))).filter(group => group.items.length);
  }, [presets, query, subject]);

  async function choose(preset) {
    if (loadingSlug) return;
    setLoadingSlug(preset.slug); setError('');
    try {
      const data = await fetchQuizBowlPresetSet(preset.slug);
      onPractice(data.set);
    } catch (err) { setError(err.message || 'Could not open this country.'); }
    setLoadingSlug(null);
  }

  if (loadingSlug) {
    const loadingCountry = (presets || []).find(preset => preset.slug === loadingSlug);
    return (
      <div className="h-full flex flex-col bg-transparent min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="w-full max-w-sm">
            <ProgressBar
              active
              duration={4000}
              label="Set is loading…"
              hint={`Building ${loadingCountry?.label || 'country'} from the maintained source notes.`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-transparent min-h-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors"><ArrowLeft size={15} /> Hub</button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white/90">Presets</h2>
          <p className="text-[10px] text-white/35">Built-in country courses from the Covalent library</p>
        </div>
      </div>
      <div className="px-5 pt-4 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search preset courses"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15" />
        </div>
        <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Preset subject">
          {['All', 'Geography', 'History'].map(item => <button key={item} role="tab" aria-selected={subject === item} onClick={() => setSubject(item)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${subject === item ? 'border-blue-500 bg-blue-500 text-white' : 'border-white/[0.06] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}>{item}</button>)}
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {!presets ? <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/35" /></div> : grouped.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-white/35">{query.trim() ? 'No preset courses match that search.' : `No ${subject === 'All' ? '' : `${subject.toLowerCase()} `}preset courses are available.`}</p>
        ) : grouped.map(({ category, region, items }) => (
          <section key={`${category}:${region}`}>
            <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{subject === 'All' ? `${category} · ${region}` : region} <span className="font-normal text-white/20">· {items.length}</span></p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(preset => {
                const busy = loadingSlug === preset.slug;
                return <button key={preset.slug} onClick={() => choose(preset)} disabled={!!loadingSlug}
                  className="group flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left hover:border-blue-400/35 hover:bg-blue-500/[0.07] disabled:opacity-55 transition-colors">
                  {preset.category === 'History' ? <Landmark size={13} className="shrink-0 text-amber-300/80" /> : <Globe2 size={13} className="shrink-0 text-blue-400" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white/85">{preset.label}</span><span className="block truncate text-[10px] text-white/35">{preset.category} · {preset.subregion || preset.region}</span></span>
                  {busy ? <Loader2 size={13} className="animate-spin text-blue-400" /> : <Play size={12} className="text-white/20 group-hover:text-blue-300 transition-colors" />}
                </button>;
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function QuizBowlCollection({ onBack, onMyPackets, onPlay, onPlayMultiplayer, mobile = false }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [playingId, setPlayingId] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value);
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportedIds, setReportedIds] = useState(() => new Set());

  async function load() {
    setLoading(true); setError('');
    try {
      const data = await fetchQuizBowlCollection();
      setListings(data.listings || []);
    } catch (err) { setError(err.message || 'Could not load the Quiz Bowl Collection.'); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filters = useMemo(() => [
    'All',
    'Presets',
    'Community',
    ...[...new Set(listings.map(listing => listing.category || 'Mixed'))].sort(),
  ], [listings]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter(listing => {
      const matchesFilter = filter === 'All'
        || (filter === 'Presets' && listing.source === 'preset')
        || (filter === 'Community' && listing.source === 'community')
        || listing.category === filter;
      const haystack = [listing.title, listing.category, listing.difficulty, listing.author, listing.region, listing.subregion, listing.preview]
        .filter(Boolean).join(' ').toLowerCase();
      return matchesFilter && (!q || haystack.includes(q));
    });
  }, [filter, listings, query]);

  async function play(listing) {
    if (playingId) return;
    setPlayingId(listing.listingId); setError('');
    try { await onPlay(listing); }
    catch (err) { setError(err.message || 'Could not open that set.'); }
    setPlayingId(null);
  }

  async function playMultiplayer(listing) {
    if (playingId) return;
    setPlayingId(listing.listingId); setError('');
    try { await onPlayMultiplayer(listing); }
    catch (err) { setError(err.message || 'Could not open that set for multiplayer.'); }
    setPlayingId(null);
  }

  function openReport(listing) {
    setReporting(listing);
    setReportReason(REPORT_REASONS[0].value);
    setReportDetails('');
    setReportError('');
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reporting || reportBusy) return;
    setReportBusy(true); setReportError('');
    try {
      await reportQuizBowlCollectionSet(reporting.listingId, {
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportedIds(current => new Set(current).add(reporting.listingId));
      setReporting(null);
    } catch (err) {
      setReportError(err.message || 'Could not submit this report.');
    } finally { setReportBusy(false); }
  }

  function listingRows(items) {
    return items.map(listing => {
      const busy = playingId === listing.listingId;
      const isPreset = listing.source === 'preset';
      return <div key={listing.listingId} className="group flex min-h-16 items-center gap-3 rounded-md border-b border-white/[0.06] px-2 py-2.5 last:border-b-0 hover:bg-white/[0.035] transition-colors">
        <div className={`${mobile ? 'w-[62px]' : 'w-[74px]'} shrink-0`}><span className="line-clamp-2 text-[10px] font-semibold uppercase tracking-wide text-white/30 group-hover:text-white/45">{isPreset ? (listing.region || 'Geography') : listing.category}</span></div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-[13px] font-medium text-white/90">{listing.title}</h4>
            {!mobile && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isPreset ? 'bg-emerald-500/[0.13] text-emerald-200/90' : 'bg-blue-500/[0.14] text-blue-200/90'}`}>{isPreset ? 'Preset' : 'Community'}</span>}
          </div>
          <p className="mt-1.5 truncate text-[10.5px] text-white/35">
            {isPreset ? <><Globe2 size={10} className="mr-1 inline -mt-px" />{listing.author} · {listing.category} · {listing.subregion || listing.region || 'Country course'} · {listing.difficulty}</> : <><UserRound size={10} className="mr-1 inline -mt-px" />{listing.author} · {listing.difficulty} · {listing.questionCount} tossup{listing.questionCount === 1 ? '' : 's'}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => play(listing)} disabled={!!playingId} aria-label={`Play ${listing.title}`}
            className={`inline-flex ${busy && isPreset ? 'min-w-[100px]' : 'min-w-[64px]'} items-center justify-center gap-1.5 rounded-lg border border-blue-500 bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:border-blue-400 hover:bg-blue-400 disabled:opacity-40 transition-colors ${mobile ? 'min-h-11' : ''}`}>{busy ? <><Loader2 size={12} className="animate-spin" />{isPreset && <span>Set is loading…</span>}</> : <><Play size={12} /> Play</>}</button>
          {onPlayMultiplayer && <button onClick={() => playMultiplayer(listing)} disabled={!!playingId} aria-label={`Play ${listing.title} in multiplayer`} title="Play in multiplayer"
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/[0.10] px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:border-sky-300/55 hover:bg-sky-500/[0.18] disabled:opacity-40 transition-colors ${mobile ? 'min-h-11' : ''}`}><Users size={12} /> <span className="hidden sm:inline">Multiplayer</span></button>}
          <button type="button" onClick={() => openReport(listing)} disabled={reportedIds.has(listing.listingId)}
            aria-label={reportedIds.has(listing.listingId) ? `${listing.title} reported` : `Report ${listing.title}`} title={reportedIds.has(listing.listingId) ? 'Report submitted' : 'Report this set'}
            className={`inline-flex items-center justify-center rounded-lg text-white/25 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-default disabled:text-emerald-300/55 disabled:hover:bg-transparent ${mobile ? 'min-h-11 min-w-11' : 'h-7 w-7'}`}>
            {reportedIds.has(listing.listingId) ? <Check size={13} /> : <Flag size={13} />}
          </button>
        </div>
      </div>;
    });
  }

  const presetListings = visible.filter(listing => listing.source === 'preset');
  const communityListings = visible.filter(listing => listing.source !== 'preset');

  return (
    <div className="h-full min-h-0 flex flex-col bg-transparent">
      <div className="flex items-start gap-3 border-b border-white/[0.06] px-5 py-3 flex-shrink-0">
        <button onClick={onBack} className={`mt-0.5 flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors ${mobile ? 'min-h-11' : ''}`}><ArrowLeft size={15} /> {mobile ? 'Quiz Bowl' : 'Hub'}</button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white/90">Quiz Bowl Collection</h2>
          <p className="text-[10px] text-white/35">Country presets and sets published by the community</p>
        </div>
        {onMyPackets && <button onClick={onMyPackets} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/60 hover:bg-white/[0.07] hover:text-white transition-colors"><FileText size={12} /> My packets</button>}
      </div>

      <div className="flex-shrink-0 px-5 pt-4">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={query} onChange={event => setQuery(event.target.value)} inputMode="search"
            placeholder="Search sets, categories, difficulties, or creators…"
            className={`w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15 ${mobile ? 'min-h-11' : ''}`} />
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide" aria-label="Collection filters">
          {filters.map(item => <button key={item} onClick={() => setFilter(item)}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${filter === item ? 'border-blue-500 bg-blue-500 text-white' : 'border-white/[0.06] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}>{item}</button>)}
        </div>
        {error && <p className="mt-1 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2">
        {loading ? <div className="flex justify-center py-14"><Loader2 size={20} className="animate-spin text-white/35" /></div> : error && !listings.length ? (
          <div className="py-14 text-center"><Store size={26} className="mx-auto mb-2 text-white/20" /><p className="text-[13px] font-semibold text-white/60">Collection unavailable</p><button onClick={load} className="mt-2 text-[11px] font-semibold text-blue-300 hover:text-blue-200">Try again</button></div>
        ) : !listings.length ? (
          <div className="rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] px-5 py-10 text-center"><Store size={26} className="mx-auto mb-2 text-white/20" /><p className="text-[13px] font-semibold text-white/65">No public sets yet</p><p className="mt-1 text-[11px] text-white/35">Publish a finished packet to start the collection.</p>{onMyPackets && <button onClick={onMyPackets} className="mt-3 rounded-lg bg-blue-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-400">Open my packets</button>}</div>
        ) : !visible.length ? (
          <div className="py-14 text-center"><Search size={25} className="mx-auto mb-2 text-white/20" /><p className="text-[13px] font-semibold text-white/60">No sets match that search</p><button onClick={() => { setQuery(''); setFilter('All'); }} className="mt-2 text-[11px] font-semibold text-blue-300 hover:text-blue-200">Clear search</button></div>
        ) : (
          <div className="space-y-5">
            {presetListings.length > 0 && <section>
              <div className="mb-1.5 flex items-center gap-2 px-1"><h3 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40"><Globe2 size={12} /> Country presets</h3><span className="text-[10px] tabular-nums text-white/25">{presetListings.length}</span></div>
              <div>{listingRows(presetListings)}</div>
            </section>}
            {communityListings.length > 0 && <section>
              <div className="mb-1.5 flex items-center gap-2 px-1"><h3 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40"><Store size={12} /> Community sets</h3><span className="text-[10px] tabular-nums text-white/25">{communityListings.length}</span></div>
              <div>{listingRows(communityListings)}</div>
            </section>}
          </div>
        )}
      </div>
      <Modal
        open={!!reporting}
        onClose={() => !reportBusy && setReporting(null)}
        title="Report set"
        description={reporting ? `Tell the moderation team what is wrong with “${reporting.title}”.` : ''}
        size="sm"
        closeOnOverlay={!reportBusy}
      >
        <form onSubmit={submitReport} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-gray-600 dark:text-white/55">Reason</label>
            <Dropdown value={reportReason} options={REPORT_REASONS} onChange={setReportReason} aria-label="Reason for reporting this set" />
          </div>
          <div>
            <label htmlFor="quizbowl-report-details" className="mb-1.5 block text-[11px] font-semibold text-gray-600 dark:text-white/55">Details <span className="font-normal text-gray-400 dark:text-white/30">(optional)</span></label>
            <textarea id="quizbowl-report-details" value={reportDetails} onChange={event => setReportDetails(event.target.value.slice(0, 1000))}
              rows={5} placeholder="Point out the question, answer, or content that should be reviewed."
              className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/15 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/85 dark:placeholder:text-white/25" />
            <p className="mt-1 text-right text-[10px] tabular-nums text-gray-400 dark:text-white/25">{reportDetails.length}/1000</p>
          </div>
          {reportError && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{reportError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={reportBusy} onClick={() => setReporting(null)}>Cancel</Button>
            <Button type="submit" variant="danger" size="sm" loading={reportBusy}>{reportBusy ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : <><Flag size={13} /> Submit report</>}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function SavedSetLibrary({ sets, loading, onBack, onNew, onImport, onEdit, onPlay, onDelete }) {
  const [filter, setFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);
  const publishedCount = sets.filter(set => set.status === 'published').length;
  const draftCount = sets.length - publishedCount;
  const visibleSets = filter === 'all' ? sets : sets.filter(set => (set.status || 'draft') === filter);

  async function choosePdf(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setImportError('Choose a PDF packet.');
      return;
    }
    setImporting(true);
    setImportError('');
    try { await onImport(file); }
    catch (error) { setImportError(error.message || 'Could not import that PDF.'); }
    finally { setImporting(false); }
  }

  return (
    <div className="h-full flex flex-col bg-transparent min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="mr-1 flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors"><ArrowLeft size={15} /> Hub</button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white/90">Packets</h2>
          <p className="text-[10px] text-white/35">Create, import, and publish playable tossup sets</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={choosePdf} className="sr-only" aria-label="Import Quiz Bowl packet PDF" />
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5 py-1.5 text-[12px] font-semibold text-white/65 hover:bg-white/[0.08] hover:text-white disabled:opacity-45 transition-colors">
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {importing ? 'Importing…' : 'Import PDF'}
          </button>
          <button onClick={onNew} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-400 transition-colors"><Plus size={13} /> Create set</button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-5 py-2 flex-shrink-0" role="tablist" aria-label="Packet publication status">
        {[
          ['all', 'All', sets.length],
          ['published', 'Published', publishedCount],
          ['draft', 'Drafts', draftCount],
        ].map(([value, label, count]) => (
          <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
            className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${filter === value ? 'bg-blue-500/15 text-blue-200' : 'text-white/35 hover:bg-white/[0.05] hover:text-white/65'}`}>
            {label} <span className="ml-1 font-mono text-[10px] opacity-60">{count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        {importError && <p className="mb-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{importError}</p>}
        {loading ? <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/35" /></div> : sets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-7 text-center">
            <FileText size={24} className="mx-auto mb-2 text-white/25" />
            <p className="text-[13px] font-semibold text-white/75">No packets yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-white/35">Write a packet from scratch or import a text-based PDF with numbered tossups and ANSWER: lines.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-white/[0.10] px-3 py-2 text-[12px] font-semibold text-white/60 hover:bg-white/[0.06]">Import PDF</button>
              <button onClick={onNew} className="rounded-lg bg-blue-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-400">Create set</button>
            </div>
          </div>
        ) : visibleSets.length === 0 ? (
          <div className="py-12 text-center"><p className="text-[13px] font-semibold text-white/60">No {filter} packets</p><p className="mt-1 text-[11px] text-white/30">Change the filter or publish a finished draft.</p></div>
        ) : <div className="space-y-2">{visibleSets.map(set => {
          const published = set.status === 'published';
          return (
            <div key={set.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 hover:border-white/[0.15] hover:bg-white/[0.05] transition-colors">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${published ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-white/[0.08] bg-white/[0.04]'}`}>
                  <FileText size={15} className={published ? 'text-emerald-300' : 'text-white/35'} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-white/90">{set.title}</p>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${published ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.03] text-white/35'}`}>{published ? 'Published' : 'Draft'}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-white/40">{set.category} · {set.difficulty} · {set.questionCount} question{set.questionCount === 1 ? '' : 's'}{set.source === 'pdf' ? ' · PDF import' : ''}</p>
                  {set.preview && <p className="mt-1 truncate text-[10px] text-white/25">{set.preview}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => onPlay(set.id)} disabled={!set.questionCount} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-400 disabled:opacity-40"><Play size={12} /> Play</button>
                <button onClick={() => onEdit(set.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/65 hover:bg-white/[0.08] hover:text-white"><Pencil size={12} /> Edit</button>
                <button onClick={() => onDelete(set.id)} aria-label={`Delete ${set.title}`} className="ml-auto rounded-md p-1.5 text-white/25 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}</div>}
      </div>
    </div>
  );
}

export function SavedSetCreator({
  initial = {},
  onBack,
  onCreateManual,
  onGenerate,
  model,
  models,
  onPickModel,
}) {
  const [mode, setMode] = useState(initial.mode === 'manual' ? 'manual' : 'ai');
  const [title, setTitle] = useState(initial.title || '');
  const [categories, setCategories] = useState(() => {
    const seeded = Array.isArray(initial.categories)
      ? initial.categories.filter(category => SET_CATEGORIES.includes(category))
      : (SET_CATEGORIES.includes(initial.category) ? [initial.category] : []);
    return seeded.length ? [...new Set(seeded)] : ['Mixed'];
  });
  const [difficulty, setDifficulty] = useState(DIFFICULTIES.includes(initial.difficulty) ? initial.difficulty : 'Medium');
  const [count, setCount] = useState(SET_COUNTS.includes(initial.count) ? initial.count : 10);
  const [prompt, setPrompt] = useState(initial.prompt || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const categoryLabel = categories.length === 1 ? categories[0] : categories.join(' + ');

  const payload = {
    title: title.trim() || `${categoryLabel} custom set`,
    category: categoryLabel,
    categories,
    difficulty,
    count,
    prompt: prompt.trim(),
  };

  function toggleCategory(category) {
    if (category === 'Mixed') {
      setCategories(['Mixed']);
      return;
    }
    setCategories(current => {
      const specific = current.filter(value => value !== 'Mixed');
      if (specific.includes(category)) {
        const next = specific.filter(value => value !== category);
        return next.length ? next : ['Mixed'];
      }
      return [...specific, category];
    });
  }

  async function submit() {
    if (busy) return;
    if (mode === 'ai' && !prompt.trim()) {
      setError('Describe the set you want the AI to write.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'ai') await onGenerate(payload);
      else await onCreateManual(payload);
    } catch (err) {
      setError(err.message || `Could not ${mode === 'ai' ? 'generate' : 'create'} this set.`);
      setBusy(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-transparent">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 transition-colors hover:text-white/75"><ArrowLeft size={15} /> Back</button>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white/90">Set creator</h2>
          <p className="text-[10px] text-white/35">Generate a draft with AI or write every tossup yourself</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="flex gap-1.5" role="tablist" aria-label="Set creation method">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'ai'}
              onClick={() => { setMode('ai'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${mode === 'ai' ? 'border-blue-400/35 bg-blue-500/15 text-blue-100' : 'border-white/[0.08] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}
            >
              <Sparkles size={14} /> Generate with AI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'manual'}
              onClick={() => { setMode('manual'); setError(''); }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 ${mode === 'manual' ? 'border-blue-400/35 bg-blue-500/15 text-blue-100' : 'border-white/[0.08] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}
            >
              <Pencil size={14} /> Write manually
            </button>
          </div>

          <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Set title</span>
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder={`${categoryLabel} custom set`}
                maxLength={120}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white/85 outline-none placeholder:text-white/25 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Categories</span>
                <span className="text-[10px] tabular-nums text-white/25">{categories[0] === 'Mixed' ? 'Broad mix' : `${categories.length} selected`}</span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Set categories">
                {SET_CATEGORIES.map(category => {
                  const selected = categories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${selected ? 'border-blue-400/35 bg-blue-500/15 text-blue-100' : 'border-white/[0.08] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-white/25">Choose one category or combine several. Mixed resets to a broad distribution.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Difficulty</span>
              <Dropdown value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} aria-label="Set difficulty" />
            </div>

            {mode === 'ai' ? (
              <>
                <div>
                  <label htmlFor="qb-set-prompt" className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">What should this set cover?</label>
                  <textarea
                    id="qb-set-prompt"
                    value={prompt}
                    onChange={event => { setPrompt(event.target.value); if (error) setError(''); }}
                    rows={5}
                    maxLength={2000}
                    placeholder="Example: Write a set on the Cold War, emphasizing proxy conflicts and diplomacy. Avoid questions whose answers are U.S. presidents."
                    className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] leading-relaxed text-white/85 outline-none placeholder:text-white/25 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20"
                  />
                  <div className="mt-1 flex justify-between gap-3 text-[10px] text-white/25">
                    <span>Include topics, distribution, style, and anything to avoid.</span>
                    <span className="tabular-nums">{prompt.length}/2000</span>
                  </div>
                </div>
                <QbModelPicker value={model} onPick={onPickModel} models={models || []} label="Writer model" />
                <div>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Questions</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SET_COUNTS.map(option => (
                      <button key={option} type="button" onClick={() => setCount(option)} className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors ${count === option ? 'border-blue-400/35 bg-blue-500/15 text-blue-100' : 'border-white/[0.08] bg-white/[0.025] text-white/40 hover:bg-white/[0.06] hover:text-white/70'}`}>{option}</button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-3">
                <Pencil size={15} className="mt-0.5 shrink-0 text-white/35" />
                <div>
                  <p className="text-[12px] font-semibold text-white/70">Start with an empty draft</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-white/35">The editor lets you add, edit, and remove tossups, enter answer lines, preview the round, and publish when it is ready.</p>
                </div>
              </div>
            )}
          </section>

          {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-3 text-[13px] font-bold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? <><Loader2 size={14} className="animate-spin" /> {mode === 'ai' ? 'Writing your set…' : 'Creating draft…'}</> : mode === 'ai' ? <><Sparkles size={14} /> Generate custom set</> : <><Pencil size={14} /> Open manual editor</>}
          </button>
          <p className="text-center text-[10px] text-white/25">AI output is saved as a draft so you can review and edit every question before publishing.</p>
        </div>
      </div>
    </div>
  );
}

export function SavedSetEditor({ initialSet, onBack, onPlay, onChanged }) {
  const [draft, setDraft] = useState(initialSet);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);
  const latest = useRef(initialSet);

  useEffect(() => { setDraft(initialSet); latest.current = initialSet; }, [initialSet]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function queue(next) {
    setDraft(next); latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(latest.current), 850);
  }
  async function save(next = latest.current) {
    if (!next?.id) return;
    setSaving(true); setError('');
    try {
      // Match the notes editor's forgiving autosave behavior: local edits
      // continue saving while a previous debounce request is resolving.
      const response = await updateSavedQuizBowlSet(next.id, next);
      setDraft(response.set); latest.current = response.set; onChanged?.(response.set);
    } catch (err) { setError(err.message || 'Could not save your changes.'); }
    setSaving(false);
  }
  function updateQuestion(index, field, value) {
    const questions = draft.questions.map((question, i) => i === index ? { ...question, [field]: value } : question);
    queue({ ...draft, questions });
  }
  function addQuestion() { queue({ ...draft, questions: [...draft.questions, { id: `draft-${Date.now()}-${draft.questions.length}`, text: '', answer: '', category: draft.category, coverageTag: '' }] }); }
  function removeQuestion(index) { queue({ ...draft, questions: draft.questions.filter((_, i) => i !== index) }); }

  async function changePublication(status) {
    if (timer.current) clearTimeout(timer.current);
    const next = { ...latest.current, status };
    setDraft(next);
    latest.current = next;
    await save(next);
  }

  if (!draft) return null;
  const playable = draft.questions.length > 0 && draft.questions.every(q => q.text.trim() && q.answer.trim());
  return <div className="h-full flex flex-col min-h-0 bg-transparent">
    <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0"><button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75"><ArrowLeft size={15} /> Packets</button><span className="text-[11px] text-white/35 ml-auto">{saving ? 'Saving…' : 'Auto-saved'}</span><button onClick={() => save()} className="rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white" aria-label="Save now"><Save size={14} /></button></div>
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[180px] flex-1">
          <input value={draft.title} onChange={e => queue({ ...draft, title: e.target.value })} placeholder="Packet title" aria-label="Packet title" className="w-full min-w-0 bg-transparent text-[19px] font-bold text-white/90 placeholder-white/25 outline-none" />
          <p className="mt-1 text-[10px] text-white/30">{draft.source === 'pdf' ? `Imported from ${draft.sourceFileName || 'PDF'}` : 'Created in Covalent AI'} · {(draft.questions || []).length} tossup{draft.questions?.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onPlay(draft)} disabled={!playable} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-white/65 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"><Play size={13} /> Preview</button>
          {draft.status === 'published' ? (
            <button onClick={() => changePublication('draft')} disabled={saving} className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-white/60 hover:bg-white/[0.08] disabled:opacity-40">Unpublish</button>
          ) : (
            <button onClick={() => changePublication('published')} disabled={!playable || saving} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-400 disabled:opacity-40"><Send size={13} /> Publish</button>
          )}
        </div>
      </div>
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${draft.status === 'published' ? 'border-emerald-400/20 bg-emerald-500/[0.08]' : 'border-white/[0.08] bg-white/[0.025]'}`}>
        <Check size={13} className={`mt-0.5 shrink-0 ${draft.status === 'published' ? 'text-emerald-300' : 'text-white/25'}`} />
        <div><p className={`text-[11px] font-semibold ${draft.status === 'published' ? 'text-emerald-200' : 'text-white/55'}`}>{draft.status === 'published' ? 'Published to Quiz Bowl Collection' : 'Draft packet'}</p><p className="mt-0.5 text-[10px] text-white/30">{draft.status === 'published' ? 'Other players can now find and play this exact set.' : 'Complete every question and answer before publishing.'}</p></div>
      </div>
      <div className="grid grid-cols-2 items-start gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Category</span>
          <input value={draft.category} onChange={e => queue({ ...draft, category: e.target.value })} className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white/80 outline-none focus:border-blue-400/50" />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Difficulty</span>
          <Dropdown
            value={draft.difficulty || DIFFICULTIES[0]}
            options={DIFFICULTIES}
            onChange={difficulty => queue({ ...draft, difficulty })}
            aria-label="Difficulty"
          />
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</p>}
      <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Questions <span className="font-normal tracking-normal text-white/25">· edits save automatically</span></p><button onClick={addQuestion} className="inline-flex items-center gap-1 rounded-md border border-white/[0.10] px-2 py-1 text-[11px] font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white"><Plus size={12} /> Add</button></div>
      <div className="space-y-2.5">{draft.questions.map((question, index) => <div key={question.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"><div className="mb-2 flex items-center"><span className="text-[10px] font-bold text-white/35">Q{index + 1}</span><button onClick={() => removeQuestion(index)} aria-label={`Remove question ${index + 1}`} className="ml-auto rounded-md p-1 text-white/25 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button></div><textarea value={question.text} onChange={e => updateQuestion(index, 'text', e.target.value)} rows={4} placeholder="Write the tossup question…" className="w-full resize-y bg-transparent text-[12px] leading-relaxed text-white/80 placeholder-white/22 outline-none" /><input value={question.answer} onChange={e => updateQuestion(index, 'answer', e.target.value)} placeholder="Correct answer" className="mt-2 w-full rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-[12px] font-medium text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50" /></div>)}</div>
      {!draft.questions.length && <div className="rounded-xl border border-dashed border-white/[0.10] py-7 text-center text-[12px] text-white/35">Add a question to begin your packet.</div>}
      {!playable && draft.questions.length > 0 && <p className="text-[10px] text-white/30"><Check size={11} className="inline mr-1" />Each question needs both a prompt and correct answer before it can be played.</p>}
    </div>
  </div>;
}
