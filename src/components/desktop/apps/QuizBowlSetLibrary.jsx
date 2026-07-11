import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Globe2, Loader2, Pencil, Play, Plus, Save, Search, Trash2 } from 'lucide-react';
import {
  fetchQuizBowlCountryPresets,
  fetchQuizBowlCountryPreset,
  updateSavedQuizBowlSet,
} from '../../../api/quizMatch';
import ProgressBar from '../../shared/ProgressBar';

const REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];

export function CountryPracticeBrowser({ onBack, onPractice }) {
  const [presets, setPresets] = useState(null);
  const [query, setQuery] = useState('');
  const [loadingSlug, setLoadingSlug] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchQuizBowlCountryPresets().then(data => setPresets(data.presets || [])).catch(err => {
      setError(err.message || 'Could not load countries.'); setPresets([]);
    });
  }, []);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (presets || []).filter(p => !q || [p.label, p.region, p.subregion].some(v => String(v || '').toLowerCase().includes(q)));
    return REGIONS.map(region => ({ region, items: filtered.filter(p => p.region === region) })).filter(group => group.items.length);
  }, [presets, query]);

  async function choose(preset) {
    if (loadingSlug) return;
    setLoadingSlug(preset.slug); setError('');
    try {
      const data = await fetchQuizBowlCountryPreset(preset.slug);
      onPractice(data.preset);
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
              label={`Loading ${loadingCountry?.label || 'country'} practice`}
              hint="Preparing geography tossups…"
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
          <h2 className="text-[15px] font-bold text-white/90">Country practice</h2>
          <p className="text-[10px] text-white/35">Easy geography sets from the country note library</p>
        </div>
      </div>
      <div className="px-5 pt-4 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search every country"
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-[13px] text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15" />
        </div>
        {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {!presets ? <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/35" /></div> : grouped.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-white/35">No countries match that search.</p>
        ) : grouped.map(({ region, items }) => (
          <section key={region}>
            <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{region} <span className="font-normal text-white/20">· {items.length}</span></p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map(preset => {
                const busy = loadingSlug === preset.slug;
                return <button key={preset.slug} onClick={() => choose(preset)} disabled={!!loadingSlug}
                  className="group flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left hover:border-blue-400/35 hover:bg-blue-500/[0.07] disabled:opacity-55 transition-colors">
                  <Globe2 size={13} className="shrink-0 text-blue-400" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white/85">{preset.label}</span><span className="block truncate text-[10px] text-white/35">{preset.subregion || 'Geography'}</span></span>
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

export function SavedSetLibrary({ sets, loading, onBack, onNew, onEdit, onPlay, onDelete }) {
  return (
    <div className="h-full flex flex-col bg-transparent min-h-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75 transition-colors"><ArrowLeft size={15} /> Hub</button>
        <h2 className="text-[15px] font-bold text-white/90">Saved sets</h2>
        <button onClick={onNew} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-400 transition-colors"><Plus size={13} /> New set</button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? <div className="py-12 flex justify-center"><Loader2 size={20} className="animate-spin text-white/35" /></div> : sets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-7 text-center"><Save size={22} className="mx-auto mb-2 text-white/25" /><p className="text-[13px] font-semibold text-white/70">No saved sets</p><p className="mt-1 text-[11px] text-white/35">Create one here, or save a finished round to edit it later.</p><button onClick={onNew} className="mt-3 text-[12px] font-semibold text-blue-300 hover:text-blue-200">Create a set</button></div>
        ) : <div className="space-y-2">{sets.map(set => (
          <div key={set.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 hover:border-white/[0.15] hover:bg-white/[0.05] transition-colors">
            <div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-blue-400/20 bg-blue-500/10"><Globe2 size={14} className="text-blue-300" /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-white/90">{set.title}</p><p className="mt-0.5 text-[10px] text-white/40">{set.category} · {set.difficulty} · {set.questionCount} question{set.questionCount === 1 ? '' : 's'}</p>{set.preview && <p className="mt-1 truncate text-[10px] text-white/25">{set.preview}</p>}</div></div>
            <div className="mt-3 flex items-center gap-2"><button onClick={() => onPlay(set.id)} disabled={!set.questionCount} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-400 disabled:opacity-40"><Play size={12} /> Play</button><button onClick={() => onEdit(set.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-semibold text-white/65 hover:bg-white/[0.08] hover:text-white"><Pencil size={12} /> Edit</button><button onClick={() => onDelete(set.id)} aria-label={`Delete ${set.title}`} className="ml-auto rounded-md p-1.5 text-white/25 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button></div>
          </div>
        ))}</div>}
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

  if (!draft) return null;
  const playable = draft.questions.length > 0 && draft.questions.every(q => q.text.trim() && q.answer.trim());
  return <div className="h-full flex flex-col min-h-0 bg-transparent">
    <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] flex-shrink-0"><button onClick={onBack} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/75"><ArrowLeft size={15} /> Saved sets</button><span className="text-[11px] text-white/35 ml-auto">{saving ? 'Saving…' : 'Auto-saved'}</span><button onClick={() => save()} className="rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white" aria-label="Save now"><Save size={14} /></button></div>
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3"><input value={draft.title} onChange={e => queue({ ...draft, title: e.target.value })} placeholder="Set title" className="min-w-0 bg-transparent text-[19px] font-bold text-white/90 placeholder-white/25 outline-none" /><button onClick={() => onPlay(draft)} disabled={!playable} className="inline-flex items-center gap-1.5 self-start rounded-lg bg-blue-500 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-400 disabled:opacity-40"><Play size={13} /> Play set</button></div>
      <div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Category<input value={draft.category} onChange={e => queue({ ...draft, category: e.target.value })} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-white/80 outline-none focus:border-blue-400/50" /></label><label className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Difficulty<select value={draft.difficulty} onChange={e => queue({ ...draft, difficulty: e.target.value })} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#1b1b1b] px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-white/80 outline-none focus:border-blue-400/50">{DIFFICULTIES.map(d => <option key={d}>{d}</option>)}</select></label></div>
      {error && <p className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</p>}
      <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Questions <span className="font-normal tracking-normal text-white/25">· edits save automatically</span></p><button onClick={addQuestion} className="inline-flex items-center gap-1 rounded-md border border-white/[0.10] px-2 py-1 text-[11px] font-semibold text-white/55 hover:bg-white/[0.06] hover:text-white"><Plus size={12} /> Add</button></div>
      <div className="space-y-2.5">{draft.questions.map((question, index) => <div key={question.id} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"><div className="mb-2 flex items-center"><span className="text-[10px] font-bold text-white/35">Q{index + 1}</span><button onClick={() => removeQuestion(index)} aria-label={`Remove question ${index + 1}`} className="ml-auto rounded-md p-1 text-white/25 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={13} /></button></div><textarea value={question.text} onChange={e => updateQuestion(index, 'text', e.target.value)} rows={4} placeholder="Write the tossup question…" className="w-full resize-y bg-transparent text-[12px] leading-relaxed text-white/80 placeholder-white/22 outline-none" /><input value={question.answer} onChange={e => updateQuestion(index, 'answer', e.target.value)} placeholder="Correct answer" className="mt-2 w-full rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-2 text-[12px] font-medium text-white/85 placeholder-white/25 outline-none focus:border-blue-400/50" /></div>)}</div>
      {!draft.questions.length && <div className="rounded-xl border border-dashed border-white/[0.10] py-7 text-center text-[12px] text-white/35">Add a question to begin your set.</div>}
      {!playable && draft.questions.length > 0 && <p className="text-[10px] text-white/30"><Check size={11} className="inline mr-1" />Each question needs both a prompt and correct answer before it can be played.</p>}
    </div>
  </div>;
}
