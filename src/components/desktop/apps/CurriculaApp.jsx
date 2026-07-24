import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Plus, Loader2, BookOpen, ChevronDown, ChevronRight, CheckCircle2, Circle, Lock, ClipboardCheck, PenTool, FileText, Check, X, Trophy, Wand2, Paperclip, Upload, Calculator, Map as MapIcon, List, ListChecks, Share2, Users, BarChart3, Zap, Search, Store, UserRound, Download, Library, EyeOff, Sparkles } from 'lucide-react';
import { listCurricula, generateCurriculum, getCurriculum, sendLessonMessage, getLessonHistory, editCurriculumWithAI, extractSourceUrl, extractFiles, refineCurriculum, generateLessonBlocks, generateFinalQuiz, gradeQuizBlock, gradeOpenBlock, completeLessonBlock, getCurriculumGradebook, listCurriculumMarketplace, enrollMarketplaceCurriculum, publishCurriculum, unpublishCurriculum } from '../../../api/curriculum';
import { getSharedItem, listOutgoing } from '../../../api/share';
import { useSharing } from '../../../context/SharingContext';
import { peek, fetchOnce, bust } from '../../../api/cache';
import ViewFade from '../../shared/ViewFade';
import { useToast } from '../../shared/Toast';
import { apiFetch } from '../../../api/client';
import { useWindowManager } from '../../../context/WindowManagerContext';
import { useDemoMode } from '../../../context/DemoModeContext';
import { DEFAULT_SETTINGS, DIFFICULTY_OPTIONS, LEARNING_STYLE_OPTIONS } from '../../../utils/constants';
import Button from '../../shared/Button';
import Input from '../../shared/Input';
import Modal from '../../shared/Modal';
import ShareDialog from '../../shared/ShareDialog';
import PillGroup from '../../shared/PillGroup';
import Toggle from '../../shared/Toggle';
import LoadingSpinner from '../../shared/LoadingSpinner';
import { Z } from '../../../styles/tokens';
import LoadingProgress from '../../shared/ProgressBar';
import { SkeletonProse } from '../../shared/Skeleton';
import ProgressBar from '../../curriculum/ProgressBar';
import ChatContainer from '../../chat/ChatContainer';
import MathText from '../../shared/MathText';
import MathTutorApp from './MathTutorApp';
import TrailView from '../../curriculum/TrailView';
import BlockLessonView from '../../lesson/BlockLessonView';
import GradebookView from '../../curriculum/GradebookView';
import ExamBlock from '../../lesson/ExamBlock';
import QuizBlock from '../../lesson/QuizBlock';
import { useAuth } from '../../../context/AuthContext';
import { errorChatMessage } from '../../../utils/aiErrors';
import useBrowserBack from '../../../hooks/useBrowserBack';
import { InlineProgress } from '../../shared/ProgressBar';

const TYPE_ICONS = { lesson: BookOpen, math_tutor: Calculator, practice: PenTool, problem_set: ListChecks, essay: FileText, unit_test: ClipboardCheck, quiz_bowl: Zap };
const TYPE_COLORS = { lesson: 'text-white/50', math_tutor: 'text-white/50', practice: 'text-white/50', problem_set: 'text-white/50', essay: 'text-amber-400', unit_test: 'text-rose-400', quiz_bowl: 'text-amber-400' };

function quizBowlTargetForCurriculum(curriculum) {
  const title = String(curriculum?.title || '').trim();
  const topic = String(curriculum?.settings?.topic || title).trim();
  const searchable = [title, curriculum?.description, curriculum?.settings?.topic, curriculum?.pausdSlug]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const subject = String(curriculum?.subject || '').toLowerCase();

  const isGeography = subject === 'geography'
    || curriculum?.category === 'Geography'
    || /\bgeography\b/.test(searchable)
    || String(curriculum?.pausdSlug || '').endsWith('-geography');
  if (isGeography) return { label: 'Geography', topic };

  const isHistory = subject === 'history'
    || curriculum?.category === 'History'
    || /\bhistory\b/.test(searchable);
  if (isHistory) return { label: 'History', topic };

  const categoryMap = {
    Math: 'Math',
    Science: 'Science',
    'Computer Science': 'Science',
    'Language & Literature': 'Literature',
    Arts: 'Art',
    'Social Science': 'Philosophy',
    Other: 'Mixed',
  };
  return { label: categoryMap[curriculum?.category] || 'Mixed', topic };
}

function withQuizBowlLessonSwaps(curriculum) {
  const target = quizBowlTargetForCurriculum(curriculum);
  if (!target) return curriculum;

  const units = curriculum.units || [];
  const stride = units.length >= 24 ? 8 : 2;
  let changed = false;
  const swappedUnits = units.map((unit, index) => {
    const shouldSwap = index === units.length - 1 || (index + 1) % stride === 0;
    if (!shouldSwap || (unit.lessons || []).some(lesson => lesson.type === 'quiz_bowl')) return unit;
    const essayIndex = (unit.lessons || []).findIndex(lesson => lesson.type === 'essay');
    if (essayIndex < 0) return unit;

    changed = true;
    const lessons = [...unit.lessons];
    const essay = lessons[essayIndex];
    lessons[essayIndex] = {
      ...essay,
      title: `Quiz Bowl: ${unit.title}`,
      description: `Play a Quiz Bowl game that reviews ${unit.title}.`,
      type: 'quiz_bowl',
      quizBowlTopic: `${target.topic}: ${unit.title}`,
      quizBowlCategory: target.label,
    };
    return { ...unit, lessons };
  });

  return changed ? { ...curriculum, units: swappedUnits } : curriculum;
}

// Course-grade / score pill color by percentage. Semantic, matching the
// gradebook: emerald = strong, sky = solid, amber = shaky, rose = failing.
function gradePillClass(pct) {
  if (pct == null) return 'border-white/15 bg-white/5 text-white/50';
  if (pct >= 90) return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (pct >= 80) return 'border-sky-400/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (pct >= 70) return 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-rose-400/30 bg-rose-500/10 text-rose-700 dark:text-rose-300';
}

