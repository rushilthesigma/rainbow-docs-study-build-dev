#!/usr/bin/env node
// scripts/generatePresetBlocks.js
// Generates lesson blocks for every preset (PAUSD) curriculum lesson and
// writes the results to data/presetLessonBlocks.json.  Run this once
// (or re-run whenever you add lessons to the catalog) - the server then
// copies these static blocks into each student's lesson at enroll time.
//
// Usage:  node scripts/generatePresetBlocks.js
// Resume: the script skips lessons that are already in the output file,
//         so you can safely re-run after a partial failure.

import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PAUSD_CATALOG } from '../data/pausdCurricula.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

// ── Model names (must match server.js) ────────────────────────────────────
const GEMINI_FLASH = 'gemini-3.5-flash';
const GEMINI_PRO   = 'gemini-3.1-pro-preview';

const LESSON_BLOCK_COUNT = {
  beginner: 5, intermediate: 7, advanced: 10, expert: 14,
};

// ── Gemini client ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ── JSON parsing (copied from server.js) ──────────────────────────────────
function parseAIJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const defenced = trimmed
    .replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    .replace(/^json\s*\n/i, '').trim();
  try { return JSON.parse(defenced); } catch {}
  function repair(s) {
    return s
      .replace(/(^|\s)\/\/[^\n]*/g, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/[""]/g, '"').replace(/['']/g, "'")
      .replace(/,(\s*[}\]])/g, '$1').replace(/−/g, '-');
  }
  try { return JSON.parse(repair(defenced)); } catch {}
  for (const opener of ['{', '[']) {
    const closer = opener === '{' ? '}' : ']';
    const start = defenced.indexOf(opener);
    if (start < 0) continue;
    let depth = 0, inStr = false, escape = false;
    for (let i = start; i < defenced.length; i++) {
      const c = defenced[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inStr) { escape = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === opener) depth++;
      else if (c === closer) {
        depth--;
        if (depth === 0) {
          const candidate = defenced.slice(start, i + 1);
          try { return JSON.parse(candidate); } catch {}
          try { return JSON.parse(repair(candidate)); } catch {}
          break;
        }
      }
    }
  }
  return null;
}

// ── Block validation (copied from server.js) ──────────────────────────────
function isUsableBlock(b) {
  if (!b || typeof b !== 'object' || !b.type) return false;
  const has = v => typeof v === 'string' && v.trim().length > 0;
  const arr = v => Array.isArray(v) && v.length > 0;
  switch (b.type) {
    case 'reading':    return has(b.content);
    case 'quiz':       return arr(b.questions);
    case 'example':    return has(b.problem) || arr(b.steps);
    case 'recap':      return arr(b.bullets);
    case 'challenge':  return has(b.prompt);
    case 'open':       return has(b.prompt);
    case 'discussion': return has(b.prompt) || arr(b.talkingPoints);
    case 'matching':   return arr(b.pairs);
    case 'fill-blank': return arr(b.sentences);
    default:           return has(b.content) || has(b.prompt) || arr(b.questions);
  }
}

// ── Block stamper (copied from server.js) ─────────────────────────────────
// Uses a placeholder id; enrollment re-stamps with the real lesson id.
function stampBlock(b, i) {
  const blockId = `__preset__-b${i}`;
  const typeLabel = {
    reading: 'Reading', quiz: 'Quiz', example: 'Worked Example',
    recap: 'Recap', application: 'In the Wild', challenge: 'Challenge',
    open: 'Open Answer', discussion: 'Discussion', matching: 'Matching',
    'fill-blank': 'Fill in the Blank',
  }[b.type] || 'Step';
  const base = {
    id: blockId, type: b.type,
    title: b.title || `${typeLabel} ${i + 1}`,
    completedAt: null,
  };
  if (b.type === 'reading' || b.type === 'application') {
    return { ...base, content: String(b.content || '') };
  }
  if (b.type === 'quiz') {
    const questions = (Array.isArray(b.questions) ? b.questions : []).map((q, qi) => ({
      id: `${blockId}-q${qi}`,
      prompt: String(q.prompt || ''),
      choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
      answer: String(q.answer || ''),
      explanation: String(q.explanation || ''),
    }));
    return { ...base, questions, score: null, responses: null };
  }
  if (b.type === 'example') {
    return {
      ...base,
      problem: String(b.problem || ''),
      steps: (Array.isArray(b.steps) ? b.steps : []).map(s => ({ label: String(s?.label || ''), text: String(s?.text || '') })),
      tryThis: String(b.tryThis || ''),
    };
  }
  if (b.type === 'recap') {
    return { ...base, bullets: (Array.isArray(b.bullets) ? b.bullets : []).map(String) };
  }
  if (b.type === 'challenge') {
    return { ...base, prompt: String(b.prompt || ''), hint: String(b.hint || ''), solution: String(b.solution || '') };
  }
  if (b.type === 'open') {
    return {
      ...base,
      prompt: String(b.prompt || ''),
      minWords: Math.max(20, Math.min(200, Number(b.minWords) || 50)),
      rubric: (Array.isArray(b.rubric) ? b.rubric : []).map(r => ({
        label: String(r?.label || ''), criterion: String(r?.criterion || ''),
        weight: Math.max(1, Math.min(5, Number(r?.weight) || 1)),
      })),
      submission: null, score: null,
    };
  }
  if (b.type === 'discussion') {
    return { ...base, prompt: String(b.prompt || ''), talkingPoints: (Array.isArray(b.talkingPoints) ? b.talkingPoints : []).map(String) };
  }
  if (b.type === 'matching') {
    return { ...base, instructions: String(b.instructions || ''), pairs: (Array.isArray(b.pairs) ? b.pairs : []).map(p => ({ term: String(p?.term || ''), definition: String(p?.definition || '') })) };
  }
  if (b.type === 'fill-blank') {
    return {
      ...base,
      instructions: String(b.instructions || ''),
      sentences: (Array.isArray(b.sentences) ? b.sentences : []).map(s => ({
        before: String(s?.before || ''), answer: String(s?.answer || ''),
        after: String(s?.after || ''), hint: String(s?.hint || ''),
      })),
    };
  }
  return { ...base, content: String(b.content || b.prompt || '') };
}

