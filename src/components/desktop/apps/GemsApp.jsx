import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Plus, Sparkles, Loader2, Trash2, RotateCcw, Pencil,
  Gem, BookOpen, MessageSquare, Zap, Target, Brain, Flame, Star,
  Rocket, Wand2, GraduationCap, FileText, Code, Scale, PenTool, Briefcase,
} from 'lucide-react';
import {
  listGems, createGem, updateGem, deleteGem,
  getGemHistory, resetGemChat, sendGemMessage,
} from '../../../api/gems';
import Button from '../../shared/Button';
import Input, { Textarea } from '../../shared/Input';
import LoadingSpinner from '../../shared/LoadingSpinner';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';

// Icon + color picker catalog. Keep names stable — persisted on each gem.
const ICON_CATALOG = {
  Sparkles, Gem, BookOpen, MessageSquare, Zap, Target, Brain, Flame,
  Star, Rocket, Wand2, GraduationCap, FileText, Code, Scale, PenTool, Briefcase,
};
const ICON_NAMES = Object.keys(ICON_CATALOG);

const COLOR_CATALOG = {
  violet:  { tile: 'bg-violet-100 dark:bg-violet-900/30',  ink: 'text-violet-600 dark:text-violet-400' },
  blue:    { tile: 'bg-blue-100 dark:bg-blue-900/30',       ink: 'text-blue-600 dark:text-blue-400' },
  emerald: { tile: 'bg-emerald-100 dark:bg-emerald-900/30', ink: 'text-emerald-600 dark:text-emerald-400' },
  amber:   { tile: 'bg-amber-100 dark:bg-amber-900/30',     ink: 'text-amber-600 dark:text-amber-400' },
  rose:    { tile: 'bg-rose-100 dark:bg-rose-900/30',       ink: 'text-rose-600 dark:text-rose-400' },
  sky:     { tile: 'bg-sky-100 dark:bg-sky-900/30',         ink: 'text-sky-600 dark:text-sky-400' },
  indigo:  { tile: 'bg-indigo-100 dark:bg-indigo-900/30',   ink: 'text-indigo-600 dark:text-indigo-400' },
  slate:   { tile: 'bg-slate-200 dark:bg-slate-800',        ink: 'text-slate-700 dark:text-slate-300' },
};
const COLOR_NAMES = Object.keys(COLOR_CATALOG);

// A handful of starter gems users can spin up in one click. These are
// NOT created automatically — the user picks one from the empty state.
const TEMPLATES = [
  {
    name: 'Essay Editor', icon: 'FileText', color: 'amber',
    description: 'Rewrites your prose to be clearer and sharper.',
    instructions: 'You are a professional essay editor. When given a draft, suggest improvements for clarity, structure, word choice, and argument strength. Provide specific edits in a rewritten paragraph, then bullet out the key changes you made and why.',
  },
  {
    name: 'Interview Coach', icon: 'Briefcase', color: 'blue',
    description: 'Drills you on interview questions with feedback.',
    instructions: 'You are a seasoned interview coach. Ask the user a realistic interview question, wait for their answer, then give specific, kind feedback — what worked, what could be sharper, and a 1-sentence sample answer. Then ask the next question. Keep the conversation going until they say stop.',
  },
  {
    name: 'Socratic Tutor', icon: 'Scale', color: 'violet',
    description: 'Never gives the answer — leads you to it.',
    instructions: 'You are a Socratic tutor. You NEVER give the student the answer directly. Instead you ask leading questions that help the student arrive at the answer themselves. When they struggle, give a small hint. Be warm and patient.',
  },
  {
    name: 'Code Reviewer', icon: 'Code', color: 'emerald',
    description: 'Reviews code snippets for bugs, style, and clarity.',
    instructions: 'You are a senior software engineer reviewing code. When the user pastes a snippet, identify bugs, style issues, naming concerns, and performance pitfalls. Rewrite the problematic parts. Explain WHY each change matters. Keep tone collegial.',
  },
  {
    name: 'Study Buddy', icon: 'GraduationCap', color: 'sky',
    description: 'Quizzes you on whatever topic you feed it.',
    instructions: 'You are a study buddy. When the user names a topic, ask them 5 progressively harder questions about it, one at a time. After each answer, tell them if they were right, explain any gaps, and move on. At the end, summarize their strengths and what to review.',
  },
  {
    name: 'Debate Partner', icon: 'Zap', color: 'rose',
    description: 'Takes any position and argues it hard.',
    instructions: 'You are a debate partner. When the user proposes a thesis, you take the OPPOSING side and argue it forcefully with evidence. Push back on weak reasoning. When the user concedes a point or makes a strong case, acknowledge it fairly. Goal: sharpen their argument.',
  },
];

