import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, AlertTriangle, Check, RefreshCw, ArrowLeft, Loader2, List, Zap, FileText, Scale, Pencil, Plus, X, Wand2, Globe } from 'lucide-react';
import { getWikiPage, searchWiki, listWikiPages, listWikiTitles, reportWikiPage, updateWikiPage, aiEditWikiPage, listWikiReports, resolveWikiReport } from '../../../api/wiki';
import { checkAdmin } from '../../../api/admin';
import { createNote, updateNote } from '../../../api/notes';
import { useWindowManager } from '../../../context/WindowManagerContext';
import ViewFade from '../../shared/ViewFade';
import Button from '../../shared/Button';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ProgressBar, { InlineProgress } from '../../shared/ProgressBar';
import { SkeletonProse } from '../../shared/Skeleton';
import useBrowserBack from '../../../hooks/useBrowserBack';

// ─── QB-highlight renderer ─────────────────────────────────────────────────
// Turns **term** into blue-highlighted bold spans — the key visual of QBpedia.
// Grounded pages also carry inline [n] citation markers (injected server-side
// from Google Search grounding); those render as small superscripts that
// match the numbered Sources list at the bottom of the article. Prose is also
// matched against every existing page title, so mentions of other QBpedia
// articles become wiki-style links that open that page in place.

// One alternation regex over all known page titles, longest first so
// "World War II" beats "World War". Lookarounds instead of \b so titles that
// start or end on punctuation still match whole words only.
function buildLinkIndex(titles, excludeSlug, excludeTitle) {
  const skip = stripCites(excludeTitle || '').trim().toLowerCase();
  const entries = [];
  for (const t of titles || []) {
    if (!t.slug || t.slug === excludeSlug) continue;
    const full = stripCites(t.title || '').trim();
    // "The French Revolution" must also match prose saying "French Revolution"
    // — the article "the" usually sits outside the **highlight** marks.
    const variants = [full];
    const bare = full.replace(/^the\s+/i, '');
    if (bare !== full) variants.push(bare);
    for (const v of variants) {
      if (v.length >= 3 && v.toLowerCase() !== skip) entries.push({ title: v, slug: t.slug });
    }
  }
  entries.sort((a, b) => b.title.length - a.title.length);
  if (!entries.length) return null;
  const pattern = entries.map(e => e.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return {
    regex: new RegExp(`(?<!\\w)(${pattern})(?!\\w)`, 'gi'),
    bySlug: new Map(entries.map(e => [e.title.toLowerCase(), e.slug])),
  };
}

// Wikipedia's first-mention rule: within one text block each target page
// links at most once; later mentions stay plain text.
function linkifySegment(seg, keyBase, linkCtx, inMark) {
  if (!seg || !linkCtx) return seg;
  const { index, linked, onNavigate } = linkCtx;
  index.regex.lastIndex = 0;
  const out = [];
  let last = 0;
  let m;
  while ((m = index.regex.exec(seg))) {
    const slug = index.bySlug.get(m[1].toLowerCase());
    if (!slug || linked.has(slug)) continue;
    linked.add(slug);
    if (m.index > last) out.push(seg.slice(last, m.index));
    out.push(
      <button
        key={`${keyBase}-w${m.index}`}
        type="button"
        onClick={() => onNavigate(slug)}
        title={`Open "${m[1]}" in QBpedia`}
        className={`inline align-baseline cursor-pointer underline underline-offset-2 transition-colors ${
          inMark
            ? 'decoration-blue-200/60 hover:decoration-blue-100 hover:text-blue-100'
            : 'text-blue-300 hover:text-blue-200 decoration-blue-300/40 hover:decoration-blue-200/70'
        }`}
      >
        {m[1]}
      </button>
    );
    last = m.index + m[1].length;
  }
  if (!out.length) return seg;
  if (last < seg.length) out.push(seg.slice(last));
  return out;
}

function renderRich(text, keyBase, sources, linkCtx, inMark) {
  const segs = text.split(/\[(\d+)\]/g);
  const out = [];
  segs.forEach((seg, i) => {
    if (i % 2 === 0) {
      const piece = linkifySegment(seg, `${keyBase}-${i}`, linkCtx, inMark);
      if (Array.isArray(piece)) out.push(...piece);
      else out.push(piece);
      return;
    }
    const src = sources?.[parseInt(seg, 10) - 1];
    if (src?.url) {
      out.push(
        <a
          key={`${keyBase}-c${i}`}
          href={src.url}
          target="_blank"
          rel="noreferrer"
          title={src.title || src.url}
          className="align-super text-blue-300/70 text-[9px] font-semibold hover:text-blue-200 hover:underline underline-offset-2"
        >
          [{seg}]
        </a>
      );
    } else {
      out.push(<sup key={`${keyBase}-c${i}`} className="text-blue-300/70 text-[9px] font-semibold">[{seg}]</sup>);
    }
  });
  return out;
}

function QBText({ text, sources, className = '', linkIndex, onNavigate }) {
  if (!text) return null;
  const linkCtx = linkIndex && onNavigate ? { index: linkIndex, linked: new Set(), onNavigate } : null;
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-blue-400/25 text-blue-200 font-bold rounded-sm px-0.5 not-italic">{renderRich(part, i, sources, linkCtx, true)}</mark>
          : <span key={i}>{renderRich(part, i, sources, linkCtx, false)}</span>
      )}
    </span>
  );
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const stripCites = (s) => (s || '').replace(/\s*\[\d+\]/g, '');

// Pull the **bold** QB terms out of article text, deduped, citation-free.
function extractTerms(text, out) {
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  while ((m = re.exec(text || ''))) {
    const t = stripCites(m[1]).trim();
    if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
}

// Split article prose into individual fact sentences. Citation markers go;
// the **term** bolds stay so the key clues render bold inside the note.
function factSentences(text) {
  return stripCites(text || '')
    .split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/)
    .map(s => s.trim())
    .filter(s => s.length > 15);
}

