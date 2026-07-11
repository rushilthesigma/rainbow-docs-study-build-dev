import { useState, useRef, useEffect } from 'react';
import { History, Send, Calculator, Beaker, Lightbulb, Compass, Plus, X, Brain, ChevronRight, Cpu, Check, Lock, Shuffle, Layers, Volume2, Square, AudioLines } from 'lucide-react';
import { sendStudyMessage, listStudySessions, getStudySession, deleteStudySession } from '../../api/curriculum';
import { syncData } from '../../api/auth';
import { errorChatMessage } from '../../utils/aiErrors';
import { Z } from '../../styles/tokens';
import useKeyboardInset from '../../hooks/useKeyboardInset';
import { useAuth } from '../../context/AuthContext';
import { planFromUser } from '../billing/modelAccess';
import { HAIKU_FREE_DAILY, resolveStudyModel, canUseStudyModel, requiredPlanLabelFor, studyModelLabel, studyModelHasFreeCap, visibleStudyModels, isGeminiOnlyEmail, isBlockedForGeminiOnly, resolveGeminiOnlyModel, STUDY_MODELS, normalizeBestOfSelection, unlockedStudyModelKeys } from '../study/studyModels';
import DictationButton from '../study/voice/DictationButton';
import { useSpeechSynthesis, speechSynthesisSupported } from '../../hooks/useSpeechSynthesis';
import { speechRecognitionSupported } from '../../hooks/useSpeechRecognition';
import { speakableText } from '../../utils/voiceText';

// Mobile-native Study Mode: full-bleed chat, slim title, no Debate
// button (head-to-head needs a wider canvas), no sidebar. The empty
// state shows a centered prompt with 4 quick-start tiles.

const QUICK_PROMPTS = [
  { icon: Calculator, label: 'Quiz me on the quadratic formula', prompt: 'Quiz me on the quadratic formula. 5 multiple-choice questions, escalating difficulty.' },
  { icon: Beaker,     label: 'Explain photosynthesis at honors level', prompt: 'Explain photosynthesis at honors-tier depth. Don\'t skip the Calvin cycle.' },
  { icon: Lightbulb,  label: 'Help me understand limits in calculus', prompt: 'Walk me through limits in calculus, starting with intuition before the formal definition.' },
  { icon: Compass,    label: "What's a good thing to study right now?", prompt: 'What should I work on right now?' },
];

// Same trigger as the desktop composer + DictationButton so "send send"
// behaves identically everywhere. Tolerant of "sent send", commas, periods.
const SEND_TRIGGER = /\b(?:send|sent)[\s,.!]+(?:send|sent)[\s,.!?]*$/i;

const MODE_LABELS = { single: 'Single', 'best-of': 'Best of', superimpose: 'Superimpose' };

