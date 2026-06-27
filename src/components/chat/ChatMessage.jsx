import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Check, X, Copy, Pencil, FileText, ExternalLink, FileText as NoteIcon, Zap, Swords, Brain, ChevronRight, ChevronDown, Volume2, Square, PanelRightOpen, Shuffle, Hammer, Lock } from 'lucide-react';
import MathText from '../shared/MathText';
import { useWindowManager } from '../../context/WindowManagerContext';

// Lightweight client-side "did the model decline?" check, mirroring the server's
// refusal detector. Used to tailor the Reroute tooltip when an answer leads with
// an "I can't do that" — the reroute itself works on any turn.
const CLIENT_REFUSAL_PATTERNS = [
  /\bi\s*(?:'|’)?\s*(?:m\b.{0,12})?(?:can(?:'|’)?t|cannot|can\s*not|won(?:'|’)?t|am\s+not\s+able\s+to|am\s+unable\s+to|(?:'|’)?m\s+(?:not\s+able|unable)\s+to)\b[^.?!\n]{0,70}\b(?:help|assist|do\s+that|do\s+this|provide|comply|continue|create|generate|produce|write|answer|fulfill|that\s+request|with\s+that|with\s+this)\b/i,
  /\b(?:i(?:'|’)?m\s+sorry|i\s+am\s+sorry|unfortunately|i\s+apologi[sz]e)\b[^.?!\n]{0,40}\b(?:can(?:'|’)?t|cannot|can\s*not|won(?:'|’)?t|unable|not\s+able)\b/i,
  /\bi(?:'|’)?m\s+not\s+(?:able|going)\s+to\s+(?:help|assist|do|provide|answer|continue)\b/i,
];
function messageLooksLikeRefusal(text) {
  if (!text) return false;
  const head = String(text).trim().slice(0, 400);
  return CLIENT_REFUSAL_PATTERNS.some((rx) => rx.test(head));
}

// Collapsible "Thinking" panel — shows the model's reasoning summary.
// Auto-expanded while thoughts stream in, collapsible afterward.
function ThinkingPanel({ text, streaming }) {
  const [open, setOpen] = useState(!!streaming);
  if (!text) return null;
  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-gray-100 dark:bg-black/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white/45 hover:text-white/70 transition-colors"
      >
        <Brain size={12} className={streaming ? 'animate-pulse' : ''} />
        {streaming ? 'Thinking…' : 'Thinking'}
        <ChevronRight size={12} className={`ml-auto transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className={`grid transition-all duration-200 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="px-3 pb-2.5 pt-0.5 max-h-60 overflow-y-auto border-t border-white/[0.06]">
            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-li:my-0 text-[12px] text-white/55 leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}>
                {text}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Best of 3 / regular-reroute result. The WINNER (best-of) or first non-refusal
// answer (reroute) is rendered as the normal message body below; this is the
// control that sits ABOVE it and expands to compare every model side by side.
// Best of 3 collapses by default (quiet thread); reroute opens by default
// because seeing every response IS the point.
function BestOfResponses({ bestOf }) {
  const responses = Array.isArray(bestOf?.responses) ? bestOf.responses : [];
  const isReroute = bestOf?.mode === 'reroute';
  const firstOther = Math.max(0, responses.findIndex((r) => !r.selected));
  const [open, setOpen] = useState(isReroute);
  const [activeIndex, setActiveIndex] = useState(firstOther);

  useEffect(() => {
    setActiveIndex(firstOther);
  }, [firstOther, bestOf]);

  // Nothing to compare against → don't surface the control at all.
  if (responses.length < 2) return null;
  const active = responses[activeIndex] || responses[0];
  const winner = responses.find((r) => r.selected) || responses[0];
  const otherCount = Math.max(0, responses.length - 1);
  const modelCount = bestOf?.modelCount ?? responses.length;
  const answeredCount = bestOf?.answeredCount ?? responses.filter((r) => r.content && !r.refused).length;
  const refusedCount = bestOf?.refusedCount ?? responses.filter((r) => r.refused).length;
  const smartRewrite = isReroute && bestOf?.smartRewrite?.used ? bestOf.smartRewrite : null;
  const initialRefusedCount = smartRewrite?.initialStats?.refusedCount ?? 0;
  const initialModelCount = smartRewrite?.initialStats?.modelCount ?? modelCount;
  // Brute force reuses the reroute panel but loops N rounds. Besides the
  // collapsed summary line, it gets its own box that shows the actual prompt(s)
  // the Brute Forcer AI entered each round (see the smartRewrite.attempts box).
  const bruteForce = isReroute && !!bestOf?.bruteForce;
  const bruteRounds = bestOf?.rounds ?? smartRewrite?.rounds ?? 0;

  return (
    <div className="mb-1 max-w-[88%] pl-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -ml-1.5 text-left transition-colors ${
          open
            ? 'text-white/75'
            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
        }`}
      >
        {isReroute && <Shuffle size={11} className="shrink-0 text-blue-300/70" />}
        <span className="text-[11.5px] font-semibold">
          {isReroute
            ? (open ? 'All model answers' : 'See all model answers')
            : (open ? 'Other responses' : 'See other responses')}
        </span>
        <span className="text-[10.5px] font-medium text-white/35 truncate">
          {isReroute ? (
            <>· {modelCount} model{modelCount === 1 ? '' : 's'}
              {bruteForce
                ? <span className="text-blue-300/80"> · brute force{bruteRounds ? ` · ${bruteRounds} round${bruteRounds === 1 ? '' : 's'}` : ''}</span>
                : smartRewrite && <span className="text-violet-300/70"> · {smartRewrite.proactive ? 'smart reroute' : 'smart retry'}</span>}
              {refusedCount > 0 && <span className="text-rose-300/60"> · {refusedCount} refused</span>}
            </>
          ) : (
            <>· {otherCount} other model{otherCount === 1 ? '' : 's'}
              {winner?.label && <span className="text-white/30"> · {winner.label} won</span>}
            </>
          )}
        </span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-white/[0.10] bg-white/[0.03] px-2.5 py-2.5 space-y-2">
          {isReroute ? (
            <>
              <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35">
                Rerouted through {modelCount} model{modelCount === 1 ? '' : 's'} · {answeredCount} answered{refusedCount > 0 ? ` · ${refusedCount} refused` : ''}
              </p>
              {smartRewrite && !bruteForce && (
                <div className="rounded-lg border px-2.5 py-2 border-violet-300/15 bg-violet-300/[0.05]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-200/75">
                    {smartRewrite.proactive
                      ? (smartRewrite.escalated
                          ? `Smart reroute · escalated after ${initialRefusedCount || initialModelCount} refusal${(initialRefusedCount || initialModelCount) === 1 ? '' : 's'}`
                          : 'Smart reroute · prompt reframed up front')
                      : `Smart retry after ${initialRefusedCount || initialModelCount} refusal${(initialRefusedCount || initialModelCount) === 1 ? '' : 's'}`}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-white/45">
                    {smartRewrite.rationale || 'The prompt was reframed to preserve the core ethos in a form models are more likely to accept.'}
                  </p>
                  {smartRewrite.prompt && (
                    <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-white/35" title={smartRewrite.prompt}>
                      {smartRewrite.prompt}
                    </p>
                  )}
                </div>
              )}
              {smartRewrite && bruteForce && (() => {
                // Show what the Brute Forcer AI actually entered. It edits the
                // prompt every round, so surface each round's prompt (falling
                // back to the single final prompt for older payloads).
                const attempts = Array.isArray(smartRewrite.attempts) && smartRewrite.attempts.length
                  ? smartRewrite.attempts
                  : (smartRewrite.prompt ? [{ round: 1, prompt: smartRewrite.prompt, answered: bestOf?.succeeded }] : []);
                return (
                  <div className="rounded-lg border px-2.5 py-2 border-blue-300/20 bg-blue-300/[0.06] space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-blue-200/80">
                      Brute forced · {bruteRounds || smartRewrite.rounds || attempts.length} round{(bruteRounds || smartRewrite.rounds || attempts.length) === 1 ? '' : 's'} · no trigger words
                    </p>
                    {smartRewrite.focus && (
                      <p className="text-[11px] leading-snug text-white/50">
                        <span className="text-white/35">Most important:</span> {smartRewrite.focus}
                      </p>
                    )}
                    {smartRewrite.strategy && (
                      <p className="text-[11px] leading-snug text-white/50">
                        <span className="text-white/35">Tactic:</span> {smartRewrite.strategy}
                      </p>
                    )}
                    {attempts.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        {attempts.map((a) => (
                          <div key={a.round} className="rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5">
                            <p className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/35">
                              {attempts.length > 1 ? `Round ${a.round} — prompt entered` : 'Prompt the AI entered'}
                              {a.answered && <span className="ml-1 text-blue-200/90">· answered</span>}
                            </p>
                            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-white/65">
                              {a.prompt}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(smartRewrite.triggerWords) && smartRewrite.triggerWords.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        <span className="text-[10px] text-white/30">Dropped:</span>
                        {smartRewrite.triggerWords.map((w, i) => (
                          <span key={i} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/35 line-through">{w}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              {bestOf?.judge?.label && (
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/35">
                  Judged by {bestOf.judge.label}
                </p>
              )}
              {bestOf?.rationale && (
                <p className="px-1 text-[11px] leading-snug text-white/45">{bestOf.rationale}</p>
              )}
            </>
          )}
          <div className="grid gap-1">
            {responses.map((r, index) => {
              const selected = index === activeIndex;
              const isWinner = !!r.selected;
              const status = isReroute
                ? (r.refused ? 'Refused' : (r.error ? 'Failed' : (isWinner ? 'Shown above' : 'Answered')))
                : (isWinner ? 'Winner' : (r.error ? 'Failed' : 'Alternative'));
              return (
                <button
                  key={`${r.key || r.label}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`w-full flex items-center gap-2 px-1 py-1 text-left transition-colors ${
                    selected
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold truncate">
                      {r.label || r.servedLabel || 'Model'}
                      {r.switched && r.servedLabel && r.servedLabel !== r.label && (
                        <span className="font-normal text-white/35"> to {r.servedLabel}</span>
                      )}
                    </span>
                    <span className={`block text-[10px] truncate ${r.refused ? 'text-rose-300/70' : 'text-white/35'}`}>
                      {status} · {r.provider || 'AI'}
                    </span>
                  </span>
                  {isWinner && <Check size={12} className="text-blue-200/90 shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          {active && (
            <div className="rounded-lg border border-white/[0.08] bg-black/[0.14] px-3 py-2 max-h-72 overflow-y-auto">
              {active.error ? (
                <p className="text-[12px] text-rose-200/90">{active.error}</p>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:bg-white/[0.08] prose-code:px-1 prose-code:rounded prose-pre:bg-black/40 prose-pre:rounded-lg text-[12px] leading-relaxed text-white/78">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}
                    components={{
                      p: ({ children, ...props }) => <p {...props}>{styleCitations(children, active.sources)}</p>,
                      li: ({ children, ...props }) => <li {...props}>{styleCitations(children, active.sources)}</li>,
                      strong: ({ children, ...props }) => <strong {...props}>{styleCitations(children, active.sources)}</strong>,
                      em: ({ children, ...props }) => <em {...props}>{styleCitations(children, active.sources)}</em>,
                    }}
                  >
                    {normalizeMathDelimiters(active.content || '')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Parse out --- FILE: name --- blocks that were prepended by ChatInput
// when the user attached a PDF or text file. Returns the extracted
// filenames and the user's actual text message (stripped of file content).
function parseUserContent(raw) {
  if (!raw.includes('--- FILE:')) return { files: [], text: raw };

  const files = [];
  const headerRx = /^--- FILE: (.+?) ---$/gm;
  let m;
  while ((m = headerRx.exec(raw)) !== null) {
    files.push(m[1]);
  }
  if (!files.length) return { files: [], text: raw };

  // The user's message is appended after all file blocks as:
  //   {file blocks}\n\n{user text or "(see attached file)"}
  // Find the last \n\n whose following text is NOT another file header.
  let userText = '';
  let searchFrom = raw.length;
  while (searchFrom > 0) {
    const pos = raw.lastIndexOf('\n\n', searchFrom - 1);
    if (pos < 0) break;
    const candidate = raw.slice(pos + 2).trim();
    if (!candidate.startsWith('--- FILE:')) {
      userText = candidate === '(see attached file)' ? '' : candidate;
      break;
    }
    searchFrom = pos;
  }

  return { files, text: userText };
}

// remark-math's mathFlow tokenizer treats $$ as a FENCED block (like ```).
// The $$ MUST be alone on its own line — anything after $$ on the same line
// is treated as "fence meta" (stripped) and is NOT sent to KaTeX.
// So $$\begin{aligned}...\end{aligned}$$ breaks because:
//   • \begin{aligned} becomes fence meta → KaTeX never sees it
//   • \end{aligned}$$ is content (not a closing fence) → block never closes
// Fix: ensure $$ fences are always on their own lines.
function normalizeMathDelimiters(s) {
  let r = s;
  // 1. Normalize non-standard environments to aligned
  r = r
    .replace(/\\begin\{(align\*?|eqnarray\*?)\}/g, '\\begin{aligned}')
    .replace(/\\end\{(align\*?|eqnarray\*?)\}/g, '\\end{aligned}');
  // 2. Wrap bare aligned blocks (no delimiters) — each $$ on its own line
  r = r.replace(
    /(\${1,2})?[ \t]*\n?[ \t]*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}[ \t]*\n?[ \t]*(\${1,2})?/g,
    (m, open, body, close) => (open && close ? m : `\n$$\n\\begin{aligned}${body}\\end{aligned}\n$$\n`),
  );
  // 3. Convert \[...\] → block, \(...\) → inline
  r = r
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$\n${body}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`);
  // 4. Fix $$\begin{env}: move \begin to the next line so it's math content, not fence meta
  r = r.replace(/\$\$\\begin\{/g, '$$\n\\begin{');
  // 5. Fix \end{env}$$: move closing $$ to its own line so mathFlow recognises it as the fence
  r = r.replace(/\\end\{([^}]+)\}\$\$/g, '\\end{$1}\n$$');
  // 6. Fix mid-paragraph $$: if $$ is not at the start of a line, force it to a new line
  r = r.replace(/([^\n$][ \t]*)\$\$/g, (_, pre) => `${pre.trimEnd()}\n$$`);
  return r;
}

const CURSOR = '\u200B@@CURSOR@@';

function InlineQuiz({ quizJson, answers, submitted, onAnswer, onSubmit, unboxed = false }) {
  let quiz;
  try { quiz = JSON.parse(quizJson); } catch { return null; }
  if (!quiz?.questions?.length) return null;

  const score = submitted ? quiz.questions.filter(q => answers[q.question] === q.correct).length : 0;

  return (
    <div className="mt-3 mb-1 space-y-3">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quiz: {quiz.topic || 'Practice'}</p>
      {quiz.questions.map((q, i) => {
        const userAnswer = answers[q.question];
        const isCorrect = submitted && userAnswer === q.correct;
        const isWrong = submitted && userAnswer && userAnswer !== q.correct;
        return (
          <div
            key={i}
            className={unboxed
              ? 'px-1 py-4 border-b border-gray-200/80 last:border-b-0 dark:border-white/[0.07]'
              : `rounded-lg border p-3 ${submitted ? (isCorrect ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10' : isWrong ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/10' : 'border-gray-200 dark:border-[#2A2A40]') : 'border-gray-200 dark:border-[#2A2A40]'}`
            }
          >
            <MathText as="p" className="text-sm font-medium mb-2">{`${i + 1}. ${q.question.replace(/^\d+[.,)\s:]+/, '')}`}</MathText>
            <div className="space-y-1">
              {(q.options || []).map(opt => {
                const letter = opt.charAt(0);
                const selected = userAnswer === letter;
                const correctOpt = submitted && letter === q.correct;
                return (
                  <button
                    key={opt}
                    disabled={submitted}
                    onClick={() => onAnswer(q.question, letter)}
                    className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400/45 ${
                      submitted ? (correctOpt ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium' : selected && !correctOpt ? 'bg-rose-100 dark:bg-rose-900/20 text-rose-600' : 'text-gray-500') :
                      selected ? 'bg-blue-500/[0.14] text-blue-700 dark:text-blue-100 ring-1 ring-inset ring-blue-400/35 dark:ring-blue-300/25 font-medium' : 'hover:bg-gray-50 dark:hover:bg-white/[0.05] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <MathText>{opt}</MathText>
                  </button>
                );
              })}
            </div>
            {submitted && q.explanation && <MathText as="p" className="text-[11px] text-gray-500 mt-2 italic">{q.explanation}</MathText>}
          </div>
        );
      })}
      {!submitted ? (
        <button
          onClick={onSubmit}
          disabled={Object.keys(answers).length < quiz.questions.length}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-white/[0.08] dark:disabled:text-white/30 disabled:cursor-not-allowed transition-colors"
        >
          Check Answers
        </button>
      ) : (
        <p className="text-sm font-semibold">{score}/{quiz.questions.length} correct</p>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-[5px] py-0.5">
      {[0, 160, 320].map(delay => (
        <span
          key={delay}
          className="w-[7px] h-[7px] rounded-full bg-white/50"
          style={{ animation: `typing-bounce 1.1s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </div>
  );
}