// ── Prompt builder (copied from server.js) ────────────────────────────────
function buildVariedLessonPrompt({ title, contextLines = [], difficulty, blockCount }) {
  const middleCount = blockCount - 2;
  const sys = `You generate one complete lesson as ${blockCount} blocks. You pick the right MIX of block types for the topic - see the schema. Output ONLY valid JSON - no markdown, no fences, no commentary.`;
  const context = contextLines.filter(Boolean).join('\n');
  const prompt = `Build ${title}.
${context ? context + '\n' : ''}Difficulty: ${difficulty}.

EXACTLY ${blockCount} blocks total (this length is set by the difficulty - do not deviate). You decide the type of each MIDDLE block based on what best serves this topic. Pick a varied, motivated mix - not all the same type.

FIXED slots:
  Slot 1:  "reading"  - Core definition + framing of the topic. The simplest correct mental model. 350-500 words of markdown.
  Slot ${blockCount}: "reading"  - Synthesis + edge cases. Surface 1-2 lingering subtleties. 350-500 words.

MIDDLE slots (slots 2 through ${blockCount - 1}, ${middleCount} blocks total) - pick from these types:
  • "reading"     - A second teaching pass (mechanics, examples). 350-500 words of markdown.
  • "quiz"        - 3 multiple-choice questions on what's been read so far.
  • "example"     - A WORKED EXAMPLE. One concrete problem the student would face, broken into 3-5 numbered solution steps the student can reveal one at a time, then a short "now you try" prompt.
  • "recap"       - A CONCEPT RECAP. 4-6 tight bullet points summarising what's been covered so far.
  • "application" - A REAL-WORLD APPLICATION. 200-300 words of markdown showing where this concept shows up.
  • "challenge"   - A STRETCH PROBLEM. A harder, non-obvious question with a hint and a full solution.
  • "open"        - An OPEN-ANSWER prompt. A short question the student must answer in their own words (40-150 words). MUST include a 2-3 item rubric - each item is { label, criterion (one sentence describing what an A-grade response shows), weight (1-3) }.
  • "discussion"  - AN AI DISCUSSION. The student chats back-and-forth with an AI tutor about what they just learned. Give a thoughtful opening question + 3-5 specific talking points the AI should hit across the conversation.
  • "matching"    - A MATCHING MINIGAME. 5-7 pairs of terms and their definitions/examples the student matches by clicking. Great for vocabulary, formula↔meaning, or cause↔effect drills.
  • "fill-blank"  - A FILL-IN-THE-BLANK exercise. 4-6 sentences with one key word/phrase omitted. The student types the missing piece. Good for keyword recall after a reading.

RULES for the middle ${middleCount} blocks:
  • Include AT LEAST 2 "quiz" blocks.
  • Include AT LEAST ${middleCount >= 5 ? 3 : 2} NON-quiz, NON-reading types - mix freely from {example, recap, application, challenge, open, discussion, matching, fill-blank}.
  • Include AT LEAST 1 "open" OR "discussion" block so the student has to express their understanding in their own words.
  • For lessons of ${middleCount >= 4 ? '4+' : 'any'} middle blocks, include AT LEAST 1 INTERACTIVE type - pick from {matching, fill-blank, discussion} - so the lesson isn't just read-and-quiz.
  • A "quiz" or "open" must follow material it can test - never put a checkpoint before the relevant teaching content.
  • A "recap" comes AFTER at least one reading or example.
  • A "discussion" should usually be near the end - it's most useful when the student has something to discuss.
  • "matching" and "fill-blank" work best right after the reading that introduces the terms they test.
  • Sequence the blocks so the lesson flows naturally for a student new to the topic.

SHAPES - each block's fields by type:
  reading:     {"type":"reading","title":"...","content":"<markdown>"}
  quiz:        {"type":"quiz","title":"...","questions":[{"prompt":"...","choices":["...","...","...","..."],"answer":"<exact text of correct choice>","explanation":"<1-2 sentences>"}, ...3 total...]}
  example:     {"type":"example","title":"...","problem":"<markdown problem statement>","steps":[{"label":"Step name","text":"<markdown>"}, ...3-5 total...],"tryThis":"<short prompt for student to try a variant>"}
  recap:       {"type":"recap","title":"...","bullets":["...","...","...","..."]}
  application: {"type":"application","title":"...","content":"<200-300 words of markdown>"}
  challenge:   {"type":"challenge","title":"...","prompt":"<markdown problem>","hint":"<1-2 sentences nudging without solving>","solution":"<markdown explanation>"}
  open:        {"type":"open","title":"...","prompt":"<question>","minWords":<40-150>,"rubric":[{"label":"...","criterion":"...","weight":<1-3>},...2-3 total...]}
  discussion:  {"type":"discussion","title":"...","prompt":"<opening question>","talkingPoints":["...","...","..."]}
  matching:    {"type":"matching","title":"...","instructions":"...","pairs":[{"term":"...","definition":"..."},...5-7 total...]}
  fill-blank:  {"type":"fill-blank","title":"...","instructions":"...","sentences":[{"before":"...","answer":"...","after":"...","hint":"..."},...4-6 total...]}

OUTPUT FORMAT - a single JSON object:
{
  "blocks": [ ...${blockCount} block objects... ]
}`;
  return { sys, prompt };
}