export default function MobileStudy() {
  const { user, fetchUser } = useAuth();
  const plan = planFromUser(user);
  const userEmail = user?.email || '';
  const [messages, setMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Per-message model pick, mirrors the desktop Study toggle. The saved choice
  // lives in preferences.studyModel; a plan-locked pick resolves to the floor.
  function resolveEffectiveModel(savedKey) {
    const resolved = resolveStudyModel(savedKey, plan);
    if (isGeminiOnlyEmail(userEmail)) {
      const m = STUDY_MODELS.find(x => x.key === resolved);
      if (!m || isBlockedForGeminiOnly(m.provider)) return resolveGeminiOnlyModel(plan);
    }
    return resolved;
  }
  const [studyModel, setStudyModel] = useState(() => resolveEffectiveModel(user?.data?.preferences?.studyModel));
  const studyModelRef = useRef(studyModel);
  studyModelRef.current = studyModel;
  // Model mode: single / best-of / superimpose. Shares the desktop preference
  // keys so the pick carries across devices. Best of runs 3 response models
  // plus a judge that picks a winner; Superimpose has the fourth model merge
  // all three answers into one instead.
  const [studyModelMode, setStudyModelMode] = useState(() => (
    ['best-of', 'superimpose'].includes(user?.data?.preferences?.studyModelMode) ? user.data.preferences.studyModelMode : 'single'
  ));
  const initialBestOf = normalizeBestOfSelection(
    user?.data?.preferences?.studyBestOfModels,
    user?.data?.preferences?.studyBestOfJudge,
    userEmail,
    plan,
  );
  const [bestOfModels, setBestOfModels] = useState(() => initialBestOf.models);
  const [bestOfJudge, setBestOfJudge] = useState(() => initialBestOf.judge);
  const studyModelModeRef = useRef(studyModelMode);
  const bestOfModelsRef = useRef(bestOfModels);
  const bestOfJudgeRef = useRef(bestOfJudge);
  studyModelModeRef.current = studyModelMode;
  bestOfModelsRef.current = bestOfModels;
  bestOfJudgeRef.current = bestOfJudge;
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  // Free Haiku messages left in the rolling 24h window (non-paid only). Null
  // until the server reports it on the first send.
  const [haikuRemaining, setHaikuRemaining] = useState(null);
  const abortRef = useRef(null);
  const streamRef = useRef('');
  const thinkRef = useRef('');
  const streamBestOfRef = useRef(null);
  const scrollerRef = useRef(null);
  const kbInset = useKeyboardInset();

  // ===== Voice mode (BETA) =====
  // Same localStorage keys as desktop Study so speed/voice/language carry over.
  const [voiceRate, setVoiceRate] = useState(() => {
    const r = parseFloat(localStorage.getItem('covalent-voice-rate'));
    return Number.isFinite(r) && r > 0 ? r : 1;
  });
  const [voiceURI, setVoiceURI] = useState(() => localStorage.getItem('covalent-voice-uri') || null);
  // Which message is being read aloud, keyed by its timestamp (indexes shift
  // as messages stream in; timestamps don't).
  const [speakingKey, setSpeakingKey] = useState(null);
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const synth = useSpeechSynthesis({ rate: voiceRate, voiceURI, onEnd: () => setSpeakingKey(null) });
  const voiceAvailable = speechSynthesisSupported || speechRecognitionSupported;

  function persistRate(r) { setVoiceRate(r); try { localStorage.setItem('covalent-voice-rate', String(r)); } catch {} }
  function persistVoiceURI(uri) {
    setVoiceURI(uri);
    try {
      if (uri) localStorage.setItem('covalent-voice-uri', uri);
      else localStorage.removeItem('covalent-voice-uri');
    } catch {}
  }

  function stopSpeech() {
    synth.cancel();
    setSpeakingKey(null);
  }

  function toggleSpeak(key, content) {
    if (speakingKey === key) { stopSpeech(); return; }
    const speech = speakableText(content);
    if (!speech) return;
    synth.speak(speech);
    setSpeakingKey(key);
  }

  // Keep the picker in sync if the cached user (plan / saved picks) changes.
  useEffect(() => {
    setStudyModel(resolveEffectiveModel(user?.data?.preferences?.studyModel));
  }, [user?.data?.preferences?.studyModel, plan, userEmail]);

  useEffect(() => {
    setStudyModelMode(['best-of', 'superimpose'].includes(user?.data?.preferences?.studyModelMode) ? user.data.preferences.studyModelMode : 'single');
    const normalized = normalizeBestOfSelection(
      user?.data?.preferences?.studyBestOfModels,
      user?.data?.preferences?.studyBestOfJudge,
      userEmail,
      plan,
    );
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
  }, [
    user?.data?.preferences?.studyModelMode,
    user?.data?.preferences?.studyBestOfModels,
    user?.data?.preferences?.studyBestOfJudge,
    userEmail,
    plan,
  ]);

  async function saveStudyPrefs(patch, { refresh = false } = {}) {
    try {
      const merged = { ...(user?.data?.preferences || {}), ...patch };
      await syncData({ preferences: merged });
      if (refresh) await fetchUser();
    } catch (err) { console.error('save study preferences failed:', err); }
  }

  async function pickStudyModel(key) {
    if (!canUseStudyModel(key, plan)) return; // locked tiers aren't selectable
    setStudyModel(key);
    setStudyModelMode('single');
    setModelSheetOpen(false);
    await saveStudyPrefs({ studyModel: key, studyModelMode: 'single' }, { refresh: true });
  }

  function pickStudyModelMode(mode) {
    const nextMode = ['best-of', 'superimpose'].includes(mode) ? mode : 'single';
    setStudyModelMode(nextMode);
    saveStudyPrefs({ studyModelMode: nextMode });
  }

  // Tap an unselected model to add it; once 3 are picked the oldest pick
  // rotates out. Tapping one of the 3 selected picks is a no-op (the trio is
  // always kept full, matching the desktop normalization).
  function pickBestOfCandidate(key) {
    if (!canUseStudyModel(key, plan) || key === bestOfJudgeRef.current) return;
    const cur = bestOfModelsRef.current;
    if (cur.includes(key)) return;
    const next = cur.length < 3 ? [...cur, key] : [...cur.slice(1), key];
    const normalized = normalizeBestOfSelection(next, bestOfJudgeRef.current, userEmail, plan);
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
    saveStudyPrefs({ studyBestOfModels: normalized.models, studyBestOfJudge: normalized.judge });
  }

  function pickBestOfJudge(key) {
    if (!canUseStudyModel(key, plan) || bestOfModelsRef.current.includes(key)) return;
    const normalized = normalizeBestOfSelection(bestOfModelsRef.current, key, userEmail, plan);
    setBestOfModels(normalized.models);
    setBestOfJudge(normalized.judge);
    saveStudyPrefs({ studyBestOfModels: normalized.models, studyBestOfJudge: normalized.judge });
  }

  const multiReady = bestOfModels.length === 3 && !!bestOfJudge;
  const multiActive = studyModelMode !== 'single' && multiReady;

  // Auto-scroll to bottom on new content - and whenever the keyboard
  // opens/closes, so the latest message stays pinned above the input.
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, streamingContent, kbInset]);

  function doSend(text, opts = {}) {
    if (!text.trim() || streaming) return;
    stopSpeech();
    const rerouteActive = !!opts.reroute;
    const bestOfActive = !rerouteActive && studyModelModeRef.current === 'best-of'
      && bestOfModelsRef.current.length === 3 && !!bestOfJudgeRef.current;
    const superimposeActive = !rerouteActive && studyModelModeRef.current === 'superimpose'
      && bestOfModelsRef.current.length === 3 && !!bestOfJudgeRef.current;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (!opts.hideUserInDisplay) setMessages((m) => [...m, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    streamRef.current = '';
    thinkRef.current = '';
    streamBestOfRef.current = null;
    const abort = sendStudyMessage(text, sessionId, {}, [], {
      onChunk: (chunk) => { streamRef.current += chunk; setStreamingContent(streamRef.current); },
      onThinking: (t) => { thinkRef.current += t; setStreamingThinking(thinkRef.current); },
      onMeta: (d) => {
        if (d.sessionId) setSessionId(d.sessionId);
        if (d.bestOf) streamBestOfRef.current = d.bestOf;
        if (typeof d.studyModel?.haikuRemaining === 'number') setHaikuRemaining(d.studyModel.haikuRemaining);
      },
      onDone: () => {
        const full = streamRef.current;
        const think = thinkRef.current;
        const bestOfMeta = streamBestOfRef.current;
        if (full) {
          const msg = {
            role: 'assistant',
            content: full,
            thinking: think || undefined,
            bestOf: bestOfMeta || undefined,
            timestamp: new Date().toISOString(),
          };
          setMessages((m) => [...m, msg]);
          // Voice-originated sends get the reply read back automatically.
          if (opts.autoPlay) {
            const speech = speakableText(full);
            if (speech) { synth.speak(speech); setSpeakingKey(msg.timestamp); }
          }
        }
        setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = ''; streamBestOfRef.current = null; setStreaming(false);
      },
      onError: (err) => {
        setMessages((m) => [...m, errorChatMessage(err)]);
        setStreamingContent(''); setStreamingThinking(''); streamRef.current = ''; thinkRef.current = ''; streamBestOfRef.current = null; setStreaming(false);
      },
    }, false, false, studyModelRef.current, null, false,
      (bestOfActive || superimposeActive)
        ? { models: bestOfModelsRef.current, judgeModel: bestOfJudgeRef.current }
        : null,
      rerouteActive, rerouteActive && !!opts.smartReroute, false, '', superimposeActive);
    abortRef.current = abort;
  }

  // ===== Dictation =====
  // Live speech streams into the input; "send send" fires the message and the
  // reply is read back aloud, so a whole turn works hands-free.
  const dictBaseRef = useRef('');
  const inputStateRef = useRef(input);
  inputStateRef.current = input;

  function handleDictationStart() {
    dictBaseRef.current = inputStateRef.current.trim();
  }
  function handleDictationLive(combined) {
    const base = dictBaseRef.current;
    setInput(base ? `${base} ${combined}` : combined);
  }
  function handleDictationFinal(finalText) {
    const base = dictBaseRef.current;
    const chunk = (finalText || '').trim();
    const merged = (base ? (chunk ? `${base} ${chunk}` : base) : chunk).trim();
    if (SEND_TRIGGER.test(merged)) {
      const payload = merged.replace(SEND_TRIGGER, '').trim();
      dictBaseRef.current = '';
      setInput('');
      doSend(payload, { autoPlay: true });
      return;
    }
    setInput(merged);
    dictBaseRef.current = merged;
  }
  function handleDictationAutoSend(chunk) {
    const base = dictBaseRef.current;
    const merged = (base && chunk ? `${base} ${chunk}` : base || chunk).trim();
    dictBaseRef.current = '';
    setInput('');
    doSend(merged, { autoPlay: true });
  }
  function handleDictationAutoRestart() {
    setInput('');
    dictBaseRef.current = '';
  }
  function handleDictationAutoDelete(countWord) {
    const NUMBER_WORDS = {
      one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
      eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
      sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
    };
    const n = parseInt(countWord, 10) || NUMBER_WORDS[countWord.toLowerCase()] || 0;
    if (!n) return;
    const words = inputStateRef.current.trim().split(/\s+/).filter(Boolean);
    const remaining = words.slice(0, Math.max(0, words.length - n)).join(' ');
    setInput(remaining);
    dictBaseRef.current = remaining;
  }

  function newSession() {
    if (abortRef.current) try { abortRef.current(); } catch {}
    stopSpeech();
    setMessages([]); setStreamingContent(''); setStreaming(false); setSessionId(null);
    setInput('');
  }

  async function openHistory() {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const d = await listStudySessions();
      setSessions(d.sessions || []);
    } catch {} finally { setLoadingHistory(false); }
  }

  async function loadSession(sid) {
    setHistoryOpen(false);
    stopSpeech();
    try {
      const d = await getStudySession(sid);
      setSessionId(sid);
      setMessages(d.session?.messages || []);
    } catch {}
  }

  async function handleDeleteSession(sid, e) {
    e?.stopPropagation();
    if (!confirm('Delete this session?')) return;
    try {
      await deleteStudySession(sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
    } catch {}
  }

  function handleReroute(idx) {
    if (streaming) return;
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx]?.role !== 'user') userIdx -= 1;
    const prompt = messages[userIdx]?.content?.trim();
    if (!prompt) return;
    if (abortRef.current) try { abortRef.current(); } catch {}
    setTimeout(() => doSend(prompt, { reroute: true, hideUserInDisplay: true }), 30);
  }

  const empty = messages.length === 0 && !streaming;

  return (
    // `flex-1 min-h-0` (not `h-full`) so this fills the parent flex
    // column deterministically. h-full vs flex-1 matters here because
    // the parent uses flex-1 itself - `height: 100%` of a flex-grown
    // parent resolves inconsistently across browsers, while `flex-1`
    // on the child is rock solid.
    <div
      className="flex-1 min-h-0 flex flex-col bg-[#F4F5F7] dark:bg-[#0a0a14]"
      // When the on-screen keyboard opens, lift the pinned input form
      // above it (the message scroller shrinks to match). The shell
      // already reserves 90px at the bottom for its tab/nav chrome
      // (which the keyboard covers anyway), so we only need the keyboard
      // height beyond that. Settles back to 0 on dismiss.
      style={{
        paddingBottom: kbInset ? Math.max(0, kbInset - 90) : undefined,
        transition: 'padding-bottom 0.18s ease-out',
      }}
    >
      {/* Slim header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-white/[0.06] flex-shrink-0">
        <p className="flex-1 min-w-0 text-[13px] font-bold tracking-tight text-gray-900 dark:text-white truncate">Study</p>
        {voiceAvailable && (
          <button onClick={() => setVoiceSheetOpen(true)} title="Voice mode (beta)" className="w-8 h-8 rounded-full grid place-items-center text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
            <AudioLines size={15} />
          </button>
        )}
        <button onClick={newSession} title="New chat" className="w-8 h-8 rounded-full grid place-items-center text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
          <Plus size={16} />
        </button>
        <button onClick={openHistory} title="History" className="w-8 h-8 rounded-full grid place-items-center text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-white/[0.06]">
          <History size={15} />
        </button>
      </header>

      {/* Body */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto">
        {empty ? (
          <EmptyState onPick={(p) => doSend(p)} />
        ) : (
          <div className="px-3 py-3 space-y-2.5">
            {messages.map((m, i) => (
              <Bubble
                key={i}
                role={m.role}
                content={m.content}
                thinking={m.thinking}
                bestOf={m.bestOf}
                isError={!!m._error}
                canSpeak={speechSynthesisSupported}
                speaking={speakingKey === (m.timestamp || i)}
                onToggleSpeak={() => toggleSpeak(m.timestamp || i, m.content)}
                onReroute={() => handleReroute(i)}
              />
            ))}
            {streaming && (
              (streamingContent || streamingThinking)
                // Once any text (or reasoning) has streamed in, render a normal
                // bubble that grows token-by-token. No "..." filler.
                ? <Bubble role="assistant" content={streamingContent} thinking={streamingThinking} streaming />
                // Pre-first-token: show a subtle three-dot pulse so the user
                // knows we're working without the literal "..." placeholder.
                : <TypingBubble label={multiActive
                    ? (studyModelMode === 'superimpose' ? 'Running 3 models, then merging' : 'Running 3 models, then judging')
                    : null}
                  />
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        className="flex-shrink-0 px-3 py-2.5 border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0c0c16]"
        onSubmit={(e) => { e.preventDefault(); doSend(input); }}
      >
        {/* Model toggle row */}
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setModelSheetOpen(true)}
            disabled={streaming}
            className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#13131f] text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-white/[0.06] disabled:opacity-50"
          >
            {multiActive ? <Layers size={13} className="text-blue-500" /> : <Cpu size={13} className="text-blue-500" />}
            <span className="text-[12px] font-semibold max-w-[120px] truncate">
              {studyModelMode === 'best-of' && multiReady
                ? 'Best of 3'
                : studyModelMode === 'superimpose' && multiReady
                  ? 'Superimpose'
                  : studyModelLabel(studyModel)}
            </span>
            <ChevronRight size={12} className="-rotate-90 text-gray-400" />
          </button>
          {studyModelMode === 'single' && studyModelHasFreeCap(studyModel, plan) && (
            <HaikuLimitPill remaining={haikuRemaining} />
          )}
          <span className="flex-1" />
          <DictationButton
            onStart={handleDictationStart}
            onLiveText={handleDictationLive}
            onTranscript={handleDictationFinal}
            onAutoSend={handleDictationAutoSend}
            onAutoRestart={handleDictationAutoRestart}
            onAutoDelete={handleDictationAutoDelete}
            disabled={streaming}
          />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(input); } }}
            placeholder="Ask anything…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none px-3.5 py-2.5 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#13131f] text-[14px] text-gray-900 dark:text-white outline-none disabled:opacity-60 max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-full bg-blue-600 text-white grid place-items-center disabled:opacity-40 active:bg-blue-700 shrink-0"
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </form>

      {/* History sheet */}
      {historyOpen && (
        <HistorySheet
          loading={loadingHistory}
          sessions={sessions}
          onClose={() => setHistoryOpen(false)}
          onPick={loadSession}
          onDelete={handleDeleteSession}
        />
      )}

      {/* Model picker sheet */}
      {modelSheetOpen && (
        <ModelSheet
          active={studyModel}
          mode={studyModelMode}
          bestOfModels={bestOfModels}
          bestOfJudge={bestOfJudge}
          plan={plan}
          email={userEmail}
          onClose={() => setModelSheetOpen(false)}
          onPick={pickStudyModel}
          onMode={pickStudyModelMode}
          onPickCandidate={pickBestOfCandidate}
          onPickJudge={pickBestOfJudge}
        />
      )}

      {/* Voice settings sheet */}
      {voiceSheetOpen && (
        <VoiceSheet
          voices={synth.voices}
          voiceURI={voiceURI}
          onPickVoice={persistVoiceURI}
          rate={voiceRate}
          onRate={persistRate}
          onClose={() => setVoiceSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ===== Haiku daily-limit pill =====
// Free Haiku quota indicator. Shows the static daily allowance until the
// server reports a live count on the first send, then "N left today". Amber
// when running low / out.
function HaikuLimitPill({ remaining }) {
  const known = typeof remaining === 'number';
  const low = known && remaining <= 3;
  const label = `${known ? remaining : HAIKU_FREE_DAILY}/${HAIKU_FREE_DAILY}`;
  return (
    <span
      className={`animate-fade-in inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        low
          ? 'text-amber-600 dark:text-amber-300/90 bg-amber-500/10'
          : 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.05]'
      }`}
    >
      {label}
    </span>
  );
}

// ===== Model picker sheet =====
// Bottom sheet mirroring the desktop dropdown: a mode row (Single / Best of /
// Superimpose) on top, then either the single-model list or the Best of
// response + judge pickers. The server is the real enforcer (plan gate + caps).
function ModelSheet({ active, mode, bestOfModels, bestOfJudge, plan, email, onClose, onPick, onMode, onPickCandidate, onPickJudge }) {
  const models = visibleStudyModels(email);
  const canUseBestOf = unlockedStudyModelKeys(email, plan).length >= 4;
  const multi = mode === 'best-of' || mode === 'superimpose';
  return (
    <div className="fixed inset-0" style={{ zIndex: Z.sheet }}>
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[80%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-slide-up"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-2 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">Model</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>

        {/* Mode segmented control */}
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 dark:bg-white/[0.05] p-1">
            {['single', 'best-of', 'superimpose'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { if (m === 'single' || canUseBestOf) onMode(m); }}
                disabled={m !== 'single' && !canUseBestOf}
                className={`px-1 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${
                  mode === m
                    ? 'bg-white dark:bg-white/[0.11] text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-white/45'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-gray-400 dark:text-white/35">
            {mode === 'best-of'
              ? 'Three models answer; a fourth judges and shows the winner.'
              : mode === 'superimpose'
                ? 'Three models answer; a fourth merges them into one answer.'
                : 'One model answers each message.'}
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          {!multi && (
            <div className="space-y-1.5">
              {models.map((m) => {
                const locked = !canUseStudyModel(m.key, plan);
                const lockLabel = locked ? requiredPlanLabelFor(m.key, plan) : null;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={locked}
                    onClick={() => onPick(m.key)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      active === m.key
                        ? 'border-blue-400/60 bg-blue-50 dark:bg-blue-500/[0.12]'
                        : locked
                          ? 'border-gray-200 dark:border-white/[0.06] opacity-55'
                          : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] active:bg-gray-50 dark:active:bg-white/[0.04]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-100/70 dark:bg-blue-500/15 text-blue-500 grid place-items-center shrink-0">
                      <Cpu size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                        {m.label}
                        <span className="text-[10px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                        {locked && lockLabel && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300/80">
                            <Lock size={10} /> {lockLabel}
                          </span>
                        )}
                      </p>
                    </div>
                    {active === m.key && <Check size={16} className="text-blue-500 shrink-0" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          )}

          {multi && (
            <>
              <div className="flex items-center justify-between px-2 pb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35">Responses</p>
                <span className={`text-[10px] tabular-nums font-semibold ${bestOfModels.length === 3 ? 'text-emerald-500 dark:text-emerald-300/80' : 'text-amber-500 dark:text-amber-300/80'}`}>
                  {bestOfModels.length}/3
                </span>
              </div>
              <div className="space-y-1.5">
                {models.map((m) => {
                  const locked = !canUseStudyModel(m.key, plan);
                  const slot = bestOfModels.indexOf(m.key);
                  const selected = slot >= 0;
                  const isJudge = m.key === bestOfJudge;
                  const disabledRow = locked || isJudge;
                  return (
                    <button
                      key={`resp-${m.key}`}
                      type="button"
                      disabled={disabledRow}
                      onClick={() => onPickCandidate(m.key)}
                      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-blue-400/60 bg-blue-50 dark:bg-blue-500/[0.12]'
                          : disabledRow
                            ? 'border-gray-200 dark:border-white/[0.06] opacity-50'
                            : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] active:bg-gray-50 dark:active:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                          {m.label}
                          <span className="text-[10px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                          {isJudge && !locked && (
                            <span className="text-[9.5px] font-semibold text-gray-400 dark:text-white/35">
                              {mode === 'superimpose' ? 'Merge' : 'Judge'}
                            </span>
                          )}
                        </p>
                      </div>
                      {selected && (
                        <span className="w-5 h-5 rounded-md bg-blue-500 text-white text-[10px] font-bold grid place-items-center shrink-0">
                          {slot + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between px-2 pt-3 pb-1.5 mt-2 border-t border-gray-200 dark:border-white/[0.08]">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35">
                  {mode === 'superimpose' ? 'Merge AI' : 'Judge AI'}
                </p>
                <span className={`text-[10px] font-semibold ${bestOfJudge ? 'text-emerald-500 dark:text-emerald-300/80' : 'text-amber-500 dark:text-amber-300/80'}`}>
                  Fourth model
                </span>
              </div>
              <div className="space-y-1.5">
                {models.map((m) => {
                  const locked = !canUseStudyModel(m.key, plan);
                  const usedAsResponse = bestOfModels.includes(m.key);
                  const selected = bestOfJudge === m.key;
                  const disabledRow = locked || usedAsResponse;
                  return (
                    <button
                      key={`judge-${m.key}`}
                      type="button"
                      disabled={disabledRow}
                      onClick={() => onPickJudge(m.key)}
                      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-blue-400/60 bg-blue-50 dark:bg-blue-500/[0.12]'
                          : disabledRow
                            ? 'border-gray-200 dark:border-white/[0.06] opacity-50'
                            : 'border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] active:bg-gray-50 dark:active:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
                          {m.label}
                          <span className="text-[10px] font-medium text-gray-400 dark:text-white/40">{m.provider}</span>
                          {usedAsResponse && !locked && (
                            <span className="text-[9.5px] font-semibold text-gray-400 dark:text-white/35">Response</span>
                          )}
                        </p>
                      </div>
                      {selected && <Check size={15} className="text-blue-500 shrink-0" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Voice settings sheet =====
// Compact mobile take on the desktop VoiceMenu: playback speed, TTS voice,
// dictation language. Device pickers/tests stay desktop-only.
const SPEEDS = [
  { v: 0.85, label: '0.85×' },
  { v: 1,    label: '1×'    },
  { v: 1.15, label: '1.15×' },
  { v: 1.35, label: '1.35×' },
];

const DICT_LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'zh-CN', label: 'Chinese (Mandarin)' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
];

const DICT_LANG_KEY = 'covalent.dictation.lang';

function VoiceSheet({ voices, voiceURI, onPickVoice, rate, onRate, onClose }) {
  const [dictLang, setDictLang] = useState(() => {
    try { return localStorage.getItem(DICT_LANG_KEY) || 'en-US'; } catch { return 'en-US'; }
  });
  function pickLang(v) {
    setDictLang(v);
    try { localStorage.setItem(DICT_LANG_KEY, v); } catch {}
  }
  const sorted = [...voices].sort((a, b) => {
    const ae = /^en/i.test(a.lang) ? 0 : 1;
    const be = /^en/i.test(b.lang) ? 0 : 1;
    return ae - be || a.name.localeCompare(b.name);
  });
  const selectCls = 'w-full appearance-none px-3 py-2.5 rounded-xl text-[13px] font-medium bg-gray-50 dark:bg-[#0e0e18] text-gray-900 dark:text-white border border-gray-200 dark:border-white/[0.06] outline-none';
  const sectionCls = 'text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-white/35 px-1 mb-1.5';
  return (
    <div className="fixed inset-0" style={{ zIndex: Z.sheet }}>
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-slide-up"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            Voice mode
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wide bg-gray-200 text-gray-600 dark:bg-zinc-700 dark:text-zinc-200">BETA</span>
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-4">
          {!speechSynthesisSupported && !speechRecognitionSupported ? (
            <p className="text-[12px] text-gray-500 dark:text-white/50 leading-relaxed">
              Your browser doesn&rsquo;t support the Web Speech API. Try the latest Chrome or Safari.
            </p>
          ) : (
            <>
              <p className="text-[11.5px] leading-relaxed text-gray-500 dark:text-white/45">
                Tap the mic above the message box to dictate. Say &ldquo;send send&rdquo; to send hands-free and the answer is read back aloud. Tap Play under any answer to hear it.
              </p>
              {speechSynthesisSupported && (
                <div>
                  <p className={sectionCls}>Speed</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SPEEDS.map((s) => (
                      <button
                        key={s.v}
                        type="button"
                        onClick={() => onRate(s.v)}
                        className={`py-2 rounded-xl text-[12px] font-semibold transition-colors ${
                          Math.abs(rate - s.v) < 0.001
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60 active:bg-gray-200 dark:active:bg-white/[0.1]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {speechSynthesisSupported && sorted.length > 0 && (
                <div>
                  <p className={sectionCls}>Voice</p>
                  <select value={voiceURI || ''} onChange={(e) => onPickVoice(e.target.value || null)} className={selectCls}>
                    <option value="">Browser default</option>
                    {sorted.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                    ))}
                  </select>
                </div>
              )}
              {speechRecognitionSupported && (
                <div>
                  <p className={sectionCls}>Dictation language</p>
                  <select value={dictLang} onChange={(e) => pickLang(e.target.value)} className={selectCls}>
                    {DICT_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Empty state =====
function EmptyState({ onPick }) {
  return (
    <div className="px-4 pt-8 pb-6 flex flex-col items-center text-center">
      <h2 className="text-[18px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">What should we study?</h2>
      <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-1 max-w-[280px] leading-relaxed">
        Ask anything, request a quiz, or walk through a concept.
      </p>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm mt-5">
        {QUICK_PROMPTS.map((qp, i) => {
          const Icon = qp.icon;
          return (
            <button
              key={i}
              onClick={() => onPick(qp.prompt)}
              className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#13131f] p-3 flex items-center gap-3 active:scale-[0.99] transition-transform text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-100/70 dark:bg-blue-500/15 text-blue-500 grid place-items-center shrink-0">
                <Icon size={16} />
              </div>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-tight">{qp.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===== Best of / Superimpose panel =====
// Compact take on the desktop BestOfResponses control: a summary row inside
// the assistant bubble that expands to show the judge's call and each model's
// raw answer. Also renders reroute metas from sessions started on desktop.
function BestOfPanel({ bestOf }) {
  const responses = Array.isArray(bestOf?.responses) ? bestOf.responses : [];
  const isReroute = bestOf?.mode === 'reroute';
  const isSuperimpose = bestOf?.mode === 'superimpose';
  const [open, setOpen] = useState(false);
  const firstOther = Math.max(0, responses.findIndex((r) => !r.selected));
  const [activeIndex, setActiveIndex] = useState(firstOther);

  if (responses.length < 2) return null;
  const active = responses[activeIndex] || responses[0];
  const winner = responses.find((r) => r.selected) || responses[0];
  const refusedCount = bestOf?.refusedCount ?? responses.filter((r) => r.refused).length;

  const summary = isSuperimpose
    ? `Merged from ${responses.length} models`
    : isReroute
      ? `${bestOf?.modelCount ?? responses.length} models${refusedCount ? ` · ${refusedCount} refused` : ''}`
      : `Best of ${responses.length}${winner?.label ? ` · ${winner.label} won` : ''}`;

  return (
    <div className="mb-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"
      >
        <Layers size={11} />
        <span className="truncate">{summary}</span>
        <ChevronRight size={11} className={`ml-auto shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-2.5 pb-2 pt-1.5 border-t border-gray-200 dark:border-white/[0.06] space-y-1.5">
          {bestOf?.judge?.label && !isReroute && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-white/35">
              {isSuperimpose ? `Superimposed by ${bestOf.judge.label}` : `Judged by ${bestOf.judge.label}`}
            </p>
          )}
          {bestOf?.rationale && !isReroute && (
            <p className="text-[11px] leading-snug text-gray-500 dark:text-white/45">{bestOf.rationale}</p>
          )}
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {responses.map((r, i) => (
              <button
                key={`${r.key || r.label}-${i}`}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`shrink-0 px-2 py-1 rounded-lg text-[10.5px] font-semibold whitespace-nowrap transition-colors ${
                  i === activeIndex
                    ? 'bg-blue-600 text-white'
                    : r.refused
                      ? 'bg-rose-500/10 text-rose-500 dark:text-rose-300/80'
                      : 'bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-white/60'
                }`}
              >
                {r.label || r.servedLabel || 'Model'}
                {r.selected && !isSuperimpose ? ' ✓' : ''}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-black/[0.25] border border-gray-200 dark:border-white/[0.06] px-2.5 py-2 max-h-48 overflow-y-auto">
            {active?.error ? (
              <p className="text-[11.5px] text-rose-500 dark:text-rose-300/90">{active.error}</p>
            ) : (
              <p className="text-[11.5px] leading-relaxed text-gray-600 dark:text-white/70 whitespace-pre-wrap">
                {active?.refused ? `Refused. ${active?.content || ''}`.trim() : (active?.content || 'No answer')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Bubble =====
function Bubble({ role, content, thinking, streaming, bestOf, isError, canSpeak, speaking, onToggleSpeak, onReroute }) {
  const isUser = role === 'user';
  const [showThink, setShowThink] = useState(!!streaming);
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-[#13131f] border border-gray-200 dark:border-white/[0.06] text-gray-900 dark:text-gray-100'
      }`}>
        {!isUser && thinking && (
          <div className="mb-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowThink(s => !s)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400"
            >
              <Brain size={11} className={streaming ? 'animate-pulse' : ''} />
              {streaming ? 'Thinking…' : 'Thinking'}
              <ChevronRight size={11} className={`ml-auto transition-transform ${showThink ? 'rotate-90' : ''}`} />
            </button>
            {showThink && (
              <div className="px-2.5 pb-2 pt-1.5 text-[12px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap border-t border-gray-200 dark:border-white/[0.06] max-h-52 overflow-y-auto">
                {thinking}
              </div>
            )}
          </div>
        )}
        {!isUser && bestOf && !isError && <BestOfPanel bestOf={bestOf} />}
        <div className="whitespace-pre-wrap">{content}</div>
        {!isUser && !streaming && !isError && content && (
          <div className="mt-1.5 flex items-center gap-3">
            {canSpeak && (
              <button
                type="button"
                onClick={onToggleSpeak}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold transition-colors ${
                  speaking ? 'text-blue-500' : 'text-gray-400 dark:text-white/35 active:text-gray-600 dark:active:text-white/60'
                }`}
              >
                {speaking ? <><Square size={9} /> Stop</> : <><Volume2 size={10} /> Play</>}
              </button>
            )}
            {onReroute && (
              <button
                type="button"
                onClick={onReroute}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 dark:text-white/35 active:text-gray-600 dark:active:text-white/60"
                title="Reroute this prompt through every available model"
              >
                <Shuffle size={10} /> Reroute
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Pre-streaming "thinking" indicator. Three pulsing dots - feels alive,
// no literal "..." characters in the content. Best of / Superimpose sends
// wait on several models, so those show a short status label too.
function TypingBubble({ label }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl px-4 py-3 bg-white dark:bg-[#13131f] border border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-end gap-1 h-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-typing-bounce [animation-delay:300ms]" />
        </div>
        {label && <p className="mt-1.5 text-[10.5px] text-gray-400 dark:text-white/40">{label}…</p>}
      </div>
    </div>
  );
}

// ===== History sheet =====
function HistorySheet({ loading, sessions, onClose, onPick, onDelete }) {
  return (
    <div className="fixed inset-0" style={{ zIndex: Z.sheet }}>
      <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in" />
      <div className="absolute bottom-0 left-0 right-0 max-h-[70%] rounded-t-3xl bg-white dark:bg-[#13131f] border-t border-gray-200 dark:border-white/[0.06] shadow-2xl flex flex-col animate-slide-up"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">History</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full grid place-items-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          {loading && <p className="text-center text-[12px] text-gray-400 py-6">Loading…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-center text-[12px] text-gray-500 dark:text-gray-400 py-6">No past sessions.</p>
          )}
          <div className="space-y-1.5">
            {sessions.map((s) => (
              <div key={s.id} className="group flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0e0e18] px-3 py-2.5">
                <button onClick={() => onPick(s.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{s.title || 'Untitled session'}</p>
                  <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : ''}
                    {s.messageCount ? ` · ${s.messageCount} messages` : ''}
                  </p>
                </button>
                <button onClick={(e) => onDelete(s.id, e)} aria-label="Delete" className="text-gray-400 hover:text-rose-500 p-1.5">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