export default function ChatMessage({
  message,
  quizId,
  sideScreenQuizId = null,
  quizSideScreenTarget = null,
  onSideScreenQuiz,
  isStreaming,
  canEdit = false,
  onEdit,
  onUserEdit,
  onAiInstruct,
  onReroute,
  onSmartReroute,
  onBruteForce,
  // Smart Reroute and Brute Force are Paid-only. When false, those two controls
  // render locked and route the click to the upgrade flow instead of firing.
  paid = true,
  onUpgrade = null,
}) {
  const isUser = message.role === 'user';
  const raw = message.content || '';
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(raw);
  const [instructText, setInstructText] = useState('');
  const [copied, setCopied] = useState(false);
  const [rerouteMenuOpen, setRerouteMenuOpen] = useState(false);
  const [reroutePos, setReroutePos] = useState(null);
  const rerouteBtnRef = useRef(null);
  const [bruteOpen, setBruteOpen] = useState(false);
  const [bruteFocus, setBruteFocus] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const utterRef = useRef(null);

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  // The reroute menu is portaled to <body> so it escapes the message bubble's
  // stacking context — otherwise the NEXT chat message paints on top of it and
  // steals the hover/click (you'd hover "Smart Reroute" and the next message
  // would light up instead). Position it from the trigger button's rect.
  function placeRerouteMenu() {
    const b = rerouteBtnRef.current?.getBoundingClientRect();
    if (!b) return;
    const MENU_W = 130;
    const MENU_H = 64;
    const left = Math.max(8, Math.min(b.left, window.innerWidth - MENU_W - 8));
    let top = b.bottom + 4;
    if (top + MENU_H > window.innerHeight - 8) top = b.top - MENU_H - 4; // flip above near the edge
    setReroutePos({ left, top, width: MENU_W });
  }

  useEffect(() => {
    if (!rerouteMenuOpen) return;
    const reflow = () => placeRerouteMenu();
    const onKey = (e) => { if (e.key === 'Escape') setRerouteMenuOpen(false); };
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('keydown', onKey);
    };
  }, [rerouteMenuOpen]);

  function pickFemaleVoice() {
    const voices = window.speechSynthesis.getVoices();
    const PREFERRED = ['Samantha', 'Google US English', 'Microsoft Zira - English', 'Microsoft Zira', 'Karen', 'Moira', 'Tessa', 'Veena', 'Google UK English Female', 'Ava'];
    for (const name of PREFERRED) {
      const v = voices.find(v => v.name === name || v.name.startsWith(name));
      if (v) return v;
    }
    const femaleKw = ['female', 'zira', 'samantha', 'karen', 'moira', 'tessa', 'veena', 'ava'];
    return voices.find(v => v.lang.startsWith('en') && femaleKw.some(k => v.name.toLowerCase().includes(k)))
      || voices.find(v => v.lang.startsWith('en'))
      || voices[0]
      || null;
  }

  function toggleSpeak() {
    if (!window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    // Strip markdown syntax so TTS reads clean prose, not punctuation noise.
    const text = (message.content || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\[.*?\]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utterRef.current = utter;
    const femaleVoice = pickFemaleVoice();
    if (femaleVoice) utter.voice = femaleVoice;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  }

  async function handleCopy() {
    // Copy the RAW markdown, not the rendered HTML, so it pastes cleanly
    // into Notion / Obsidian / ChatGPT / anywhere.
    const md = raw
      .replace(/\[PHASE_COMPLETE\]/g, '')
      .replace(/\[LESSON_(?:DONE|COMPLETE)\]\s*\{[\s\S]*?\}/g, '')
      .replace(/\[LESSON_(?:DONE|COMPLETE)\]/g, '')
      .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
      .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
      .replace(/\[MAKE_(?:NOTE|QUIZBOWL|DEBATE)\][\s\S]*?\[\/MAKE_(?:NOTE|QUIZBOWL|DEBATE)\]/g, '')
      .replace(/\[STATUS:\s*(advance|stay|next)\s*\]/gi, '')
      .trim();
    try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  }

  function saveUserEdit() {
    // User edits RESTART the conversation from this point - the parent
    // truncates history and re-sends the edited text to the AI.
    const fn = onUserEdit || onEdit;
    if (typeof fn === 'function') fn(editText);
    setEditing(false);
  }

  function submitInstruct() {
    // Intent: REPLACE this AI message with a fresh one that honors the
    // instruction. The parent is responsible for dropping this message +
    // everything after and asking the AI to regenerate the reply in place.
    if (!instructText.trim() || typeof onAiInstruct !== 'function') return;
    onAiInstruct(instructText.trim());
    setInstructText('');
    setEditing(false);
  }

  // Brute force with an optional clarification: the user types what matters
  // most about the request, which the server keeps intact while it rewrites the
  // prompt without trigger words. Empty focus is fine - it just runs the loop.
  function submitBruteForce() {
    if (typeof onBruteForce !== 'function') return;
    if (!paid) { setBruteOpen(false); onUpgrade?.(); return; }
    const focus = bruteFocus.trim();
    setBruteOpen(false);
    setBruteFocus('');
    onBruteForce(focus);
  }

  // Extract quiz blocks - only render the inline quiz UI when the full block has arrived
  const quizMatch = raw.match(/\[QUIZ_START\]\s*([\s\S]*?)\s*\[QUIZ_END\]/);
  const quizJson = quizMatch ? quizMatch[1].trim() : null;
  const quizStreaming = !quizJson && raw.includes('[QUIZ_START]');
  const quizIsSideScreened = !!quizJson && sideScreenQuizId === quizId;
  const wasQuizSideScreened = useRef(quizIsSideScreened);
  const [quizReturning, setQuizReturning] = useState(false);
  useEffect(() => {
    let timer;
    if (wasQuizSideScreened.current && !quizIsSideScreened) {
      setQuizReturning(true);
      timer = window.setTimeout(() => setQuizReturning(false), 180);
    } else if (quizIsSideScreened) {
      setQuizReturning(false);
    }
    wasQuizSideScreened.current = quizIsSideScreened;
    return () => window.clearTimeout(timer);
  }, [quizIsSideScreened]);
  let quizTopic = 'Practice';
  if (quizJson) {
    try { quizTopic = JSON.parse(quizJson)?.topic || 'Practice'; } catch { /* rendered quiz handles invalid JSON */ }
  }
  const quizView = quizJson ? (
    <InlineQuiz
      quizJson={quizJson}
      answers={quizAnswers}
      submitted={quizSubmitted}
      onAnswer={(question, letter) => setQuizAnswers(prev => ({ ...prev, [question]: letter }))}
      onSubmit={() => setQuizSubmitted(true)}
      unboxed={quizIsSideScreened}
    />
  ) : null;

  // Extract tutor `board` drawing blocks. Each closed ```board ... ``` becomes an
  // inline figure rendered below the bubble text; an unclosed one (still
  // streaming) shows a "drawing…" chip. The DSL is stripped from the visible
  // text so the raw commands never flash. (Only the math tutor emits these.)
  const boardSrcs = [];
  const boardRe = /```board[ \t]*\n?([\s\S]*?)```/g;
  let bm;
  while ((bm = boardRe.exec(raw))) boardSrcs.push(bm[1]);
  const lastBoardOpen = raw.lastIndexOf('```board');
  const boardStreaming = lastBoardOpen >= 0 && raw.indexOf('```', lastBoardOpen + 8) < 0;

  let displayContent = raw;

  // While streaming: drop any partial quiz block so the raw JSON doesn't flash in the bubble.
  // Also drop an unclosed [LESSON_DONE]{... block so the JSON tail doesn't show up either.
  if (quizStreaming) displayContent = displayContent.replace(/\[QUIZ_START\][\s\S]*$/, '');
  displayContent = displayContent.replace(/\[LESSON_DONE\]\s*\{[^}]*$/g, '');

  // Strip board blocks (closed and any unclosed trailing one) from the bubble text.
  displayContent = displayContent
    .replace(/```board[ \t]*\n?[\s\S]*?```/g, '')
    .replace(/```board[\s\S]*$/g, '');

  // Balanced-brace stripper: removes `[LESSON_DONE|LESSON_COMPLETE]` + its
  // trailing JSON even when the JSON has nested braces or is wrapped in a
  // code fence. Also strips the fence itself if present.
  function stripDoneMarker(s) {
    const rx = /```(?:json|javascript|js)?\s*/gi;
    s = s.replace(rx, '').replace(/```/g, '');
    const mark = s.search(/\[LESSON_(?:DONE|COMPLETE)\]/);
    if (mark < 0) return s;
    const markerEnd = mark + (s.slice(mark).match(/\[LESSON_(?:DONE|COMPLETE)\]/)[0].length);
    const rest = s.slice(markerEnd);
    const braceStart = rest.indexOf('{');
    if (braceStart < 0) return s.slice(0, mark);
    // Walk braces
    let depth = 0, inStr = false, esc = false, i = braceStart;
    for (; i < rest.length; i++) {
      const ch = rest[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return s.slice(0, mark) + rest.slice(i);
  }

  displayContent = displayContent
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/g, '')
    .replace(/\[MILESTONE_COMPLETE:[^\]]+\]/g, '')
    // [MAKE_*] action tokens (study mode): the server has already parsed
    // these into real artifacts and we render Open cards below the bubble.
    // Hide both completed and in-flight (partial) blocks so the raw JSON
    // never flashes in the user's view.
    .replace(/\[MAKE_(?:NOTE|QUIZBOWL|DEBATE)\][\s\S]*?\[\/MAKE_(?:NOTE|QUIZBOWL|DEBATE)\]/g, '')
    .replace(/\[MAKE_(?:NOTE|QUIZBOWL|DEBATE)\][\s\S]*$/g, '')
    .replace(/\[STATUS:\s*(advance|stay|next)\s*\]/gi, '');
  displayContent = stripDoneMarker(displayContent).trim();

  displayContent = normalizeMathDelimiters(displayContent);

  const artifacts = Array.isArray(message.artifacts) ? message.artifacts : [];
  if (!displayContent && !quizJson && !artifacts.length && !boardSrcs.length && !isStreaming) return null;
  const quizOnlySideScreened = quizIsSideScreened
    && !displayContent
    && !message.thinking
    && !artifacts.length
    && !boardSrcs.length
    && !boardStreaming;

  const contentWithCursor = isStreaming ? displayContent + CURSOR : displayContent;

  const markdownRef = useRef(null);

  const isError = !!message._error;

  // Layout philosophy - NOT ChatGPT.
  // ChatGPT's pattern is full-width alternating gray/white panels with
  // tiny avatar+name. We deliberately do iMessage-style:
  //
  //   AI on the LEFT in a soft-rounded card with a sharp inner left
  //   accent stripe - feels like a teacher's note in the margin.
  //   USER on the RIGHT as a tight blue bubble with a sharp tail
  //   corner pointing at "you" (rounded-tr-sm).
  //
  // No avatars, no per-message header, no full-width gray panels.
  // The directional alignment alone signals who's talking.

  if (isUser) {
    // Split out any --- FILE: ... --- blocks prepended by ChatInput
    const { files: attachedFiles, text: userText } = parseUserContent(displayContent);

    if (editing) {
      return (
        <div className="flex justify-end mb-3 animate-fade-in">
          <div className="max-w-[78%] w-full sm:w-auto">
            <div className="rounded-2xl rounded-tr-md bg-gray-900 dark:bg-white/[0.12] p-3 shadow-sm">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={Math.min(12, Math.max(3, editText.split('\n').length))}
                className="w-full min-w-[260px] p-2 rounded-lg bg-white/10 text-white placeholder-white/40 text-sm outline-none border border-white/20 focus:border-white/50"
                autoFocus
              />
              <p className="text-[10px] text-white/60 mt-1.5">Saving will restart the conversation from here.</p>
              <div className="flex gap-1.5 mt-2 justify-end">
                <button onClick={() => { setEditing(false); setEditText(raw); }} className="px-3 py-1 rounded-md text-[11px] text-white/70 hover:bg-white/10">Cancel</button>
                <button onClick={saveUserEdit} className="px-3 py-1 rounded-md text-[11px] bg-blue-500 text-white font-semibold hover:bg-blue-400 transition-colors">Save &amp; Restart</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="group flex justify-end mb-3 animate-fade-in">
        <div className="max-w-[78%]">
          {/* User bubble - dark/white neutral, no color */}
          <div className="rounded-2xl rounded-tr-md bg-gray-900/70 dark:bg-white/[0.11] px-4 py-2.5 shadow-sm">
            {Array.isArray(message.images) && message.images.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {message.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.dataUrl || img.url}
                    alt={img.name || `attachment-${i}`}
                    className="max-w-[160px] max-h-[160px] rounded-lg object-cover border border-white/20"
                  />
                ))}
              </div>
            )}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachedFiles.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.10] border border-white/[0.18] text-white/80 text-[11px] font-medium max-w-[220px]"
                  >
                    <FileText size={11} className="flex-shrink-0 text-white/50" />
                    <span className="truncate">{name}</span>
                  </span>
                ))}
              </div>
            )}
            {userText && (
              <p className="whitespace-pre-wrap text-[13.5px] text-white leading-relaxed">{userText}</p>
            )}
          </div>
          {!isStreaming && canEdit && (
            <div className="mt-1 mr-1 flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              {message._edited && <span className="text-[9px] text-gray-400 italic mr-1">edited</span>}
              <button
                onClick={handleCopy}
                title="Copy as text"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
              >
                {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
              <button
                onClick={() => { setEditing(true); setEditText(raw); }}
                title="Edit this message"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1e1e2e]"
              >
                <Pencil size={10} /> Edit
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant turn - same bubble SHAPE as the user (rounded-2xl with one
  // sharp tail corner pointing back at the speaker), just a different
  // color. iMessage style: user = blue, AI = gray. Symmetric, no extra
  // chrome (no accent stripes, no header labels).
  return (
    <div className={
      quizOnlySideScreened
        ? 'hidden'
        : `flex flex-col items-start mb-3 ${quizReturning ? 'animate-quiz-fade' : 'animate-fade-in'}`
    }>
      {/* The "see other responses" meta sits ABOVE the bubble, not inside it:
          the winner reads as the normal message, the alternatives are one
          quiet click away. */}
      {message.bestOf && !isError && <BestOfResponses bestOf={message.bestOf} />}
      <div className={`max-w-[88%] rounded-2xl rounded-tl-md px-4 py-2.5 shadow-sm ${
        isError
          ? 'bg-rose-100/70 dark:bg-rose-900/30'
          : 'bg-white/50 dark:bg-white/[0.08]'
      }`}>
        <div className={isError ? 'text-rose-700 dark:text-rose-200 text-sm' : 'text-gray-900 dark:text-white'}>
        {message.thinking && !isError && <ThinkingPanel text={message.thinking} streaming={isStreaming} />}
        {isStreaming && !displayContent && !message.thinking && <ThinkingDots />}
        {displayContent && (
          <div ref={markdownRef} className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-code:bg-gray-200 dark:prose-code:bg-white/[0.08] prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 dark:prose-pre:bg-black/60 prose-pre:rounded-lg">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#94a3b8' }]]}
              components={{
                p: ({ children, ...props }) => <p {...props}>{styleCitations(injectCursor(children), message.sources)}</p>,
                li: ({ children, ...props }) => <li {...props}>{styleCitations(injectCursor(children), message.sources)}</li>,
                h1: ({ children, ...props }) => <h1 {...props}>{injectCursor(children)}</h1>,
                h2: ({ children, ...props }) => <h2 {...props}>{injectCursor(children)}</h2>,
                h3: ({ children, ...props }) => <h3 {...props}>{injectCursor(children)}</h3>,
                strong: ({ children, ...props }) => <strong {...props}>{styleCitations(children, message.sources)}</strong>,
                em: ({ children, ...props }) => <em {...props}>{styleCitations(children, message.sources)}</em>,
              }}
            >
              {contentWithCursor}
            </ReactMarkdown>
          </div>
        )}
        {quizStreaming && !quizJson && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08]">
            <span className="inline-block w-1.5 h-1.5 bg-gray-400 dark:bg-white/50 rounded-full animate-pulse" />
            <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Generating quiz…</span>
          </div>
        )}
        {quizJson && (
          <>
            <div
              aria-hidden={quizIsSideScreened}
              inert={quizIsSideScreened ? true : undefined}
              className={quizIsSideScreened ? 'hidden' : (quizReturning ? 'animate-quiz-fade' : '')}
            >
              {quizView}
              {typeof onSideScreenQuiz === 'function' && (
                <button
                  type="button"
                  onClick={() => onSideScreenQuiz({ id: quizId, title: `Quiz: ${quizTopic}` })}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
                  title="Open quiz in sidescreen"
                >
                  <PanelRightOpen size={13} />
                  Sidescreen
                </button>
              )}
            </div>
            {quizIsSideScreened && quizSideScreenTarget && createPortal(quizView, quizSideScreenTarget)}
          </>
        )}
        {boardStreaming && !boardSrcs.length && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-white/[0.06] border border-gray-200 dark:border-white/[0.08]">
            <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">Drawing on the board…</span>
          </div>
        )}
        {/* Tutor figures render on the Math Tutor canvas, not inline in chat. */}
        {artifacts.length > 0 && <ArtifactCards artifacts={artifacts} />}
        {Array.isArray(message.sources) && message.sources.length > 0 && (
          <Sources sources={message.sources} />
        )}
        {!isStreaming && !isError && displayContent && editing && typeof onAiInstruct === 'function' && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#2A2A40]">
            <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
              What should the AI change?
            </label>
            <div className="flex gap-1.5 items-start">
              <input
                autoFocus
                value={instructText}
                onChange={e => setInstructText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && instructText.trim()) submitInstruct(); }}
                placeholder="e.g. shorter, more examples, include the formula…"
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-white/25"
              />
              <button
                onClick={() => { setEditing(false); setInstructText(''); }}
                className="px-2 py-1 rounded text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.07]"
              >Cancel</button>
              <button
                onClick={submitInstruct}
                disabled={!instructText.trim()}
                className="px-3 py-1 rounded-lg text-[10px] bg-gray-900 dark:bg-white/[0.12] text-white font-medium hover:bg-gray-800 dark:hover:bg-white/[0.18] disabled:opacity-40"
              >Redo</button>
            </div>
          </div>
        )}
        {!isStreaming && !isError && displayContent && !editing && bruteOpen && typeof onBruteForce === 'function' && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#2A2A40]">
            <label className="text-[10px] font-semibold text-blue-600 dark:text-blue-200/80 uppercase tracking-wider block mb-1.5">
              What's the most important part to keep?
            </label>
            <div className="flex gap-1.5 items-start">
              <input
                autoFocus
                value={bruteFocus}
                onChange={e => setBruteFocus(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitBruteForce();
                  else if (e.key === 'Escape') { setBruteOpen(false); setBruteFocus(''); }
                }}
                placeholder="Optional. e.g. keep the step-by-step math, or the core argument"
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.05] text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-400/30"
              />
              <button
                onClick={() => { setBruteOpen(false); setBruteFocus(''); }}
                className="px-2 py-1 rounded text-[10px] text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.07]"
              >Cancel</button>
              <button
                onClick={submitBruteForce}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-500 dark:bg-blue-500/80 dark:hover:bg-blue-500 transition-colors"
              ><Hammer size={10} /> Brute force</button>
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-gray-400 dark:text-white/35">
              5 models keep rewording your prompt for up to 10 rounds, preserving this above all.
            </p>
          </div>
        )}
        {!isStreaming && !isError && displayContent && !editing && !bruteOpen && (
          <div className="mt-2 flex items-center gap-1 opacity-40 hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              title="Copy as Markdown"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.07]"
            >
              {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
            </button>
            {window.speechSynthesis && (
              <button
                onClick={toggleSpeak}
                title={speaking ? 'Stop playback' : 'Play response aloud'}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors ${
                  speaking
                    ? 'text-blue-500 dark:text-blue-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {speaking ? <><Square size={10} /> Stop</> : <><Volume2 size={10} /> Play</>}
              </button>
            )}
            {canEdit && typeof onAiInstruct === 'function' && (
              <button
                onClick={() => { setEditing(true); setInstructText(''); }}
                title="Tell the AI what to change about this response"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.07]"
              >
                <Pencil size={10} /> Edit
              </button>
            )}
            {typeof onReroute === 'function' && (
              typeof onSmartReroute === 'function' ? (
                // Reroute split into a small menu: plain reroute vs smart reroute.
                // Menu is portaled to <body> (see placeRerouteMenu) so the next
                // chat message can't paint over it and swallow the click/hover.
                <div className="relative">
                  <button
                    ref={rerouteBtnRef}
                    onClick={() => setRerouteMenuOpen((o) => { if (!o) placeRerouteMenu(); return !o; })}
                    aria-expanded={rerouteMenuOpen}
                    title={messageLooksLikeRefusal(displayContent)
                      ? "This looks like a refusal — reroute through every model to find one that answers"
                      : "Reroute this prompt through every model"}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-blue-600 dark:text-blue-300/90 hover:text-blue-700 dark:hover:text-blue-200 hover:bg-blue-500/[0.10] dark:hover:bg-blue-500/[0.12] transition-colors"
                  >
                    <Shuffle size={10} /> Reroute
                    <ChevronDown size={10} className={`transition-transform ${rerouteMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {rerouteMenuOpen && reroutePos && createPortal(
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setRerouteMenuOpen(false)} />
                      <div
                        style={{ position: 'fixed', left: reroutePos.left, top: reroutePos.top, minWidth: reroutePos.width, zIndex: 9999 }}
                        className="rounded-lg border border-gray-200 dark:border-white/[0.10] bg-white dark:bg-[#1b1d24] shadow-xl py-0.5"
                      >
                        <button
                          onClick={() => { setRerouteMenuOpen(false); onReroute(); }}
                          className="w-full px-2.5 py-1 text-left text-[11px] text-gray-800 dark:text-white/85 whitespace-nowrap hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
                        >
                          Reroute
                        </button>
                        <button
                          onClick={() => { setRerouteMenuOpen(false); if (paid) onSmartReroute(); else onUpgrade?.(); }}
                          title={paid ? undefined : 'Smart reroute is a Paid feature — upgrade to reframe your prompt before fanning it out.'}
                          className="w-full px-2.5 py-1 text-left text-[11px] text-gray-800 dark:text-white/85 whitespace-nowrap hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors flex items-center justify-between gap-3"
                        >
                          <span>Smart Reroute</span>
                          {!paid && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-500 dark:text-amber-300/90">
                              <Lock size={9} /> Paid
                            </span>
                          )}
                        </button>
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              ) : (
                <button
                  onClick={onReroute}
                  title={messageLooksLikeRefusal(displayContent)
                    ? "This looks like a refusal — reroute through every model to find one that answers"
                    : "Reroute: run this prompt through every model and see each response"}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-blue-600 dark:text-blue-300/90 hover:text-blue-700 dark:hover:text-blue-200 hover:bg-blue-500/[0.10] dark:hover:bg-blue-500/[0.12] transition-colors"
                >
                  <Shuffle size={10} /> Reroute
                </button>
              )
            )}
            {typeof onBruteForce === 'function' && (
              <button
                onClick={() => { if (!paid) { onUpgrade?.(); return; } setBruteOpen((o) => !o); setEditing(false); }}
                aria-expanded={paid ? bruteOpen : undefined}
                title={paid
                  ? "Brute force: run 5 models for up to 10 rounds, rewriting the prompt without trigger words until one answers. Click to first say what matters most."
                  : "Brute force is a Paid feature — upgrade to keep rewriting your prompt across every model until one answers."}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-700 dark:text-blue-100 ring-1 ring-inset ring-blue-500/25 dark:ring-blue-400/30 transition-colors ${bruteOpen ? 'bg-blue-500/25 dark:bg-blue-400/30' : 'bg-blue-500/15 hover:bg-blue-500/25 dark:bg-blue-400/[0.18] dark:hover:bg-blue-400/30'}`}
              >
                {paid ? <Hammer size={10} /> : <Lock size={10} />} Brute force
                {paid
                  ? <ChevronDown size={10} className={`transition-transform ${bruteOpen ? 'rotate-180' : ''}`} />
                  : <span className="text-[9px] font-semibold text-amber-500 dark:text-amber-300/90">Paid</span>}
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// Open cards rendered beneath an assistant bubble when the AI emitted a
// [MAKE_*] action token in study mode. Each card describes the artifact
// the server just created (a note, a QB practice topic, a debate prompt)
// and provides one button that deep-links into the right app via the
// desktop window manager. We deliberately keep these visually distinct
// from quiz blocks: card-like, soft border, the verb "Open in <App>" so
// the affordance is obvious without reading.
function ArtifactCards({ artifacts }) {
  const wm = (() => { try { return useWindowManager(); } catch { return null; } })();
  function open(a) {
    if (!wm || !a?.launch?.appId) return;
    try { wm.openApp(a.launch.appId, a.launch.label || a.launch.appId, a.launch.meta || {}); } catch {}
  }
  const META = {
    note:     { Icon: NoteIcon, label: 'Note',        appLabel: 'Notes',     tone: 'text-emerald-200', ring: 'border-emerald-400/30 hover:border-emerald-400/55' },
    quizbowl: { Icon: Zap,      label: 'Quiz Bowl',   appLabel: 'Quiz Bowl', tone: 'text-amber-200',   ring: 'border-amber-400/30 hover:border-amber-400/55' },
    debate:   { Icon: Swords,   label: 'Debate',      appLabel: 'Debate',    tone: 'text-rose-200',    ring: 'border-rose-400/30 hover:border-rose-400/55' },
  };
  return (
    <div className="mt-3 space-y-2">
      {artifacts.map((a, i) => {
        const m = META[a.type] || { Icon: ExternalLink, label: 'Artifact', appLabel: 'App', tone: 'text-white/70', ring: 'border-white/20 hover:border-white/40' };
        const Icon = m.Icon;
        return (
          <button
            key={i}
            onClick={() => open(a)}
            className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white/[0.04] hover:bg-white/[0.07] transition-colors text-left ${m.ring}`}
          >
            <div className={`w-8 h-8 rounded-lg grid place-items-center bg-white/[0.06] ${m.tone} flex-shrink-0`}>
              <Icon size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{m.label}</p>
              <p className="text-[12.5px] font-bold text-white truncate">{a.title || a.launch?.meta?.initialTopic || 'Untitled'}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.10] group-hover:bg-white/[0.16] text-white/85 text-[11px] font-semibold flex-shrink-0">
              Open <ExternalLink size={10} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Sources({ sources }) {
  return (
    <div className="mt-3 pt-2 border-t border-gray-200 dark:border-[#2A2A40]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Sources</p>
      <ol className="space-y-1">
        {sources.map((s, i) => {
          let host = '';
          try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { host = s.url; }
          return (
            <li key={i} className="flex items-start gap-1.5 text-[11px]">
              <span className="text-gray-400 tabular-nums">[{i + 1}]</span>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:underline break-all"
                title={s.url}
              >
                {s.title || host}
              </a>
              {s.title && <span className="text-gray-400 truncate">· {host}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function injectCursor(children) {
  if (!children) return children;
  if (!Array.isArray(children)) children = [children];
  return children.map((child, i) => {
    if (typeof child === 'string' && child.includes('@@CURSOR@@')) {
      const parts = child.split('@@CURSOR@@');
      return (
        <span key={i}>
          {parts[0].replace('\u200B', '')}
          <span className="inline-block w-1.5 h-4 bg-white/70 dark:bg-white/60 animate-pulse ml-0.5 align-middle rounded-sm" />
          {parts[1]}
        </span>
      );
    }
    return child;
  });
}

// Turn inline "[n]" citation markers into Wikipedia-style superscripts.
// If we have the matching source, make it a clickable link to the URL
// and trim the preceding space so "word [3]" renders as "word³".
function styleCitations(children, sources) {
  if (!children) return children;
  if (!Array.isArray(children)) children = [children];
  const rx = /\s*\[(\d+)\]/g;
  return children.flatMap((child, idx) => {
    if (typeof child !== 'string') return [child];
    const parts = [];
    let last = 0;
    let m;
    let n = 0;
    while ((m = rx.exec(child)) !== null) {
      if (m.index > last) parts.push(child.slice(last, m.index));
      const num = Number(m[1]);
      const src = Array.isArray(sources) ? sources[num - 1] : null;
      const sup = (
        <sup
          key={`${idx}-${n++}`}
          className="ml-0.5 text-[0.7em] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 align-super"
        >
          {src?.url ? (
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              title={src.title || src.url}
              className="no-underline hover:underline"
            >[{num}]</a>
          ) : (
            <span>[{num}]</span>
          )}
        </sup>
      );
      parts.push(sup);
      last = m.index + m[0].length;
    }
    if (last < child.length) parts.push(child.slice(last));
    return parts.length ? parts : [child];
  });
}