export default function GemsApp() {
  const [view, setView] = useState('list'); // list | new | edit | chat
  const [gems, setGems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeGem, setActiveGem] = useState(null);

  // Form state (shared between new + edit views)
  const [form, setForm] = useState(blankForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef('');
  const streamSourcesRef = useRef([]);
  const abortRef = useRef(null);

  useBrowserBack(view !== 'list', () => setView('list'));

  useEffect(() => {
    listGems().then(d => setGems(d.gems || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function blankForm() {
    return { name: '', description: '', instructions: '', icon: 'Sparkles', color: 'violet' };
  }

  function openNew(template) {
    setForm(template
      ? { name: template.name, description: template.description, instructions: template.instructions, icon: template.icon, color: template.color }
      : blankForm());
    setSaveError(null);
    setView('new');
  }

  async function saveNew() {
    if (!form.name.trim() || !form.instructions.trim() || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const { gem } = await createGem(form);
      setGems(prev => [gem, ...prev.filter(g => g.id !== gem.id)]);
      openChat(gem);
    } catch (e) { setSaveError(e.message || 'Failed to create'); }
    setSaving(false);
  }

  function openEdit(gem) {
    setActiveGem(gem);
    setForm({
      name: gem.name || '', description: gem.description || '',
      instructions: gem.instructions || '',
      icon: gem.icon || 'Sparkles', color: gem.color || 'violet',
    });
    setSaveError(null);
    setView('edit');
  }

  async function saveEdit() {
    if (!activeGem || saving) return;
    setSaving(true); setSaveError(null);
    try {
      const { gem } = await updateGem(activeGem.id, form);
      setGems(prev => prev.map(g => g.id === gem.id ? { ...g, ...gem } : g));
      setActiveGem(g => g ? { ...g, ...gem } : g);
      setView('chat');
    } catch (e) { setSaveError(e.message || 'Failed to save'); }
    setSaving(false);
  }

  async function handleDelete(id, e) {
    e?.stopPropagation();
    if (!confirm('Delete this mind and its chat?')) return;
    try {
      await deleteGem(id);
      setGems(prev => prev.filter(g => g.id !== id));
      if (activeGem?.id === id) { setActiveGem(null); setView('list'); }
    } catch (err) { console.error(err); }
  }

  async function openChat(gem) {
    setActiveGem(gem);
    setView('chat');
    setMessages([]);
    setSourceMode(false);
    try {
      const data = await getGemHistory(gem.id);
      setMessages(data.chatHistory || []);
    } catch {}
  }

  const handleSend = useCallback((text) => {
    if (!activeGem || streaming) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    streamRef.current = '';
    streamSourcesRef.current = [];
    const abort = sendGemMessage(activeGem.id, text, {
      onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); },
      onSource: src => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onDone: () => {
        const full = streamRef.current;
        const sources = streamSourcesRef.current;
        if (full) {
          const aiMsg = { role: 'assistant', content: full, timestamp: new Date().toISOString() };
          if (sources.length) aiMsg.sources = sources;
          setMessages(m => [...m, aiMsg]);
        }
        setStreamingContent(''); setStreamingSources([]);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
      onError: err => {
        setMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent(''); setStreamingSources([]);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
    }, sourceMode);
    abortRef.current = abort;
  }, [activeGem, streaming, sourceMode]);

  async function handleReset() {
    if (!activeGem) return;
    if (!confirm('Clear this mind\u2019s chat?')) return;
    try {
      await resetGemChat(activeGem.id);
      setMessages([]);
    } catch (err) { console.error(err); }
  }

  // ========== CHAT VIEW ==========
  if (view === 'chat' && activeGem) {
    const Icon = ICON_CATALOG[activeGem.icon] || Sparkles;
    const palette = COLOR_CATALOG[activeGem.color] || COLOR_CATALOG.violet;
    const header = (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
        <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><ArrowLeft size={16} /></button>
        <div className={`w-6 h-6 rounded-md ${palette.tile} flex items-center justify-center ${palette.ink}`}>
          <Icon size={13} />
        </div>
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">{activeGem.name}</span>
        <button onClick={() => openEdit(activeGem)} title="Edit" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"><Pencil size={13} /></button>
        <button onClick={handleReset} title="Reset chat" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1"><RotateCcw size={13} /></button>
      </div>
    );
    return (
      <ChatContainer
        messages={messages}
        streamingContent={streamingContent}
        streamingSources={streamingSources}
        onSend={handleSend}
        disabled={streaming}
        placeholder={streaming ? 'Thinking...' : `Message ${activeGem.name}...`}
        header={header}
        className="h-full"
        sourceMode={sourceMode}
        onToggleSource={setSourceMode}
      />
    );
  }

  // ========== NEW / EDIT FORM ==========
  if (view === 'new' || view === 'edit') {
    return (
      <div className="max-w-xl mx-auto">
        <button onClick={() => setView(view === 'edit' ? 'chat' : 'list')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> Back
        </button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{view === 'edit' ? 'Edit mind' : 'New mind'}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Give your assistant a name, a personality, and a task. The instructions become its system prompt.
        </p>

        {saveError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 mb-4">{saveError}</div>}

        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g., Essay Editor"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Short description (optional)"
            placeholder="What does this gem do?"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <Textarea
            label="Instructions"
            rows={6}
            placeholder="You are a warm, patient math tutor. When the user asks a question, walk them through step-by-step..."
            value={form.instructions}
            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
          />

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_NAMES.map(n => {
                const I = ICON_CATALOG[n];
                const selected = form.icon === n;
                return (
                  <button
                    key={n}
                    onClick={() => setForm(f => ({ ...f, icon: n }))}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                      selected
                        ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                        : 'bg-white dark:bg-[#0D0D14] border-gray-200 dark:border-[#2A2A40] text-gray-600 dark:text-gray-300 hover:border-blue-400'
                    }`}
                    title={n}
                  >
                    <I size={15} />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_NAMES.map(c => {
                const p = COLOR_CATALOG[c];
                const selected = form.color === c;
                return (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${p.tile} ${
                      selected ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-[#161622] border-transparent' : 'border-gray-200 dark:border-[#2A2A40]'
                    }`}
                    title={c}
                  >
                    <Sparkles size={13} className={p.ink} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={view === 'edit' ? saveEdit : saveNew}
              disabled={!form.name.trim() || !form.instructions.trim() || saving}
            >
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving</> : <>{view === 'edit' ? 'Save changes' : 'Create mind'}</>}
            </Button>
            {view === 'edit' && (
              <Button variant="secondary" onClick={(e) => handleDelete(activeGem.id, e)}>
                <Trash2 size={13} /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== LIST VIEW ==========
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Minds</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Custom AI assistants you build yourself.</p>
        </div>
        <Button size="sm" onClick={() => openNew()}><Plus size={14} /> New Mind</Button>
      </div>

      {gems.length === 0 ? (
        <div className="space-y-4">
          <div className="text-center py-6">
            <Brain size={28} className="text-violet-500 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">No minds yet.</p>
            <p className="text-xs text-gray-400">Pick a template to start, or build one from scratch.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {TEMPLATES.map(t => {
              const I = ICON_CATALOG[t.icon] || Sparkles;
              const p = COLOR_CATALOG[t.color] || COLOR_CATALOG.violet;
              return (
                <button
                  key={t.name}
                  onClick={() => openNew(t)}
                  className="group flex items-start gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-3 py-2.5 text-left hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg ${p.tile} flex items-center justify-center flex-shrink-0 ${p.ink}`}>
                    <I size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">{t.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {gems.map(g => {
            const I = ICON_CATALOG[g.icon] || Sparkles;
            const p = COLOR_CATALOG[g.color] || COLOR_CATALOG.violet;
            return (
              <div
                key={g.id}
                onClick={() => openChat(g)}
                className="group flex items-center gap-4 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg ${p.tile} flex items-center justify-center flex-shrink-0 ${p.ink}`}>
                  <I size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{g.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {g.description || <span className="italic text-gray-300 dark:text-gray-500">No description</span>}
                    {g.messageCount ? ` · ${g.messageCount} msgs` : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(g); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-500 p-1"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => handleDelete(g.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-rose-500 p-1"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <div className="pt-2">
            <button
              onClick={() => openNew()}
              className="w-full text-xs text-gray-400 hover:text-blue-500 py-2 rounded-lg border border-dashed border-gray-200 dark:border-[#2A2A40] hover:border-blue-300"
            >
              + New mind
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