// ── Gemini call ────────────────────────────────────────────────────────────
async function callGeminiDirect(sys, prompt, model, maxTokens) {
  const m = genAI.getGenerativeModel({
    model,
    systemInstruction: { role: 'system', parts: [{ text: sys }] },
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.6,
      responseMimeType: 'application/json',
    },
  });
  const result = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
  return result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateBlocks(course, unit, lesson) {
  const difficulty = course.difficulty || 'advanced';
  const blockCount = LESSON_BLOCK_COUNT[difficulty] || LESSON_BLOCK_COUNT.advanced;
  const maxTokens  = blockCount >= 10 ? 12000 : 8192;
  const model      = blockCount >= 10 ? GEMINI_PRO : GEMINI_FLASH;

  const { sys, prompt } = buildVariedLessonPrompt({
    title: `the lesson "${lesson.title}" from the unit "${unit.title}" of the course "${course.title}"`,
    contextLines: [
      lesson.description ? `Lesson goal: ${lesson.description}` : '',
      course.description ? `Course context: ${course.description}` : '',
    ],
    difficulty,
    blockCount,
  });

  let best = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text   = await callGeminiDirect(sys, prompt, model, maxTokens);
      const parsed = parseAIJson(text);
      if (!parsed || !Array.isArray(parsed.blocks)) continue;
      const usable = parsed.blocks.filter(isUsableBlock);
      if (usable.length === blockCount) { best = usable; break; }
      if (!best || usable.length > best.length) best = usable;
    } catch (e) {
      console.error(`    attempt ${attempt + 1} error:`, e.message);
    }
  }
  if (!best || best.length < 3) return null;
  return best.map((b, i) => stampBlock(b, i));
}

// ── Concurrency helper ─────────────────────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────
const OUT_FILE = join(ROOT, 'presetBlocks.json');

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set');
    process.exit(1);
  }

  // Load existing progress so we can resume after a failure.
  let cache = {};
  if (existsSync(OUT_FILE)) {
    try { cache = JSON.parse(readFileSync(OUT_FILE, 'utf-8')); } catch {}
  }

  // Collect all lessons that still need blocks.
  const todo = [];
  for (const course of PAUSD_CATALOG) {
    for (let ui = 0; ui < (course.units || []).length; ui++) {
      const unit = course.units[ui];
      for (let li = 0; li < (unit.lessons || []).length; li++) {
        const lesson = unit.lessons[li];
        if (lesson.type && lesson.type !== 'lesson') continue; // skip math_tutor / practice
        const key = `${course.slug}:${lesson.title}`;
        if (cache[key]) continue; // already done
        todo.push({ course, unit, lesson, key });
      }
    }
  }

  const total    = Object.keys(cache).length + todo.length;
  const done     = Object.keys(cache).length;
  console.log(`${done} already generated, ${todo.length} remaining (${total} total)`);
  if (todo.length === 0) { console.log('All done!'); return; }

  let completed = done;
  let failed    = 0;
  const CONCURRENCY = 8;

  const tasks = todo.map(({ course, unit, lesson, key }) => async () => {
    process.stdout.write(`  [${completed + 1}/${total}] ${key} ... `);
    const blocks = await generateBlocks(course, unit, lesson);
    if (blocks) {
      cache[key] = blocks;
      completed++;
      // Save after every lesson so progress is never lost.
      writeFileSync(OUT_FILE, JSON.stringify(cache, null, 2));
      console.log(`✓ (${blocks.length} blocks)`);
    } else {
      failed++;
      console.log('✗ FAILED');
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  console.log(`\nDone. ${completed} generated, ${failed} failed.`);
  if (failed > 0) {
    console.log('Re-run the script to retry failed lessons.');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