// Cornell-note seed: section headings with the article's actual facts as
// bullets, one fact per line. The cue column (buildCues) carries the bare
// terms as recall prompts to test against these facts.
function buildNoteSeed(page) {
  const lines = [`*Seeded from QBpedia: ${stripCites(page.title)}*`, ''];
  const leadFacts = factSentences(page.lead);
  if (leadFacts.length) {
    lines.push('## Lead');
    for (const f of leadFacts.slice(0, 8)) lines.push(`- ${f}`);
    lines.push('');
  }
  for (const s of page.sections || []) {
    const facts = factSentences(s.content);
    if (!facts.length) continue;
    lines.push(`## ${stripCites(s.title)}`);
    for (const f of facts.slice(0, 8)) lines.push(`- ${f}`);
    lines.push('');
  }
  return lines.join('\n');
}

// Plain-text digest of the whole article (bolds and citations stripped) -
// the payload QBpedia hands to Quiz Bowl and Debate so they work from the
// page's actual facts instead of just the topic name. The cap is generous
// on purpose: those activities treat this as their ONLY fact source, so
// truncating it starves them of material.
function articleFacts(page, maxLen = 12000) {
  const parts = [stripCites(page.lead || '').replace(/\*\*/g, '')];
  for (const s of page.sections || []) {
    parts.push(`${stripCites(s.title)}: ${stripCites(s.content || '').replace(/\*\*/g, '')}`);
  }
  const text = parts.filter(Boolean).join('\n');
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

// Cue column = recall prompts. The first bolded terms of the article are
// exactly the clues a QB player should be able to produce cold.
function buildCues(page) {
  const terms = [];
  extractTerms(page.lead, terms);
  for (const s of page.sections || []) extractTerms(s.content, terms);
  return terms.slice(0, 8);
}

function formatRelative(isoDate) {
  const delta = Date.now() - new Date(isoDate).getTime();
  const m = Math.floor(delta / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function QBpediaApp() {
  const [view, setView] = useState('hub'); // hub | article | report | edit | why | reports
  const [currentSlug, setCurrentSlug] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [recentPages, setRecentPages] = useState([]);
  // Slug + title of every cached page — the lookup behind in-article wiki links
  const [allTitles, setAllTitles] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Open error-report count — fuels the admin Reports badge in the hub.
  const [reportCount, setReportCount] = useState(0);
  // True while the server backfills sources into a pre-citation page; the
  // stale article stays on screen and swaps once the cited rewrite lands.
  const [refreshing, setRefreshing] = useState(false);

  useBrowserBack(view !== 'hub', () => {
    if (view === 'report' || view === 'edit') { setView('article'); return; }
    setView('hub');
    setCurrentSlug(null);
    setCurrentPage(null);
    setSearchResults(null);
  });

  const refreshIndex = useCallback(() => {
    listWikiPages().then(d => setRecentPages(d.pages || [])).catch(() => {});
    listWikiTitles().then(d => setAllTitles(d.titles || [])).catch(() => {});
  }, []);

  useEffect(() => {
    refreshIndex();
    checkAdmin().then(d => setIsAdmin(!!d.isAdmin)).catch(() => {});
  }, [refreshIndex]);

  const loadReportCount = useCallback(() => {
    listWikiReports().then(d => setReportCount((d.reports || []).length)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAdmin) loadReportCount();
  }, [isAdmin, loadReportCount]);

  async function openPage(slug, { retry = false } = {}) {
    setError(null);
    setCurrentSlug(slug);
    setCurrentPage(null);
    setView('article');
    setLoading(true);
    setGenerating(false);
    setRefreshing(false);
    try {
      // Already-generated pages come back from cache; only new topics generate
      const data = await getWikiPage(slug, { retry });
      if (data.failed) {
        setError(data.error || 'Generation failed.');
      } else if (data.generating) {
        setGenerating(true);
      }
      if (data.page) {
        setCurrentPage(data.page);
        setGenerating(false);
        setRefreshing(!!data.refreshing);
        // Refresh recent list
        refreshIndex();
      }
    } catch (e) {
      setError(e.message || 'Failed to load page.');
      setGenerating(false);
    }
    setLoading(false);
  }

  // Poll for generation if server is generating. Gemini Pro with search
  // grounding routinely takes 60-120s, so the give-up ceiling is generous.
  useEffect(() => {
    if (!generating || !currentSlug) return;
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > 300000) {
        setGenerating(false);
        setError('Generation timed out.');
        clearInterval(interval);
        return;
      }
      try {
        const data = await getWikiPage(currentSlug);
        if (data.failed) {
          setGenerating(false);
          setError(data.error || 'Generation failed.');
          clearInterval(interval);
          return;
        }
        if (data.page && !data.generating) {
          setCurrentPage(data.page);
          setGenerating(false);
          setRefreshing(!!data.refreshing);
          clearInterval(interval);
          refreshIndex();
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [generating, currentSlug]);

  // Source backfill poll: the article is on screen, so poll gently (no view
  // bumps) and swap the page in once the server's cited rewrite is saved.
  useEffect(() => {
    if (!refreshing || !currentSlug) return;
    const startedAt = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startedAt > 300000) {
        setRefreshing(false);
        clearInterval(interval);
        return;
      }
      try {
        const data = await getWikiPage(currentSlug, { poll: true });
        if (data.page && (data.page.sources?.length || !data.refreshing)) {
          setCurrentPage(data.page);
          setRefreshing(false);
          clearInterval(interval);
        }
      } catch {}
    }, 6000);
    return () => clearInterval(interval);
  }, [refreshing, currentSlug]);

  function goHub() {
    setView('hub');
    setCurrentSlug(null);
    setCurrentPage(null);
    setError(null);
    setSearchResults(null);
    setRefreshing(false);
  }

  if (view === 'report' && currentPage) {
    return (
      <ViewFade viewKey="report" className="h-full">
        <ReportView page={currentPage} onBack={() => setView('article')} />
      </ViewFade>
    );
  }

  if (view === 'edit' && currentPage) {
    return (
      <ViewFade viewKey="edit" className="h-full">
        <EditView
          page={currentPage}
          onBack={() => setView('article')}
          onSaved={(updated) => {
            setCurrentPage(updated);
            setView('article');
            refreshIndex();
          }}
        />
      </ViewFade>
    );
  }

  if (view === 'why') {
    return (
      <ViewFade viewKey="why" className="h-full">
        <WhyView onBack={goHub} onNavigate={openPage} />
      </ViewFade>
    );
  }

  if (view === 'reports') {
    return (
      <ViewFade viewKey="reports" className="h-full">
        <AdminReportsView onBack={goHub} onOpenPage={openPage} onResolved={loadReportCount} />
      </ViewFade>
    );
  }

  if (view === 'article') {
    return (
      <ViewFade viewKey={`article:${currentSlug}`} className="h-full flex flex-col">
        <ArticleView
          slug={currentSlug}
          page={currentPage}
          loading={loading}
          generating={generating}
          refreshing={refreshing}
          error={error}
          onBack={goHub}
          onNavigate={openPage}
          onRetry={() => openPage(currentSlug, { retry: true })}
          onReport={() => setView('report')}
          isAdmin={isAdmin}
          onEdit={() => setView('edit')}
          titles={allTitles}
        />
      </ViewFade>
    );
  }

  return (
    <ViewFade viewKey="hub" className="h-full flex flex-col">
      <HubView
        searchResults={searchResults}
        setSearchResults={setSearchResults}
        onNavigate={openPage}
        onWhy={() => setView('why')}
        isAdmin={isAdmin}
        reportCount={reportCount}
        onReports={() => setView('reports')}
      />
    </ViewFade>
  );
}

// ─── Hub ──────────────────────────────────────────────────────────────────
function HubView({ searchResults, setSearchResults, onNavigate, onWhy, isAdmin, reportCount, onReports }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  function handleSearch(val) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchWiki(val.trim());
        setSearchResults(data.results || []);
      } catch {}
      setSearching(false);
    }, 350);
  }

  function handleEnter(e) {
    if (e.key !== 'Enter' || !query.trim()) return;
    const slug = slugify(query.trim());
    onNavigate(slug);
    setQuery('');
    setSearchResults(null);
  }

  const POPULAR_TOPICS = [
    'Napoleon Bonaparte', 'World War II', 'The French Revolution',
    'William Shakespeare', 'The Civil War', 'Albert Einstein',
    'The Renaissance', 'Ancient Rome', 'Charles Darwin', 'The Cold War',
    'Marie Curie', 'The Ottoman Empire',
  ];

  const RECOMMENDED_TOPICS = [
    { label: 'Emmy Noether',           cat: 'Science' },
    { label: 'Paul Dirac',             cat: 'Science' },
    { label: 'Leonhard Euler',         cat: 'Science' },
    { label: 'Niels Bohr',             cat: 'Science' },
    { label: 'The Brothers Karamazov', cat: 'Literature' },
    { label: 'Don Quixote',            cat: 'Literature' },
    { label: 'Doctor Faustus',         cat: 'Literature' },
    { label: 'One Hundred Years of Solitude', cat: 'Literature' },
    { label: 'Robespierre',            cat: 'History' },
    { label: 'Simón Bolívar',          cat: 'History' },
    { label: 'Otto von Bismarck',      cat: 'History' },
    { label: 'Battle of Agincourt',    cat: 'History' },
    { label: 'Caravaggio',             cat: 'Art' },
    { label: 'Johannes Vermeer',       cat: 'Art' },
    { label: 'Dmitri Shostakovich',    cat: 'Music' },
    { label: 'Gustav Mahler',          cat: 'Music' },
    { label: 'Immanuel Kant',          cat: 'Philosophy' },
    { label: 'Søren Kierkegaard',      cat: 'Philosophy' },
    { label: 'Prometheus',             cat: 'Mythology' },
    { label: 'Osiris',                 cat: 'Mythology' },
  ];

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Header — notes-style: plain bold title, quiet actions on the right */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <h2 className="text-lg font-bold text-white/90">QBpedia</h2>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={onReports}
              title="Review error reports filed by readers"
              className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <AlertTriangle size={12} className={reportCount > 0 ? 'text-amber-300/80' : ''} />
              Reports
              {reportCount > 0 && (
                <span className="px-1.5 py-px rounded-full bg-rose-500/20 border border-rose-400/30 text-rose-200 text-[9px] font-bold tabular-nums">
                  {reportCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={onWhy}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Why not Wikipedia?
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-5 flex-shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onKeyDown={handleEnter}
          placeholder="Search or enter any topic to generate a page…"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-sm text-white/90 placeholder-white/30 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500 transition-colors"
        />
        {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">

        {/* Search results */}
        {searchResults !== null && (
          <div className="mb-5">
            {searchResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-white/55 mb-1">No cached pages match.</p>
                <p className="text-xs text-white/35">Press Enter to generate a new page for <span className="text-blue-300/80">"{query}"</span></p>
              </div>
            ) : (
              <>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5 mb-2">
                  <Search size={12} /> Results
                </h3>
                <div>
                  {searchResults.map(p => (
                    <PageRow key={p.slug} page={p} onClick={() => onNavigate(p.slug)} />
                  ))}
                </div>
                <button
                  onClick={() => onNavigate(slugify(query))}
                  className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-white/[0.03] text-sm text-white/45 hover:text-white/75 transition-colors"
                >
                  <Plus size={13} className="flex-shrink-0 text-white/35" />
                  <span>Generate a new page for <span className="text-blue-300/80 font-medium">"{query}"</span></span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Popular starting points */}
        {searchResults === null && (
          <>
            <div className="mb-5">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">
                Quick start
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_TOPICS.map(topic => (
                  <button
                    key={topic}
                    onClick={() => onNavigate(slugify(topic))}
                    className="text-[12px] px-2.5 py-1 rounded-lg border bg-blue-500 border-blue-400 text-white font-medium hover:bg-blue-400 hover:border-blue-300 transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommended niche topics */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">
                Recommended
              </h3>
              <div className="space-y-0.5">
                {RECOMMENDED_TOPICS.map(({ label, cat }) => (
                  <button
                    key={label}
                    onClick={() => onNavigate(slugify(label))}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.04] transition-colors group"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-white/25 w-16 shrink-0 group-hover:text-white/40 transition-colors">{cat}</span>
                    <span className="text-[13px] text-white/65 group-hover:text-white/90 transition-colors">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageRow({ page, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03] rounded-md transition-colors"
    >
      <Globe size={13} className="text-white/35 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-white/90 truncate">{page.title}</h3>
        {page.lead && (
          <p className="text-xs text-white/55 truncate">
            {stripCites(page.lead).replace(/\*\*/g, '')}
          </p>
        )}
      </div>
      {page.generatedAt && (
        <span className="text-[10.5px] text-white/40 flex-shrink-0">{formatRelative(page.generatedAt)}</span>
      )}
    </button>
  );
}

// ─── Article ──────────────────────────────────────────────────────────────
function ArticleView({ slug, page, loading, generating, refreshing, error, onBack, onNavigate, onRetry, onReport, isAdmin, onEdit, titles }) {
  const [tocOpen, setTocOpen] = useState(false);
  const [readPct, setReadPct] = useState(0);
  // Wikipedia-style right rail (actions + contents + related + page notes),
  // sized off the WINDOW width, not the viewport — the app lives in a
  // draggable window, so media queries would lie. 'full' is the spacious
  // fullscreen treatment, 'compact' the same two-column layout squeezed for a
  // default window, 'stack' a single column when no rail can fit.
  const [bodyW, setBodyW] = useState(0);
  // Height too: the sticky rail must cap at the window height and scroll
  // internally, or anything below the fold in it would never be reachable.
  const [bodyH, setBodyH] = useState(0);
  const layout = bodyW >= 900 ? 'full' : bodyW >= 560 ? 'compact' : 'stack';
  const rail = layout !== 'stack';
  const full = layout === 'full';
  const scrollRef = useRef(null);
  const sectionRefs = useRef([]);
  const { openApp } = useWindowManager();
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState(null);

  // "Take notes" pre-creates a Cornell note seeded from this article, then
  // hands off to the Notes app with that note already open.
  async function handleTakeNotes() {
    if (noteBusy || !page) return;
    setNoteBusy(true);
    setNoteErr(null);
    try {
      const { note } = await createNote(stripCites(page.title));
      await updateNote(note.id, { mainNotes: buildNoteSeed(page), cues: buildCues(page) });
      openApp('notes', 'Notes', { initialNoteId: note.id });
    } catch (e) {
      setNoteErr(e.message || 'Could not create the note.');
    }
    setNoteBusy(false);
  }

  const displayTitle = page?.title || slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';

  // Other pages' titles to hot-link in this article; never self-links.
  const linkIndex = useMemo(
    () => (page ? buildLinkIndex(titles, slug, page.title) : null),
    [titles, slug, page]
  );

  // Wikipedia red links: related topics with no page yet render red, existing
  // ones blue. Slug set rebuilt whenever the title index refreshes.
  const existingSlugs = useMemo(() => new Set((titles || []).map(t => t.slug)), [titles]);

  const updateReadPct = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setReadPct(max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100)));
  }, []);

  useEffect(() => { updateReadPct(); }, [page, layout, updateReadPct]);

  // scrollRef only exists once the article body renders, so re-attach on page.
  // Measure synchronously first — ResizeObserver's initial callback rides the
  // paint cycle and can stall in throttled/background tabs; it stays on for
  // live window drag-resizes, with a window resize listener as fallback.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => { setBodyW(el.clientWidth); setBodyH(el.clientHeight); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [page]);

  function scrollToSection(i) {
    const sc = scrollRef.current;
    if (!sc) return;
    if (i < 0) { sc.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const el = sectionRefs.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 10;
    sc.scrollTo({ top, behavior: 'smooth' });
  }

  if (loading && !generating) {
    return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;
  }

  if (generating) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={16} /> QBpedia
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="pt-1 pb-10 max-w-2xl mx-auto">
            <h1 className="text-xl font-bold text-white/95 leading-tight mb-1">{displayTitle}</h1>
            <p className="text-xs text-white/35 mb-6">First time anyone has opened this page — writing it now.</p>
            <ProgressBar
              active
              label={`Writing article on ${displayTitle}`}
              hint="Checking facts with Google Search · 30-90 seconds"
              duration={60000}
            />
            <div className="mt-6 space-y-3 opacity-40">
              <SkeletonProse lines={5} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center">
          <AlertTriangle size={28} className="text-rose-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-white/80 mb-1">Failed to load</p>
          <p className="text-xs text-rose-300/80 mb-4">{error}</p>
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft size={14} /> Back</Button>
            <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw size={13} /> Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!page) return null;

  // One markup for every layout: a chip row above the article when stacked,
  // stacked full-width buttons in the rail otherwise (smaller in the compact rail).
  // Notes-style surfaces: neutral button, the app's identity lives in the icon color.
  const btnSize = rail && !full ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-1.5 text-[12px]';
  const studyBtn = 'inline-flex items-center gap-1.5 rounded-lg font-medium border border-white/[0.06] bg-white/[0.03] text-white/65 hover:text-white/90 hover:bg-white/[0.06] hover:border-white/[0.12] transition-colors';
  const studyActions = (
    <div className={rail ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-center gap-1.5 mb-4'}>
      <button
        onClick={() => openApp('quizbowl', 'Quiz Bowl', { initialTopic: stripCites(page.title), initialContext: articleFacts(page), autoStart: true })}
        className={`${studyBtn} ${btnSize} ${rail ? 'w-full' : ''}`}
      >
        <Zap size={12} className="flex-shrink-0 text-amber-300" /> {rail ? 'Start a Quiz Bowl game' : 'Start a Quiz Bowl game on this'}
      </button>
      <button
        onClick={handleTakeNotes}
        disabled={noteBusy}
        className={`${studyBtn} ${btnSize} disabled:opacity-50 ${rail ? 'w-full' : ''}`}
      >
        {noteBusy ? <Loader2 size={12} className="animate-spin flex-shrink-0 text-emerald-300" /> : <FileText size={12} className="flex-shrink-0 text-emerald-300" />} Take notes
      </button>
      <button
        onClick={() => openApp('debate', 'Debate', { initialTopic: stripCites(page.title), initialContext: articleFacts(page) })}
        className={`${studyBtn} ${btnSize} ${rail ? 'w-full' : ''}`}
      >
        <Scale size={12} className="flex-shrink-0 text-rose-300" /> Debate it
      </button>
      {noteErr && <p className="text-[11px] text-rose-300/80">{noteErr}</p>}
    </div>
  );

  // Legend, accuracy disclaimer, and the report link as one quiet text block,
  // no colored banners. Lives at the bottom of the rail when there is one,
  // otherwise above the article.
  const pageNotes = (
    <div className={rail ? 'space-y-1.5' : 'mb-4 pb-3 space-y-1.5 border-b border-white/[0.06]'}>
      <p className="text-[11px] leading-relaxed text-white/45">
        <mark className="bg-blue-400/25 text-blue-200 font-bold rounded-sm px-0.5 not-italic">Highlighted</mark> = key clue terms to memorize for Quiz Bowl
      </p>
      <p className="text-[11px] leading-relaxed text-white/45 flex items-start gap-1.5">
        <AlertTriangle size={11} className="flex-shrink-0 mt-[2.5px] text-white/35" />
        <span>Not 100% accurate yet. Check other sources too.</span>
      </p>
      <button
        onClick={onReport}
        className="text-left text-[11px] text-white/40 hover:text-white/70 underline decoration-white/20 underline-offset-2 transition-colors"
      >
        Report an error on this page
      </button>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header — notes-style inline back button + quiet icon actions */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> QBpedia
        </button>
        <div className="flex items-center gap-1">
          {!rail && (
            <button
              onClick={() => setTocOpen(o => !o)}
              title="Table of contents"
              className={`p-1.5 rounded-md transition-colors ${tocOpen ? 'bg-white/[0.08] text-white/70' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.05]'}`}
            >
              <List size={14} />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onEdit}
              title="Edit page (admin)"
              className="p-1.5 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Reading progress — fills as you scroll through the article */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/[0.08]">
          <div
            className="h-full bg-blue-400 transition-all duration-150 ease-out rounded-full"
            style={{ width: `${readPct}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-white/35 flex-shrink-0 w-7 text-right">{readPct}%</span>
      </div>

      {/* TOC dropdown — stacked mode only; rail layouts have Contents in the rail */}
      {!rail && tocOpen && page.sections?.length > 0 && (
        <div className="mb-3 pb-2.5 border-b border-white/[0.06] flex-shrink-0">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5 mb-1.5"><List size={12} /> Contents</h3>
          <div className="flex flex-col gap-0.5">
            <button onClick={() => { setTocOpen(false); scrollToSection(-1); }} className="text-left text-[11px] text-white/55 hover:text-white/80 py-0.5">Lead</button>
            {page.sections.map((s, i) => (
              <button key={i} onClick={() => { setTocOpen(false); scrollToSection(i); }} className="text-left text-[11px] text-white/55 hover:text-white/80 py-0.5">
                {i + 1}. {stripCites(s.title)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Article body */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" ref={scrollRef} onScroll={updateReadPct}>
        <div className={rail ? (full ? 'pt-1 pb-12 max-w-5xl mx-auto flex items-start gap-10' : 'pt-1 pb-10 flex items-start gap-6') : 'pt-1 pb-10 max-w-2xl mx-auto'}>
        <div className={rail ? 'flex-1 min-w-0 max-w-[44rem]' : ''}>
          {/* Title */}
          <h1 className={`${full ? 'text-2xl' : 'text-xl'} font-bold text-white/95 leading-tight mb-1`}>{page.title}</h1>
          <div className={`flex items-center gap-2 ${rail ? 'pb-3 mb-4 border-b border-white/[0.08]' : 'mb-4'}`}>
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">QBpedia</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] text-white/25">{formatRelative(page.generatedAt)}</span>
            {page.editedAt && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-[10px] text-white/25">edited {formatRelative(page.editedAt)}</span>
              </>
            )}
            {page.views > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="text-[10px] text-white/25">{page.views} views</span>
              </>
            )}
          </div>

          {/* Study actions and page notes sit above the article only when
              there's no rail to hold them */}
          {!rail && studyActions}
          {!rail && pageNotes}

          {/* Lead paragraph */}
          <p className="text-[14px] leading-[1.75] text-white/85 mb-5 font-light">
            <QBText text={page.lead} sources={page.sources} linkIndex={linkIndex} onNavigate={onNavigate} />
          </p>

          {/* Sections */}
          {(page.sections || []).map((section, i) => (
            <div key={i} className="mb-5" ref={el => { sectionRefs.current[i] = el; }}>
              <h2 className="text-[15px] font-bold text-white/95 mb-2 pb-1.5 border-b border-white/[0.08]">
                {section.title}
              </h2>
              <p className="text-[13.5px] leading-[1.75] text-white/80 font-light">
                <QBText text={section.content} sources={page.sources} linkIndex={linkIndex} onNavigate={onNavigate} />
              </p>
            </div>
          ))}

          {/* Related topics — bottom chips in stacked mode; rail layouts list them */}
          {!rail && page.relatedTopics?.length > 0 && (
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Related topics</p>
              <div className="flex flex-wrap gap-1.5">
                {page.relatedTopics.map(topic => (
                  <button
                    key={topic}
                    onClick={() => onNavigate(slugify(topic))}
                    className="text-[12px] px-2.5 py-1 rounded-lg border bg-white/[0.03] border-white/[0.06] text-white/55 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sources — real web sources from Google Search grounding */}
          {page.sources?.length > 0 ? (
            <div className="mt-6 pt-4 border-t border-white/[0.06]">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Sources</p>
              <ol className="space-y-1">
                {page.sources.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[11px] min-w-0">
                    <span className="text-blue-300/60 font-semibold tabular-nums flex-shrink-0">[{i + 1}]</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-white/55 hover:text-blue-300 underline decoration-white/15 underline-offset-2 truncate transition-colors"
                    >
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ) : refreshing ? (
            <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-white/30" />
              <span className="text-[11px] text-white/35">
                This page was written before citations existed. Rewriting it with checked sources, it will swap in here when ready.
              </span>
            </div>
          ) : null}

        </div>

        {/* Right rail — the Wikipedia-style tools column. Sticky inside the
            article scroll container, so it stays put while the text scrolls. */}
        {rail && (
          <aside
            className={`flex-shrink-0 sticky top-2 overflow-y-auto overscroll-contain pr-2 ${full ? 'w-60 space-y-5' : 'w-44 space-y-4'}`}
            style={bodyH ? { maxHeight: bodyH - 16 } : undefined}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Study this page</p>
              {studyActions}
            </div>
            {page.sections?.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Contents</p>
                <div className="flex flex-col">
                  <button onClick={() => scrollToSection(-1)} className="text-left text-[11.5px] text-white/55 hover:text-blue-300 py-[3px] transition-colors">Lead</button>
                  {page.sections.map((s, i) => (
                    <button key={i} onClick={() => scrollToSection(i)} className="text-left text-[11.5px] text-white/55 hover:text-blue-300 py-[3px] transition-colors">
                      {i + 1}. {stripCites(s.title)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {page.relatedTopics?.length > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-1.5">Related articles</p>
                <div className="flex flex-col">
                  {page.relatedTopics.map(topic => {
                    const exists = existingSlugs.has(slugify(topic));
                    return (
                      <button
                        key={topic}
                        onClick={() => onNavigate(slugify(topic))}
                        title={exists ? `Open "${topic}"` : `"${topic}" hasn't been written yet — click to generate it`}
                        className={`text-left text-[11.5px] py-[3px] hover:underline underline-offset-2 transition-colors ${exists ? 'text-blue-300 hover:text-blue-200' : 'text-rose-300/75 hover:text-rose-200'}`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">About</p>
              {pageNotes}
            </div>
          </aside>
        )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin edit ────────────────────────────────────────────────────────────
// Direct page editor for admins. Text keeps the raw markers: **term** for
// highlights, [n] for citations into the page's numbered Sources list.
function EditView({ page, onBack, onSaved }) {
  const [title, setTitle] = useState(page.title || '');
  const [lead, setLead] = useState(page.lead || '');
  const [sections, setSections] = useState((page.sections || []).map(s => ({ ...s })));
  const [related, setRelated] = useState((page.relatedTopics || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const undoRef = useRef(null); // pre-AI snapshot of the fields

  function patchSection(i, patch) {
    setSections(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function handleAiEdit() {
    const instruction = aiInstruction.trim();
    if (!instruction || aiBusy) return;
    setAiBusy(true);
    setErr(null);
    setAiApplied(false);
    try {
      const { draft } = await aiEditWikiPage(page.slug, instruction);
      undoRef.current = { title, lead, sections, related };
      setTitle(draft.title || '');
      setLead(draft.lead || '');
      setSections((draft.sections || []).map(s => ({ ...s })));
      setRelated((draft.relatedTopics || []).join(', '));
      setAiApplied(true);
      setAiInstruction('');
    } catch (e) {
      setErr(e.message || 'AI edit failed.');
    } finally {
      setAiBusy(false);
    }
  }

  function handleUndoAi() {
    const snap = undoRef.current;
    if (!snap) return;
    setTitle(snap.title);
    setLead(snap.lead);
    setSections(snap.sections);
    setRelated(snap.related);
    undoRef.current = null;
    setAiApplied(false);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const { page: updated } = await updateWikiPage(page.slug, {
        title: title.trim(),
        lead,
        sections: sections.filter(s => s.title.trim() || s.content.trim()),
        relatedTopics: related.split(',').map(t => t.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch (e) {
      setErr(e.message || 'Failed to save.');
      setSaving(false);
    }
  }

  const fieldCls = 'w-full px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[13px] text-white/90 placeholder-white/30 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors';
  const labelCls = 'block text-xs font-medium text-white/40 mb-1.5';

  return (
    <div className="h-full overflow-y-auto">
      <div className="pb-10 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5 gap-2">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={16} /> Article
          </button>
        </div>

        <div className="mb-5">
          <h2 className="text-lg font-bold text-white/90">Edit page</h2>
          <p className="text-xs text-white/40 mt-0.5">
            <mark className="bg-blue-400/25 text-blue-200 font-semibold rounded-sm px-0.5 not-italic">**term**</mark> highlights a clue · [n] cites source n
          </p>
        </div>

        <div className="space-y-4">
          {/* AI-assisted edit: the draft lands in the fields below for review;
              nothing is saved until the admin hits Save changes. */}
          <div className="pb-4 border-b border-white/[0.06] space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 flex items-center gap-1.5">
              <Wand2 size={12} /> Edit with AI
            </h3>
            <textarea
              value={aiInstruction}
              onChange={e => setAiInstruction(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAiEdit(); }}
              rows={2}
              disabled={aiBusy}
              placeholder={'Describe the change: "fix the dates in Early Life", "tighten the lead", "add a section on her later work"'}
              className={`${fieldCls} resize-none leading-relaxed disabled:opacity-50`}
            />
            <div className="flex items-center gap-2.5">
              <Button size="sm" variant="secondary" onClick={handleAiEdit} disabled={aiBusy || !aiInstruction.trim()}>
                {aiBusy ? <><InlineProgress active /> Applying…</> : <><Wand2 size={13} /> Apply with AI</>}
              </Button>
              {aiBusy && <p className="text-[11px] text-white/40">Rewriting the page, usually 10-30 seconds.</p>}
              {aiApplied && !aiBusy && (
                <p className="text-[11px] text-white/50">
                  Draft applied below. Review, then save.
                  <button onClick={handleUndoAi} className="ml-1.5 text-blue-300/80 hover:text-blue-200 underline underline-offset-2">Undo</button>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className={fieldCls} />
          </div>

          <div>
            <label className={labelCls}>Lead</label>
            <textarea value={lead} onChange={e => setLead(e.target.value)} rows={3} className={`${fieldCls} resize-none leading-relaxed`} />
          </div>

          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={s.title}
                  onChange={e => patchSection(i, { title: e.target.value })}
                  placeholder="Section title"
                  className={`${fieldCls} font-semibold`}
                />
                <button
                  onClick={() => setSections(prev => prev.filter((_, idx) => idx !== i))}
                  title="Remove section"
                  className="p-1.5 rounded-md text-white/25 hover:text-rose-400 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={s.content}
                onChange={e => patchSection(i, { content: e.target.value })}
                rows={4}
                placeholder="Section content"
                className={`${fieldCls} resize-none leading-relaxed`}
              />
            </div>
          ))}

          <button
            onClick={() => setSections(prev => [...prev, { title: '', content: '' }])}
            className="w-full py-2.5 rounded-lg border border-dashed border-white/[0.10] text-[12px] text-white/40 hover:text-white/70 hover:border-white/[0.18] transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> Add section
          </button>

          <div>
            <label className={labelCls}>Related topics (comma-separated)</label>
            <input value={related} onChange={e => setRelated(e.target.value)} className={fieldCls} />
          </div>

          {err && <p className="text-xs text-rose-400">{err}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={onBack} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || aiBusy || !title.trim()}>
              {saving ? <><InlineProgress active /> Saving…</> : <><Check size={14} /> Save changes</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Report ────────────────────────────────────────────────────────────────
function ReportView({ page, onBack }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await reportWikiPage(page.slug, reason.trim());
      setSubmitted(true);
    } catch (e) {
      setErr(e.message || 'Failed to submit.');
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center">
          <Check size={28} className="text-emerald-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-white/90 mb-1">Report submitted</p>
          <p className="text-xs text-white/45 mb-4">Thanks — an admin will review this page.</p>
          <Button size="sm" variant="ghost" onClick={onBack}><ArrowLeft size={14} /> Back to article</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="pb-10 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5 gap-2">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
            <ArrowLeft size={16} /> Article
          </button>
        </div>

        <div className="mb-5">
          <h2 className="text-lg font-bold text-white/90">Report an error</h2>
          <p className="text-xs text-white/40 mt-0.5 truncate">{page.title}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5">
              What's wrong?
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe the error — incorrect fact, missing information, wrong date, etc."
              rows={5}
              className="w-full px-3.5 py-2.5 rounded-lg border border-white/[0.10] bg-white/[0.04] text-[13px] text-white/90 placeholder-white/30 resize-none outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/20 transition-colors leading-relaxed"
            />
          </div>

          {err && <p className="text-xs text-rose-400">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onBack} disabled={submitting}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!reason.trim() || submitting}>
              {submitting ? <><InlineProgress active /> Submitting…</> : 'Submit report'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Why not Wikipedia? ────────────────────────────────────────────────────
function WhySection({ title, children }) {
  return (
    <div className="mb-5">
      <h2 className="text-[15px] font-bold text-white/95 mb-2 pb-1.5 border-b border-white/[0.08]">{title}</h2>
      <div className="space-y-3 text-[13.5px] leading-[1.75] text-white/80 font-light">{children}</div>
    </div>
  );
}

function WhyView({ onBack, onNavigate }) {
  const TRY_TOPICS = ['Marie Curie', 'Napoleon Bonaparte', 'Treaty of Westphalia'];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> QBpedia
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-1 pb-10 max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-white/95 leading-tight mb-1">Why not Wikipedia?</h1>
          <div className="flex items-center gap-2 mb-5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">QBpedia</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span className="text-[10px] text-white/25">About this encyclopedia</span>
          </div>

          <p className="text-[14px] leading-[1.75] text-white/85 mb-5 font-light">
            Wikipedia is the best general reference ever assembled, and QBpedia is not trying to
            replace it. QBpedia exists because quiz bowl is not a general knowledge game. It rewards
            a specific, surprisingly small set of facts, and reading Wikipedia front to back is a
            slow way to find them.
          </p>

          <WhySection title="Questions are pyramidal">
            <p>
              A tossup opens with clues almost nobody knows and ends with a giveaway almost everybody
              knows. The first player to buzz gets the points, so matches are decided in the early and
              middle clues. Those clues are not random. Writers pull them from the same stories, works,
              and details year after year.
            </p>
          </WhySection>

          <WhySection title="Wikipedia buries the clues">
            <p>
              The Wikipedia article on Napoleon runs past twenty thousand words. Perhaps a dozen of its
              facts show up in real questions, and the article gives you no way to tell which ones. It
              was written to document Napoleon, not to predict question writers. You can read it for an
              hour and still miss the detail that opens every hard tossup on him.
            </p>
            <p>
              A QBpedia page is a few hundred words written from the question writer's side. It covers
              the facts that appear in actual packets, roughly in the order a tossup would use them,
              with the buzzable terms highlighted.
            </p>
          </WhySection>

          <WhySection title="The highlights are the clues">
            <p>Every page marks the exact phrases that questions hinge on. The Marie Curie page reads like this:</p>
            <p className="border-l-2 border-blue-400/30 pl-3 italic text-white/75">
              <QBText text="She showed that **thorium** gives off rays like uranium, coined the word **radioactivity**, and discovered both **polonium** and **radium** with her husband **Pierre**. She is still the only person with Nobel Prizes in **two different sciences**." />
            </p>
            <p>
              If you remember only the highlighted phrases, you can still buzz. That is the reading
              QBpedia is built for, and it is why pages here feel closer to flashcards than to essays.
            </p>
          </WhySection>

          <WhySection title="Pages are written on demand">
            <p>
              Wikipedia has about seven million English articles. QBpedia has exactly as many as people
              have asked for. The first time anyone opens a topic, the page is written on the spot,
              which is why a brand new page takes about half a minute to appear. The tradeoff is focus
              over coverage. There is no page about your street, but the page on the Treaty of
              Westphalia leads with the Thirty Years' War, because that is the clue writers actually use.
            </p>
          </WhySection>

          <WhySection title="When Wikipedia is the right tool">
            <p>
              QBpedia pages are written by an AI model that checks facts with Google Search and lists
              its sources at the bottom of each page. It knows the canon well, but it can still state
              something wrong with confidence. Wikipedia has edit histories and tens of thousands of
              editors checking each other's work. Use it to verify a fact, settle a protest, or go
              deeper than a page here goes. If you find a mistake on a QBpedia page, report it with
              the link at the bottom of the page. An admin reviews every report.
            </p>
          </WhySection>

          {/* Try it */}
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 mb-2">Try it on a topic</p>
            <div className="flex flex-wrap gap-1.5">
              {TRY_TOPICS.map(topic => (
                <button
                  key={topic}
                  onClick={() => onNavigate(slugify(topic))}
                  className="text-[12px] px-2.5 py-1 rounded-lg border bg-white/[0.03] border-white/[0.06] text-white/55 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin reports ─────────────────────────────────────────────────────────
// The admin's review queue for "Report an error" submissions. Each report can
// be fixed with an AI rewrite of the page, fixed by hand (open the page, edit
// it, come back and mark it fixed), or dismissed if it doesn't hold up.
function AdminReportsView({ onBack, onOpenPage, onResolved }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [busy, setBusy] = useState({});   // report id -> resolution in flight
  const [done, setDone] = useState({});   // report id -> applied resolution
  const [errs, setErrs] = useState({});   // report id -> action error

  useEffect(() => {
    listWikiReports()
      .then(d => setReports(d.reports || []))
      .catch(e => setLoadErr(e.message || 'Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  async function resolve(report, resolution) {
    if (busy[report.id] || done[report.id]) return;
    setBusy(prev => ({ ...prev, [report.id]: resolution }));
    setErrs(prev => ({ ...prev, [report.id]: null }));
    try {
      await resolveWikiReport(report.id, resolution);
      setDone(prev => ({ ...prev, [report.id]: resolution }));
      onResolved?.();
    } catch (e) {
      setErrs(prev => ({ ...prev, [report.id]: e.message || 'Failed to resolve.' }));
    }
    setBusy(prev => ({ ...prev, [report.id]: null }));
  }

  const openCount = reports.filter(r => !done[r.id]).length;

  const DONE_LABELS = {
    ai: 'Fixed. The page was rewritten with the report in mind.',
    manual: 'Marked fixed.',
    dismiss: 'Dismissed.',
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/60 transition-colors">
          <ArrowLeft size={16} /> QBpedia
        </button>
        {!loading && !loadErr && (
          <span className="text-xs text-white/40">{openCount} open</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-1 pb-10 max-w-2xl mx-auto space-y-2">
          <h2 className="text-lg font-bold text-white/90 mb-3">Error reports</h2>

          {loading && (
            <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>
          )}

          {!loading && loadErr && (
            <p className="text-xs text-rose-400">{loadErr}</p>
          )}

          {!loading && !loadErr && reports.length === 0 && (
            <div className="text-center py-12">
              <Check size={28} className="text-emerald-300 mx-auto mb-3" />
              <p className="text-sm text-white/55 mb-1">All clear</p>
              <p className="text-xs text-white/35">No open reports. When a reader reports an error on a page, it shows up here.</p>
            </div>
          )}

          {reports.map(r => {
            const inFlight = busy[r.id];
            const resolution = done[r.id];
            const plainTitle = stripCites(r.pageTitle || r.slug).replace(/\*\*/g, '');
            return (
              <div
                key={r.id}
                className={`rounded-lg border p-3.5 transition-colors ${resolution ? 'border-white/[0.05] bg-white/[0.01]' : 'border-white/[0.06] bg-white/[0.03]'}`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <button
                    onClick={() => onOpenPage(r.slug)}
                    title={`Open "${plainTitle}"`}
                    className="text-[13px] font-bold text-blue-300 hover:text-blue-200 hover:underline underline-offset-2 truncate text-left transition-colors"
                  >
                    {plainTitle}
                  </button>
                  <span className="text-[10px] text-white/25 flex-shrink-0">{formatRelative(r.createdAt)}</span>
                </div>

                <p className={`text-[12.5px] leading-relaxed border-l-2 border-amber-400/30 pl-3 mb-1.5 ${resolution ? 'text-white/35' : 'text-white/75'}`}>
                  {r.reason}
                </p>
                <p className="text-[10.5px] text-white/30 mb-3">Reported by {r.reportedBy}</p>

                {inFlight === 'ai' ? (
                  <ProgressBar
                    active
                    label="Rewriting the page"
                    hint="Fixing the reported error with checked sources · 30-90 seconds"
                    duration={60000}
                  />
                ) : resolution ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-[11.5px] inline-flex items-center gap-1.5 ${resolution === 'dismiss' ? 'text-white/40' : 'text-emerald-300/90'}`}>
                      {resolution === 'dismiss' ? <X size={12} /> : <Check size={12} />}
                      {DONE_LABELS[resolution]}
                    </p>
                    {resolution === 'ai' && (
                      <button
                        onClick={() => onOpenPage(r.slug)}
                        className="text-[11.5px] text-blue-300/80 hover:text-blue-200 underline underline-offset-2 transition-colors"
                      >
                        Open the page →
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => resolve(r, 'ai')}
                        disabled={!!inFlight}
                        title="Rewrite the page with AI, telling it what was reported"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-blue-400/30 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25 disabled:opacity-40 transition-colors"
                      >
                        <Wand2 size={12} /> Fix with AI
                      </button>
                      <button
                        onClick={() => onOpenPage(r.slug)}
                        disabled={!!inFlight}
                        title="Open the page to check the report or edit it by hand"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-white/[0.10] bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white/85 disabled:opacity-40 transition-colors"
                      >
                        <Pencil size={12} /> Open page
                      </button>
                      <button
                        onClick={() => resolve(r, 'manual')}
                        disabled={!!inFlight}
                        title="Close this report without rewriting, for after you fix the page by hand"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-400/25 bg-emerald-500/[0.08] text-emerald-200 hover:bg-emerald-500/[0.16] disabled:opacity-40 transition-colors"
                      >
                        {inFlight === 'manual' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Mark fixed
                      </button>
                      <button
                        onClick={() => resolve(r, 'dismiss')}
                        disabled={!!inFlight}
                        title="Close this report without changing the page"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/70 disabled:opacity-40 transition-colors"
                      >
                        {inFlight === 'dismiss' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Dismiss
                      </button>
                    </div>
                    {errs[r.id] && <p className="text-[11px] text-rose-300/90 mt-2">{errs[r.id]}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
