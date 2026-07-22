#!/usr/bin/env node
// Generates full-length "History of <country>" preset notes for every country
// in the maintained geography catalog and writes resumable generated data to:
//   data/countryHistoryNotes/countryHistoryNotesGenerated.json
//   data/countryHistoryNotes/countryHistoryNotesGenerated.js
//
// Usage:  node scripts/generateCountryHistoryNotes.js [--model=<gemini model id>]
// Resume: already-generated slugs are skipped, so re-run after a partial failure.


import dotenv from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { COUNTRY_GEO_NOTES } from '../data/countryGeoNotes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env') });

const GEMINI_FLASH = 'gemini-3.6-flash';
const PROVIDER = process.argv.find(arg => arg.startsWith('--provider='))?.slice('--provider='.length) || 'gemini';
const MODEL_ID = process.argv.find(arg => arg.startsWith('--model='))?.slice('--model='.length)
  || (PROVIDER === 'openai' ? 'gpt-5.4-mini' : GEMINI_FLASH);
const JSON_PATH = join(ROOT, 'data', 'countryHistoryNotes', 'countryHistoryNotesGenerated.json');
const JS_PATH = join(ROOT, 'data', 'countryHistoryNotes', 'countryHistoryNotesGenerated.js');
const CONCURRENCY = 8;

if (PROVIDER !== 'gemini' && PROVIDER !== 'openai') {
  console.error('Provider must be "gemini" or "openai"');
  process.exit(1);
}
if (PROVIDER === 'gemini' && !process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}
if (PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

const genAI = PROVIDER === 'gemini' ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const geminiModel = genAI?.getGenerativeModel({
  model: MODEL_ID,
  generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
});
const openai = PROVIDER === 'openai' ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function parseAIJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const defenced = trimmed
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  try { return JSON.parse(defenced); } catch {}
  return null;
}

function buildPrompt({ country, region, subregion }) {
  return `You are writing a preset study note for a history study app used by secondary-school students preparing for history courses and quiz bowl. Write a compact but substantive history of ${country}, in ${subregion}, ${region}.

Return strict JSON with exactly these keys:
{
  "cues": [six to eight short Cornell-style recall questions about the country's history],
  "mainNotes": "markdown string",
  "summary": "two to three sentence plain-text summary"
}

Requirements for mainNotes:
- 600 to 850 words of factual content in markdown.
- Use exactly these H2 sections in this order: "## Foundations and early societies", "## States, empires, and outside powers", "## Formation of the modern state", "## Twentieth century", "## Recent history", "## Key dates".
- Adapt each section to the country. Do not falsely imply that every country was colonized, independent in antiquity, or governed as one continuous state.
- Begin with the peoples, settlements, kingdoms, or political systems that preceded the modern country. Explain colonial rule, imperial influence, migration, or regional unions when relevant.
- Explain how the present state and borders formed, including independence, unification, partition, constitutional change, or dissolution of a larger state as applicable.
- Cover major political, social, and economic turning points, important conflicts, democratization or authoritarian periods, and changes in international alignment.
- Keep "Recent history" focused on durable developments through the early 2020s. Do not name a current officeholder or make claims that depend on today's news.
- "## Key dates" must be a chronological bullet list of six to ten dates or date ranges, each followed by a one-sentence event description.
- Use precise dates where well established. If dates are debated, say "around" or briefly note the uncertainty.
- Use neutral language for disputed borders, sovereignty, civil conflict, ethnic identity, and colonial legacies. Distinguish the history of the territory from the history of the present-day state.
- Plain, factual, encyclopedic tone. No hype words, rhetorical questions, second person, citations, or em dashes.
- Do not include a title heading; the app supplies the title "History of ${country}".

Requirements for cues: questions must be answerable directly from the note and should span multiple eras rather than cluster around independence.

Requirements for summary: two to three sentences that identify the most important long-term arc and modern turning points. No markdown.`;
}

function isUsable(note) {
  const requiredSections = [
    '## Foundations and early societies',
    '## States, empires, and outside powers',
    '## Formation of the modern state',
    '## Twentieth century',
    '## Recent history',
    '## Key dates',
  ];
  return note
    && Array.isArray(note.cues) && note.cues.length >= 6
    && note.cues.every(cue => typeof cue === 'string' && cue.trim())
    && typeof note.mainNotes === 'string' && note.mainNotes.length > 2200
    && requiredSections.every(section => note.mainNotes.includes(section))
    && typeof note.summary === 'string' && note.summary.trim().length > 100;
}

function loadState() {
  if (!existsSync(JSON_PATH)) return {};
  try { return JSON.parse(readFileSync(JSON_PATH, 'utf8')); } catch { return {}; }
}

function saveState(state) {
  writeFileSync(JSON_PATH, `${JSON.stringify(state, null, 2)}\n`);
  const body = [
    '// AUTO-GENERATED by scripts/generateCountryHistoryNotes.js. Do not edit by hand;',
    '// Re-run the script instead. Each note records its generating model.',
    `export const GENERATED_COUNTRY_HISTORY_NOTES = ${JSON.stringify(state, null, 2)};`,
    '',
  ].join('\n');
  writeFileSync(JS_PATH, body);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function generateOne(item) {
  const delays = [2000, 8000, 20000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const prompt = buildPrompt(item);
      let text;
      if (PROVIDER === 'openai') {
        const result = await openai.chat.completions.create({
          model: MODEL_ID,
          max_completion_tokens: 5000,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        });
        text = result.choices?.[0]?.message?.content || '';
      } else {
        const result = await geminiModel.generateContent(prompt);
        text = result.response.text();
      }
      const note = parseAIJson(text);
      if (!isUsable(note)) throw new Error('response failed validation');
      return {
        cues: note.cues.map(cue => String(cue).trim()).slice(0, 8),
        mainNotes: String(note.mainNotes).trim(),
        summary: String(note.summary).trim(),
        model: MODEL_ID,
      };
    } catch (err) {
      const message = err?.message || String(err);
      if (attempt === delays.length) throw new Error(message);
      console.warn(`  retry ${attempt + 1} for ${item.country}: ${message.slice(0, 140)}`);
      await sleep(delays[attempt]);
    }
  }
}

async function main() {
  const queue = COUNTRY_GEO_NOTES
    .filter(note => note.category !== 'geo-subdivision')
    .map(note => ({
      slug: `history-${note.slug}`,
      country: note.country,
      region: note.region,
      subregion: note.subregion,
    }));
  const state = loadState();
  const pending = queue.filter(item => !state[item.slug]);
  console.log(`${queue.length} countries total, ${queue.length - pending.length} already generated, ${pending.length} to go.`);
  if (!pending.length) { saveState(state); return; }

  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const item = pending[cursor++];
      try {
        state[item.slug] = await generateOne(item);
        done++;
        saveState(state);
        console.log(`[${done + failed}/${pending.length}] ok  ${item.country}`);
      } catch (err) {
        failed++;
        console.error(`[${done + failed}/${pending.length}] FAIL ${item.country}: ${err.message.slice(0, 160)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveState(state);
  console.log(`Done. ${done} generated, ${failed} failed. Re-run the script to retry failures.`);
  if (failed) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