// When opened from another app (e.g. NotesApp's "Build Curriculum from
// note" action), the window-manager `meta` is spread as props. We use
// `seedView` to jump straight to the new-curriculum form and `seedTopic`
// / `seedSources` to pre-fill the topic field and attached sources.
export default function CurriculaApp({ seedTopic, seedSources, seedView, seedCurriculumId } = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const isBeta = !!user?.data?.isBeta;
  // Trail view (BETA) - gamifies the curriculum into a Duolingo-style
  // zigzag path. Persists per-curriculum in localStorage so toggling
  // back to list view is a one-click thing.
  const [trailMode, setTrailMode] = useState(() => {
    try { return localStorage.getItem('cov-curr-trail') === '1'; } catch { return false; }
  });
  function toggleTrail() {
    setTrailMode(prev => {
      const next = !prev;
      try { localStorage.setItem('cov-curr-trail', next ? '1' : '0'); } catch {}
      return next;
    });
  }
  // Seed the view from `seedView` prop (passed via window meta when another
  // app - e.g. NotesApp - opens this one with "Build Curriculum from this
  // note"). Safe to use directly as the initial state now that useBrowserBack
  // below skips 'new'/'marketplace' (see comment there).
  const [view, setView] = useState(seedView || 'list');
  // Seed from cache so re-entering the app doesn't flash the skeleton.
  const cachedCurricula = peek('curricula:list');
  const [curricula, setCurricula] = useState(() => cachedCurricula?.curricula || []);
  const [loading, setLoading] = useState(!cachedCurricula);
  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const seededCurriculumOpened = useRef(false);
  // Curriculum sharing. `activeShare` is set while viewing a curriculum that
  // was shared WITH me (all reads/writes then carry its shareId and resolve
  // to the owner's copy). `outgoingPartners` holds the accepted recipients
  // of MY selected curriculum - non-empty means co-study chat is on for its
  // lessons. Incoming invites render in the list view's "Shared with you".
  const { incomingShares, acceptShare, declineShare } = useSharing();
  const [activeShare, setActiveShare] = useState(null);
  const [outgoingPartners, setOutgoingPartners] = useState([]);
  // Shared-curriculum gradebook (owner + accepted recipients' performance).
  const [gradebook, setGradebook] = useState(null);
  const [gradebookLoading, setGradebookLoading] = useState(false);
  // WindowManager is optional - the desktop shell provides it, but if this
  // component is ever rendered outside of one (mobile, for instance) we
  // just skip the math-tutor handoff rather than crashing.
  let wm = null;
  try { wm = useWindowManager(); } catch {}
  const isDemo = useDemoMode();

  // Browser Back navigates up one level inside the curriculum stack instead
  // of leaving the SPA. lesson / math_tutor / assessment → detail → list.
  // Excludes 'new' and 'marketplace' - those are top-level sibling views to
  // 'list', not drill-downs, and intercepting Back for them caused a
  // StrictMode race that flipped a seeded 'new' view back to 'list'.
  useBrowserBack(view !== 'list' && view !== 'new' && view !== 'marketplace', () => {
    if (view === 'lesson') setView('detail');
    else if (view === 'assessment') setView('detail');
    else if (view === 'math_tutor') setView('detail');
    else if (view === 'gradebook') setView('detail');
    else if (view === 'edit') setView('detail');
    else setView('list');
  });

  // Lesson view
  const [currentLesson, setCurrentLesson] = useState(null);
  const [lessonMessages, setLessonMessages] = useState([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState([]);
  const [searchStatus, setSearchStatus] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef('');
  const streamSourcesRef = useRef([]);
  const abortRef = useRef(null);
  const autoStarted = useRef(false);

  // New curriculum - seeded topic (e.g. a note title) goes into the
  // settings on first mount.
  const [settings, setSettings] = useState(() => (
    seedTopic ? { ...DEFAULT_SETTINGS, topic: seedTopic } : DEFAULT_SETTINGS
  ));
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  // 'questions' = fetching/asking clarifying questions before build; 'building'
  // = the actual curriculum-generation call is in flight; null = idle/form.
  const [genPhase, setGenPhase] = useState(null);
  // AI-generated clarifying questions for the current topic, plus the
  // student's chosen answers. Fed into the generation prompt so the
  // curriculum matches the actual ask, not just the topic string.
  const [refineQuestions, setRefineQuestions] = useState([]); // [{ id, question, options[] }]
  const [refineAnswers, setRefineAnswers] = useState({});      // { [id]: answer }
  // Source material attached to a new curriculum: textbooks (PDF / text)
  // and websites (URL → server-fetched + HTML-stripped). Each entry:
  //   { id, title, kind: 'pdf' | 'text' | 'url', content, url?, chars }
  // Seeded from `seedSources` (e.g. a note handed off from NotesApp) when
  // the window opens.
  const [sources, setSources] = useState(() => (
    Array.isArray(seedSources) && seedSources.length > 0
      ? seedSources.map((s) => ({
          id: s.id || (crypto.randomUUID?.() || String(Date.now() + Math.random())),
          title: s.title || s.name || 'Source',
          kind: s.kind || 'text',
          content: s.content || s.text || '',
          url: s.url || null,
          chars: (s.content || s.text || '').length,
        }))
      : []
  ));
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const sourceFileRef = useRef(null);

  const [shareTarget, setShareTarget] = useState(null);

  // Public curriculum marketplace state. Presets and community-published
  // curricula intentionally share one index and one discovery surface.
  const [marketplaceCatalog, setMarketplaceCatalog] = useState([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState('');
  const [enrollingSlug, setEnrollingSlug] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishAnonymous, setPublishAnonymous] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  useEffect(() => {
    fetchOnce('curricula:list', listCurricula)
      .then(d => { setCurricula(d.curricula || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Curriculum widgets can deep-link into their course. Guard the effect so
  // React StrictMode cannot open/fetch the same course twice on mount.
  useEffect(() => {
    if (!seedCurriculumId || seededCurriculumOpened.current) return;
    seededCurriculumOpened.current = true;
    openCurriculum(seedCurriculumId);
  }, [seedCurriculumId]);

  // Lazy-load the marketplace the first time the user opens that view.
  async function loadMarketplace({ refresh = false } = {}) {
    if ((!refresh && marketplaceCatalog.length) || marketplaceLoading) return;
    setMarketplaceLoading(true);
    setMarketplaceError('');
    try {
      const data = await listCurriculumMarketplace();
      setMarketplaceCatalog(data.listings || []);
    } catch (e) {
      console.error('Failed to load curriculum marketplace:', e);
      setMarketplaceError(e?.message || 'Could not load the marketplace.');
    }
    setMarketplaceLoading(false);
  }

  async function enrollFromMarketplace(listing) {
    if (enrollingSlug) return;
    setEnrollingSlug(listing.listingId);
    try {
      const data = await enrollMarketplaceCurriculum(listing.listingId);
      // Return to the main Curricula list and show the enrolled course there.
      // Updating optimistically first avoids making a successful click look
      // inert if the follow-up refresh is briefly unavailable.
      const fallback = [data.curriculum, ...curricula.filter(c => c.id !== data.curriculum.id)];
      setCurricula(fallback);
      bust('curricula:list');
      try {
        const latest = await listCurricula();
        setCurricula(latest.curricula || fallback);
      } catch (refreshError) {
        console.warn('Could not refresh curricula after enrollment:', refreshError);
      }
      setSelectedCurriculum(null);
      setView('list');
      toast.success(data.alreadyEnrolled ? 'Course is already in your curricula.' : 'Course added to your curricula.');
    } catch (e) {
      console.error('Marketplace enrollment failed:', e);
      toast.error('Could not add course: ' + (e?.message || 'unknown error'));
    }
    setEnrollingSlug(null);
  }

  function openPublishDialog() {
    setPublishAnonymous(selectedCurriculum?.marketplace?.anonymous === true);
    setPublishOpen(true);
  }

  async function saveMarketplacePublication() {
    if (!selectedCurriculum || publishBusy) return;
    setPublishBusy(true);
    try {
      const data = await publishCurriculum(selectedCurriculum.id, publishAnonymous);
      const updated = { ...selectedCurriculum, marketplace: data.marketplace };
      setSelectedCurriculum(updated);
      setCurricula(prev => prev.map(c => c.id === updated.id ? { ...c, marketplace: data.marketplace } : c));
      setPublishOpen(false);
      setMarketplaceCatalog([]);
      toast.success(selectedCurriculum.marketplace?.published ? 'Marketplace listing updated.' : 'Curriculum published.');
    } catch (e) {
      toast.error(e?.message || 'Could not publish this curriculum.');
    }
    setPublishBusy(false);
  }

  async function removeMarketplacePublication() {
    if (!selectedCurriculum || publishBusy) return;
    setPublishBusy(true);
    try {
      const data = await unpublishCurriculum(selectedCurriculum.id);
      const updated = { ...selectedCurriculum, marketplace: data.marketplace };
      setSelectedCurriculum(updated);
      setCurricula(prev => prev.map(c => c.id === updated.id ? { ...c, marketplace: data.marketplace } : c));
      setPublishOpen(false);
      setMarketplaceCatalog([]);
      toast.success('Curriculum removed from the marketplace.');
    } catch (e) {
      toast.error(e?.message || 'Could not remove this listing.');
    }
    setPublishBusy(false);
  }

  async function handleGenerate() {
    if (!settings.topic.trim() || generating) return;
    setGenerating(true); setGenError(null);

    // Always pause to ask clarifying questions before building - keeps the
    // curriculum aligned with the student's actual ask, not just the bare
    // topic string. If they already pre-answered some via the Refine panel
    // (refineQuestions populated), skip the fetch and jump straight to build.
    if (refineQuestions.length === 0) {
      setGenPhase('questions');
      try {
        const { questions } = await refineCurriculum(settings.topic, settings.difficulty, settings.audience);
        const list = Array.isArray(questions) ? questions : [];
        setRefineQuestions(list);
        if (list.length === 0) {
          // API returned no questions - nothing to ask, build immediately.
          await runBuild();
        }
        // Otherwise wait for the user to answer + click "Build curriculum".
      } catch (err) {
        // Couldn't fetch questions - surface a soft warning and build anyway
        // so the user isn't stuck.
        setGenError(`Couldn't fetch clarifying questions: ${err?.message || 'unknown error'}. Building with your settings…`);
        await runBuild();
      }
      return;
    }

    await runBuild();
  }

  async function runBuild() {
    setGenPhase('building');
    try {
      // Strip the local id (used only for React keys + remove-button) before
      // sending - server doesn't care about it.
      const cleanSources = sources.map(({ id, ...rest }) => rest); // eslint-disable-line no-unused-vars
      // Fold the Q&A from the refine step into settings so the prompt can
      // anchor the curriculum to the student's actual ask.
      const refinements = refineQuestions
        .map(q => ({ question: q.question, answer: typeof refineAnswers[q.id] === 'string' ? refineAnswers[q.id].trim() : refineAnswers[q.id] }))
        .filter(r => r.answer);
      const augmented = { ...settings, ...(refinements.length ? { refinements } : {}) };
      const data = await generateCurriculum(augmented, cleanSources);
      setCurricula(prev => [data.curriculum, ...prev]);
      bust('curricula:list');
      setSelectedCurriculum(data.curriculum);
      setView('detail');
      setSettings(DEFAULT_SETTINGS);
      setSources([]);
      setRefineQuestions([]); setRefineAnswers({});
    } catch (err) { setGenError(err.message || 'Failed'); }
    setGenerating(false);
    setGenPhase(null);
  }

  function cancelGenerate() {
    setGenerating(false);
    setGenPhase(null);
    setRefineQuestions([]);
    setRefineAnswers({});
    setGenError(null);
  }

  async function handleAddSourceUrl(e) {
    e?.preventDefault?.();
    const url = sourceUrlInput.trim();
    if (!url || sourceBusy) return;
    setSourceBusy(true); setSourceError('');
    try {
      const s = await extractSourceUrl(url);
      setSources(prev => [...prev, { id: crypto.randomUUID?.() || String(Date.now()), ...s }]);
      setSourceUrlInput('');
    } catch (err) {
      setSourceError(err.message || 'Failed to fetch URL');
    } finally { setSourceBusy(false); }
  }

  async function handleAddSourceFiles(filesList) {
    const files = Array.from(filesList || []);
    if (!files.length || sourceBusy) return;
    setSourceBusy(true); setSourceError('');
    try {
      const { files: extracted } = await extractFiles(files);
      const ok = (extracted || []).filter(f => !f.error && f.text);
      const failed = (extracted || []).filter(f => f.error);
      if (ok.length) {
        setSources(prev => [
          ...prev,
          ...ok.map(f => ({
            id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
            title: f.name, kind: f.kind || 'text', content: f.text, chars: (f.text || '').length,
          })),
        ]);
      }
      if (failed.length) setSourceError(`${failed.length} file(s) couldn't be extracted: ${failed.map(f => f.name).join(', ')}`);
    } catch (err) {
      setSourceError(err.message || 'Failed to extract files');
    } finally {
      setSourceBusy(false);
      if (sourceFileRef.current) sourceFileRef.current.value = '';
    }
  }

  function removeSource(id) {
    setSources(prev => prev.filter(s => s.id !== id));
  }

  // Re-fetch the open curriculum in place (without changing the view), so a
  // freshly graded unit test reflects its score, completion check, and the
  // updated course grade as soon as the student returns to the detail view.
  async function refreshSelectedCurriculum(id) {
    if (!id) return;
    try { const data = await getCurriculum(id); setSelectedCurriculum(data.curriculum); } catch {}
  }

  useEffect(() => {
    const curriculumId = selectedCurriculum?.id;
    if (!curriculumId) return undefined;
    const handleProgress = (event) => {
      if (event.detail?.curriculumId === curriculumId) refreshSelectedCurriculum(curriculumId);
    };
    window.addEventListener('covalent:curriculum-progress', handleProgress);
    return () => window.removeEventListener('covalent:curriculum-progress', handleProgress);
  }, [selectedCurriculum?.id]);

  async function openCurriculum(id) {
    setView('detail');
    setActiveShare(null);
    setOutgoingPartners([]);
    try { const data = await getCurriculum(id); setSelectedCurriculum(data.curriculum); } catch {}
    // Anyone with an accepted share studies this curriculum WITH me - their
    // names label the co-study chat rail in the lesson view.
    try {
      const shares = await listOutgoing(id);
      setOutgoingPartners((shares || []).filter(s => s.status === 'accepted').map(s => s.recipientName || 'Study partner'));
    } catch {}
  }

  // A curriculum someone shared with me: same detail view, but every lesson
  // call resolves to the OWNER's copy via the shareId, so we study the same
  // live object together.
  async function openSharedCurriculum(share) {
    setView('detail');
    setActiveShare(share);
    setOutgoingPartners([]);
    setSelectedCurriculum(null);
    try {
      const curriculum = await getSharedItem('curriculum', share.itemId, share.id);
      setSelectedCurriculum(curriculum);
    } catch (e) {
      toast.error(e.message || "Couldn't open the shared curriculum.");
      setActiveShare(null);
      setView('list');
    }
  }

  // Open the shared-curriculum gradebook. Works for the owner (sees everyone
  // they shared with) and for recipients (the shared group's progress).
  async function openGradebook() {
    const cid = selectedCurriculum?.id;
    if (!cid) return;
    setView('gradebook');
    setGradebook(null);
    setGradebookLoading(true);
    try {
      const data = await getCurriculumGradebook(cid);
      setGradebook(data);
    } catch (e) {
      toast.error(e.message || "Couldn't load the gradebook.");
      setView('detail');
    } finally {
      setGradebookLoading(false);
    }
  }

  async function refreshGradebook() {
    const cid = gradebook?.curriculum?.id || selectedCurriculum?.id;
    if (!cid) return;
    setGradebookLoading(true);
    try {
      const data = await getCurriculumGradebook(cid);
      setGradebook(data);
    } catch (e) {
      toast.error(e.message || "Couldn't refresh the gradebook.");
    } finally {
      setGradebookLoading(false);
    }
  }

  async function openLesson(lesson, curriculumId) {
    // Shared curricula support the standard block lessons only - the other
    // flows (math tutor, assessments, essays) don't carry the shareId yet.
    if (activeShare && lesson.type && lesson.type !== 'lesson') {
      toast.info('Only standard lessons are available in a shared curriculum for now.');
      return;
    }
    if (lesson.type === 'quiz_bowl') {
      const target = quizBowlTargetForCurriculum(selectedCurriculum);
      if (!target || !wm?.openApp) {
        toast.error('Quiz Bowl is unavailable for this curriculum.');
        return;
      }
      wm.openApp('quizbowl', 'Quiz Bowl', {
        initialTopic: lesson.quizBowlTopic || `${target.topic}: ${lesson.title}`,
        initialCategory: lesson.quizBowlCategory || target.label,
        autoStart: true,
        curriculumId,
        curriculumLessonId: lesson.id,
      });
      return;
    }
    setCurrentLesson({ ...lesson, curriculumId });
    // Unit-test typed lessons go to a real assessment quiz, not the chat tutor.
    if (lesson.type === 'unit_test' || lesson.type === 'essay') {
      setView('assessment');
      return;
    }
    // Math Tutor lessons embed the tutor INLINE inside the curriculum view
    // (don't pop a separate window). The MathTutorApp accepts a seedTopic
    // prop and auto-starts on the lesson's topic.
    if (lesson.type === 'math_tutor') {
      setView('math_tutor');
      return;
    }
    // Practice lessons (math canvas) - also embed inline for now via the
    // same math-tutor flow seeded with a "give me practice problems" prompt.
    if (lesson.type === 'practice') {
      setView('math_tutor');
      return;
    }
    // Problem-set lessons launch the structured problem-set runner (a sequence
    // of problems solved one at a time on the canvas) via the math-tutor view.
    if (lesson.type === 'problem_set') {
      setView('math_tutor');
      return;
    }
    setView('lesson');
    setLessonMessages([]);
    setSourceMode(false);
    autoStarted.current = false;
    try {
      const hist = await getLessonHistory(curriculumId, lesson.id);
      setLessonMessages(hist.chatHistory || []);
      if (!hist.chatHistory?.length && !autoStarted.current) {
        autoStarted.current = true;
        setTimeout(() => doSendLesson(`I'm ready to learn about "${lesson.title}". Let's begin!`, curriculumId, lesson.id, { sourced: true }), 200);
      }
    } catch {}
  }

  function doSendLesson(text, cid, lid, opts = {}) {
    const wasSourced = !!(opts.sourced ?? sourceMode);
    const images = opts.images || [];
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    if (images.length) userMsg.images = images.map(i => ({ dataUrl: i.dataUrl, name: i.name }));
    setLessonMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent('');
    setStreamingSources([]);
    setSearchStatus(wasSourced ? 'searching' : null);
    streamRef.current = '';
    streamSourcesRef.current = [];

    const abort = sendLessonMessage(cid || currentLesson?.curriculumId, lid || currentLesson?.id, text, images, {
      onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); if (searchStatus) setSearchStatus(null); },
      onSource: src => {
        streamSourcesRef.current = [...streamSourcesRef.current, src];
        setStreamingSources(streamSourcesRef.current);
      },
      onStatus: s => setSearchStatus(s),
      onDone: () => {
        const full = streamRef.current;
        const sources = streamSourcesRef.current;
        if (full) {
          const msg = { role: 'assistant', content: full, timestamp: new Date().toISOString() };
          if (sources.length) msg.sources = sources;
          setLessonMessages(m => [...m, msg]);
        }
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
      onError: err => {
        setLessonMessages(m => [...m, errorChatMessage(err)]);
        setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
        streamRef.current = ''; streamSourcesRef.current = [];
        setStreaming(false);
      },
    }, wasSourced);
    abortRef.current = abort;
  }

  const handleLessonSend = useCallback((text, images) => {
    if (streaming) return;
    doSendLesson(text, null, null, { images });
  }, [streaming, currentLesson]);

  // ===== Assessment (unit_test / essay) - real quiz, not a chat tutor =====
  if (view === 'assessment' && currentLesson) {
    return (
      <ViewFade viewKey={`assessment:${currentLesson.id}`} className="h-full flex flex-col">
        <AssessmentView
          lesson={currentLesson}
          curriculum={selectedCurriculum}
          onBack={() => { refreshSelectedCurriculum(selectedCurriculum?.id || currentLesson.curriculumId); setView('detail'); }}
        />
      </ViewFade>
    );
  }

  // ===== Math Tutor - embedded inline. The MathTutorApp component is
  // re-used here with a seedTopic prop so it auto-starts on this lesson's
  // topic without going through its own setup view. Both 'math_tutor' and
  // 'practice' lesson types route here; the seed prompt is slightly
  // different so practice sessions lead with problems instead of theory.
  if (view === 'math_tutor' && currentLesson) {
    const isPractice = currentLesson.type === 'practice';
    const isProblemSet = currentLesson.type === 'problem_set';
    const concepts = Array.isArray(currentLesson.practiceConcepts) ? currentLesson.practiceConcepts : [];
    const seed = currentLesson.practiceTopic || currentLesson.title;
    const label = isProblemSet ? 'Problem Set' : isPractice ? 'Practice' : 'Math Tutor';
    // The unit Math Tutor is the middle of the Lesson -> Math Tutor -> Unit
    // Test loop. When it carries the unit's concept list, seed it as a pre-test
    // review that drills exactly what the unit taught before the test.
    const conceptLine = concepts.length ? ` Cover these concepts from the unit: ${concepts.join('; ')}.` : '';
    const reviewSeed = `Review session for "${seed}" - my warm-up right before the unit test.${conceptLine} Teach each idea briefly, then give me one problem at a time on the canvas, starting moderate and escalating. Give step-by-step feedback when I tap Get feedback, and grade me when I ask whether I'm ready for the test.`;
    const practiceSeed = `Practice problems on ${seed}. Give me one problem at a time on the canvas - start at moderate difficulty and escalate.`;
    const seedTopic = isPractice ? practiceSeed : (concepts.length ? reviewSeed : seed);
    return (
      <ViewFade viewKey={`math_tutor:${currentLesson.id}`} className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-3 flex-shrink-0">
          <button onClick={() => setView('detail')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90">
            <ArrowLeft size={16} /> Back to curriculum
          </button>
          <span className="text-xs text-white/40">·</span>
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">{label}</span>
          <span className="text-xs text-white/40">·</span>
          <span className="text-xs text-white/60 truncate">{currentLesson.title}</span>
        </div>
        <div className="flex-1 min-h-0">
          <MathTutorApp
            {...(isProblemSet
              ? { seedProblemSet: { topic: seed, count: currentLesson.problemCount || 5, problems: currentLesson.problems?.length ? currentLesson.problems : null } }
              : { seedTopic })}
            onBack={() => setView('detail')}
          />
        </div>
      </ViewFade>
    );
  }

  // Lesson view
  if (view === 'lesson' && currentLesson) {
    // Plain "lesson" type uses the new Claudius-style 4R/4Q block view
    // with SRS. Math / essay / unit_test still go through their own flows.
    if (currentLesson.type === 'lesson' || !currentLesson.type) {
      // Shared curriculum: route every block call through the shareId so it
      // resolves to the owner's copy, and light up the co-study chat rail.
      // The owner gets the rail too once someone has accepted their share.
      const shareId = activeShare?.id || null;
      const coStudy = (activeShare || outgoingPartners.length > 0)
        ? {
            shareId,
            partnerNames: activeShare
              ? [activeShare.ownerName || 'Study partner']
              : outgoingPartners,
          }
        : null;
      const cid = selectedCurriculum?.id;
      const sharedApi = shareId
        ? {
            generateBlocks: () => generateLessonBlocks(cid, currentLesson.id, shareId),
            generateFinalQuiz: () => generateFinalQuiz(cid, currentLesson.id, shareId),
            gradeBlock: (bid, resp) => gradeQuizBlock(cid, currentLesson.id, bid, resp, shareId),
            gradeOpenBlock: (bid, text) => gradeOpenBlock(cid, currentLesson.id, bid, text, shareId),
            completeBlock: (bid) => completeLessonBlock(cid, currentLesson.id, bid, shareId),
          }
        : undefined;
      return (
        <ViewFade viewKey={`lesson:${currentLesson.id}`} className="h-full flex flex-col">
          <BlockLessonView
            curriculumId={cid}
            lesson={currentLesson}
            onBack={() => { refreshSelectedCurriculum(cid); setView('detail'); }}
            api={sharedApi}
            coStudy={coStudy}
          />
        </ViewFade>
      );
    }
    const header = (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 glass-header">
        <button onClick={() => setView('detail')} className="text-white/40 hover:text-white/80"><ArrowLeft size={16} /></button>
        <BookOpen size={14} className="text-white/50" />
        <span className="text-sm font-semibold text-white truncate">{currentLesson.title}</span>
      </div>
    );
    function handleUserEdit(idx, newContent) {
      if (streaming) return;
      if (abortRef.current) try { abortRef.current(); } catch {}
      setLessonMessages(prev => prev.slice(0, idx));
      setTimeout(() => doSendLesson(newContent, null, null, {}), 30);
    }
    // Regenerate the AI bubble IN PLACE. The hidden instruction is sent to
    // the server alongside the prior user text; the client transcript only
    // shows the original user turn + the new AI reply.
    function handleAiInstruct(idx, instruction) {
      if (streaming || !instruction?.trim()) return;
      let userIdx = idx - 1;
      while (userIdx >= 0 && lessonMessages[userIdx]?.role !== 'user') userIdx--;
      if (userIdx < 0) return;
      const prevUserText = lessonMessages[userIdx].content || '';
      const userMsgSnapshot = lessonMessages[userIdx];
      if (abortRef.current) try { abortRef.current(); } catch {}
      setLessonMessages(prev => [...prev.slice(0, userIdx), userMsgSnapshot]);
      const hidden = `${prevUserText}\n\n[SYSTEM NOTE: Regenerate your previous answer - this time ${instruction.trim()}. Do NOT acknowledge this instruction. Just output the revised answer directly.]`;
      setTimeout(() => doSendLessonRegenerate(hidden), 30);
    }

    // No visible user-msg added; only the AI reply appends on done.
    function doSendLessonRegenerate(text) {
      setStreaming(true); setStreamingContent(''); setStreamingSources([]);
      streamRef.current = ''; streamSourcesRef.current = [];
      const abort = sendLessonMessage(currentLesson?.curriculumId, currentLesson?.id, text, [], {
        onChunk: c => { streamRef.current += c; setStreamingContent(streamRef.current); },
        onSource: src => {
          streamSourcesRef.current = [...streamSourcesRef.current, src];
          setStreamingSources(streamSourcesRef.current);
        },
        onStatus: s => setSearchStatus(s),
        onDone: () => {
          const full = streamRef.current;
          const sources = streamSourcesRef.current;
          if (full) {
            const msg = { role: 'assistant', content: full, timestamp: new Date().toISOString(), _edited: true };
            if (sources.length) msg.sources = sources;
            setLessonMessages(m => [...m, msg]);
          }
          setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
          streamRef.current = ''; streamSourcesRef.current = [];
          setStreaming(false);
        },
        onError: err => {
          setLessonMessages(m => [...m, errorChatMessage(err)]);
          setStreamingContent(''); setStreamingSources([]); setSearchStatus(null);
          streamRef.current = ''; streamSourcesRef.current = [];
          setStreaming(false);
        },
      }, !!sourceMode);
      abortRef.current = abort;
    }
    return (
      <ViewFade viewKey={`lesson-chat:${currentLesson.id}`} className="h-full flex flex-col">
        <ChatContainer
          messages={lessonMessages}
          streamingContent={streamingContent}
          streamingSources={streamingSources}
          searchStatus={searchStatus}
          onSend={handleLessonSend}
          disabled={streaming}
          placeholder={streaming ? 'AI is thinking...' : 'Message...'}
          header={header}
          className="h-full"
          sourceMode={sourceMode}
          onToggleSource={setSourceMode}
          onUserEditMessage={handleUserEdit}
          onAiInstruct={handleAiInstruct}
        />
      </ViewFade>
    );
  }

  // Gradebook view - shared-curriculum performance for everyone studying it.
  if (view === 'gradebook') {
    return (
      <ViewFade viewKey={`gradebook:${selectedCurriculum?.id || ''}`}>
        <GradebookView
          gradebook={gradebook}
          loading={gradebookLoading}
          onBack={() => setView('detail')}
          onRefresh={refreshGradebook}
        />
      </ViewFade>
    );
  }

  // Detail view
  if (view === 'detail' && selectedCurriculum) {
    const c = selectedCurriculum;
    const displayCurriculum = withQuizBowlLessonSwaps(c);
    const totalLessons = (displayCurriculum.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
    const completedLessons = (displayCurriculum.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);

    return (
      <ViewFade viewKey={`detail:${selectedCurriculum.id}`}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { setView('list'); setSelectedCurriculum(null); setActiveShare(null); }} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/90">
            <ArrowLeft size={16} /> All Curricula
          </button>
          <div className="flex items-center gap-2">
            {(activeShare || outgoingPartners.length > 0) && (
              <button
                onClick={openGradebook}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-400/25 bg-sky-500/[0.08] text-xs font-semibold text-sky-700 dark:text-sky-200/90 hover:border-sky-400/45 hover:bg-sky-500/[0.14] transition-colors"
                title="See everyone's performance on this shared curriculum"
              >
                <BarChart3 size={13} /> Gradebook
                {!activeShare && outgoingPartners.length > 0 && (
                  <span className="text-[10px] font-bold text-sky-700/80 dark:text-sky-200/70 tabular-nums">{outgoingPartners.length + 1}</span>
                )}
              </button>
            )}
            {activeShare && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-400/25 bg-sky-500/[0.08] text-[11px] font-semibold text-sky-700 dark:text-sky-200/90">
                <Users size={11} /> Shared by {activeShare.ownerName || 'a study partner'}
              </span>
            )}
            {!activeShare && isBeta && (
              <button
                onClick={toggleTrail}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  trailMode
                    ? 'border-white/25 bg-white/15 text-white'
                    : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
                }`}
                title="Trail view (BETA) - gamified curriculum path"
              >
                {trailMode ? <List size={12} /> : <MapIcon size={12} />}
                {trailMode ? 'List view' : 'Trail'}
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">BETA</span>
              </button>
            )}
            {!activeShare && (
              <button
                onClick={openPublishDialog}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  c.marketplace?.published
                    ? 'border-blue-400/30 bg-blue-500/[0.12] text-blue-100 hover:bg-blue-500/[0.18]'
                    : 'border-white/10 text-white/50 hover:border-white/25 hover:text-white/80'
                }`}
                title={c.marketplace?.published ? 'Manage marketplace listing' : 'Publish to the curriculum marketplace'}
              >
                <Upload size={12} /> {c.marketplace?.published ? 'Published' : 'Publish'}
              </button>
            )}
            {!activeShare && (
              <button
                onClick={() => setView('edit')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/50 hover:border-white/25 hover:text-white/80 transition-colors"
                title="Edit curriculum"
              >
                <Wand2 size={12} /> Edit
              </button>
            )}
          </div>
        </div>
        {!trailMode && (
          <div className="w-full">
            <h1 className="text-xl font-bold text-white mb-1">{c.title}</h1>
            <div className="flex items-center gap-3 mb-4">
              <ProgressBar value={completedLessons} max={totalLessons} className="flex-1" />
              <span className="text-xs text-white/45 tabular-nums flex-shrink-0">{completedLessons}/{totalLessons}</span>
            </div>
            {/* Course grade - the AI's rolled-up grade from every unit test the
                student has taken (and any graded essays). Appears once at least
                one piece of graded work is in. */}
            {c.graded && c.courseGrade?.percent != null && (
              <div className="flex items-center gap-2 mb-4 -mt-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Course grade</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums border ${gradePillClass(c.courseGrade.percent)}`}>
                  {c.courseGrade.letter} · {c.courseGrade.percent}%
                </span>
                <span className="text-[11px] text-white/30">{c.courseGrade.gradedCount} graded</span>
              </div>
            )}
            {c.marketplace?.published && (
              <div className="flex items-center gap-1.5 mb-4 -mt-1 text-[11px] text-blue-200/75">
                {c.marketplace.anonymous ? <EyeOff size={12} /> : <UserRound size={12} />}
                Public on the marketplace {c.marketplace.anonymous ? 'anonymously' : 'with your name'}
                {c.marketplace.installCount > 0 && <span className="text-white/30">· {c.marketplace.installCount} added</span>}
              </div>
            )}
          </div>
        )}
        {trailMode && isBeta && !activeShare ? (
          <TrailView curriculum={displayCurriculum} onOpenLesson={(l) => openLesson(l, c.id)} />
        ) : (
          <>
            {/* Single stacked column of unit cards, stretched full-width so
                a maximized/fullscreen window doesn't leave the whole right
                side of the screen empty. */}
            <div className="w-full space-y-3">
              {(displayCurriculum.units || []).map((unit, i) => (
                <UnitSection
                  key={unit.id}
                  unit={i === 0 ? { ...unit, tourAnchorFirst: true } : unit}
                  onOpenLesson={(l) => openLesson(l, c.id)}
                />
              ))}
            </div>

            {/* Course-level midterm + final, with spaced repetition. Sits
                full-width below the unit columns. Exams stay owner-only -
                their endpoints don't carry a shareId. */}
            {!activeShare && (
              <div className="w-full pt-4">
                <ExamBlock curriculumId={c.id} />
              </div>
            )}
          </>
        )}

        <Modal
          open={publishOpen}
          onClose={() => !publishBusy && setPublishOpen(false)}
          title={c.marketplace?.published ? 'Marketplace listing' : 'Publish curriculum'}
          description="Share the course structure and learning material publicly. Your private progress, answers, scores, and lesson chats are never included."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="text-sm font-medium text-white/90">{c.title}</p>
              <p className="mt-1 text-xs text-white/45">{displayCurriculum.units?.length || 0} units · {totalLessons} lessons</p>
            </div>
            <Toggle
              label="Post anonymously"
              description="The listing will say Anonymous creator instead of showing your name."
              accent="blue"
              checked={publishAnonymous}
              onChange={setPublishAnonymous}
            />
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/[0.08]">
              {c.marketplace?.published ? (
                <Button variant="ghost" size="sm" disabled={publishBusy} onClick={removeMarketplacePublication} className="text-rose-300 hover:text-rose-200">
                  Remove listing
                </Button>
              ) : <span />}
              <Button size="sm" loading={publishBusy} onClick={saveMarketplacePublication}>
                <Upload size={13} /> {c.marketplace?.published ? 'Save listing' : 'Publish publicly'}
              </Button>
            </div>
          </div>
        </Modal>

      </ViewFade>
    );
  }

  // Edit curriculum (full-page view)
  if (view === 'edit' && selectedCurriculum) {
    return (
      <ViewFade viewKey={`edit:${selectedCurriculum.id}`}>
        <EditCurriculumView
          curriculum={selectedCurriculum}
          onBack={() => setView('detail')}
          onUpdated={(updated) => {
            setSelectedCurriculum(updated);
            setCurricula(prev => prev.map(x => x.id === updated.id ? updated : x));
            bust('curricula:list');
            setView('detail');
          }}
        />
      </ViewFade>
    );
  }

  // New curriculum
  if (view === 'new') {
    return (
      <ViewFade viewKey="new">
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90 mb-4"><ArrowLeft size={16} /> Back</button>
        <h2 className="text-lg font-bold text-white mb-4">New curriculum</h2>
        {generating && genPhase === 'questions' ? (
          <div className="py-8 px-2 max-w-lg mx-auto w-full">
            <div className="mb-8">
              <h3 className="text-[22px] font-bold text-white tracking-tight">A few quick questions</h3>
            </div>
            {genError && (
              <div className="px-3 py-2 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300">
                {genError}
              </div>
            )}
            {refineQuestions.length === 0 ? (
              <div className="flex items-center gap-2 text-[12px] text-white/40 py-6">
                <Loader2 size={14} className="animate-spin text-blue-400" />
                Thinking of good questions to ask…
              </div>
            ) : (
              <div className="space-y-6">
                {refineQuestions.map((q, qi) => {
                  const isOpen = q.type === 'open';
                  return (
                    <div key={q.id}>
                      <p className="text-[13px] font-medium text-white/80 mb-2.5">{q.question}</p>
                      {isOpen ? (
                        <textarea
                          value={refineAnswers[q.id] || ''}
                          onChange={(e) => setRefineAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                          placeholder={q.placeholder || 'Type your answer…'}
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg bg-white/[0.04] text-[12px] text-white/90 border border-white/[0.10] placeholder:text-white/25 hover:border-white/20 focus:border-blue-500 focus:outline-none focus:bg-blue-500/[0.06] resize-none transition-colors"
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {q.options.map(opt => {
                            const active = refineAnswers[q.id] === opt;
                            return (
                              <button
                                key={opt}
                                onClick={() => setRefineAnswers(p => ({ ...p, [q.id]: opt }))}
                                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                                  active
                                    ? 'bg-blue-500 text-white border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.35)]'
                                    : 'bg-white/[0.05] text-white/55 border-white/[0.10] hover:bg-white/[0.09] hover:text-white/80 hover:border-white/20'
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-white/25 tabular-nums">
                    {Object.values(refineAnswers).filter(a => a && String(a).trim()).length}/{refineQuestions.length} answered
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={cancelGenerate}
                      className="px-3 py-1.5 rounded-lg text-[12px] text-white/35 hover:text-white/65 transition-colors"
                    >
                      Cancel
                    </button>
                    <Button onClick={runBuild}>
                      Build curriculum
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : generating ? (
          <div className="py-10 px-2 max-w-xl mx-auto w-full">
            <LoadingProgress
              active
              label={`Generating ${settings.topic || 'curriculum'}…`}
              hint="~30s"
              duration={30000}
            />
            <div className="mt-6">
              <SkeletonProse lines={5} />
            </div>
            {isDemo && (
              <div className="mt-6 max-w-sm mx-auto text-center rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">Don&apos;t leave or close - request will cancel.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {genError && <div className="px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800 text-xs text-rose-600">{genError}</div>}
            <Input label="Topic" placeholder="Calculus, US History, etc." value={settings.topic} onChange={e => setSettings(p => ({ ...p, topic: e.target.value }))} data-tour="curriculum-topic-input" />
            <PillGroup label="Difficulty" options={DIFFICULTY_OPTIONS} value={settings.difficulty} onChange={v => setSettings(p => ({ ...p, difficulty: v }))} />
            <PillGroup label="Style" options={LEARNING_STYLE_OPTIONS} value={settings.learningStyle} onChange={v => setSettings(p => ({ ...p, learningStyle: v }))} />
            <div className="flex gap-4">
              <Toggle label="Examples" accent="blue" checked={settings.includeExamples} onChange={v => setSettings(p => ({ ...p, includeExamples: v }))} />
              <Toggle
                label="Exercises"
                description="Fill-in-the-blank, matching, and multiple choice only"
                accent="blue"
                checked={settings.includeExercises}
                onChange={v => setSettings(p => ({ ...p, includeExercises: v }))}
              />
            </div>

            {/* ===== Source material (textbooks + websites) ===== */}
            <div className="rounded-xl border border-white/10 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-white/60">Sources <span className="font-normal opacity-60">(optional)</span></p>
                {sources.length > 0 && (
                  <span className="text-[10px] text-white/40 tabular-nums">{sources.length}/8</span>
                )}
              </div>

              {/* URL input */}
              <form onSubmit={handleAddSourceUrl} className="flex items-center gap-2 mb-2">
                <input
                  type="url"
                  value={sourceUrlInput}
                  onChange={e => setSourceUrlInput(e.target.value)}
                  placeholder="https://…"
                  disabled={sourceBusy || sources.length >= 8}
                  className="flex-1 px-3 py-2 rounded-lg border border-white/10 bg-white dark:bg-transparent text-sm text-white outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sourceBusy || !sourceUrlInput.trim() || sources.length >= 8}
                  className="px-3 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  {sourceBusy ? <InlineProgress active /> : <><Plus size={12} /> Add URL</>}
                </button>
              </form>

              {/* File picker */}
              <input
                ref={sourceFileRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json,.tex"
                className="hidden"
                onChange={e => handleAddSourceFiles(e.target.files)}
              />
              <button
                onClick={() => sourceFileRef.current?.click()}
                disabled={sourceBusy || sources.length >= 8}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-white/[0.10] text-white/45 text-xs hover:border-white/30 hover:text-white/70 transition-colors disabled:opacity-50"
              >
                {sourceBusy ? <InlineProgress active /> : <Paperclip size={13} />}
                Attach PDFs or text files
              </button>

              {sourceError && (
                <div className="mt-2 px-2.5 py-1.5 rounded-md text-[11px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/15 border border-rose-200 dark:border-rose-800/40 flex items-center justify-between gap-2">
                  <span>{sourceError}</span>
                  <button onClick={() => setSourceError('')} className="opacity-70 hover:opacity-100"><X size={11} /></button>
                </div>
              )}

              {/* Source list */}
              {sources.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {sources.map(s => {
                    const Icon = FileText;
                    return (
                      <div key={s.id} className="group flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/10">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${s.kind === 'url' ? 'bg-white/[0.08] text-white/50' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'}`}>
                          <Icon size={11} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white/90 truncate">{s.title}</p>
                          <p className="text-[10px] text-white/40 truncate">{s.url || s.kind} · {Math.round((s.chars || s.content?.length || 0) / 100) / 10}k chars</p>
                        </div>
                        <button
                          onClick={() => removeSource(s.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/30 hover:text-rose-500 transition-all flex-shrink-0"
                          title="Remove"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={!settings.topic.trim()} data-tour="curriculum-generate-button">Generate Curriculum</Button>
          </div>
        )}
      </ViewFade>
    );
  }

  // Curriculum marketplace - browse presets and community courses together.
  if (view === 'marketplace') {
    return (
      <ViewFade viewKey="marketplace" className="h-full flex flex-col">
        <CurriculumMarketplaceView
          catalog={marketplaceCatalog}
          loading={marketplaceLoading}
          error={marketplaceError}
          enrollingSlug={enrollingSlug}
          onBack={() => setView('list')}
          onRetry={() => loadMarketplace({ refresh: true })}
          onEnroll={enrollFromMarketplace}
        />
      </ViewFade>
    );
  }

  // List view
  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  return (
    <ViewFade viewKey="list">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Curricula</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { loadMarketplace(); setView('marketplace'); }}
          >
            <Store size={14} /> Marketplace
          </Button>
          <Button size="sm" data-tour="new-curriculum-button" onClick={() => setView('new')}><Plus size={14} /> New</Button>
        </div>
      </div>

      {/* Marketplace discovery strip */}
      <button
        onClick={() => { loadMarketplace(); setView('marketplace'); }}
        data-tour="pausd-catalog-button"
        className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-white/[0.16] hover:bg-white/[0.07] transition-colors text-left backdrop-blur-sm"
      >
        <div className="w-10 h-10 rounded-lg bg-white/[0.07] text-white/70 flex items-center justify-center flex-shrink-0">
          <Store size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Curriculum Marketplace</p>
          <p className="text-[11px] text-white/50">Search preset and community-made courses.</p>
        </div>
        <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
      </button>

      {/* Shared with you - curriculum invites + accepted shared courses.
          Accepting puts the course here (one live copy, studied together
          with the owner), not a duplicate in "your" list below. */}
      {(() => {
        const pendingShares = incomingShares.filter(s => s.itemType === 'curriculum' && s.status === 'pending');
        const acceptedShares = incomingShares.filter(s => s.itemType === 'curriculum' && s.status === 'accepted' && s.itemExists !== false);
        if (pendingShares.length === 0 && acceptedShares.length === 0) return null;
        return (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2 px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 inline-flex items-center gap-1.5">
                <Users size={12} /> Shared with you
              </h2>
              <span className="text-[10px] text-white/25 tabular-nums">{pendingShares.length + acceptedShares.length}</span>
            </div>
            <div className="space-y-2">
              {pendingShares.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-sky-400/25 bg-sky-500/[0.06] px-4 py-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center flex-shrink-0"><BookOpen size={16} className="text-sky-600 dark:text-sky-300" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{s.itemTitle}</h3>
                    <p className="text-xs text-white/45 mt-0.5">{s.ownerName} wants to study this with you</p>
                  </div>
                  <Button size="sm" onClick={() => acceptShare(s.id).catch((e) => toast.error(e.message || "Couldn't accept the invite."))}>
                    <Check size={13} /> Accept
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Decline" onClick={() => declineShare(s.id).catch(() => {})}>
                    <X size={13} />
                  </Button>
                </div>
              ))}
              {acceptedShares.map((s) => (
                <div key={s.id} onClick={() => openSharedCurriculum(s)} className="flex items-center gap-4 bg-white/[0.04] backdrop-blur-sm rounded-xl border border-white/[0.08] px-4 py-3 cursor-pointer hover:border-white/[0.18] hover:bg-white/[0.07] transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0"><Users size={16} className="text-sky-600 dark:text-sky-300/80" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">{s.itemTitle}</h3>
                    <p className="text-xs text-white/40 mt-0.5">Studying together with {s.ownerName}</p>
                  </div>
                  <ChevronRight size={16} className="text-white/30 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {curricula.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-white/40 mx-auto mb-3" />
          <p className="text-sm text-white/45 mb-4">No curricula yet</p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={() => setView('new')}><Plus size={16} /> New</Button>
            <Button variant="secondary" onClick={() => { loadMarketplace(); setView('marketplace'); }}>
              <Store size={16} /> Browse marketplace
            </Button>
          </div>
        </div>
      ) : (() => {
        // Bucket curricula by AI-assigned subject category, in a fixed order.
        // Anything off-list (or legacy/uncategorized) falls into "Other".
        const CATEGORY_ORDER = ['Math', 'Science', 'Computer Science', 'History', 'Language & Literature', 'Arts', 'Social Science', 'Other'];
        const groups = {};
        for (const c of curricula) {
          const cat = CATEGORY_ORDER.includes(c.category) ? c.category : 'Other';
          (groups[cat] = groups[cat] || []).push(c);
        }
        const renderCard = (c) => {
          // The LIST response strips `units` but supplies counters; prefer
          // those, fall back to recomputing for full objects in state.
          const total = typeof c.totalLessons === 'number'
            ? c.totalLessons
            : (c.units || []).reduce((s, u) => s + (u.lessons || []).length, 0);
          const done = typeof c.completedLessons === 'number'
            ? c.completedLessons
            : (c.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0);
          const units = typeof c.unitCount === 'number' ? c.unitCount : (c.units?.length || 0);
          return (
            <div key={c.id} onClick={() => openCurriculum(c.id)} className="flex items-center gap-4 bg-white/[0.04] backdrop-blur-sm rounded-xl border border-white/[0.08] px-4 py-3 cursor-pointer hover:border-white/[0.18] hover:bg-white/[0.07] transition-colors">
              <div className="w-9 h-9 rounded-lg bg-white/[0.07] flex items-center justify-center flex-shrink-0"><BookOpen size={16} className="text-white/50" /></div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">{c.title}</h3>
                <p className="text-xs text-white/40 mt-0.5">{done}/{total} lessons · {units} unit{units === 1 ? '' : 's'}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShareTarget({ id: c.id, type: 'curriculum', title: c.title }); }}
                className="p-1.5 rounded-lg text-white/25 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-white/[0.06] transition-colors flex-shrink-0"
                title="Share"
              >
                <Share2 size={15} />
              </button>
            </div>
          );
        };
        return (
          <div className="space-y-5">
            {CATEGORY_ORDER.filter(cat => groups[cat]?.length).map(cat => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{cat}</h2>
                  <span className="text-[10px] text-white/25 tabular-nums">{groups[cat].length}</span>
                </div>
                <div className="space-y-2">
                  {groups[cat].map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {shareTarget && (
        <ShareDialog item={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </ViewFade>
  );
}

// Inline unit accordion (no React Router navigate)
function UnitSection({ unit, onOpenLesson }) {
  const [open, setOpen] = useState(true);
  const totalLessons = (unit.lessons || []).length;
  const completedLessons = (unit.lessons || []).filter(l => l.isCompleted).length;

  return (
    <div className={`bg-white/[0.04] backdrop-blur-sm rounded-xl border border-white/[0.08] overflow-hidden ${unit.locked ? 'opacity-50' : ''}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors">
        {unit.locked ? <Lock size={14} className="text-white/30" /> : open ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-white text-sm">{unit.title}</h4>
        </div>
        <span className="text-xs text-white/35 tabular-nums">{completedLessons}/{totalLessons}</span>
      </button>
      {open && !unit.locked && (
        <div className="border-t border-white/8 p-1.5">
          {(unit.lessons || []).map((lesson, i) => {
            const TypeIcon = TYPE_ICONS[lesson.type] || BookOpen;
            const typeColor = TYPE_COLORS[lesson.type] || 'text-white/35';
            // Anchor the FIRST lesson of the FIRST unit so the guided tour
            // can highlight it after enrollment.
            const tourAnchor = unit.tourAnchorFirst && i === 0 && lesson.type === 'lesson';
            return (
              <button
                key={lesson.id}
                onClick={() => onOpenLesson(lesson)}
                data-tour={tourAnchor ? 'first-lesson' : undefined}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-white/8 transition-colors group"
              >
                {lesson.isCompleted ? <CheckCircle2 size={14} className="text-white/40 flex-shrink-0" /> : lesson.chatHistory?.length > 0 ? <Circle size={14} className="text-white/35 flex-shrink-0" /> : <TypeIcon size={14} className={`${typeColor} flex-shrink-0`} />}
                <span className={`text-sm flex-1 truncate ${lesson.isCompleted ? 'text-white/25 line-through' : 'text-white/60 group-hover:text-white'}`}>{lesson.title}</span>
                {typeof lesson.score === 'number' && (lesson.type === 'unit_test' || lesson.type === 'essay') && (
                  <span className={`flex-shrink-0 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md border ${gradePillClass(lesson.score)}`}>{lesson.score}%</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============= Real assessment UI - handles both quiz and essay =============
//
// Quiz path now uses the same `<QuizBlock>` component the in-lesson
// quizzes use, so the look + feel is consistent across the entire
// curriculum (one MCQ at a time, choice cards, results screen with
// per-question explanations). The essay path still has its own
// custom UI because it needs a textarea + rubric + AI grader output.
function AssessmentView({ lesson, curriculum, onBack }) {
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [essayText, setEssayText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState(null);

  const isEssay = lesson.type === 'essay';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const topic = `${lesson.title}${curriculum?.title ? ` (from ${curriculum.title})` : ''}`;
        const data = await apiFetch('/api/assessment/generate', {
          method: 'POST',
          body: JSON.stringify({
            topic,
            type: isEssay ? 'essay' : 'quiz',
            // Default to 3 questions instead of 5. ~40% faster
            // generation on Flash Lite + still enough to gauge
            // mastery; users can re-take to drill more.
            questionCount: 10,
            difficulty: curriculum?.settings?.difficulty || 'beginner',
          }),
        });
        if (!alive) return;
        setAssessment(data.assessment);
      } catch (e) {
        setError(e.message || 'Failed to load assessment');
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [lesson.id, isEssay]);

  // Convert the server's assessment shape into the QuizBlock `block`
  // shape so we can reuse the in-lesson quiz UI verbatim.
  //   server:   { questions: [{ id, question, options: ["A) …", …], correct: "A", explanation }] }
  //   block:    { id, title, questions: [{ id, prompt, choices: [text, …], answer: text, explanation }] }
  // Memoised by assessment id so we don't rebuild on every render.
  const block = (!isEssay && assessment) ? (() => {
    const stripPrefix = (s) => String(s || '').replace(/^[A-Z]\)\s*/, '');
    return {
      id: assessment.id,
      title: assessment.title || lesson.title,
      questions: (assessment.questions || []).map((q, i) => {
        const choices = (q.options || []).map(stripPrefix);
        const correctLetter = String(q.correct || 'A').toUpperCase();
        const correctIdx = Math.max(0, correctLetter.charCodeAt(0) - 65);
        return {
          id: q.id || `q${i + 1}`,
          prompt: q.question,
          choices,
          answer: choices[correctIdx] || choices[0] || '',
          explanation: q.explanation || '',
        };
      }),
    };
  })() : null;

  // QuizBlock's grader contract: gradeFn(blockId, responses) where
  // each response is { qid, given (choice text) }. We translate the
  // chosen text back into the server's letter format and call the
  // existing /api/assessment/grade endpoint, then re-shape the
  // server result into what QuizBlock expects.
  async function quizGradeFn(_blockId, responses) {
    if (!assessment) return { score: 0, results: [] };
    const answersByIdx = {};
    block.questions.forEach((bq, i) => {
      const r = responses.find(x => x.qid === bq.id);
      if (!r) return;
      const choiceIdx = bq.choices.findIndex(c => c === r.given);
      const letter = String.fromCharCode(65 + Math.max(0, choiceIdx));
      answersByIdx[i] = letter;
    });
    const r = await apiFetch('/api/assessment/grade', {
      method: 'POST',
      body: JSON.stringify({ assessment, answers: answersByIdx }),
    });
    setResult(r.result);
    // Persist the test score onto the curriculum lesson and mark it complete,
    // so it rolls into the course grade (computeCourseGrade reads unit-test
    // lesson scores). The grade endpoint records the score rather than
    // toggling, so retakes update the grade.
    const cid = curriculum?.id || lesson.curriculumId;
    if (cid) {
      try {
        await apiFetch(`/api/curriculum/${cid}/lesson/${lesson.id}/complete`, {
          method: 'POST',
          body: JSON.stringify({ score: r.result?.percentage || 0 }),
        });
      } catch {}
    }
    const blockResults = block.questions.map((bq, i) => ({
      qid: bq.id,
      correct: !!r.result?.details?.[i]?.correct,
      given: responses.find(x => x.qid === bq.id)?.given || '',
    }));
    return { score: r.result?.percentage || 0, results: blockResults };
  }

  async function handleEssaySubmit() {
    if (!assessment) return;
    setGrading(true);
    setError(null);
    try {
      const r = await apiFetch('/api/assessment/grade', {
        method: 'POST',
        body: JSON.stringify({ assessment, answers: { essay: essayText } }),
      });
      setResult(r.result);
      const cid = curriculum?.id || lesson.curriculumId;
      if (cid) {
        try {
          await apiFetch(`/api/curriculum/${cid}/lesson/${lesson.id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ score: r.result?.percentage || 0 }),
          });
        } catch {}
      }
    } catch (e) { setError(e.message); }
    setGrading(false);
  }

  const wordCount = essayText.split(/\s+/).filter(Boolean).length;
  const canSubmitEssay = essayText.trim().length >= 30;

  const totalRubricPoints = Array.isArray(assessment?.rubric)
    ? assessment.rubric.reduce((s, r) => s + (r.maxScore || 5), 0)
    : null;

  return (
    <div className="h-full overflow-y-auto bg-transparent">
      <div className="max-w-3xl mx-auto px-5 py-6">
        {/* ── Back nav ── */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-white/30 hover:text-white/60 transition-colors mb-6"
        >
          <ArrowLeft size={14} /> Back
        </button>

        {/* ── Header ── */}
        <div className="mb-7 flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/[0.18] bg-amber-500/[0.08] text-amber-300/85">
            <FileText size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Graded essay</p>
            <div className="flex items-baseline gap-2">
              <h1 className="text-[20px] font-bold leading-snug text-white/90">{lesson.title}</h1>
              {totalRubricPoints && (
                <span className="shrink-0 font-mono text-[11px] text-white/35">{totalRubricPoints} pts</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="py-16 flex flex-col items-center gap-4">
            <LoadingProgress active label={isEssay ? 'Building essay prompt…' : 'Generating assessment…'} duration={8000} />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl p-4 mb-4">
            <X size={14} className="text-rose-500 dark:text-rose-400 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}

        {/* ===== ESSAY FORM ===== */}
        {!loading && !error && assessment && !result && isEssay && (
          <div className="space-y-5">
            <div className="grid gap-5 border-y border-white/[0.07] py-5 lg:grid-cols-5">
              {/* Prompt */}
              <section className="lg:col-span-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Prompt</p>
                <MathText as="p" className="text-[14px] leading-7 text-white/82">{assessment.prompt || ''}</MathText>
              </section>

              {/* Rubric */}
              {Array.isArray(assessment.rubric) && assessment.rubric.length > 0 && (
                <section className="border-t border-white/[0.07] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Rubric</p>
                    <span className="font-mono text-[10px] text-white/30">{assessment.rubric.length} criteria</span>
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {assessment.rubric.map((r, i) => (
                      <div key={i} className="py-2 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[12px] font-medium text-white/75">{r.criterion}</span>
                          <span className="shrink-0 font-mono text-[10px] text-amber-300/80">{r.maxScore || 5} pts</span>
                        </div>
                        {r.description && <p className="mt-0.5 text-[11px] leading-snug text-white/35">{r.description}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Textarea */}
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-colors focus-within:border-blue-400/45 focus-within:ring-2 focus-within:ring-blue-400/[0.12]">
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                <label htmlFor={`essay-response-${lesson.id}`} className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Your response</label>
                <span className="font-mono text-[10px] text-white/30">Draft</span>
              </div>
              <textarea
                id={`essay-response-${lesson.id}`}
                value={essayText}
                onChange={e => setEssayText(e.target.value)}
                placeholder="Make a clear argument, support it with evidence, and address each rubric criterion."
                rows={14}
                className="w-full resize-y bg-transparent px-4 py-4 text-[14px] leading-7 text-white/85 outline-none placeholder:text-white/25"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5">
                <p className="font-mono text-[10px] text-white/35">
                  {wordCount} {wordCount === 1 ? 'word' : 'words'} <span className="mx-1.5 text-white/20">·</span> {essayText.length} characters
                </p>
                {!canSubmitEssay && essayText.length > 0 && (
                  <p className="text-[10px] font-medium text-amber-300/85">30 characters minimum</p>
                )}
                {canSubmitEssay && (
                  <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-300/90">
                    <Check size={9} /> Ready
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <p className="mr-auto text-[11px] text-white/35">AI feedback is based on the rubric above.</p>
              <Button
              onClick={handleEssaySubmit}
              disabled={grading || !canSubmitEssay}
              loading={grading}
              className="min-w-[140px]"
            >
              {grading ? (
                <><Loader2 size={14} className="animate-spin" /> Grading…</>
              ) : (
                'Submit for grading'
              )}
              </Button>
            </div>
          </div>
        )}

        {/* ===== QUIZ - same UI as in-lesson QuizBlock ===== */}
        {!loading && !error && assessment && !result && !isEssay && block && (
          <QuizBlock
            block={block}
            gradeFn={quizGradeFn}
            onComplete={onBack}
          />
        )}

        {/* ===== RESULT - ESSAY ===== */}
        {result && isEssay && (() => {
          const pct = result.percentage ?? 0;
          const letter = pct >= 93 ? 'A' : pct >= 90 ? 'A−' : pct >= 87 ? 'B+' : pct >= 83 ? 'B' : pct >= 80 ? 'B−' : pct >= 77 ? 'C+' : pct >= 73 ? 'C' : pct >= 70 ? 'C−' : pct >= 67 ? 'D+' : pct >= 60 ? 'D' : 'F';
          const col = pct >= 80 ? { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'bg-emerald-500' }
            : pct >= 65 ? { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/25', bar: 'bg-amber-500' }
            : { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/25', bar: 'bg-rose-500' };
          return (
            <div className="space-y-6">
              <section className={`grid gap-5 rounded-xl border ${col.border} ${col.bg} p-4 sm:grid-cols-[104px_minmax(0,1fr)] sm:items-center`}>
                <div className="border-b border-white/[0.08] pb-4 text-center sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
                  <div className="flex items-baseline justify-center gap-1.5">
                    <span className={`text-4xl font-bold tabular-nums ${col.text}`}>{letter}</span>
                    <span className={`font-mono text-[13px] ${col.text} opacity-70`}>{pct}%</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-white/35">{result.score} / {result.total} pts</p>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Grading complete</p>
                  {result.overallFeedback ? (
                    <MathText as="p" className="text-[13px] leading-relaxed text-white/75">{result.overallFeedback}</MathText>
                  ) : (
                    <p className="text-[13px] text-white/55">Your essay has been scored against the rubric.</p>
                  )}
                </div>
              </section>

              {/* Rubric breakdown */}
              {Array.isArray(result.rubricScores) && result.rubricScores.length > 0 && (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Rubric breakdown</p>
                  <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                  {result.rubricScores.map((r, i) => {
                    const p = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
                    const c = p >= 80 ? { score: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', bar: 'bg-emerald-500' }
                      : p >= 60 ? { score: 'text-amber-400 bg-amber-500/10 border-amber-500/20', bar: 'bg-amber-500' }
                      : { score: 'text-rose-400 bg-rose-500/10 border-rose-500/20', bar: 'bg-rose-500' };
                    return (
                      <div key={i} className="py-3.5">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <p className="text-[13px] font-semibold text-white/80">{r.criterion}</p>
                          <span className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${c.score}`}>{r.score}/{r.maxScore}</span>
                        </div>
                        <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${p}%` }} />
                        </div>
                        {r.feedback && <MathText as="p" className="text-[11px] text-white/40 leading-snug">{r.feedback}</MathText>}
                      </div>
                    );
                  })}
                  </div>
                </section>
              )}

              {/* Strengths + improvements */}
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.isArray(result.strengths) && result.strengths.length > 0 && (
                  <section>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/75">Strengths</p>
                    <ul className="space-y-2.5 border-t border-white/[0.07] pt-3">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <Check size={12} className="mt-0.5 shrink-0 text-emerald-300/90" />
                          <span className="text-[12px] leading-snug text-white/60">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {Array.isArray(result.improvements) && result.improvements.length > 0 && (
                  <section>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300/75">Next time</p>
                    <ul className="space-y-2.5 border-t border-white/[0.07] pt-3">
                      {result.improvements.map((s, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-0.5 shrink-0 text-[12px] font-bold text-amber-300/90">→</span>
                          <span className="text-[12px] leading-snug text-white/60">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-5">
                <Button
                  onClick={() => { setResult(null); setEssayText(result.essay || essayText); }}
                  variant="secondary"
                >
                  Revise &amp; Resubmit
                </Button>
                <Button
                  onClick={onBack}
                >
                  Back to Curriculum
                </Button>
              </div>
            </div>
          );
        })()}

        {/* In NEW (QuizBlock) mode the quiz results are rendered
            inside QuizBlock itself (score chip + per-question
            breakdown + Continue button), so nothing else to render
            here. The CLASSIC mode renders its own result block
            above. */}
      </div>
    </div>
  );
}

// ============= Edit curriculum (full-page view) =============
function EditCurriculumView({ curriculum, onBack, onUpdated }) {
  const [instruction, setInstruction] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  function addFiles(list) {
    const incoming = Array.from(list || []);
    const filtered = incoming.filter(f => f.size <= 25 * 1024 * 1024).slice(0, 5);
    setFiles(prev => [...prev, ...filtered].slice(0, 5));
  }
  function removeFile(i) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!instruction.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const { curriculum: updated } = await editCurriculumWithAI(curriculum.id, instruction.trim(), files);
      onUpdated(updated);
    } catch (e) {
      setError(e.message || 'Edit failed');
      setSubmitting(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  return (
    <div className="flex flex-col h-full">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/90 mb-6">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Wand2 size={16} className="text-white/50" />
        <h2 className="text-lg font-bold text-white">Edit curriculum with AI</h2>
      </div>
      <p className="text-xs text-white/35 mb-6">{curriculum.title}</p>

      <div className="flex-1 overflow-y-auto space-y-6 pb-4">
        <div>
          <label className="text-xs font-medium text-white/45 mb-2 block">Your instruction</label>
          <textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder={'Examples:\n• Add a unit on functional groups after Unit 2\n• Simplify Unit 1 to 3 lessons\n• Rename "Intro" to "Getting Started" and add a practice lesson\n• Rewrite this to match the AP Chemistry syllabus in the attached PDF'}
            rows={7}
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white placeholder-white/30 resize-none outline-none focus:border-white/30"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-white/45 mb-2 block">Context files (optional)</label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 rounded-xl p-5 text-center cursor-pointer hover:border-white/30 transition-colors"
          >
            <Upload size={18} className="text-white/40 mx-auto mb-1.5" />
            <p className="text-xs text-white/45">Drop PDFs or text files here, or click to pick</p>
            <p className="text-[10px] text-white/40 mt-0.5">up to 5 files · 25MB each</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.json,application/pdf,text/plain,text/markdown"
              className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
          {files.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10">
                  <Paperclip size={11} className="text-white/40 flex-shrink-0" />
                  <span className="flex-1 text-xs text-white/60 truncate">{f.name}</span>
                  <span className="text-[10px] text-white/40">{Math.round(f.size / 1024)} KB</span>
                  <button onClick={() => removeFile(i)} className="text-white/30 hover:text-rose-500"><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10 mt-2">
        <button onClick={onBack} className="px-4 py-2 rounded-lg border border-white/10 text-xs font-medium text-white/60 hover:text-white/80">Cancel</button>
        <button
          onClick={submit}
          disabled={!instruction.trim() || submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 border border-blue-500 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <><InlineProgress active /> Applying…</> : <>Apply edit</>}
        </button>
      </div>
    </div>
  );
}

// =============================================================
// Curriculum Marketplace — a search-first discovery hub with a source filter
// for community-made courses and dense wiki-style result rows.
// =============================================================
function CurriculumMarketplaceView({ catalog, loading, error, enrollingSlug, onBack, onRetry, onEnroll }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');

  const filters = ['All', 'Community'];
  const normalizedQuery = query.trim().toLowerCase();
  const visible = catalog.filter(course => {
    const haystack = [course.title, course.description, course.category, course.subject, course.author, course.grade]
      .filter(Boolean).join(' ').toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesFilter = filter === 'All' || course.source === 'community';
    return matchesQuery && matchesFilter;
  });

  const featured = visible.filter(course => course.featured).slice(0, 6);
  const community = visible.filter(course => course.source === 'community');
  const library = visible.filter(course => course.source === 'preset' && !featured.includes(course));
  // Community is a source view, not a search mode. It keeps the normal
  // marketplace sections and simply removes preset listings.
  const hasActiveSearch = Boolean(normalizedQuery) && filter === 'All';

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-white/35 hover:text-white/65 transition-colors mb-2">
            <ArrowLeft size={16} /> My curricula
          </button>
          <h2 className="text-lg font-bold text-white/95">Curriculum Marketplace</h2>
          <p className="mt-0.5 text-[11px] text-white/40">Preset courses and curricula made by the community.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] text-white/35">
          <Store size={13} /> {catalog.length} public course{catalog.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="relative mb-3 flex-shrink-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search topics, subjects, grade levels, or creators…"
          inputMode="search"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-white/[0.10] bg-white/[0.04] text-white/90 placeholder-white/30 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-colors"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-3 flex-shrink-0">
        {filters.map(item => (
          <button
            key={item}
            onClick={() => {
              setFilter(item);
              if (item === 'Community') setQuery('');
            }}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors ${
              filter === item
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-white/[0.06] bg-white/[0.025] text-white/45 hover:bg-white/[0.06] hover:text-white/70'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2">
        {loading && catalog.length === 0 ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner size={24} /></div>
        ) : error && catalog.length === 0 ? (
          <div className="text-center py-14">
            <Store size={28} className="mx-auto mb-3 text-white/20" />
            <p className="text-sm text-white/65">Marketplace unavailable</p>
            <p className="mt-1 text-xs text-white/35">{error}</p>
            <Button size="sm" variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-14">
            <Search size={28} className="mx-auto mb-3 text-white/20" />
            <p className="text-sm text-white/65">No curricula match “{query || filter}”</p>
            <button onClick={() => { setQuery(''); setFilter('All'); }} className="mt-2 text-xs text-blue-300 hover:text-blue-200">Clear search</button>
          </div>
        ) : hasActiveSearch ? (
          <CourseSection title="Results" icon={Search} items={visible} enrollingSlug={enrollingSlug} onEnroll={onEnroll} />
        ) : (
          <>
            <CourseSection title="Featured courses" icon={Sparkles} items={featured} enrollingSlug={enrollingSlug} onEnroll={onEnroll} />
            <CourseSection title="Community made" icon={Users} items={community} enrollingSlug={enrollingSlug} onEnroll={onEnroll} />
            <CourseSection title="Course library" icon={Library} items={library} enrollingSlug={enrollingSlug} onEnroll={onEnroll} />
          </>
        )}
      </div>
    </div>
  );
}

// Module-level on purpose. When this was declared inside
// CurriculumMarketplaceView, every parent re-render created a new component
// type, so React remounted all the rows. The desktop shell focuses the window
// on pointerdown, which re-renders the app mid-click — the Add button was
// remounted between mousedown and mouseup and its click never fired.
function CourseSection({ title, icon: Icon, items, enrollingSlug, onEnroll }) {
  if (!items.length) return null;
  return (
    <section className="mb-5">
      <div className="flex items-center gap-2 mb-1.5 px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40 inline-flex items-center gap-1.5">
          <Icon size={12} /> {title}
        </h3>
        <span className="text-[10px] text-white/25 tabular-nums">{items.length}</span>
      </div>
      <div>
        {items.map((course, index) => (
          <MarketplaceCourseRow
            key={course.listingId}
            course={course}
            enrolling={enrollingSlug === course.listingId}
            onEnroll={() => onEnroll(course)}
            tourAnchor={course.source === 'preset' && index === 0}
          />
        ))}
      </div>
    </section>
  );
}

function MarketplaceCourseRow({ course, enrolling, onEnroll, tourAnchor }) {
  const category = course.category || 'Other';
  const meta = [
    course.grade ? `Grade ${course.grade}` : null,
    `${course.unitCount || 0} units`,
    `${course.lessonCount || 0} lessons`,
    course.installCount ? `${course.installCount} added` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      data-tour={tourAnchor ? 'pausd-course-card' : undefined}
      className="group min-h-16 flex items-center gap-3 px-2 py-2.5 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.035] rounded-md transition-colors"
    >
      <div className="w-[72px] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/30 group-hover:text-white/45 transition-colors line-clamp-2">{category}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-sm font-medium text-white/90 truncate">{course.title}</h4>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            course.source === 'community'
              ? 'bg-blue-500/[0.14] text-blue-200/90'
              : 'bg-white/[0.06] text-white/35'
          }`}>
            {course.source === 'community' ? 'Community' : 'Preset'}
          </span>
        </div>
        <p className="mt-1.5 text-[10.5px] text-white/35 truncate">
          {course.anonymous ? <EyeOff size={10} className="inline mr-1 -mt-px" /> : <UserRound size={10} className="inline mr-1 -mt-px" />}
          {course.author} · {meta}
        </p>
      </div>
      <button
        type="button"
        onClick={onEnroll}
        disabled={enrolling}
        aria-label={`Add ${course.title} to my curricula`}
        className="shrink-0 inline-flex min-w-[66px] items-center justify-center gap-1.5 rounded-lg border border-blue-500 bg-blue-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:border-blue-400 hover:bg-blue-400 disabled:opacity-40 transition-colors"
      >
        {enrolling ? <InlineProgress active /> : <><Download size={12} /> Add</>}
      </button>
    </div>
  );
}
