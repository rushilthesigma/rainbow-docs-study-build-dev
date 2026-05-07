import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import Stripe from 'stripe';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pdfParse = _require('pdf-parse');
import {
  buildCurriculumPrompt, buildLessonPrompt, buildLessonChatPrompt,
  buildStandaloneLessonPrompt, buildMathTutorPrompt,
  buildStudyModePrompt, buildGoalMilestonesPrompt, buildAssessmentPrompt,
  buildFlashcardPrompt, buildCueGenerationPrompt, buildSummaryPrompt,
  buildTopicSuggestionsPrompt, buildSlideshowPrompt,
} from './prompts.js';
import { PAUSD_CATALOG, getPausdTemplate, listPausdCatalog } from './data/pausdCurricula.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3002;

// ===== Google Gemini =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// As of 2026-04 the 3.x family is exposed as `-preview` variants.
// Three tiers, all 1M-token input context. Pro/Flash use the Gemini 3
// preview line; Flash Lite uses the GA 2.5-flash-lite (no Gemini-3 lite
// SKU exists yet, so falling back to the most-current GA Lite model
// avoids 404s on model resolution).
//   Pro        — gemini-3.1-pro-preview     (deepest reasoning, slowest)
//   Flash      — gemini-3-flash-preview     (balanced)
//   Flash Lite — gemini-2.5-flash-lite      (fastest + cheapest, GA)
const GEMINI_PRO        = 'gemini-3.1-pro-preview';
const GEMINI_FLASH      = 'gemini-3-flash-preview';
const GEMINI_FLASH_LITE = 'gemini-2.5-flash-lite';
const DEFAULT_MODEL = GEMINI_PRO;
const FALLBACK_MODEL = GEMINI_FLASH;
const resolveModel = (name) => name || DEFAULT_MODEL;
// Cascade: Pro → Flash → Flash Lite (each fallback step trades quality for
// availability + cost). Flash Lite has no further fallback.
const fallbackFor = (name) => {
  if (name === GEMINI_PRO) return GEMINI_FLASH;
  if (name === GEMINI_FLASH) return GEMINI_FLASH_LITE;
  return GEMINI_FLASH_LITE;
};
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY is not set — AI calls will fail');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Data storage — try multiple locations until one works
const IS_RENDER = !!process.env.RENDER;
const CANDIDATE_DIRS = [
  process.env.DATA_DIR,
  '/data',
  '/opt/render/project/data',
  '/opt/render/project/src/data',
  '/tmp/covalent-data',
  __dirname,
].filter(Boolean);

let DATA_DIR = __dirname;
for (const dir of CANDIDATE_DIRS) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.write-test'), Date.now().toString());
    // Verify it actually persisted
    const readBack = readFileSync(join(dir, '.write-test'), 'utf-8');
    if (readBack) { DATA_DIR = dir; break; }
  } catch {}
}

console.log(`=== COVALENT STARTUP ===`);
console.log(`Data directory: ${DATA_DIR}`);
console.log(`Render: ${IS_RENDER}`);
console.log(`Tried: ${CANDIDATE_DIRS.join(', ')}`);
const USERS_FILE = join(DATA_DIR, 'users.json');

function loadUsers() {
  try {
    if (existsSync(USERS_FILE)) return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) { console.error('Error loading users:', e); }
  return {};
}

function saveUsers(users) {
  try {
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('FAILED to save users to', USERS_FILE, e.message);
    // Fallback to __dirname
    try { writeFileSync(join(__dirname, 'users.json'), JSON.stringify(users, null, 2)); console.log('Saved users to fallback location'); } catch {}
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Session storage — embedded in users.json for single-file persistence
// Also kept in memory for fast lookups, synced to disk on every change
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json');
function loadSessions() {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
      console.log(`Loaded ${Object.keys(data).length} sessions from ${SESSIONS_FILE}`);
      return data;
    }
  } catch (e) { console.error('Error loading sessions:', e.message); }
  return {};
}
function saveSessions() {
  try {
    writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  } catch (e) {
    console.error('FAILED to save sessions:', e.message);
    // Fallback: try saving to __dirname if DATA_DIR fails
    try { writeFileSync(join(__dirname, 'sessions.json'), JSON.stringify(sessions, null, 2)); } catch {}
  }
}
const sessions = loadSessions();
console.log(`Active sessions: ${Object.keys(sessions).length}`);

const OWNER_EMAILS = ['rushilkelapure@gmail.com'];
function isOwner(email) {
  return OWNER_EMAILS.includes(email?.toLowerCase());
}

// Advisors: auto-Pro, get a red "Advisor" badge in UIs, and can see
// beta/early-access features (flagged in /api/auth/me as isBeta:true).
const ADVISOR_EMAILS = ['william.qiao.yang@gmail.com'];
function isAdvisor(email) {
  return ADVISOR_EMAILS.includes((email || '').toLowerCase());
}
function canSeeBeta(email) {
  return isOwner(email) || isAdvisor(email);
}

// ===== Stripe =====
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// ===== Plan / limits =====
const FREE_DAILY_MESSAGE_LIMIT = 20;
const FREE_DAILY_QUIZBOWL_GAMES = 2;
const FREE_WEEKLY_CURRICULA = 1;
const FREE_WEEKLY_DEBATES = 1;
const MODEL_PRO       = GEMINI_PRO;
const MODEL_FREE      = GEMINI_FLASH;
const MODEL_FLASH_LITE = GEMINI_FLASH_LITE;

function todayKey() { return new Date().toISOString().slice(0, 10); }
// ISO year-week (Mon-start) for weekly buckets, e.g. "2026-W16"
function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Every authenticated user is Pro. The paid-tier gates have been removed
// from the product — we keep the function so the 100+ call sites that use
// `getPlan` / `isPro` / `modelForUser` still work without edits, they just
// always see "pro" now. Owner/advisor email checks live separately (for
// admin surfaces) and are unaffected.
function getPlan(/* user, email */) { return 'pro'; }
function isPro(/* user, email */) { return true; }
// Three tiers selectable via preferences.modelTier:
//   'pro'        → gemini-3.1-pro-preview         (default — deepest reasoning)
//   'flash'      → gemini-3-flash-preview         (balanced — faster, lower cost)
//   'flash-lite' → gemini-3-flash-lite-preview    (fastest + cheapest)
// Free users always get FREE (Flash) regardless of preference.
function modelForUser(user, email) {
  if (!isPro(user, email)) return MODEL_FREE;
  const tier = user?.data?.preferences?.modelTier;
  if (tier === 'flash-lite') return MODEL_FLASH_LITE;
  if (tier === 'flash')      return MODEL_FREE;
  return MODEL_PRO;
}

// Reset daily counters when the day rolls over, weekly counters on ISO week change
function ensureUsageBucket(user) {
  const today = todayKey();
  const week = weekKey();
  if (!user.data.usage) user.data.usage = { day: null, messages: 0, quizBowlGames: 0 };
  if (user.data.usage.day !== today) {
    user.data.usage.day = today;
    user.data.usage.messages = 0;
    user.data.usage.quizBowlGames = 0;
  }
  if (user.data.usage.week !== week) {
    user.data.usage.week = week;
    user.data.usage.curricula = 0;
    user.data.usage.debates = 0;
  }
}

// Returns { allowed: boolean, remaining: number, limit: number, plan }.
// Mutates usage on allowed=true (caller must saveUsers).
// `cost` is how many messages this request counts as (2 for sourced).
function consumeMessage(users, email, cost = 1) {
  const u = users[email];
  if (!u) return { allowed: false, remaining: 0, limit: 0, plan: 'free' };
  const plan = getPlan(u, email);
  if (plan === 'pro') return { allowed: true, remaining: Infinity, limit: Infinity, plan };
  ensureUsageBucket(u);
  if (u.data.usage.messages + cost > FREE_DAILY_MESSAGE_LIMIT) {
    return { allowed: false, remaining: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - u.data.usage.messages), limit: FREE_DAILY_MESSAGE_LIMIT, plan };
  }
  u.data.usage.messages += cost;
  return { allowed: true, remaining: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - u.data.usage.messages), limit: FREE_DAILY_MESSAGE_LIMIT, plan, cost };
}
function consumeQuizBowlGame(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  if (getPlan(u, email) === 'pro') return { allowed: true, remaining: Infinity, limit: Infinity };
  ensureUsageBucket(u);
  if (u.data.usage.quizBowlGames >= FREE_DAILY_QUIZBOWL_GAMES) {
    return { allowed: false, remaining: 0, limit: FREE_DAILY_QUIZBOWL_GAMES };
  }
  u.data.usage.quizBowlGames++;
  return { allowed: true, remaining: Math.max(0, FREE_DAILY_QUIZBOWL_GAMES - u.data.usage.quizBowlGames), limit: FREE_DAILY_QUIZBOWL_GAMES };
}
// Weekly buckets — curricula / debates
function consumeCurriculumGeneration(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  if (getPlan(u, email) === 'pro') return { allowed: true, remaining: Infinity, limit: Infinity };
  ensureUsageBucket(u);
  if ((u.data.usage.curricula || 0) >= FREE_WEEKLY_CURRICULA) {
    return { allowed: false, remaining: 0, limit: FREE_WEEKLY_CURRICULA };
  }
  u.data.usage.curricula = (u.data.usage.curricula || 0) + 1;
  return { allowed: true, remaining: Math.max(0, FREE_WEEKLY_CURRICULA - u.data.usage.curricula), limit: FREE_WEEKLY_CURRICULA };
}
function consumeDebate(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  if (getPlan(u, email) === 'pro') return { allowed: true, remaining: Infinity, limit: Infinity };
  ensureUsageBucket(u);
  if ((u.data.usage.debates || 0) >= FREE_WEEKLY_DEBATES) {
    return { allowed: false, remaining: 0, limit: FREE_WEEKLY_DEBATES };
  }
  u.data.usage.debates = (u.data.usage.debates || 0) + 1;
  return { allowed: true, remaining: Math.max(0, FREE_WEEKLY_DEBATES - u.data.usage.debates), limit: FREE_WEEKLY_DEBATES };
}

// ===== MIDDLEWARE =====
app.use(cors());
// Stripe webhook MUST read the raw body for signature verification.
// Mount it BEFORE express.json() or the signature check will fail.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'dist')));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') ?? req.headers.Authorization?.replace('Bearer ', '');
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.userId = sessions[token].id;
  req.userEmail = sessions[token].email;
  req.isOwner = isOwner(req.userEmail);
  // Check if banned
  const users = loadUsers();
  const userEmail = findEmailById(users, req.userId);
  if (userEmail && users[userEmail]?.banned) {
    return res.status(403).json({ error: 'Account suspended' });
  }
  next();
}

function findUserByIdFromUsers(users, id) {
  return Object.values(users).find(u => u.id === id);
}

function findEmailById(users, id) {
  return Object.keys(users).find(e => users[e].id === id);
}

// Spaced repetition intervals in ms: now, 1h, 6h, 1d, 3d, 1w, 2w, 1mo
const SR_INTERVALS = [0, 3600000, 21600000, 86400000, 259200000, 604800000, 1209600000, 2592000000];

// Default data for new users
function createDefaultData() {
  return {
    curricula: [],
    studyStreaks: { lastActiveDate: null, currentStreak: 0, longestStreak: 0, weeklyActivity: {} },
    dailyLog: {},
    preferences: {
      defaultDifficulty: 'beginner',
      defaultTone: 'encouraging',
      defaultStyle: 'conceptual',
      defaultLength: 'medium',
      includeExamples: true,
      includeExercises: true,
      rigor: 'standard',
      lessonTempo: 'normal',
      aiPersonality: 'friendly',
      fluffLevel: 'normal',
      customInstructions: '',
      // ----- UI prefs (moved off localStorage) -----
      theme: 'dark',
      wallpaper: 'lavender',
      dockSize: 'medium',
      iconStyle: 'gradient',
      dockPosition: 'bottom',
      onboarded: false,
      tourStep: null,
    },
    profile: { level: 1, xp: 0, xpToNextLevel: 100, strengths: [], weaknesses: [], topicScores: {} },
    goals: [],
    flashcardDecks: [],
    notes: [],
    studySessions: [],
    assessmentHistory: [],
    lessons: [],
    slideshows: [],               // AI-generated slide decks


    // ----- Billing / plan state -----
    plan: 'free',                 // 'free' | 'pro'
    proUntil: null,               // ISO string or null — when paid sub expires; null = untimed (admin grant / owner)
    proGrantedBy: null,           // 'owner' | 'stripe' | null
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    // Usage counters — reset by helper when the date / week changes
    usage: { day: null, messages: 0, quizBowlGames: 0, week: null, curricula: 0, debates: 0 },
  };
}

// Migrate existing user data to include new fields
function migrateUserData(data) {
  if (!data) return createDefaultData();
  const defaults = createDefaultData();
  // Backfill top-level sections
  for (const key of Object.keys(defaults)) {
    if (data[key] === undefined) data[key] = defaults[key];
  }
  // Backfill preferences
  if (data.preferences) {
    for (const key of Object.keys(defaults.preferences)) {
      if (data.preferences[key] === undefined) data.preferences[key] = defaults.preferences[key];
    }
  }
  // Migrate old top-level fields into preferences
  if (data.customInstructions !== undefined && !data.preferences.customInstructions) {
    data.preferences.customInstructions = data.customInstructions;
  }
  if (data.aiPersonality !== undefined && data.preferences.aiPersonality === 'friendly') {
    data.preferences.aiPersonality = data.aiPersonality;
  }
  // Clean phantom curricula from old RushilAI app — remove any without valid units/lessons structure
  if (data.curricula?.length) {
    data.curricula = data.curricula.filter(c => {
      // Must have units array with at least one unit that has lessons
      if (!c.units || !Array.isArray(c.units) || c.units.length === 0) return false;
      // Must have an id and title
      if (!c.id || !c.title) return false;
      // Units must have lessons arrays (old app had different format)
      const hasValidUnit = c.units.some(u => Array.isArray(u.lessons) && u.lessons.length > 0);
      return hasValidUnit;
    });
    // Retroactively unlock any previously-locked units — students can jump
    // ahead to any lesson at will now.
    for (const c of data.curricula) {
      for (const unit of (c.units || [])) {
        if (unit.locked) unit.locked = false;
      }
    }
  }
  return data;
}

// Check if any goal milestones should be auto-completed based on profile
function checkGoalMilestones(data) {
  if (!data?.goals?.length || !data?.profile?.topicScores) return;
  const scores = data.profile.topicScores;
  const strengths = data.profile.strengths || [];

  for (const goal of data.goals) {
    if (goal.status !== 'active') continue;
    for (const milestone of goal.milestones || []) {
      if (milestone.isCompleted) continue;
      // Extract keywords from milestone title
      const words = milestone.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      // Check against topic scores
      for (const [topic, info] of Object.entries(scores)) {
        if (info.score >= 80) {
          const topicWords = topic.split('-');
          const match = words.some(w => topicWords.some(tw => tw.includes(w) || w.includes(tw)));
          if (match) {
            milestone.isCompleted = true;
            milestone.completedAt = new Date().toISOString();
            milestone.completedVia = 'profile';
            break;
          }
        }
      }
      // Also check strengths
      if (!milestone.isCompleted) {
        for (const s of strengths) {
          const sWords = s.split('-');
          const match = words.some(w => sWords.some(sw => sw.includes(w) || w.includes(sw)));
          if (match) {
            milestone.isCompleted = true;
            milestone.completedAt = new Date().toISOString();
            milestone.completedVia = 'profile';
            break;
          }
        }
      }
    }
    // Update goal progress
    const total = (goal.milestones || []).length;
    const done = (goal.milestones || []).filter(m => m.isCompleted).length;
    goal.progress = total > 0 ? Math.round((done / total) * 100) : 0;
    if (goal.progress === 100) goal.status = 'completed';
  }
}

// Robust JSON parser with multiple fallback strategies.
//
// Gemini failure modes this handles:
//   1. Strict JSON (responseMimeType=application/json) — direct parse.
//   2. Markdown-fenced JSON: ```json\n{...}\n```
//   3. Leading `json` label without fences.
//   4. Prose preamble before the JSON body.
//   5. Trailing commas before } / ].
//   6. Smart / curly quotes (" " ' ') instead of ASCII " '.
//   7. JS-style line comments (// ...) inside the JSON.
//   8. JS-style block comments (/* ... */).
//   9. Unicode minus / hyphen variants in numbers (− vs -).
//
// Walks the string to find the first BALANCED brace pair so prose around
// the JSON body doesn't break extraction.
function parseAIJson(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // Strategy 1: direct parse (happens when responseMimeType=application/json).
  try { return JSON.parse(trimmed); } catch {}

  // Strategy 2: strip ``` fences + leading "json" label.
  const defenced = trimmed
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/^json\s*\n/i, '')
    .trim();
  try { return JSON.parse(defenced); } catch {}

  // Repair helpers that we can layer onto a candidate.
  function repair(s) {
    return s
      // Strip line comments outside of strings (rough — relies on being a
      // single statement; sufficient for AI output that doesn't have
      // intentional `//` inside strings).
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
      // Strip block comments.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Smart quotes → ASCII.
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // Trailing commas before } or ].
      .replace(/,(\s*[}\]])/g, '$1')
      // Unicode minus → ASCII hyphen-minus.
      .replace(/−/g, '-');
  }

  try { return JSON.parse(repair(defenced)); } catch {}

  // Strategy 3: find the first balanced JSON object or array by walking
  // characters, tracking string state + brace depth.
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
          // Apply the repair pass and try again.
          try { return JSON.parse(repair(candidate)); } catch {}
          break;
        }
      }
    }
  }

  return null;
}

// ===== AUTH ROUTES =====

// Dev login (for testing without Google OAuth configured)
app.post('/api/auth/dev-login', (req, res) => {
  const { name, email } = req.body;
  const devEmail = email || 'dev@covalent.test';
  const devName = name || 'Dev User';

  const users = loadUsers();
  if (!users[devEmail]) {
    users[devEmail] = {
      id: crypto.randomUUID(),
      email: devEmail,
      name: devName,
      password: null,
      verified: true,
      createdAt: new Date().toISOString(),
      data: createDefaultData(),
    };
    saveUsers(users);
  }

  const token = generateToken();
  sessions[token] = { id: users[devEmail].id, email: devEmail };
  saveSessions();

  res.json({
    success: true,
    token,
    user: { id: users[devEmail].id, email: devEmail, name: users[devEmail].name, data: users[devEmail].data },
  });
});

// Google OAuth
app.post('/api/auth/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google Sign-In not configured' });
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid Google token' });

    const payload = await verifyRes.json();
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    const googleEmail = payload.email;
    const googleName = payload.name || payload.given_name || googleEmail.split('@')[0];
    if (!googleEmail) return res.status(400).json({ error: 'No email in Google token' });

    const users = loadUsers();

    if (users[googleEmail]) {
      const user = users[googleEmail];
      if (!user.verified) { user.verified = true; saveUsers(users); }
      const token = generateToken();
      sessions[token] = { id: user.id, email: googleEmail };
      saveSessions();
      return res.json({
        success: true,
        token,
        user: { id: user.id, email: googleEmail, name: user.name, data: user.data || {} },
      });
    }

    // New user
    const userId = crypto.randomUUID();
    users[googleEmail] = {
      id: userId,
      email: googleEmail,
      name: googleName,
      password: null,
      verified: true,
      googleAuth: true,
      createdAt: new Date().toISOString(),
      data: createDefaultData(),
    };
    saveUsers(users);

    const token = generateToken();
    sessions[token] = { id: userId, email: googleEmail };
    saveSessions();

    res.json({
      success: true,
      token,
      user: { id: userId, email: googleEmail, name: googleName, data: users[googleEmail].data },
    });
  } catch (e) {
    console.error('Google auth error:', e);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && sessions[token]) {
    delete sessions[token];
    saveSessions();
  }
  res.json({ success: true });
});

// Delete account
app.delete('/api/auth/account', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    delete users[email];
    saveUsers(users);
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) { delete sessions[token]; saveSessions(); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    // Migrate data on every read
    user.data = migrateUserData(user.data);

    // Track visits. /api/auth/me is the first call after sign-in and on every
    // subsequent page load, so we use it as the visit signal — debounced to
    // 30 min so a quick refresh doesn't inflate the number.
    const now = Date.now();
    const VISIT_DEBOUNCE_MS = 30 * 60 * 1000;
    user.data.visitCount = user.data.visitCount || 0;
    if (!user.data.lastVisitAt || now - new Date(user.data.lastVisitAt).getTime() > VISIT_DEBOUNCE_MS) {
      user.data.visitCount++;
      user.data.lastVisitAt = new Date(now).toISOString();
      user.data.firstVisitAt = user.data.firstVisitAt || user.data.lastVisitAt;
    }

    saveUsers(users);
    // Expose the *effective* plan (owner + advisor + time-decayed Pro) so the
    // client doesn't have to repeat the logic. Also surface role flags.
    const effectivePlan = getPlan(user, email);
    res.json({
      id: user.id,
      email: user.email || email,
      name: user.name,
      // Surface isDemo so the client can hard-refuse to render the
      // signed-in dashboard with a demo session — see ProtectedRoute
      // in src/App.jsx, which force-logs-out + redirects.
      isDemo: isDemoOrDevEmail(email),
      data: {
        ...user.data,
        effectivePlan,
        isOwner: isOwner(email),
        isAdvisor: isAdvisor(email),
        isBeta: canSeeBeta(email),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync user data
app.post('/api/auth/sync', authMiddleware, (req, res) => {
  try {
    const { data } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = { ...users[email].data, ...data };
    saveUsers(users);
    res.json({ success: true, data: users[email].data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== AI CHAT (generic) =====
// Convert Claude-style messages [{role:'user'|'assistant', content:'...', images?:[...]}]
// into Gemini's `contents` format. When a message carries `images`, each image
// is forwarded as inline_data so Gemini can see screenshots/photos alongside the prompt.
function messagesToGeminiContents(messages) {
  return (messages || []).map(m => {
    const parts = [];
    const imgs = Array.isArray(m.images) ? m.images : [];
    for (const img of imgs) {
      // Accept either `{ dataUrl, mimeType }` or `{ url: "data:...;base64,..." }`.
      const dataUrl = img?.dataUrl || img?.url || '';
      const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (match) {
        parts.push({ inlineData: { mimeType: img.mimeType || match[1], data: match[2] } });
      }
    }
    const text = String(m.content ?? '');
    if (text) parts.push({ text });
    if (!parts.length) parts.push({ text: '' });
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

function isInvalidModelError(errMsg = '') {
  const s = String(errMsg).toLowerCase();
  return s.includes('not found') || s.includes('invalid') || s.includes('unsupported')
    || s.includes('does not exist') || s.includes('unknown model');
}

function isRateLimitError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = err?.status || err?.code;
  return status === 429 || status === 503 || status >= 500 || msg.includes('rate limit') || msg.includes('resource_exhausted');
}

// Non-streaming helper. Returns the Claude-shaped envelope the rest of the
// codebase expects: { success: true, data: { content: [{ text }] }, model }.
// Pass opts.enableWebSearch=true to enable Google Search grounding (sources
// surfaced on data.sources for the caller to use).
async function callGemini(systemPrompt, messages, model, maxOutputTokens = 4096, opts = {}) {
  if (!genAI) return { success: false, error: 'GEMINI_API_KEY not configured', status: 500 };

  let currentModel = model || DEFAULT_MODEL;
  let lastError = null;

  // Grounding consumes a significant share of the token budget for "thinking"
  // and tool calls. Under ~2048 tokens we often get empty grounding metadata,
  // so floor sourced calls at 4096 regardless of what the caller requested.
  const effectiveMaxTokens = opts.enableWebSearch ? Math.max(maxOutputTokens, 4096) : maxOutputTokens;

  for (let attempt = 0; attempt < 3; attempt++) {
    const resolved = resolveModel(currentModel);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const m = genAI.getGenerativeModel({
        model: resolved,
        systemInstruction: systemPrompt ? { role: 'system', parts: [{ text: systemPrompt }] } : undefined,
        tools: opts.enableWebSearch ? [{ googleSearch: {} }] : undefined,
        generationConfig: {
          maxOutputTokens: effectiveMaxTokens,
          temperature: Number.isFinite(opts.temperature) ? opts.temperature : 0.7,
          // jsonMode: true forces Gemini to emit strictly valid JSON, no
          // prose, no markdown fences. Dramatically reduces parseAIJson
          // failures on structured outputs like slides.
          ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });

      const result = await m.generateContent(
        { contents: messagesToGeminiContents(messages) },
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      let text = result?.response?.text?.() ?? '';
      // Extract grounded source list + inject inline [n] markers to match
      // the streaming path's citation UX.
      const gm = result?.response?.candidates?.[0]?.groundingMetadata || {};
      const chunksMeta = gm.groundingChunks || [];
      const supports = gm.groundingSupports || [];
      const sources = [];
      const urlToIndex = new Map();

      // Append [n] markers to text: walk supports ordered by their segment
      // endIndex (a UTF-8 byte offset) and splice in markers from right to left.
      if (opts.enableWebSearch && supports.length) {
        const orderedSupports = [...supports].sort((a, b) => (a?.segment?.endIndex ?? 0) - (b?.segment?.endIndex ?? 0));
        for (const sup of orderedSupports) {
          for (const ci of (sup?.groundingChunkIndices || [])) {
            const ch = chunksMeta[ci];
            const url = ch?.web?.uri || ch?.retrievedContext?.uri;
            if (!url) continue;
            if (!urlToIndex.has(url)) {
              const idx = urlToIndex.size + 1;
              urlToIndex.set(url, idx);
              sources.push({ url, title: ch?.web?.title || ch?.retrievedContext?.title || url });
            }
          }
        }
        // Any URLs without matching supports — still surface them
        for (const ch of chunksMeta) {
          const url = ch?.web?.uri || ch?.retrievedContext?.uri;
          if (!url || urlToIndex.has(url)) continue;
          const idx = urlToIndex.size + 1;
          urlToIndex.set(url, idx);
          sources.push({ url, title: ch?.web?.title || ch?.retrievedContext?.title || url });
        }
        // Now build insertions: (byte endIndex → char index) + marker list.
        const utf8 = Buffer.from(text, 'utf-8');
        const byteToCharIndex = (byteIdx) => utf8.slice(0, Math.min(byteIdx, utf8.length)).toString('utf-8').length;
        const insertions = [];
        for (const sup of orderedSupports) {
          const endByte = sup?.segment?.endIndex;
          const chunkIdxs = sup?.groundingChunkIndices || [];
          if (endByte == null || !chunkIdxs.length) continue;
          const markers = [];
          for (const ci of chunkIdxs) {
            const ch = chunksMeta[ci];
            const url = ch?.web?.uri || ch?.retrievedContext?.uri;
            if (!url) continue;
            const idx = urlToIndex.get(url);
            if (idx) markers.push(`[${idx}]`);
          }
          if (markers.length) insertions.push({ at: byteToCharIndex(endByte), markers });
        }
        insertions.sort((a, b) => b.at - a.at);
        let withCitations = text;
        for (const ins of insertions) {
          const before = withCitations.slice(0, ins.at);
          const after = withCitations.slice(ins.at);
          const leadingSpace = /\s$/.test(before) ? '' : ' ';
          withCitations = before + leadingSpace + ins.markers.join('') + after;
        }
        text = withCitations;
      } else if (opts.enableWebSearch) {
        // Tool was enabled but the model didn't search / returned no supports.
        // Still surface any raw chunks as a sources list (no inline markers).
        for (const ch of chunksMeta) {
          const url = ch?.web?.uri || ch?.retrievedContext?.uri;
          if (!url || urlToIndex.has(url)) continue;
          urlToIndex.set(url, urlToIndex.size + 1);
          sources.push({ url, title: ch?.web?.title || ch?.retrievedContext?.title || url });
        }
      }
      return {
        success: true,
        data: { content: [{ type: 'text', text }], sources },
        model: resolved,
      };
    } catch (err) {
      lastError = err?.message || String(err);
      // Detect "model not found / invalid model" errors so we can cascade.
      // Gemini 3.x preview ids periodically vanish or get renamed; without
      // this fallback every call would hard-fail until we redeployed.
      const errStr = String(lastError).toLowerCase();
      const isModelMissing =
        err?.status === 404 ||
        err?.status === 400 ||
        errStr.includes('not found') ||
        errStr.includes('invalid model') ||
        errStr.includes('does not exist') ||
        errStr.includes('not supported');

      if (isRateLimitError(err)) {
        if (attempt === 1) currentModel = fallbackFor(currentModel);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (isModelMissing) {
        const next = fallbackFor(currentModel);
        if (next && next !== currentModel && attempt < 2) {
          console.warn(`Model "${currentModel}" unavailable (${err?.status || 'no status'}). Falling back to "${next}".`);
          currentModel = next;
          continue;
        }
      }
      // Non-retryable
      return { success: false, error: lastError, status: err?.status || 500 };
    }
  }
  return { success: false, error: lastError || 'All attempts failed' };
}

// Back-compat alias — all existing call sites use `callAnthropic`.
const callAnthropic = callGemini;

// Ensure the fields the completion handler touches exist. Older user records
// may be missing these; without this, any lesson-complete save throws.
function ensureLessonCompletionFields(data) {
  if (!data) return;
  if (!data.profile) data.profile = { level: 1, xp: 0, xpToNextLevel: 100, strengths: [], weaknesses: [], topicScores: {} };
  if (typeof data.profile.xp !== 'number') data.profile.xp = 0;
  if (typeof data.profile.xpToNextLevel !== 'number') data.profile.xpToNextLevel = 100;
  if (typeof data.profile.level !== 'number') data.profile.level = 1;
  if (!data.studyStreaks) data.studyStreaks = { lastActiveDate: null, currentStreak: 0, longestStreak: 0, weeklyActivity: {} };
  if (!data.studyStreaks.weeklyActivity) data.studyStreaks.weeklyActivity = {};
  if (!data.dailyLog) data.dailyLog = {};
}

// Pull the JSON blob that follows a [LESSON_DONE] / [LESSON_COMPLETE] marker.
// Walks brace depth so nested objects are handled correctly. Tolerates code
// fences and inline citation markers — caller should pre-sanitize if needed.
function extractLessonDoneJson(text) {
  const markerIdx = text.search(/\[LESSON_(?:DONE|COMPLETE)\]/);
  if (markerIdx < 0) return null;
  const after = text.slice(markerIdx).replace(/^\[LESSON_(?:DONE|COMPLETE)\]/, '');
  const start = after.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < after.length; i++) {
    const ch = after[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return after.slice(start, i + 1);
    }
  }
  return null;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system, model, max_tokens, sourced } = req.body;
    const systemPrompt = system || 'You are a helpful AI assistant.';
    const result = await callGemini(systemPrompt, messages, model, max_tokens || 4096, { enableWebSearch: !!sourced });
    if (result.success) return res.json(result.data);
    return res.status(result.status || 500).json({ error: result.error });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Consume the weekly debate quota. Client calls this BEFORE starting a
// new debate conversation. Free plan = 1/week, Pro = unlimited.
app.post('/api/debate/start', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const quota = consumeDebate(users, email);
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'debate_limit_reached',
        message: `You've already used this week's free debate (${quota.limit}/week). Upgrade to Pro for unlimited.`,
        limit: quota.limit, remaining: 0,
      });
    }
    saveUsers(users);
    res.json({ ok: true, remaining: quota.remaining, limit: quota.limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PUBLIC LANDING-PAGE DEMO =====
// Unauthenticated, heavily rate-limited endpoints so the live preview on
// the marketing page can actually generate a real curriculum without a
// visitor having to sign in first. Abuse vectors:
//   - spam: mitigated by per-IP count (5 gens / hour)
//   - cost:  mitigated by forcing MODEL_FREE (Flash) + 2 units * 3 lessons cap
// State lives in-memory; restart wipes limits (fine).
const demoIpLimits = new Map(); // ip -> { count, firstAt }
const DEMO_RATE_MAX = 50;                   // plenty for demo-kicking without abuse
const DEMO_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function demoAllowed(ip) {
  const now = Date.now();
  const rec = demoIpLimits.get(ip) || { count: 0, firstAt: now };
  if (now - rec.firstAt > DEMO_RATE_WINDOW_MS) {
    rec.count = 0;
    rec.firstAt = now;
  }
  rec.count += 1;
  demoIpLimits.set(ip, rec);
  return rec.count <= DEMO_RATE_MAX;
}
function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

app.post('/api/demo/curriculum/generate', async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!demoAllowed(ip)) {
      return res.status(429).json({ error: 'Demo rate limit reached. Sign up for unlimited.' });
    }
    const topic = String(req.body?.topic || '').trim().slice(0, 80);
    const difficulty = ['beginner','intermediate','advanced'].includes(req.body?.difficulty)
      ? req.body.difficulty : 'intermediate';
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    // Condensed prompt for the demo — force a compact structure so
    // generation is under 5s and the preview feels snappy.
    const system = 'You are an expert curriculum designer. Output ONLY valid JSON. No markdown, no code fences, no explanation.';
    const user = `Design a compact learning curriculum for: "${topic}" at the ${difficulty} level.

Return JSON with EXACTLY 2 units. Each unit has 3 lessons. Each lesson has a "type" from: "lesson", "math_tutor" (step-by-step math only), "essay" (graded essay), "unit_test".

{
  "title": "Course title",
  "description": "1 sentence description",
  "units": [
    {
      "title": "Unit 1 title",
      "lessons": [
        { "title": "Lesson 1", "description": "One line", "type": "lesson" },
        { "title": "Lesson 2", "description": "One line", "type": "lesson" },
        { "title": "Lesson 3 (assessment)", "description": "One line", "type": "unit_test" }
      ]
    },
    { "title": "Unit 2 title", "lessons": [ ...same shape... ] }
  ]
}`;

    let result = await callGemini(system, [{ role: 'user', content: user }], MODEL_FREE, 2048);
    if (!result.success) return res.status(500).json({ error: result.error || 'AI failed' });

    let text = result.data.content?.[0]?.text || '';
    let parsed = parseAIJson(text);

    // Retry once with a much stricter prompt if the first pass didn't give
    // us valid JSON — the Flash model occasionally wraps output in prose.
    if (!parsed?.units) {
      const retry = await callGemini(
        'Output ONLY a single valid JSON object. No markdown. No code fences. No explanation. Nothing before or after the JSON. Start with { and end with }.',
        [{ role: 'user', content: `${user}\n\nCRITICAL: Output ONLY the JSON object. Nothing else.` }],
        MODEL_FREE, 2048,
      );
      if (retry.success) {
        text = retry.data.content?.[0]?.text || '';
        parsed = parseAIJson(text);
      }
    }

    if (!parsed?.units) {
      console.warn('Demo curriculum parse failed. Raw text (first 500):', text.slice(0, 500));
      return res.status(500).json({ error: 'The AI response was malformed. Try a different topic.' });
    }

    // Tag a client-side id onto each entity so the UI has stable keys.
    const curriculumId = `demo-${Date.now()}`;
    parsed.id = curriculumId;
    parsed.isDemo = true;
    parsed.units = (parsed.units || []).slice(0, 2).map((u, ui) => ({
      ...u,
      id: `${curriculumId}-u${ui}`,
      lessons: (u.lessons || []).slice(0, 4).map((l, li) => ({
        ...l,
        id: `${curriculumId}-u${ui}-l${li}`,
        type: ['lesson','math_tutor','essay','unit_test','practice'].includes(l.type) ? l.type : 'lesson',
        isCompleted: false,
      })),
    }));

    res.json({ curriculum: parsed });
  } catch (e) {
    console.error('Demo curriculum error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Generate a small flashcard deck on any topic. Public, rate-limited.
app.post('/api/demo/flashcards/generate', async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!demoAllowed(ip)) return res.status(429).json({ error: 'Demo rate limit reached. Sign up for unlimited.' });
    const topic = String(req.body?.topic || '').trim().slice(0, 80);
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const system = 'You are a flashcard author. Output ONLY valid JSON — no markdown, no fences, no explanation.';
    const user = `Generate 8 flashcards on "${topic}". Each card is short (front: question/prompt, back: 1-2 sentence answer). Return JSON:
{ "cards": [ { "front": "...", "back": "..." }, ... 8 total ... ] }`;
    const result = await callGemini(system, [{ role: 'user', content: user }], MODEL_FREE, 1536);
    if (!result.success) return res.status(500).json({ error: result.error || 'AI failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    const cards = Array.isArray(parsed?.cards) ? parsed.cards.slice(0, 8) : [];
    if (!cards.length) return res.status(500).json({ error: 'Malformed AI response. Try a different topic.' });
    res.json({ cards });
  } catch (e) {
    console.error('Demo flashcards error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Stream a tutor response for the demo. Supports BOTH one-shot (pass
// `topic`) and multi-turn conversations (pass `messages: [{role,content}...]`).
// Multi-turn powers the back-and-forth chat in the landing-page mini OS.
app.post('/api/demo/lesson/stream', async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (!demoAllowed(ip)) {
      return res.status(429).json({ error: 'Demo rate limit reached. Sign up for unlimited.' });
    }

    // Prefer a conversation history when provided. Falls back to a single-
    // topic prompt for the legacy call sites.
    let messages = Array.isArray(req.body?.messages) ? req.body.messages : null;
    const topic = String(req.body?.topic || '').trim().slice(0, 120);
    const context = String(req.body?.context || '').trim().slice(0, 200);

    let system;
    if (messages && messages.length) {
      // Sanitize + cap. We trust only 'user'/'assistant' roles.
      messages = messages
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
      if (!messages.length) return res.status(400).json({ error: 'No messages' });
      system = 'You are a warm, conversational tutor. Use markdown — headings (##), bold, bulleted lists, numbered steps, and code blocks where useful. Keep replies under 250 words unless the student asks for depth. End with one short check-for-understanding question when it fits.';
    } else {
      if (!topic) return res.status(400).json({ error: 'Topic or messages required' });
      system = 'You are a warm, conversational tutor. Use markdown — headings (##), bold, bulleted lists, numbered steps, and code blocks where useful. Keep the opening to 150-220 words.';
      messages = [{
        role: 'user',
        content: `Give me an opening lesson on "${topic}"${context ? ` (context: ${context})` : ''}. Start with a 1-sentence hook, then the core idea (## heading), one worked example, and finish with a short check-for-understanding question.`,
      }];
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await streamAIResponse(res, system, messages, () => {}, MODEL_FREE);
  } catch (e) {
    console.error('Demo lesson stream error:', e);
    try {
      if (!res.headersSent) res.status(500).json({ error: e.message });
      else { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); }
    } catch {}
  }
});

// ===== CURRICULUM ROUTES =====

// Generate a new curriculum
app.post('/api/curriculum/generate', authMiddleware, async (req, res) => {
  try {
    const { settings, sources: rawSources } = req.body;
    if (!settings?.topic) return res.status(400).json({ error: 'Topic is required' });

    // Sources: optional array of { title, kind: 'pdf'|'text'|'url', content, url? }.
    // Already-extracted text — files come from /api/files/extract and URLs
    // from /api/sources/extract-url. We sanitize + cap to stay inside the
    // model's input window.
    const SOURCE_TOTAL_CAP = 60000;
    const SOURCE_PER_ITEM_CAP = 25000;
    let sources = Array.isArray(rawSources) ? rawSources.filter(Boolean).slice(0, 8) : [];
    sources = sources.map(s => ({
      title: String(s.title || s.url || 'Source').slice(0, 200),
      kind: ['pdf', 'text', 'url'].includes(s.kind) ? s.kind : 'text',
      url: s.url ? String(s.url).slice(0, 500) : undefined,
      content: String(s.content || '').slice(0, SOURCE_PER_ITEM_CAP),
    })).filter(s => s.content.length >= 30);
    // Trim to fit total cap proportionally if combined size is too big.
    const totalChars = sources.reduce((n, s) => n + s.content.length, 0);
    if (totalChars > SOURCE_TOTAL_CAP) {
      const ratio = SOURCE_TOTAL_CAP / totalChars;
      sources = sources.map(s => ({ ...s, content: s.content.slice(0, Math.floor(s.content.length * ratio)) }));
    }

    const usersC = loadUsers();
    const emailC = findEmailById(usersC, req.userId);
    if (!emailC) return res.status(404).json({ error: 'User not found' });
    usersC[emailC].data = migrateUserData(usersC[emailC].data);

    // Demo users (auto-created throwaway accounts spun up by the landing
    // page mini-OS) are capped at 1 curriculum total. Real users hit the
    // weekly Pro/Free quota instead.
    if (isDemoOrDevEmail(emailC)) {
      const existing = (usersC[emailC].data.curricula || []).length;
      if (existing >= 1) {
        return res.status(402).json({
          error: 'demo_curriculum_limit',
          message: 'Demo accounts are limited to 1 curriculum. Sign in with Google to create more.',
        });
      }
    } else {
      // Free plan: 1 curriculum generation per week. Pro: unlimited.
      const quota = consumeCurriculumGeneration(usersC, emailC);
      if (!quota.allowed) {
        return res.status(402).json({
          error: 'curriculum_limit_reached',
          message: `You've already generated ${quota.limit} curriculum this week on the free plan. Upgrade to Pro for unlimited.`,
          limit: quota.limit, remaining: 0,
        });
      }
    }
    saveUsers(usersC);

    const { system, user } = buildCurriculumPrompt(settings, sources);
    // Flash for curriculum generation — the Pro model was aborting on
    // long generations (`gemini-3.1-pro-preview` hits 60s timeouts even
    // on simple structured-JSON outputs). Flash is ~3× faster and the
    // schema is strict enough that quality is the same.
    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_FLASH, 8192, { jsonMode: true, temperature: 0.7 });

    if (!result.success) return res.status(500).json({ error: result.error });

    const text = result.data.content?.[0]?.text || '';
    let curriculum = parseAIJson(text);
    if (!curriculum || !curriculum.units) {
      console.warn('Curriculum first attempt parse failed. First 400 chars:', text.slice(0, 400));
      // Retry once with stronger JSON enforcement and even lower temperature.
      const retryResult = await callGemini(
        'You MUST output ONLY a valid JSON object. No markdown, no explanation, no text before or after. Just raw JSON.',
        [{ role: 'user', content: `${user}\n\nIMPORTANT: Output ONLY the JSON object, nothing else.` }],
        DEFAULT_MODEL, 8192, { jsonMode: true, temperature: 0.3 }
      );
      if (retryResult.success) {
        const retryText = retryResult.data.content?.[0]?.text || '';
        curriculum = parseAIJson(retryText);
        if (!curriculum) console.error('Curriculum retry parse failed. First 400 chars:', retryText.slice(0, 400));
      }
      if (!curriculum || !curriculum.units) {
        return res.status(500).json({ error: 'Failed to parse curriculum. Please try again.' });
      }
    }

    // Add IDs and structure to everything
    const curriculumId = crypto.randomUUID();
    curriculum.id = curriculumId;
    curriculum.createdAt = new Date().toISOString();
    curriculum.settings = { ...settings };
    curriculum.linkedGoalIds = [];
    // Persist the source materials the user attached — minus their full
    // content (kept only metadata, since the content is already baked
    // into every generated lesson via the prompt). Frontend uses this
    // to render the "Sources used" badge on the curriculum card.
    curriculum.sources = sources.map(s => ({
      title: s.title, kind: s.kind, url: s.url || null, chars: s.content.length,
    }));

    // Detect if this is a math-related curriculum
    const mathKeywords = ['math', 'algebra', 'calculus', 'geometry', 'trigonometry', 'statistics', 'arithmetic', 'equation', 'fraction', 'polynomial', 'linear', 'quadratic', 'integral', 'derivative', 'probability', 'number theory'];
    const topicLower = (settings.topic || '').toLowerCase();
    const isMathCurriculum = mathKeywords.some(kw => topicLower.includes(kw));

    let lessonCounter = 0;
    curriculum.units = (curriculum.units || []).map((unit, ui) => {
      const lessons = (unit.lessons || []).map((lesson, li) => {
        lessonCounter++;
        return {
          ...lesson,
          id: `${curriculumId}-u${ui}-l${li}`,
          type: 'lesson',
          chatHistory: [],
          phase: null,
          phaseData: {},
          content: null,
          isCompleted: false,
          score: null,
        };
      });

      // For math curricula: add a Math Tutor step-by-step drill (handwriting
      // canvas + step grading) + a free-form Practice Problems lesson. The
      // Math Tutor walks through a guided worked problem; Practice is the
      // student's turn on the same topic.
      if (isMathCurriculum && lessons.length >= 2) {
        const mathTutorLesson = {
          id: `${curriculumId}-u${ui}-mathtutor`,
          title: `${unit.title} — Math Tutor`,
          description: `Walk through worked problems for ${unit.title} with step-by-step feedback on a handwriting canvas.`,
          type: 'math_tutor',
          tool: 'math_tutor',
          practiceTopic: unit.title,
          chatHistory: [],
          phase: null,
          phaseData: {},
          content: null,
          isCompleted: false,
          score: null,
        };
        const practiceLesson = {
          id: `${curriculumId}-u${ui}-practice`,
          title: `${unit.title} — Practice Problems`,
          description: `Solve practice problems for ${unit.title} using the math canvas.`,
          type: 'practice',
          tool: 'math_canvas',
          practiceTopic: unit.title,
          chatHistory: [],
          phase: null,
          phaseData: {},
          content: null,
          isCompleted: false,
          score: null,
        };
        // Insert Math Tutor before the last concept lesson, Practice before the unit test.
        lessons.splice(lessons.length - 1, 0, mathTutorLesson);
        lessons.push(practiceLesson);
      } else if (lessons.length >= 2) {
        // For NON-math curricula: add a graded essay per unit. It routes to
        // the existing assessment/essay flow (prompt + rubric + AI grading).
        const essayLesson = {
          id: `${curriculumId}-u${ui}-essay`,
          title: `${unit.title} — Graded Essay`,
          description: `Write a graded short essay on ${unit.title}. Feedback is scored against a rubric.`,
          type: 'essay',
          chatHistory: [],
          phase: null,
          phaseData: {},
          content: null,
          isCompleted: false,
          score: null,
        };
        // Essay goes before the unit test so students write before the MCQ check.
        lessons.push(essayLesson);
      }

      // Add unit test at end (always last).
      lessons.push({
        id: `${curriculumId}-u${ui}-test`,
        title: `${unit.title} — Assessment`,
        description: `Test your knowledge of ${unit.title}`,
        type: 'unit_test',
        chatHistory: [],
        phase: null,
        phaseData: {},
        content: null,
        isCompleted: false,
        score: null,
      });

      // All units unlocked — student can jump to any lesson at any time.
      return { ...unit, id: `${curriculumId}-u${ui}`, locked: false, lessons };
    });

    // Save to user data
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    if (!users[email].data) users[email].data = createDefaultData();
    users[email].data.curricula.unshift(curriculum);
    saveUsers(users);

    res.json({ curriculum });
  } catch (e) {
    console.error('Curriculum generation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List all curricula (summaries)
app.get('/api/curriculum', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curricula = (users[email].data?.curricula || []).map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      settings: c.settings,
      totalLessons: (c.units || []).reduce((sum, u) => sum + (u.lessons || []).length, 0),
      completedLessons: (c.units || []).reduce((sum, u) => sum + (u.lessons || []).filter(l => l.isCompleted).length, 0),
      unitCount: (c.units || []).length,
    }));
    res.json({ curricula });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single curriculum (full)
app.get('/api/curriculum/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    res.json({ curriculum });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update curriculum
app.put('/api/curriculum/:id', authMiddleware, (req, res) => {
  try {
    const { updates } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curricula = users[email].data?.curricula || [];
    const idx = curricula.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Curriculum not found' });
    curricula[idx] = { ...curricula[idx], ...updates };
    saveUsers(users);
    res.json({ curriculum: curricula[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete curriculum
app.delete('/api/curriculum/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curricula = users[email].data?.curricula || [];
    users[email].data.curricula = curricula.filter(c => c.id !== req.params.id);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =================================================================
// PAUSD CATALOG — pre-built Khan-Academy-style courses at PAUSD rigor.
// Browse the catalog, then enroll → clones the template into the user's
// curricula list with full IDs and per-unit math-tutor / practice / unit-
// test lessons (math) or essay (non-math), exactly like AI-generated
// curricula from /api/curriculum/generate.
// =================================================================

app.get('/api/pausd/catalog', authMiddleware, (req, res) => {
  try {
    res.json({ catalog: listPausdCatalog() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/pausd/catalog/:slug', authMiddleware, (req, res) => {
  try {
    const tpl = getPausdTemplate(req.params.slug);
    if (!tpl) return res.status(404).json({ error: 'Course not found' });
    res.json({ course: tpl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enroll: clone a template into the user's curricula.
//
// Mirrors the post-AI-generation enrichment from /api/curriculum/generate
// so existing lesson-chat / math-tutor / assessment endpoints all light up
// unchanged. Each enrolled course gets:
//   - fresh curriculum + unit + lesson IDs
//   - for math curricula: a Math Tutor + Practice Problems lesson per unit
//   - for non-math curricula: a Graded Essay per unit
//   - always: a Unit Assessment at the end of every unit
app.post('/api/pausd/enroll', authMiddleware, (req, res) => {
  try {
    const { slug } = req.body || {};
    const tpl = getPausdTemplate(slug);
    if (!tpl) return res.status(404).json({ error: 'Course not found' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    if (!users[email].data) users[email].data = createDefaultData();
    users[email].data = migrateUserData(users[email].data);

    // Bail if already enrolled — show them the existing one rather than
    // making a duplicate.
    const existing = (users[email].data.curricula || []).find(c => c.pausdSlug === slug);
    if (existing) return res.json({ curriculum: existing, alreadyEnrolled: true });

    // Demo accounts are capped at 1 curriculum total. Already-enrolled
    // case above slips through (re-opens the existing one); only NEW
    // enrollments check the cap.
    if (isDemoOrDevEmail(email)) {
      const totalCurricula = (users[email].data.curricula || []).length;
      if (totalCurricula >= 1) {
        return res.status(402).json({
          error: 'demo_curriculum_limit',
          message: 'Demo accounts are limited to 1 curriculum. Sign in with Google to enroll in more.',
        });
      }
    }

    const curriculumId = crypto.randomUUID();
    const isMathCurriculum = tpl.subject === 'math';

    const curriculum = {
      id: curriculumId,
      title: tpl.title,
      description: tpl.description,
      createdAt: new Date().toISOString(),
      pausdSlug: tpl.slug,
      source: 'pausd',
      settings: {
        topic: tpl.title,
        difficulty: tpl.difficulty || 'advanced',
        audience: 'PAUSD middle / high school student',
        learningStyle: 'conceptual',
        includeExamples: true,
        includeExercises: true,
      },
      linkedGoalIds: [],
      units: (tpl.units || []).map((unit, ui) => {
        // Honor explicit `type` from the catalog template — math_tutor and
        // practice (canvas) lessons can be authored INLINE inside a unit's
        // lessons array, interspersed between section lessons. Otherwise
        // default to type 'lesson' (chat-based).
        const lessons = (unit.lessons || []).map((lesson, li) => {
          const t = lesson.type || 'lesson';
          const base = {
            id: `${curriculumId}-u${ui}-l${li}`,
            title: lesson.title,
            description: lesson.description,
            type: t,
            chatHistory: [],
            phase: null,
            phaseData: {},
            content: null,
            isCompleted: false,
            score: null,
          };
          if (t === 'math_tutor') {
            base.tool = 'math_tutor';
            base.practiceTopic = lesson.practiceTopic || unit.title;
          } else if (t === 'practice') {
            base.tool = 'math_canvas';
            base.practiceTopic = lesson.practiceTopic || unit.title;
          }
          return base;
        });

        // Whether the template already provides interactive math lessons.
        const hasInlineMathTutor = lessons.some(l => l.type === 'math_tutor');
        const hasInlinePractice  = lessons.some(l => l.type === 'practice');

        if (isMathCurriculum && lessons.length >= 2) {
          // Auto-append a Math Tutor + Practice ONLY when the template
          // didn't bake them in explicitly. PAUSD math units increasingly
          // include them inline (drilled between sections), in which case
          // we leave the template's structure untouched.
          if (!hasInlineMathTutor) {
            lessons.splice(lessons.length - 1, 0, {
              id: `${curriculumId}-u${ui}-mathtutor`,
              title: `${unit.title} — Math Tutor`,
              description: `Walk through worked problems for ${unit.title} with step-by-step feedback on a handwriting canvas.`,
              type: 'math_tutor',
              tool: 'math_tutor',
              practiceTopic: unit.title,
              chatHistory: [],
              phase: null,
              phaseData: {},
              content: null,
              isCompleted: false,
              score: null,
            });
          }
          if (!hasInlinePractice) {
            lessons.push({
              id: `${curriculumId}-u${ui}-practice`,
              title: `${unit.title} — Practice Problems`,
              description: `Solve practice problems for ${unit.title} using the math canvas.`,
              type: 'practice',
              tool: 'math_canvas',
              practiceTopic: unit.title,
              chatHistory: [],
              phase: null,
              phaseData: {},
              content: null,
              isCompleted: false,
              score: null,
            });
          }
        } else if (!isMathCurriculum && lessons.length >= 2) {
          lessons.push({
            id: `${curriculumId}-u${ui}-essay`,
            title: `${unit.title} — Graded Essay`,
            description: `Write a graded short essay on ${unit.title}. Feedback is scored against a rubric.`,
            type: 'essay',
            chatHistory: [],
            phase: null,
            phaseData: {},
            content: null,
            isCompleted: false,
            score: null,
          });
        }

        // Unit assessment last.
        lessons.push({
          id: `${curriculumId}-u${ui}-test`,
          title: `${unit.title} — Assessment`,
          description: `Test your knowledge of ${unit.title}`,
          type: 'unit_test',
          chatHistory: [],
          phase: null,
          phaseData: {},
          content: null,
          isCompleted: false,
          score: null,
        });

        return {
          id: `${curriculumId}-u${ui}`,
          title: unit.title,
          description: unit.description,
          textbookContext: unit.textbookContext || null,
          locked: false,
          lessons,
        };
      }),
    };

    users[email].data.curricula.unshift(curriculum);
    saveUsers(users);
    res.json({ curriculum });
  } catch (e) {
    console.error('PAUSD enroll error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Generate lesson content (SSE streaming)
app.post('/api/curriculum/:id/lesson/generate', authMiddleware, async (req, res) => {
  try {
    const { unitId, lessonId } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });

    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    const unit = (curriculum.units || []).find(u => u.id === unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const lesson = (unit.lessons || []).find(l => l.id === lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Build previous lessons list for context
    const lessonIdx = unit.lessons.indexOf(lesson);
    const previousLessons = unit.lessons.slice(0, lessonIdx).map(l => l.title);

    const settings = curriculum.settings || {};
    const { system, user } = buildLessonPrompt(settings, unit.title, lesson, previousLessons);

    await streamAIResponse(
      res,
      system,
      [{ role: 'user', content: user }],
      async (fullContent) => {
        // Persist generated lesson content
        const usersAfter = loadUsers();
        const curr = (usersAfter[email]?.data?.curricula || []).find(c => c.id === req.params.id);
        if (curr) {
          const u = (curr.units || []).find(u => u.id === unitId);
          if (u) {
            const l = (u.lessons || []).find(l => l.id === lessonId);
            if (l) {
              l.content = fullContent;
              saveUsers(usersAfter);
            }
          }
        }
      },
      DEFAULT_MODEL,
    );
    return;
  } catch (e) {
    console.error('Lesson generation error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
});

// Toggle lesson completion
app.post('/api/curriculum/:id/lesson/:lessonId/complete', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });

    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    let found = false;
    for (const unit of curriculum.units || []) {
      const lesson = (unit.lessons || []).find(l => l.id === req.params.lessonId);
      if (lesson) {
        lesson.isCompleted = !lesson.isCompleted;
        found = true;

        // Update streak
        if (lesson.isCompleted) {
          const today = new Date().toISOString().slice(0, 10);
          const streaks = users[email].data.studyStreaks || { lastActiveDate: null, currentStreak: 0, longestStreak: 0, weeklyActivity: {} };
          const dailyLog = users[email].data.dailyLog || {};

          if (!dailyLog[today]) dailyLog[today] = { lessonsCompleted: 0 };
          dailyLog[today].lessonsCompleted++;

          if (streaks.lastActiveDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            if (streaks.lastActiveDate === yesterday) {
              streaks.currentStreak++;
            } else if (streaks.lastActiveDate !== today) {
              streaks.currentStreak = 1;
            }
            streaks.lastActiveDate = today;
            if (streaks.currentStreak > streaks.longestStreak) {
              streaks.longestStreak = streaks.currentStreak;
            }
          }

          // Weekly activity
          const dayOfWeek = new Date().getDay();
          streaks.weeklyActivity[dayOfWeek] = (streaks.weeklyActivity[dayOfWeek] || 0) + 1;

          users[email].data.studyStreaks = streaks;
          users[email].data.dailyLog = dailyLog;
        }

        break;
      }
    }

    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    saveUsers(users);

    res.json({
      success: true,
      streaks: users[email].data.studyStreaks,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get streak data
app.get('/api/study/streak', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const streaks = users[email].data?.studyStreaks || { lastActiveDate: null, currentStreak: 0, longestStreak: 0, weeklyActivity: {} };
    const dailyLog = users[email].data?.dailyLog || {};
    res.json({ streaks, dailyLog });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CONVERSATIONAL LESSON CHAT =====

const LESSON_PHASES = ['introduction', 'explanation', 'check_understanding', 'deeper_dive', 'practice'];

// Max assistant turns we allow in a single phase before we forcibly advance.
// Prevents a lesson getting stuck when the model forgets the status marker.
const PHASE_TURN_CAPS = {
  introduction: 2,
  explanation: 5,
  check_understanding: 6,
  deeper_dive: 4,
  practice: 6,
};

function countAssistantTurnsInPhase(lesson) {
  if (!lesson.phaseStartIndex && lesson.phaseStartIndex !== 0) lesson.phaseStartIndex = 0;
  let count = 0;
  for (let i = lesson.phaseStartIndex; i < (lesson.chatHistory || []).length; i++) {
    if (lesson.chatHistory[i].role === 'assistant') count++;
  }
  return count;
}

// Returns true if phase advanced (or lesson completed).
function advancePhaseIfNeeded(lesson, fullContent) {
  const currentIdx = LESSON_PHASES.indexOf(lesson.phase);
  if (currentIdx < 0) return false;

  // 1. Explicit model signal — [STATUS: advance] OR legacy [PHASE_COMPLETE]
  const modelSaidAdvance = /\[STATUS:\s*advance\]/i.test(fullContent)
    || fullContent.includes('[PHASE_COMPLETE]')
    || fullContent.includes('[LESSON_COMPLETE]');

  // 2. Safety fallback — too many turns in this phase
  const turnsInPhase = countAssistantTurnsInPhase(lesson);
  const cap = PHASE_TURN_CAPS[lesson.phase] ?? 5;
  const hitCap = turnsInPhase >= cap;

  if (!modelSaidAdvance && !hitCap) return false;

  if (currentIdx < LESSON_PHASES.length - 1) {
    lesson.phase = LESSON_PHASES[currentIdx + 1];
    lesson.phaseStartIndex = (lesson.chatHistory || []).length;
    return true;
  }
  return false;
}

// Helper: stream AI response as SSE, backed by Google Gemini.
//
// SSE event schema (unchanged from the old Anthropic impl — frontend consumers
// depend on this exact shape):
//   { content: "..." }                     -- text delta
//   { source: { url, title } }             -- new source discovered
//   { status: "searching"|"reading"|"no_sources" }
//   { done: true, sources: [{url,title}] } -- end
//   { error: "..." }
//
// Two modes:
//   - Non-source: stream text deltas through as they arrive (token-by-token UX).
//   - Source mode: buffer the entire response server-side, then once Gemini
//     returns groundingMetadata at stream end, inject [n] markers at the
//     correct segment indices and flush the rewritten text as a single content
//     event followed by per-source events + the done event.
async function streamAIResponse(res, systemPrompt, messages, onComplete, modelOverride, opts = {}) {
  const requestedModel = modelOverride || DEFAULT_MODEL;
  const enableWebSearch = !!opts.enableWebSearch;
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Critical for Render / nginx — without this they buffer SSE chunks and the
    // client sees nothing until the stream ends, which feels like the AI stopped.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
  }
  // Helper: write SSE event AND flush so Node's internal buffer doesn't hold it.
  const sse = (obj) => {
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      res.flush?.();
    } catch {}
  };

  if (!genAI) {
    sse({ error: 'GEMINI_API_KEY not configured' });
    res.end();
    return;
  }

  // Source mode: sources are retrieved automatically via Google Search
  // grounding — tell the model it has the capability rather than browbeating
  // it into using the tool.
  const finalSystem = enableWebSearch
    ? `${systemPrompt}

---
SOURCE MODE — NON-NEGOTIABLE RULES:
- You have Google Search. Use it on EVERY single response — short answers, follow-ups, clarifications, and "yes/no" replies included. No message is exempt.
- Run 2-4 queries before writing each response, then base every factual claim on what the search returns.
- Cite the supporting source inline using [1], [2], … markers placed immediately after the claim they back. The UI renders the sources list below your message; do NOT write your own "Sources:" footer.
- If search returns nothing useful, say so plainly and refuse to fabricate — do not fall back to model-only answers in source mode.
- Write naturally and do not mention that you searched.`
    : systemPrompt;

  const controller = new AbortController();
  // 5-minute hard cap. Long lessons with quiz blocks + grounded source mode
  // can take a while; 180s was clipping legitimate streams.
  const timeout = setTimeout(() => controller.abort(), 300000);

  // Heartbeat — without periodic bytes, intermediate proxies (Cloudflare,
  // nginx) close idle SSE connections after ~30s, which the user perceives
  // as the AI "stopping". Comment lines are valid SSE noops the browser
  // ignores, so they keep the pipe warm without polluting events.
  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); res.flush?.(); }
    catch {}
  }, 15000);

  try {
    const resolved = resolveModel(requestedModel);
    const tools = enableWebSearch ? [{ googleSearch: {} }] : undefined;
    const model = genAI.getGenerativeModel({
      model: resolved,
      systemInstruction: { role: 'system', parts: [{ text: finalSystem }] },
      tools,
      // 32k output cap. The previous 8k limit silently truncated long lessons
      // (intro phase + 6 sections + quiz block routinely hit 9-10k). Gemini
      // 2.5 / 3.x both support 32k+ output.
      generationConfig: { maxOutputTokens: 32768, temperature: 0.7 },
    });

    if (enableWebSearch) {
      sse({ status: 'searching' });
    }

    const result = await model.generateContentStream(
      { contents: messagesToGeminiContents(messages) },
      { signal: controller.signal },
    );

    let buffered = '';
    let finalResponse = null;

    // Always stream tokens live — both source and non-source mode. In source
    // mode, citation markers get appended at the end (once we have grounding
    // metadata) rather than inline, because Gemini only returns supports
    // after the stream closes.
    for await (const chunk of result.stream) {
      const text = chunk?.text?.() || '';
      if (text) {
        buffered += text;
        sse({ content: text });
      }
    }

    try { finalResponse = await result.response; } catch {}
    clearTimeout(timeout);
    clearInterval(heartbeat);

    // Surface non-STOP finish reasons so the client can show "the model hit
    // its output limit / was cut off by safety filters" instead of letting
    // the message just end mid-sentence with no explanation.
    const finishReason = finalResponse?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
      const userMsg = ({
        MAX_TOKENS: '\n\n_[response cut off — hit length limit; ask the AI to continue]_',
        SAFETY: '\n\n_[response was blocked by safety filters]_',
        RECITATION: '\n\n_[response was cut off due to recitation policy]_',
        OTHER: '\n\n_[response ended unexpectedly]_',
      })[finishReason] || `\n\n_[response ended: ${finishReason}]_`;
      sse({ content: userMsg });
      buffered += userMsg;
    }

    // --- Citation handling (source mode only) ---
    const sources = [];
    let appendedMarkers = '';
    if (enableWebSearch) {
      const gm = finalResponse?.candidates?.[0]?.groundingMetadata || {};
      const chunksMeta = gm.groundingChunks || [];
      const supports = gm.groundingSupports || [];

      // Build URL → [n] map in the order supports reference each source.
      const urlToIndex = new Map();
      const orderedSupports = [...supports].sort((a, b) => {
        const ea = a?.segment?.endIndex ?? 0;
        const eb = b?.segment?.endIndex ?? 0;
        return ea - eb;
      });

      for (const sup of orderedSupports) {
        const chunkIdxs = sup?.groundingChunkIndices || [];
        for (const ci of chunkIdxs) {
          const ch = chunksMeta[ci];
          const url = ch?.web?.uri || ch?.retrievedContext?.uri;
          if (!url) continue;
          if (!urlToIndex.has(url)) {
            const idx = urlToIndex.size + 1;
            urlToIndex.set(url, idx);
            const title = ch?.web?.title || ch?.retrievedContext?.title || url;
            sources.push({ url, title });
          }
        }
      }

      // Some grounding responses emit chunks without matching supports — add
      // those URLs too so the sources list is never empty when grounding ran.
      for (const ch of chunksMeta) {
        const url = ch?.web?.uri || ch?.retrievedContext?.uri;
        if (!url || urlToIndex.has(url)) continue;
        const idx = urlToIndex.size + 1;
        urlToIndex.set(url, idx);
        const title = ch?.web?.title || ch?.retrievedContext?.title || url;
        sources.push({ url, title });
      }

      for (const s of sources) {
        sse({ source: s });
      }

      if (sources.length > 0) {
        // Append [1][2][3]... at the very end of the message as a single
        // content event. Inline positioning isn't possible post-stream, so
        // we clump them — the <Sources> list below the message gives the
        // fully-clickable bibliography.
        const markerText = ' ' + sources.map((_, i) => `[${i + 1}]`).join('');
        appendedMarkers = markerText;
        sse({ content: markerText });
      } else {
        sse({ status: 'no_sources' });
      }
    }

    const finalContent = buffered + appendedMarkers;
    // Bookkeeping in onComplete (saving chat history, updating streaks, etc.)
    // must never surface as an AI error — the AI response is already done.
    if (onComplete) {
      try { await onComplete(finalContent, sources); }
      catch (bookkeepErr) { console.error('streamAIResponse onComplete threw:', bookkeepErr); }
    }
    sse({ done: true, sources });
    res.end();
  } catch (e) {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    console.error('Gemini stream error:', e);
    if (!res.writableEnded) {
      sse({ error: e?.message || String(e) });
      res.end();
    }
  }
}

// Lesson chat (conversational 5-phase)
app.post('/api/curriculum/:id/lesson/:lessonId/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { message, sourced, images } = req.body;
    req.sourced = !!sourced;
    req.images = Array.isArray(images) ? images : [];
    if (!message && !req.images.length) return res.status(400).json({ error: 'Message required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const curriculum = (users[email].data.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    // PAUSD courses are textbook-only. Force web search OFF — the AI must
    // teach inside the chapter scope of the assigned textbook (Big Ideas
    // Math, NGSS), not pull random sources from the wider internet.
    if (curriculum.source === 'pausd') req.sourced = false;

    // If the curriculum has attached source material (pdfs / urls), the
    // model answers ONLY from those — same rule as Study Mode. The
    // system prompt's ATTACHED SOURCES block forbids invention.
    const lessonSources = Array.isArray(curriculum.sources) ? curriculum.sources : [];
    if (lessonSources.length > 0) req.sourced = false;

    let lesson = null, unit = null;
    for (const u of curriculum.units || []) {
      const l = (u.lessons || []).find(l => l.id === req.params.lessonId);
      if (l) { lesson = l; unit = u; break; }
    }
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Initialize phase if needed
    if (!lesson.phase) lesson.phase = 'introduction';
    if (!lesson.chatHistory) lesson.chatHistory = [];
    if (!lesson.phaseData) lesson.phaseData = { questionsAsked: 0, questionsCorrect: 0 };

    // Add user message
    lesson.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Build system prompt for current phase. Pass the WHOLE curriculum so the
    // prompt builder can compose a "course memory" block — what was already
    // taught (with scores + summaries), what's coming up, where this lesson
    // sits — so the AI builds on prior lessons instead of re-teaching them.
    const systemPrompt = buildLessonChatPrompt(
      lesson.phase, lesson, unit, curriculum.settings,
      users[email].data.profile, users[email].data.preferences, lesson.chatHistory,
      users[email].data.assessmentHistory || [],
      curriculum
    );

    // Build messages from chat history. Attach the current turn's images to
    // the last user message so Gemini sees them as inline_data parts.
    const aiMessages = lesson.chatHistory.map(m => ({ role: m.role, content: m.content }));
    if (req.images.length && aiMessages.length && aiMessages[aiMessages.length - 1].role === 'user') {
      aiMessages[aiMessages.length - 1].images = req.images;
    }

    const tierModel = modelForUser(users[email], email);
    await streamAIResponse(res, systemPrompt, aiMessages, async (fullContent, sources) => {
      // Save AI response to chat history (with sources if web-search was on)
      const entry = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
      if (sources && sources.length) entry.sources = sources;
      lesson.chatHistory.push(entry);

      // Phase transition: model signal OR turn-cap fallback
      advancePhaseIfNeeded(lesson, fullContent);

      // Check for lesson completion — sanitize code fences + citation markers first.
      const cleanedCurr = fullContent
        .replace(/```(?:json|javascript|js)?\s*/gi, '')
        .replace(/```/g, '')
        .replace(/\s*\[\d+\]\s*/g, ' ');
      if (/\[LESSON_COMPLETE\]/.test(cleanedCurr)) {
        // Always mark complete — nothing below can block this.
        lesson.isCompleted = true;
        lesson.completedAt = new Date().toISOString();
        ensureLessonCompletionFields(users[email].data);
        const jsonStr = extractLessonDoneJson(cleanedCurr);
        if (jsonStr) {
          try {
            const completionData = JSON.parse(jsonStr);
            lesson.phaseData = { ...lesson.phaseData, ...completionData };
            lesson.score = completionData.questionsCorrect;
            const xp = completionData.xpEarned || 25;
            users[email].data.profile.xp += xp;
            if (users[email].data.profile.xp >= users[email].data.profile.xpToNextLevel) {
              users[email].data.profile.level++;
              users[email].data.profile.xp -= users[email].data.profile.xpToNextLevel;
              users[email].data.profile.xpToNextLevel = Math.floor(users[email].data.profile.xpToNextLevel * 1.5);
            }
          } catch (e) { console.warn('curriculum lesson completionData parse failed:', e.message); }
        } else {
          lesson.phaseData = { ...(lesson.phaseData || {}), xpEarned: 25 };
          users[email].data.profile.xp = (users[email].data.profile.xp || 0) + 25;
        }
        // Streak bookkeeping (isolated so a bad field can't stop the save).
        try {
          const today = new Date().toISOString().slice(0, 10);
          const streaks = users[email].data.studyStreaks;
          if (!users[email].data.dailyLog[today]) users[email].data.dailyLog[today] = { lessonsCompleted: 0 };
          users[email].data.dailyLog[today].lessonsCompleted++;
          if (streaks.lastActiveDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            streaks.currentStreak = streaks.lastActiveDate === yesterday ? streaks.currentStreak + 1 : 1;
            streaks.lastActiveDate = today;
            if (streaks.currentStreak > streaks.longestStreak) streaks.longestStreak = streaks.currentStreak;
          }
          streaks.weeklyActivity[new Date().getDay()] = (streaks.weeklyActivity[new Date().getDay()] || 0) + 1;
        } catch (e) { console.warn('curriculum lesson streak bookkeeping failed:', e.message); }
      }

      // Auto-complete goal milestones (also isolated).
      try { checkGoalMilestones(users[email].data); } catch (e) { console.warn('checkGoalMilestones failed:', e.message); }

      try { saveUsers(users); } catch (e) { console.error('saveUsers failed:', e.message); }
    }, tierModel, { enableWebSearch: !!req.sourced });
  } catch (e) {
    console.error('Lesson chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// Get lesson chat history
app.get('/api/curriculum/:id/lesson/:lessonId/history', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    let lesson = null;
    for (const u of curriculum.units || []) {
      const l = (u.lessons || []).find(l => l.id === req.params.lessonId);
      if (l) { lesson = l; break; }
    }
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ chatHistory: lesson.chatHistory || [], phase: lesson.phase || 'introduction', phaseData: lesson.phaseData || {} });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset lesson chat
app.post('/api/curriculum/:id/lesson/:lessonId/reset', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    for (const u of curriculum.units || []) {
      const l = (u.lessons || []).find(l => l.id === req.params.lessonId);
      if (l) {
        l.chatHistory = []; l.phase = null; l.phaseData = {};
        l.isCompleted = false; l.score = null;
        l.blocks = [];
        break;
      }
    }
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// STRUCTURED LESSON BLOCKS  (Claudius-style: R1 → Q1 → R2 → Q2 →
//   R3 (SRS based on Q1+Q2 misses) → Q3 → R4 → FINAL QUIZ)
//
// First 7 blocks generated up-front via /blocks/generate. The final
// quiz is generated lazily via /blocks/final-quiz/generate AFTER Q3
// is graded — that endpoint reads which questions the student got
// wrong in Q1-Q3 and folds those concepts back in. Spaced repetition
// for real, not just a label.
// =========================================================

function findUserCurriculum(users, email, cid) {
  return (users[email]?.data?.curricula || []).find(c => c.id === cid);
}
function findLessonInCurriculum(curriculum, lessonId) {
  for (const unit of curriculum.units || []) {
    for (const l of unit.lessons || []) {
      if (l.id === lessonId) return { unit, lesson: l };
    }
  }
  return null;
}
function stampBlock(lessonId, b, i, opts = {}) {
  const blockId = `${lessonId}-b${i}`;
  const base = {
    id: blockId,
    type: b.type,
    title: b.title || (b.type === 'quiz' ? `Quiz ${Math.floor(i / 2) + 1}` : `Reading ${Math.floor(i / 2) + 1}`),
    completedAt: null,
    ...(opts.srs ? { srs: true } : {}),
    ...(opts.isFinal ? { isFinal: true } : {}),
  };
  if (b.type === 'reading') return { ...base, content: String(b.content || '') };
  const questions = (Array.isArray(b.questions) ? b.questions : []).map((q, qi) => ({
    id: `${blockId}-q${qi}`,
    prompt: String(q.prompt || ''),
    choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
    answer: String(q.answer || ''),
    explanation: String(q.explanation || ''),
  }));
  return { ...base, questions, score: null, responses: null };
}

// Returns the missed-question summaries from any quiz blocks already
// graded on this lesson — used to feed SRS context into R3 / final quiz
// generation.
function collectMissedFromLesson(lesson) {
  const missed = [];
  for (const b of lesson.blocks || []) {
    if (b.type !== 'quiz' || !Array.isArray(b.responses)) continue;
    for (const r of b.responses) {
      if (r.correct) continue;
      const q = (b.questions || []).find(qq => qq.id === r.qid);
      if (!q) continue;
      missed.push({
        prompt: q.prompt,
        userPicked: r.given || '(no answer)',
        correctAnswer: q.answer,
        explanation: q.explanation || '',
      });
    }
  }
  return missed;
}

app.post('/api/curriculum/:id/lesson/:lessonId/blocks/generate', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const { unit, lesson } = found;

    // Idempotent: if 7 blocks already cached, return them as-is.
    if (Array.isArray(lesson.blocks) && lesson.blocks.length >= 7) {
      return res.json({ blocks: lesson.blocks });
    }

    const sys = `You generate one complete lesson as 7 blocks: 4 readings interleaved with 3 mid-quizzes. Output ONLY valid JSON — no markdown, no fences, no commentary.`;
    const prompt = `Build the lesson "${lesson.title}" from the unit "${unit.title}" of the course "${curriculum.title}".
${lesson.description ? `Lesson goal: ${lesson.description}\n` : ''}${curriculum.description ? `Course context: ${curriculum.description}\n` : ''}
Difficulty: ${curriculum.difficulty || 'intermediate'}.

EXACTLY 7 blocks in this order:
  1. reading_1 — Core definition + framing of the topic. The simplest correct mental model.
  2. quiz_1   — 3 multiple-choice questions on reading 1.
  3. reading_2 — Mechanics. How it works, with a worked numeric / concrete example.
  4. quiz_2   — 3 multiple-choice questions on reading 2.
  5. reading_3 — SPACED-REPETITION review of readings 1 + 2. The student has now seen R1 and R2 — return to the trickiest concepts from BOTH readings, re-frame from a different angle, hit the most common misconceptions head-on, and add ONE bridging idea that ties them together. This is NOT a new sub-concept — it is intentional review designed to make R1 + R2 stick. 350-450 words.
  6. quiz_3   — 3 multiple-choice questions that mix R1, R2, and R3 (i.e. drag Q1/Q2-style content back in alongside the R3 framing).
  7. reading_4 — Synthesis + edge cases. Tie the lesson to the surrounding course; surface 1-2 lingering subtleties.

Each reading: 350-500 words of markdown (## sub-heading + body, with **bold**, lists, fenced code where useful, math via $...$ or $$...$$ if it fits).
Each quiz question: a "prompt" (string), 4 "choices" (strings, no A) B) prefixes — UI adds them), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible — each wrong option encodes a real misconception.

Return JSON exactly in this shape:
{
  "blocks": [
    {"type":"reading","title":"Reading 1 — <name>","content":"<markdown>"},
    {"type":"quiz","title":"Quiz 1","questions":[{"prompt":"...","choices":["...","...","...","..."],"answer":"...","explanation":"..."},...3 total...]},
    ...
    {"type":"reading","title":"Reading 4 — <name>","content":"<markdown>"}
  ]
}`;

    // Speed: Flash (not Pro) is plenty for structured-JSON lesson generation
    // and runs ~2-3x faster. Reading + quiz quality is identical because
    // the prompt does the heavy lifting. Pro is reserved for free-form
    // tutoring where reasoning depth matters.
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 8192, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Lesson generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length !== 7) {
      console.error('Block parse failed. Got', parsed?.blocks?.length, 'blocks');
      return res.status(500).json({ error: 'Lesson did not return 7 blocks. Try again.' });
    }

    const blocks = parsed.blocks.map((b, i) => {
      // Block #5 (index 4) is the SRS reading — flag it.
      const opts = i === 4 ? { srs: true } : {};
      return stampBlock(lesson.id, b, i, opts);
    });

    lesson.blocks = blocks;
    saveUsers(users);
    res.json({ blocks });
  } catch (e) {
    console.error('blocks/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// Generate the final quiz lazily, after Q3 is graded. Pulls in the
// concepts the student missed in Q1-Q3 so the final quiz is real
// spaced repetition rather than a generic re-test.
app.post('/api/curriculum/:id/lesson/:lessonId/blocks/final-quiz/generate', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const { unit, lesson } = found;
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length < 7) {
      return res.status(400).json({ error: 'Run blocks/generate first' });
    }
    if (lesson.blocks.length === 8) {
      // already generated
      return res.json({ block: lesson.blocks[7] });
    }

    const missed = collectMissedFromLesson(lesson);
    const missedBlock = missed.length
      ? `MISSED QUESTIONS FROM Q1-Q3 (use these as the spine of the final quiz — re-test the same concepts from a different angle, do NOT repeat the questions verbatim):\n${missed.map((m, i) => `  ${i + 1}. Prompt: ${m.prompt}\n     Student picked: ${m.userPicked}\n     Correct: ${m.correctAnswer}\n     Why it tripped them: ${m.explanation}`).join('\n')}`
      : `(The student got every Q1-Q3 question right. Push harder: 5 application / synthesis questions that integrate readings 1-4.)`;

    const sys = `You write the FINAL QUIZ for a lesson — a 5-question multiple-choice quiz that integrates the whole lesson. Output ONLY valid JSON.`;
    const prompt = `Lesson: "${lesson.title}" (unit: "${unit.title}", course: "${curriculum.title}").
Difficulty: ${curriculum.difficulty || 'intermediate'}.

${missedBlock}

Write 5 multiple-choice questions:
- 3 of them must directly re-test the missed-concept areas from above (different angle, harder than the original question).
- 2 of them must test synthesis — pulling ideas from at least 2 different readings together.

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible — each wrong option encodes a real misconception.

Return JSON exactly:
{ "questions": [ ...5 total... ] }`;

    // Flash for speed — same reasoning as the bulk block generator.
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 4096, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Final quiz generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'Final quiz returned no questions. Try again.' });
    }

    const block = stampBlock(lesson.id, { type: 'quiz', title: 'Final Quiz', questions: parsed.questions }, 7, { isFinal: true });
    lesson.blocks.push(block);
    saveUsers(users);
    res.json({ block });
  } catch (e) {
    console.error('blocks/final-quiz/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/curriculum/:id/lesson/:lessonId/blocks/:bid/grade', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const block = (found.lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block || block.type !== 'quiz') return res.status(404).json({ error: 'Quiz block not found' });

    const responses = Array.isArray(req.body?.responses) ? req.body.responses : [];
    const results = block.questions.map(q => {
      const r = responses.find(x => x.qid === q.id);
      const given = r?.given || '';
      const correct = !!given && given.trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
      return { qid: q.id, given, correct };
    });
    const correctCount = results.filter(r => r.correct).length;
    const score = block.questions.length > 0 ? Math.round((correctCount / block.questions.length) * 100) : 0;

    block.score = score;
    block.responses = results;
    block.completedAt = new Date().toISOString();
    saveUsers(users);

    res.json({ score, results });
  } catch (e) {
    console.error('blocks/grade failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/curriculum/:id/lesson/:lessonId/blocks/:bid/complete', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const block = (found.lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block) return res.status(404).json({ error: 'Block not found' });

    if (!block.completedAt) block.completedAt = new Date().toISOString();

    const allDone = (found.lesson.blocks || []).length === 8 &&
                    (found.lesson.blocks || []).every(b => b.completedAt);
    if (allDone && !found.lesson.isCompleted) {
      found.lesson.isCompleted = true;
      const quizScores = (found.lesson.blocks || [])
        .filter(b => b.type === 'quiz' && typeof b.score === 'number').map(b => b.score);
      found.lesson.score = quizScores.length ? Math.round(quizScores.reduce((s, n) => s + n, 0) / quizScores.length) : null;
    }
    saveUsers(users);
    res.json({ block, lesson: { isCompleted: !!found.lesson.isCompleted, score: found.lesson.score ?? null } });
  } catch (e) {
    console.error('blocks/complete failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// MIDTERMS / FINALS — course-level SRS exams
//
// `midterm`: built once half the lessons in the course are complete.
// `final`:   built once all (or 90%+) lessons in the course are complete.
//
// Both pull the missed-question pool from EVERY graded quiz across
// EVERY lesson and use it as the basis for the exam. Stored on the
// curriculum at `curriculum.exams = { midterm: {...}, final: {...} }`.
// =========================================================

function collectMissedAcrossCurriculum(curriculum) {
  const missed = [];
  for (const unit of curriculum.units || []) {
    for (const l of unit.lessons || []) {
      for (const b of l.blocks || []) {
        if (b.type !== 'quiz' || !Array.isArray(b.responses)) continue;
        for (const r of b.responses) {
          if (r.correct) continue;
          const q = (b.questions || []).find(qq => qq.id === r.qid);
          if (!q) continue;
          missed.push({
            unit: unit.title,
            lesson: l.title,
            prompt: q.prompt,
            userPicked: r.given || '(no answer)',
            correctAnswer: q.answer,
            explanation: q.explanation || '',
          });
        }
      }
    }
  }
  return missed;
}

function curriculumLessonProgress(curriculum) {
  let total = 0, done = 0;
  for (const unit of curriculum.units || []) {
    for (const l of unit.lessons || []) {
      total++;
      if (l.isCompleted) done++;
    }
  }
  return { total, done, fraction: total > 0 ? done / total : 0 };
}

app.get('/api/curriculum/:id/exams', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const exams = curriculum.exams || {};
    const progress = curriculumLessonProgress(curriculum);
    res.json({
      progress,
      midterm: exams.midterm || null,
      final: exams.final || null,
      midtermAvailable: progress.fraction >= 0.5,
      finalAvailable: progress.fraction >= 0.9,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/curriculum/:id/exams/:kind/generate', authMiddleware, async (req, res) => {
  try {
    const kind = req.params.kind === 'final' ? 'final' : 'midterm';
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    if (!curriculum.exams) curriculum.exams = {};
    if (curriculum.exams[kind]) {
      // already generated; return as-is
      return res.json({ exam: curriculum.exams[kind] });
    }

    const progress = curriculumLessonProgress(curriculum);
    const minFraction = kind === 'final' ? 0.9 : 0.5;
    if (progress.fraction < minFraction) {
      return res.status(400).json({ error: `Need ${Math.ceil(minFraction * 100)}% of lessons complete to unlock the ${kind} (you're at ${Math.round(progress.fraction * 100)}%).` });
    }

    const missed = collectMissedAcrossCurriculum(curriculum);
    const questionCount = kind === 'final' ? 20 : 12;

    const missedBlock = missed.length
      ? `MISSED QUESTION POOL (every wrong answer the student gave across the course — use these as the spine):\n${missed.slice(0, 30).map((m, i) => `  ${i + 1}. [${m.unit} / ${m.lesson}] Q: ${m.prompt}\n     Picked: ${m.userPicked}  Correct: ${m.correctAnswer}\n     Why: ${m.explanation}`).join('\n')}`
      : `(The student got every quiz right so far. Push harder: write ${questionCount} application/synthesis questions integrating the whole course.)`;

    const sys = `You write a ${kind === 'final' ? 'final exam' : 'midterm'} for a course. ${questionCount} multiple-choice questions, integrating concepts across the whole course. Output ONLY valid JSON — no markdown, no fences.`;
    const prompt = `Course: "${curriculum.title}".
${curriculum.description ? `Course description: ${curriculum.description}\n` : ''}Difficulty: ${curriculum.difficulty || 'intermediate'}.
Units covered:
${(curriculum.units || []).map((u, i) => `  ${i + 1}. ${u.title}${u.description ? ` — ${u.description}` : ''}`).join('\n')}

${missedBlock}

Write ${questionCount} multiple-choice questions for the ${kind}.
- ${kind === 'final' ? '~70%' : '~60%'} should re-test the missed-concept areas above (DIFFERENT angle, harder than the original — never repeat verbatim).
- The rest must test synthesis — pulling concepts from MULTIPLE units together.
- ${kind === 'final' ? 'The final has 2-3 cumulative "boss" questions that demand application across 3+ units.' : 'The midterm leans on the FIRST half of the course material.'}

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).

Return JSON exactly:
{ "questions": [ ...${questionCount} total... ] }`;

    // Flash for speed — exams are 12-20 multiple-choice questions, no
    // reasoning depth required beyond the prompt's instructions.
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 8192, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Exam generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'Exam returned no questions. Try again.' });
    }

    const examId = `${curriculum.id}-${kind}`;
    const exam = {
      id: examId,
      kind,
      title: kind === 'final' ? 'Final Exam' : 'Midterm',
      questions: parsed.questions.map((q, qi) => ({
        id: `${examId}-q${qi}`,
        prompt: String(q.prompt || ''),
        choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
        answer: String(q.answer || ''),
        explanation: String(q.explanation || ''),
      })),
      missedSourceCount: missed.length,
      generatedAt: new Date().toISOString(),
      score: null,
      responses: null,
      completedAt: null,
    };
    curriculum.exams[kind] = exam;
    saveUsers(users);
    res.json({ exam });
  } catch (e) {
    console.error('exams/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/curriculum/:id/exams/:examId/grade', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    // examId might be `<cid>-midterm` or `<cid>-final` — locate accordingly.
    const exams = curriculum.exams || {};
    let exam = null, kind = null;
    for (const k of ['midterm', 'final']) {
      if (exams[k] && exams[k].id === req.params.examId) { exam = exams[k]; kind = k; break; }
    }
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const responses = Array.isArray(req.body?.responses) ? req.body.responses : [];
    const results = exam.questions.map(q => {
      const r = responses.find(x => x.qid === q.id);
      const given = r?.given || '';
      const correct = !!given && given.trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
      return { qid: q.id, given, correct };
    });
    const correctCount = results.filter(r => r.correct).length;
    const score = exam.questions.length > 0 ? Math.round((correctCount / exam.questions.length) * 100) : 0;
    exam.score = score;
    exam.responses = results;
    exam.completedAt = new Date().toISOString();
    saveUsers(users);
    res.json({ score, results, kind });
  } catch (e) {
    console.error('exams/grade failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== STUDY MODE =====

app.post('/api/study/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { message, sessionId, context, sourced, images } = req.body;
    // Source-mode + attached sources interaction:
    //   • If the user has attached PDFs/URLs (`context.sources`), the
    //     model must answer ONLY from those — no web fallback. So when
    //     attached sources are present, we disable web search entirely
    //     even if `sourced=true` was sent. The system prompt's ATTACHED
    //     SOURCES rules already enforce no-fabrication.
    //   • Otherwise, `sourced=true` keeps the existing Google-Search
    //     grounding path.
    const hasAttachedSources = !!(context && Array.isArray(context.sources) && context.sources.length > 0);
    req.sourced = !!sourced && !hasAttachedSources;
    req.hasAttachedSources = hasAttachedSources;
    req.images = Array.isArray(images) ? images : [];
    if (!message && !req.images.length) return res.status(400).json({ error: 'Message required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    // Find or create session
    let session = sessionId ? (users[email].data.studySessions || []).find(s => s.id === sessionId) : null;
    if (!session) {
      session = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), lastMessageAt: null, messages: [], context: context || {} };
      users[email].data.studySessions.unshift(session);
    } else if (context && (context.curriculumId !== undefined || context.sources !== undefined)) {
      // Mid-session context updates: caller flipped on curriculum
      // integration or attached sources after the session started.
      // Merge into the persisted context so subsequent turns inherit it.
      session.context = { ...(session.context || {}), ...context };
    }

    session.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    session.lastMessageAt = new Date().toISOString();

    const systemPrompt = buildStudyModePrompt(
      users[email].data.profile, users[email].data.goals,
      users[email].data.curricula, users[email].data.preferences,
      users[email].data.assessmentHistory || [],
      session.context || null
    );

    const aiMessages = session.messages.map(m => ({ role: m.role, content: m.content }));
    if (req.images.length && aiMessages.length && aiMessages[aiMessages.length - 1].role === 'user') {
      aiMessages[aiMessages.length - 1].images = req.images;
    }

    // Send sessionId in the first event
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ sessionId: session.id })}\n\n`);

    const tierModel = modelForUser(users[email], email);
    await streamAIResponse(res, systemPrompt, aiMessages, async (fullContent, sources) => {
      const msg = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
      if (sources && sources.length) msg.sources = sources;
      session.messages.push(msg);

      // Check for milestone completion markers
      const milestoneMatches = fullContent.matchAll(/\[MILESTONE_COMPLETE:([^\]]+)\]/g);
      for (const match of milestoneMatches) {
        const mid = match[1];
        for (const goal of users[email].data.goals || []) {
          const milestone = (goal.milestones || []).find(m => m.id === mid);
          if (milestone && !milestone.isCompleted) {
            milestone.isCompleted = true;
            milestone.completedAt = new Date().toISOString();
            milestone.completedVia = 'study_mode';
            goal.progress = Math.round(((goal.milestones.filter(m => m.isCompleted).length) / goal.milestones.length) * 100);
          }
        }
      }

      // Keep only last 50 sessions
      if (users[email].data.studySessions.length > 50) {
        users[email].data.studySessions = users[email].data.studySessions.slice(0, 50);
      }

      saveUsers(users);
    }, tierModel, { enableWebSearch: !!req.sourced });
  } catch (e) {
    console.error('Study chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.get('/api/study/sessions', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const sessions = (users[email].data?.studySessions || []).map(s => ({
      id: s.id, startedAt: s.startedAt, lastMessageAt: s.lastMessageAt,
      messageCount: s.messages?.length || 0, context: s.context,
      preview: s.messages?.[0]?.content?.slice(0, 80) || '',
    }));
    res.json({ sessions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/study/sessions/:sid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const session = (users[email].data?.studySessions || []).find(s => s.id === req.params.sid);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/study/sessions/:sid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data.studySessions = (users[email].data.studySessions || []).filter(s => s.id !== req.params.sid);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== GOALS =====

app.get('/api/goals', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    res.json({ goals: users[email].data?.goals || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    // AI generates milestones
    const { system, user } = buildGoalMilestonesPrompt(title, description, users[email].data.curricula);
    const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 2048, { jsonMode: true, temperature: 0.5 });

    let milestones = [];
    if (result.success) {
      const parsed = parseAIJson(result.data.content?.[0]?.text || '');
      if (parsed?.milestones) {
        milestones = parsed.milestones.map((m, i) => ({
          id: crypto.randomUUID(), title: m.title, isCompleted: false, completedAt: null, completedVia: null,
        }));
      }
    }
    // Fallback if AI fails
    if (milestones.length === 0) {
      milestones = Array.from({ length: 5 }, (_, i) => ({
        id: crypto.randomUUID(), title: `Milestone ${i + 1}`, isCompleted: false, completedAt: null, completedVia: null,
      }));
    }

    const goal = {
      id: crypto.randomUUID(), title, description: description || '', createdAt: new Date().toISOString(),
      status: 'active', linkedCurriculumIds: [], milestones, progress: 0,
    };

    users[email].data.goals.unshift(goal);
    saveUsers(users);
    res.json({ goal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/goals/:gid', authMiddleware, (req, res) => {
  try {
    const { updates } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const goal = (users[email].data?.goals || []).find(g => g.id === req.params.gid);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    Object.assign(goal, updates);
    saveUsers(users);
    res.json({ goal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/goals/:gid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data.goals = (users[email].data.goals || []).filter(g => g.id !== req.params.gid);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals/:gid/milestones/:mid/complete', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const goal = (users[email].data?.goals || []).find(g => g.id === req.params.gid);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const milestone = (goal.milestones || []).find(m => m.id === req.params.mid);
    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    milestone.isCompleted = !milestone.isCompleted;
    milestone.completedAt = milestone.isCompleted ? new Date().toISOString() : null;
    milestone.completedVia = milestone.isCompleted ? 'manual' : null;
    goal.progress = Math.round(((goal.milestones.filter(m => m.isCompleted).length) / goal.milestones.length) * 100);
    if (goal.progress === 100) goal.status = 'completed';
    saveUsers(users);
    res.json({ goal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== FLASHCARDS =====

app.get('/api/flashcards', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const decks = (users[email].data?.flashcardDecks || []).map(d => ({
      id: d.id, title: d.title, createdAt: d.createdAt, cardCount: (d.cards || []).length,
      dueCount: (d.cards || []).filter(c => !c.nextReview || new Date(c.nextReview) <= new Date()).length,
    }));
    res.json({ decks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flashcards', authMiddleware, async (req, res) => {
  try {
    const { title, topic, count, difficulty } = req.body;
    if (!title && !topic) return res.status(400).json({ error: 'Title or topic required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    let cards = [];
    if (topic) {
      const { system, user } = buildFlashcardPrompt(topic, count || 10, difficulty || 'beginner');
      const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096, { jsonMode: true, temperature: 0.6 });
      if (result.success) {
        const parsed = parseAIJson(result.data.content?.[0]?.text || '');
        if (parsed?.cards) {
          cards = parsed.cards.map(c => ({
            id: crypto.randomUUID(), front: c.front, back: c.back,
            srLevel: 0, nextReview: new Date().toISOString(), lastReviewed: null, correctCount: 0, incorrectCount: 0,
          }));
        }
      }
    }

    const deck = { id: crypto.randomUUID(), title: title || topic, createdAt: new Date().toISOString(), cards };
    users[email].data.flashcardDecks.unshift(deck);
    saveUsers(users);
    res.json({ deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/flashcards/:deckId', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    res.json({ deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/flashcards/:deckId', authMiddleware, (req, res) => {
  try {
    const { title } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    if (title) deck.title = title;
    saveUsers(users);
    res.json({ deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/flashcards/:deckId', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data.flashcardDecks = (users[email].data.flashcardDecks || []).filter(d => d.id !== req.params.deckId);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flashcards/:deckId/cards', authMiddleware, async (req, res) => {
  try {
    const { cards, topic, count, difficulty } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    let newCards = [];
    if (topic) {
      const { system, user } = buildFlashcardPrompt(topic, count || 10, difficulty || 'beginner');
      const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096, { jsonMode: true, temperature: 0.6 });
      if (result.success) {
        const parsed = parseAIJson(result.data.content?.[0]?.text || '');
        if (parsed?.cards) {
          newCards = parsed.cards.map(c => ({
            id: crypto.randomUUID(), front: c.front, back: c.back,
            srLevel: 0, nextReview: new Date().toISOString(), lastReviewed: null, correctCount: 0, incorrectCount: 0,
          }));
        }
      }
    } else if (cards) {
      newCards = cards.map(c => ({
        id: crypto.randomUUID(), front: c.front, back: c.back,
        srLevel: 0, nextReview: new Date().toISOString(), lastReviewed: null, correctCount: 0, incorrectCount: 0,
      }));
    }

    deck.cards.push(...newCards);
    saveUsers(users);
    res.json({ deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/flashcards/:deckId/cards/:cardId', authMiddleware, (req, res) => {
  try {
    const { front, back } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    const card = (deck.cards || []).find(c => c.id === req.params.cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (front !== undefined) card.front = front;
    if (back !== undefined) card.back = back;
    saveUsers(users);
    res.json({ card });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/flashcards/:deckId/cards/:cardId', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    deck.cards = (deck.cards || []).filter(c => c.id !== req.params.cardId);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/flashcards/:deckId/review', authMiddleware, (req, res) => {
  try {
    const { cardId, correct } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const deck = (users[email].data?.flashcardDecks || []).find(d => d.id === req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });
    const card = (deck.cards || []).find(c => c.id === cardId);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    card.lastReviewed = new Date().toISOString();
    if (correct) {
      card.correctCount++;
      card.srLevel = Math.min((card.srLevel || 0) + 1, SR_INTERVALS.length - 1);
    } else {
      card.incorrectCount++;
      card.srLevel = 0;
    }
    card.nextReview = new Date(Date.now() + SR_INTERVALS[card.srLevel]).toISOString();

    saveUsers(users);
    res.json({ card });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== NOTES =====

app.get('/api/notes', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const notes = (users[email].data?.notes || []).map(n => ({
      id: n.id, title: n.title, type: n.type || 'regular', createdAt: n.createdAt, updatedAt: n.updatedAt,
      preview: (n.mainNotes || '').slice(0, 100),
    }));
    res.json({ notes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes', authMiddleware, (req, res) => {
  try {
    const { title, type } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const note = {
      id: crypto.randomUUID(), title: title || 'Untitled Note', type: type || 'regular',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      cues: [], mainNotes: '', summary: '',
      linkedCurriculumId: null, linkedLessonId: null,
    };
    users[email].data.notes.unshift(note);
    saveUsers(users);
    res.json({ note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notes/:nid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const note = (users[email].data?.notes || []).find(n => n.id === req.params.nid);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notes/:nid', authMiddleware, (req, res) => {
  try {
    const { title, cues, mainNotes, summary } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const note = (users[email].data?.notes || []).find(n => n.id === req.params.nid);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (title !== undefined) note.title = title;
    if (cues !== undefined) note.cues = cues;
    if (mainNotes !== undefined) note.mainNotes = mainNotes;
    if (summary !== undefined) note.summary = summary;
    note.updatedAt = new Date().toISOString();
    saveUsers(users);
    res.json({ note });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/notes/:nid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data.notes = (users[email].data.notes || []).filter(n => n.id !== req.params.nid);
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes/:nid/generate-cues', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const note = (users[email].data?.notes || []).find(n => n.id === req.params.nid);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (!note.mainNotes) return res.status(400).json({ error: 'No notes to generate cues from' });

    const { system, user } = buildCueGenerationPrompt(note.mainNotes);
    const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 1024, { jsonMode: true, temperature: 0.4 });
    if (result.success) {
      const parsed = parseAIJson(result.data.content?.[0]?.text || '');
      if (parsed?.cues) {
        note.cues = parsed.cues;
        note.updatedAt = new Date().toISOString();
        saveUsers(users);
        return res.json({ cues: note.cues });
      }
    }
    res.status(500).json({ error: 'Failed to generate cues' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notes/:nid/generate-summary', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const note = (users[email].data?.notes || []).find(n => n.id === req.params.nid);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (!note.mainNotes) return res.status(400).json({ error: 'No notes to summarize' });

    const { system, user } = buildSummaryPrompt(note.cues, note.mainNotes);
    const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 1024, { jsonMode: true, temperature: 0.4 });
    if (result.success) {
      const parsed = parseAIJson(result.data.content?.[0]?.text || '');
      if (parsed?.summary) {
        note.summary = parsed.summary;
        note.updatedAt = new Date().toISOString();
        saveUsers(users);
        return res.json({ summary: note.summary });
      }
    }
    res.status(500).json({ error: 'Failed to generate summary' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ASSESSMENTS =====

app.post('/api/assessment/generate', authMiddleware, async (req, res) => {
  try {
    const { topic, type, questionCount, difficulty } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic required' });

    const { system, user } = buildAssessmentPrompt(topic, type || 'quiz', questionCount || 5, difficulty || 'beginner');
    // jsonMode forces Gemini to emit strict JSON — eliminates the "Failed
    // to parse assessment" failures that came from the model wrapping
    // output in markdown fences or adding a preamble.
    const result = await callGemini(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096, { jsonMode: true, temperature: 0.5 });
    if (!result.success) return res.status(500).json({ error: result.error });

    const rawText = result.data.content?.[0]?.text || '';
    const parsed = parseAIJson(rawText);
    if (!parsed) {
      console.error('Assessment parse failed. First 400 chars:', rawText.slice(0, 400));
      return res.status(500).json({ error: 'Failed to parse assessment. Try again.' });
    }

    const assessment = { id: crypto.randomUUID(), ...parsed, createdAt: new Date().toISOString() };
    res.json({ assessment });
  } catch (e) {
    console.error('Assessment generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/assessment/grade', authMiddleware, async (req, res) => {
  try {
    const { assessment, answers } = req.body;
    if (!assessment || !answers) return res.status(400).json({ error: 'Assessment and answers required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    // ===== ESSAY PATH — AI grades against rubric =====
    if (assessment.type === 'essay') {
      const essayText = String(answers.essay || '').trim();
      if (!essayText) return res.status(400).json({ error: 'Essay text required' });
      if (essayText.length < 30) return res.status(400).json({ error: 'Essay must be at least 30 characters' });

      const rubric = Array.isArray(assessment.rubric) ? assessment.rubric : [];
      const rubricLines = rubric.map((r, i) =>
        `${i + 1}. ${r.criterion} (max ${r.maxScore || 5} pts) — ${r.description || ''}`
      ).join('\n') || '(no rubric provided — grade holistically out of 5 for organization, evidence, and analysis)';

      const sys = `You are a strict but fair essay grader. Grade the student's essay against the rubric. Output ONLY valid JSON — no markdown, no preamble.`;
      const usr = `ESSAY PROMPT:
${assessment.prompt || assessment.title || ''}

RUBRIC:
${rubricLines}

STUDENT'S ESSAY:
"""
${essayText.slice(0, 12000)}
"""

Return JSON exactly in this shape (one rubricScores entry per rubric criterion above, in the same order):
{
  "rubricScores": [{"criterion": "...", "score": N, "maxScore": N, "feedback": "1-2 sentences explaining the score and what would have earned full marks"}],
  "overallFeedback": "2-3 sentences summarizing the essay's strengths and weaknesses",
  "strengths": ["specific thing the essay did well", "another specific thing"],
  "improvements": ["specific concrete revision", "another specific revision"]
}`;

      const tierModel = modelForUser(users[email], email);
      const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], tierModel, 2000, { jsonMode: true, temperature: 0.4 });
      if (!aiResp.success) return res.status(500).json({ error: aiResp.error || 'Grading failed' });
      const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
      if (!parsed || !Array.isArray(parsed.rubricScores)) {
        return res.status(500).json({ error: 'Failed to parse grading response' });
      }

      const score = parsed.rubricScores.reduce((s, r) => s + (Number(r.score) || 0), 0);
      const total = parsed.rubricScores.reduce((s, r) => s + (Number(r.maxScore) || 0), 0)
        || rubric.reduce((s, r) => s + (Number(r.maxScore) || 5), 0)
        || 5;

      const result = {
        id: crypto.randomUUID(),
        type: 'essay',
        topic: assessment.title || '',
        score, total,
        percentage: total > 0 ? Math.round((score / total) * 100) : 0,
        rubricScores: parsed.rubricScores,
        overallFeedback: String(parsed.overallFeedback || '').slice(0, 1000),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 6) : [],
        improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 6) : [],
        essay: essayText.slice(0, 3000),
        prompt: assessment.prompt || '',
        createdAt: new Date().toISOString(),
      };

      users[email].data.assessmentHistory.unshift(result);
      if (users[email].data.assessmentHistory.length > 100) {
        users[email].data.assessmentHistory = users[email].data.assessmentHistory.slice(0, 100);
      }

      // Update topic scores from the essay percentage (same as quiz path)
      const topicKey = (assessment.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (topicKey && users[email].data.profile) {
        const existing = users[email].data.profile.topicScores[topicKey] || { score: 0, attempts: 0 };
        existing.attempts++;
        existing.score = Math.round((existing.score * (existing.attempts - 1) + result.percentage) / existing.attempts);
        existing.lastAttempt = new Date().toISOString();
        users[email].data.profile.topicScores[topicKey] = existing;

        const scores = Object.entries(users[email].data.profile.topicScores);
        users[email].data.profile.strengths = scores.filter(([, v]) => v.score >= 80).map(([k]) => k).slice(0, 5);
        users[email].data.profile.weaknesses = scores.filter(([, v]) => v.score < 60).map(([k]) => k).slice(0, 5);
      }

      try { checkGoalMilestones(users[email].data); } catch (e) { console.warn('checkGoalMilestones failed:', e.message); }
      saveUsers(users);
      return res.json({ result });
    }

    // ===== QUIZ PATH (multiple-choice) =====
    let score = 0;
    const details = (assessment.questions || []).map((q, i) => {
      const userAnswer = answers[i] || answers[q.id];
      const isCorrect = userAnswer === q.correct;
      if (isCorrect) score++;
      return { question: q.question, answer: userAnswer, correct: isCorrect, correctAnswer: q.correct, explanation: q.explanation || '' };
    });

    const total = assessment.questions?.length || 0;
    const result = {
      id: crypto.randomUUID(), type: assessment.type || 'quiz', topic: assessment.title || '',
      score, total, percentage: total > 0 ? Math.round((score / total) * 100) : 0,
      details, createdAt: new Date().toISOString(),
    };

    users[email].data.assessmentHistory.unshift(result);
    // Keep last 100
    if (users[email].data.assessmentHistory.length > 100) {
      users[email].data.assessmentHistory = users[email].data.assessmentHistory.slice(0, 100);
    }

    // Update profile topic scores
    const topicKey = (assessment.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (topicKey && users[email].data.profile) {
      const existing = users[email].data.profile.topicScores[topicKey] || { score: 0, attempts: 0 };
      existing.attempts++;
      existing.score = Math.round((existing.score * (existing.attempts - 1) + result.percentage) / existing.attempts);
      existing.lastAttempt = new Date().toISOString();
      users[email].data.profile.topicScores[topicKey] = existing;

      // Update strengths/weaknesses
      const scores = Object.entries(users[email].data.profile.topicScores);
      users[email].data.profile.strengths = scores.filter(([, v]) => v.score >= 80).map(([k]) => k).slice(0, 5);
      users[email].data.profile.weaknesses = scores.filter(([, v]) => v.score < 60).map(([k]) => k).slice(0, 5);
    }

    // Auto-complete goal milestones based on updated profile
    checkGoalMilestones(users[email].data);

    saveUsers(users);
    res.json({ result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/assessment/history', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    res.json({ history: users[email].data?.assessmentHistory || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== GEMS (removed) =====
// Endpoints intentionally deleted per product direction. Left as a
// breadcrumb so nobody tries to re-add them without discussion.
app.get('/api/gems-removed-marker', authMiddleware, (req, res) => { res.status(410).json({ error: 'Removed' }); });

/*
app.get('/api/gems', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    // Strip chatHistory from list payload to keep it small.
    const list = (users[email].data.gems || []).map(g => ({
      ...g, chatHistory: undefined, messageCount: (g.chatHistory || []).length,
    }));
    res.json({ gems: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gems', authMiddleware, (req, res) => {
  try {
    const { name, description, instructions, icon, color } = req.body || {};
    if (!name?.trim() || !instructions?.trim()) {
      return res.status(400).json({ error: 'Name and instructions are required' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const gem = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 60),
      description: (description || '').trim().slice(0, 200),
      instructions: instructions.trim().slice(0, 4000),
      icon: icon || 'Sparkles',
      color: color || 'violet',
      chatHistory: [],
      createdAt: new Date().toISOString(),
    };
    users[email].data.gems.unshift(gem);
    saveUsers(users);
    res.json({ gem });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/gems/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const gem = (users[email].data.gems || []).find(g => g.id === req.params.id);
    if (!gem) return res.status(404).json({ error: 'Gem not found' });
    const { name, description, instructions, icon, color } = req.body || {};
    if (name !== undefined) gem.name = String(name).slice(0, 60);
    if (description !== undefined) gem.description = String(description).slice(0, 200);
    if (instructions !== undefined) gem.instructions = String(instructions).slice(0, 4000);
    if (icon !== undefined) gem.icon = icon;
    if (color !== undefined) gem.color = color;
    saveUsers(users);
    res.json({ gem });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/gems/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    users[email].data.gems = (users[email].data.gems || []).filter(g => g.id !== req.params.id);
    saveUsers(users);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/gems/:id/history', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const gem = (users[email].data.gems || []).find(g => g.id === req.params.id);
    if (!gem) return res.status(404).json({ error: 'Gem not found' });
    res.json({ gem: { ...gem }, chatHistory: gem.chatHistory || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gems/:id/reset', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const gem = (users[email].data.gems || []).find(g => g.id === req.params.id);
    if (!gem) return res.status(404).json({ error: 'Gem not found' });
    gem.chatHistory = [];
    saveUsers(users);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gems/:id/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { message, sourced } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const gem = (users[email].data.gems || []).find(g => g.id === req.params.id);
    if (!gem) return res.status(404).json({ error: 'Gem not found' });

    // Append user turn, persist immediately so history is consistent if the
    // stream is interrupted.
    if (!Array.isArray(gem.chatHistory)) gem.chatHistory = [];
    gem.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    saveUsers(users);

    const system = `You are "${gem.name}", a custom AI assistant. Follow these instructions exactly:\n\n${gem.instructions}\n\nStay in character. Use markdown where helpful.`;
    const history = gem.chatHistory.slice(-30).map(m => ({ role: m.role, content: m.content }));
    const model = modelForUser(users[email], email);

    await streamAIResponse(
      res, system, history,
      (fullContent, sources) => {
        const after = loadUsers();
        const g = (after[email]?.data?.gems || []).find(x => x.id === gem.id);
        if (g) {
          if (!Array.isArray(g.chatHistory)) g.chatHistory = [];
          const msg = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
          if (sources?.length) msg.sources = sources;
          g.chatHistory.push(msg);
          saveUsers(after);
        }
      },
      model,
      { enableWebSearch: !!sourced },
    );
  } catch (e) {
    console.error('Gem chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else { res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`); res.end(); }
  }
});
*/

// ===== SLIDESHOWS =====
// AI-generated + manually-built presentation decks. Full CRUD, templates,
// inline image support (image URLs), speaker notes, multiple layouts.

// Slide-deck templates for the "Start blank" flow. Each returns a seed
// array of slides with placeholder content the user then edits.
// Safe numeric clamp for freeform slide element coords.
function clamp(n, lo, hi) { n = Number(n); if (!Number.isFinite(n)) return lo; return Math.max(lo, Math.min(hi, n)); }

// Strip <script>, javascript: URLs, and on* event handlers from pasted
// SVG markup. Keeps the markup rendered-only, never executed.
function sanitizeSvg(raw) {
  if (!raw) return '';
  let s = String(raw).slice(0, 50_000);
  // Only allow content starting with <svg or a single tag — reject anything else.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/ on[a-z]+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/javascript:/gi, '');
  // Require the content to contain an <svg> root.
  if (!/<svg[\s>]/i.test(s)) return '';
  return s;
}

function buildTemplateSlides(id, title, deckId) {
  function s(i, layout, title, subtitle, bullets, notes = '', extras = {}) {
    return {
      id: `${deckId}-${i}`, layout, title, subtitle: subtitle || '',
      bullets: bullets || [], notes, image: extras.image || '', imageCaption: extras.imageCaption || '',
    };
  }
  switch (id) {
    case 'pitch':
      return [
        s(0, 'title',   title || 'Our Pitch',      'One-line hook for the product', [],      'Open strong. State the problem in one sentence.'),
        s(1, 'content', 'The Problem',             '', ['Pain point 1', 'Pain point 2', 'Who feels it most'], 'Make it visceral — name the user.'),
        s(2, 'content', 'Our Solution',            '', ['Core feature', 'What makes us different', 'Why it works'], 'Demo here if you have one.'),
        s(3, 'content', 'Why Now',                 '', ['Shift 1', 'Shift 2', 'Shift 3'], 'Timing is everything.'),
        s(4, 'content', 'Traction',                '', ['Users / revenue', 'Growth rate', 'Notable signals'], 'Hard numbers only.'),
        s(5, 'content', 'The Team',                '', ['Founder 1 — role', 'Founder 2 — role', 'Advisors'], 'Why this team can win.'),
        s(6, 'summary', 'The Ask',                 '', ['Amount raising', 'Use of funds', 'Timeline'], 'End with a clear ask.'),
      ];
    case 'lesson':
      return [
        s(0, 'title',   title || 'Lesson title',  'A 1-sentence hook', [], 'Start by naming what the student will walk away with.'),
        s(1, 'content', 'What it is',             '', ['Definition', 'Everyday analogy', 'Why it matters'], ''),
        s(2, 'content', 'How it works',           '', ['Step 1', 'Step 2', 'Step 3'], ''),
        s(3, 'content', 'Worked example',         '', ['Given: …', 'Process: …', 'Answer: …'], 'Walk through each step out loud.'),
        s(4, 'content', 'Common mistakes',        '', ['Mistake 1 → correct view', 'Mistake 2 → correct view'], ''),
        s(5, 'summary', 'Recap',                  '', ['Key idea', 'What to practice next'], ''),
      ];
    case 'bookreport':
      return [
        s(0, 'title',   title || 'Book Report', 'Author · Year', [], ''),
        s(1, 'content', 'Premise',              '', ['Setting', 'Main character(s)', 'Central conflict'], ''),
        s(2, 'content', 'Plot summary',         '', ['Act 1', 'Act 2', 'Act 3'], 'Keep it under 90 seconds to read aloud.'),
        s(3, 'content', 'Themes',               '', ['Theme 1 — supporting quote', 'Theme 2 — supporting quote'], ''),
        s(4, 'quote',   '"A resonant quote from the book."', '— Character / page #', [], ''),
        s(5, 'content', 'What I took away',     '', ['Insight 1', 'Insight 2'], ''),
        s(6, 'summary', 'Rating & recommendation', '', ['Who should read this', 'Who should skip'], ''),
      ];
    case 'project':
      return [
        s(0, 'title',   title || 'Project proposal', 'Working title', [], ''),
        s(1, 'content', 'Background',          '', ['Context', 'What exists today', 'Gap'], ''),
        s(2, 'content', 'Goal',                '', ['What we\u2019re building', 'Who it\u2019s for'], ''),
        s(3, 'content', 'Approach',            '', ['Phase 1', 'Phase 2', 'Phase 3'], ''),
        s(4, 'content', 'Timeline',            '', ['Week 1-2', 'Week 3-4', 'Week 5+'], ''),
        s(5, 'content', 'Risks',               '', ['Risk 1 → mitigation', 'Risk 2 → mitigation'], ''),
        s(6, 'summary', 'Success metrics',     '', ['How we\u2019ll measure it', 'What \u201cdone\u201d looks like'], ''),
      ];
    case 'class':
      return [
        s(0, 'title',   title || 'Class Presentation', 'Your name · Class · Date', [], ''),
        s(1, 'content', 'Overview',            '', ['What this talk covers', 'Why it matters'], ''),
        s(2, 'imageRight', 'Visual context',   '', ['Key point tied to the image', 'Second point'], 'Describe the image out loud.', { image: '', imageCaption: 'Replace with an image URL on the right panel' }),
        s(3, 'content', 'Deep dive',           '', ['Point A', 'Point B', 'Point C'], ''),
        s(4, 'twoCol',  'Compare & contrast',  '', ['Option 1 pro', 'Option 2 pro', 'Option 1 con', 'Option 2 con'], ''),
        s(5, 'summary', 'Takeaways & Q&A',     '', ['Main idea 1', 'Main idea 2', 'Happy to take questions'], ''),
      ];
    case 'blank':
    default:
      return [
        s(0, 'title',   title || 'Untitled slideshow', 'Click to edit your subtitle', [], ''),
        s(1, 'content', 'New section',                 '', ['First point', 'Second point'], ''),
        s(2, 'summary', 'Key takeaways',               '', ['Takeaway 1', 'Takeaway 2'], ''),
      ];
  }
}

// AI-generated + manually-built presentation decks. One-shot generation,
app.get('/api/slideshows', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const list = (users[email].data.slideshows || []).map(s => ({
      id: s.id, title: s.title, topic: s.topic,
      slideCount: (s.slides || []).length,
      createdAt: s.createdAt,
    }));
    res.json({ slideshows: list });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/slideshows/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Not found' });
    // Heal legacy slides on read — runs the same mechanical contrast fixer
    // over the stored slides before responding. Nothing unreadable should
    // ever reach the client, even if it predates the current fix.
    let mutated = false;
    deck.slides = (deck.slides || []).map(s => {
      if (!Array.isArray(s.elements) || !s.elements.length) return s;
      const fixed = autoFixSlide(s);
      if (JSON.stringify(fixed.elements) !== JSON.stringify(s.elements) ||
          fixed.background !== s.background) mutated = true;
      return fixed;
    });
    if (mutated) saveUsers(users);
    res.json({ slideshow: deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/slideshows/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    users[email].data.slideshows = (users[email].data.slideshows || []).filter(s => s.id !== req.params.id);
    saveUsers(users);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create a blank slideshow. Body: { title } — everything else defaults.
// Starts with a single title slide that the user then builds on top of.
app.post('/api/slideshows', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const title = String(req.body?.title || 'Untitled slideshow').trim().slice(0, 200);
    const templateId = String(req.body?.template || 'blank');
    const deckId = crypto.randomUUID();
    const slides = buildTemplateSlides(templateId, title, deckId);
    const deck = {
      id: deckId,
      title,
      subtitle: '',
      topic: title,
      slides,
      settings: { manual: true, template: templateId },
      createdAt: new Date().toISOString(),
    };
    users[email].data.slideshows.unshift(deck);
    saveUsers(users);
    res.json({ slideshow: deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== Per-slide AI helpers =====
//
// The AI gets a detailed design brief (archetypes, hierarchy rules, color
// pairings, positioning math) so what comes back is composable — we insert
// the returned `elements[]` as-is instead of synthesizing a boring
// title/bullets layout from scratch. The prompt is the difference between
// "looks like a form" and "looks designed."
const SLIDE_DESIGN_SYSTEM = `You are a senior presentation designer composing ONE slide. Each slide must feel considered — not a formulaic bullets-under-title layout. Surprise the viewer when the content invites it.

## Archetypes — pick one that SUITS the content, don't default
- HERO: huge centered title, tiny supporting line. Use for section openers.
- STAT: one massive number or short phrase (100+ fontSize), small explanation. Use for data points.
- CONTENT: title + 3-4 supporting points. For concepts that need elaboration.
- QUOTE: large italic quote with a small attribution below. For memorable lines.
- IMAGE_DOMINANT: a prominent image on one side (40-55% width), text on the other.
- TIMELINE: 3-5 short elements arranged horizontally or on a diagonal.
- COMPARISON: two columns, headers aligned.
- ASYMMETRIC: break the symmetry — offset title, unexpected alignment.

## Composition rules
- Visual hierarchy: ONE dominant element (biggest font AND boldest weight). Everything else recedes.
- Whitespace: 25-40% of the canvas empty. Never cram.
- Padding: ≥5% from every edge.
- Background + text must have a WCAG contrast ratio of 4.5+. NON-NEGOTIABLE. Common safe pairings:
    light bg (#ffffff, #f9fafb, #fef3c7, #dbeafe, #d1fae5) ↔ dark text (#111827, #1f2937)
    dark bg (#0f172a, #1e293b, #111827, #1e1e2e, #2563eb) ↔ light text (#ffffff, #f3f4f6)
- Accent color: at most ONE element in a vivid accent (ex: #2563eb, #dc2626, #059669).
- Don't put any element entirely inside another.
- Use varied positions: not everything flush-left from x=8.

## Visual elements (no images)
Do NOT use "image" elements. Instead, create visual interest with:
- An "icon" element (kind: "icon", iconName: one of Lightbulb, Rocket, Target, Flame, Star, Zap, Sparkles, Heart, Brain, BookOpen, GraduationCap, Briefcase, Award, Trophy, Medal, Crown, TrendingUp, BarChart3, PieChart, Activity, Gauge, DollarSign, Globe, MapPin, Flag, Leaf, Trees, Sun, Cloud, Atom, Microscope, Cog, Cpu, MessageSquare, Mail, Bell, Calendar, Clock, CheckCircle, AlertTriangle, Shield, Lock, Eye, Search). Size it generously (w 10-20, h 15-30).
- A "shape" element (kind: "shape", shape: "rect" | "circle" | "pill"). Use behind or beside text as an accent. A big pale-colored pill behind a stat can make a slide pop.
- At most ONE icon and/or ONE shape per slide. Restraint wins.

## Font sizes (keep hierarchy snappy, not subtle)
- HERO / SECTION titles: 72-100
- STAT number: 100-160
- Content slide title: 44-60
- Subtitle: 20-26
- Body / bullets: 20-28
- Captions / small labels: 14-18

Weights: 700 for titles, 600 for emphasis, 500 for subtitles, 400 for body.

## Coordinate system
x, y, w, h are PERCENTAGES of the slide (0-100). Each element stays within 3-97 on every axis. Elements must NOT overlap significantly.

## Bullets
If the content is a list, pack lines into ONE text element with "\\n" between them. Do NOT create one element per bullet.

## Output
Return ONLY valid JSON — no markdown, no code fences, no commentary:
{
  "background": "#RRGGBB",
  "notes": "1-2 sentences the presenter says aloud",
  "layout": "title" | "content" | "summary" | "quote" | "freeform",
  "elements": [
    { "kind": "text",  "x": 8, "y": 12, "w": 84, "h": 20, "text": "...", "fontSize": 56, "fontWeight": "700", "italic": false, "underline": false, "align": "left", "color": "#RRGGBB" },
    { "kind": "image", "x": 55, "y": 20, "w": 40, "h": 60, "searchQuery": "Krebs cycle diagram" }
  ]
}

Typically 2-5 elements per slide. Vary your archetypes across a deck — don't repeat the same shape. Compose something you'd actually be proud to present.`;

// Generate a single slide on a topic and insert it after `insertAfter`
// (default: append to the end of the deck).
app.post('/api/slideshows/:id/ai/slide', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    const topic = String(req.body?.topic || '').trim().slice(0, 160);
    const insertAfter = Number.isFinite(Number(req.body?.insertAfter))
      ? Math.max(-1, Math.min((deck.slides || []).length - 1, Number(req.body.insertAfter)))
      : (deck.slides || []).length - 1;
    if (!topic) return res.status(400).json({ error: 'Topic required' });

    const nid = `${deck.id}-ai${Date.now()}`;
    const model = modelForUser(users[email], email);

    // SAME SHAPE AS THE WHOLE-DECK GENERATOR. One slide, one JSON object
    // with title/subtitle/bullets/notes/layout. That's the contract that
    // already works for `/api/slideshows/generate`; reuse it here so the
    // client renders via the legacy SlideCanvas that already looks right.
    const system = `You are a senior presentation designer composing ONE slide. Your job is to produce something that looks considered and non-formulaic. Don't default to the same "title + 3 bullets" layout every time — pick the archetype that genuinely fits the content.

Think about:
- Which archetype suits this specific topic (title / content / summary / quote).
- A short, punchy title under 10 words.
- Bullets that are parallel, non-redundant, and each say something specific.
- Speaker notes that sound like a real presenter talking, not a description of the slide.

NEVER include images. NEVER suggest imagery. Just strong typography + tight copy.

Output ONLY valid JSON — no markdown, no fences.`;
    const user = `Deck title: "${deck.title || 'Untitled'}".
Topic: "${topic}".

Compose the slide. Archetype choices:
- "title" — short punchy title + 1-sentence subtitle, bullets empty.
- "content" — title + 3-5 bullets. Use when the topic needs explanation.
- "summary" — "Key takeaways" feel — title + 3-5 bullets.
- "quote" — title = the quote itself, subtitle = attribution ("— Name").

JSON shape:
{
  "title": "...",
  "subtitle": "",
  "bullets": [],           // 3-5 short points, each under 18 words, or [] for title/quote
  "notes": "1-2 sentence speaker note",
  "layout": "title" | "content" | "summary" | "quote"
}`;

    const aiResult = await callGemini(system, [{ role: 'user', content: user }], model, 1500, { jsonMode: true, temperature: 0.85 });
    if (!aiResult.success) return res.status(500).json({ error: aiResult.error || 'AI call failed' });
    const parsed = parseAIJson(aiResult.data.content?.[0]?.text || '');
    if (!parsed?.title) return res.status(500).json({ error: 'AI response missing title' });

    const newSlide = {
      id: nid,
      layout: ['title','content','summary','quote','twoCol','freeform'].includes(parsed.layout) ? parsed.layout : 'content',
      title: String(parsed.title).slice(0, 200),
      subtitle: String(parsed.subtitle || '').slice(0, 300),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 6).map(b => String(b).slice(0, 300)) : [],
      notes: String(parsed.notes || '').slice(0, 1000),
      image: '', imageCaption: '',
      // Legacy field stays null — renderer uses theme default. Matches how
      // the bulk-generated slides work.
      background: null,
      elements: [],
    };

    deck.slides.splice(insertAfter + 1, 0, newSlide);
    saveUsers(users);
    console.log(`AI slide inserted at ${insertAfter + 1} — layout=${newSlide.layout}, ${newSlide.bullets.length} bullets`);
    res.json({ slideshow: deck, insertedAt: insertAfter + 1 });
  } catch (e) { console.error('AI slide error:', e); res.status(500).json({ error: e.message }); }
});

// ===== Programmatic slide-design validator =====
// The text-only "self critique" pass was unreliable — the AI would happily
// rationalize a black-on-black slide as fine. Instead we compute the real
// problems (WCAG contrast, overlap, out-of-bounds, font-size hierarchy),
// hand the list back to the AI so it has a concrete fix list, and loop
// until the slide validates. If the loop exhausts, we mechanically
// auto-fix the worst issues (contrast gets flipped, out-of-bounds gets
// clamped) so the user never sees a black-on-black slide.

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length < 6) return null;
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function relLuminance({ r, g, b }) {
  const toLin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}
function contrastRatio(a, b) {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const la = relLuminance(ra), lb = relLuminance(rb);
  const L1 = Math.max(la, lb), L2 = Math.min(la, lb);
  return (L1 + 0.05) / (L2 + 0.05);
}
// Hard minimum — 4.5 on anything. The "3.0 for large text" WCAG allowance
// was letting borderline-unreadable dark-on-dark slides through.
const MIN_CONTRAST = 4.5;
function pickHighContrastText(bgHex) {
  const whiteC = contrastRatio('#ffffff', bgHex);
  const blackC = contrastRatio('#111827', bgHex);
  return whiteC >= blackC ? '#ffffff' : '#111827';
}
function rectsOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function validateSlideDesign(slide) {
  const issues = [];
  const bg = slide.background || '#ffffff';
  const els = Array.isArray(slide.elements) ? slide.elements : [];
  if (!els.length) issues.push('Slide has no elements.');

  els.forEach((el, i) => {
    const id = `element[${i}]`;
    if (el.kind === 'text') {
      const ratio = contrastRatio(el.color || '#111827', bg);
      if (ratio < MIN_CONTRAST) {
        issues.push(`${id}: low contrast (${ratio.toFixed(2)} vs required ${MIN_CONTRAST}). Text color ${el.color} on background ${bg}. Change text color to a strongly contrasting hex.`);
      }
    }
    // Bounds: must fit with ≥5% padding on left/top, ≥3% on right/bottom.
    if (el.x < 3 || el.y < 3 || el.x + el.w > 97 || el.y + el.h > 97) {
      issues.push(`${id}: out of bounds or too close to the edge (x=${el.x}, y=${el.y}, w=${el.w}, h=${el.h}). Keep every element inside 3-97% on each axis.`);
    }
  });

  // Significant overlaps between text elements (>15% of either box covered).
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.kind === 'text' && b.kind === 'text' && rectsOverlap(a, b)) {
        const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        const overlapArea = ix * iy;
        const aArea = a.w * a.h, bArea = b.w * b.h;
        const pct = overlapArea / Math.min(aArea, bArea);
        if (pct > 0.15) {
          issues.push(`element[${i}] and element[${j}] overlap significantly. Reposition so they don\u2019t.`);
        }
      }
    }
  }

  // Hierarchy: need one element ≥ 32px AND at least one smaller element
  // (when more than one text element exists).
  const textEls = els.filter(e => e.kind === 'text');
  if (textEls.length >= 2) {
    const maxFs = Math.max(...textEls.map(e => Number(e.fontSize) || 0));
    const minFs = Math.min(...textEls.map(e => Number(e.fontSize) || 0));
    if (maxFs < 32) issues.push('No dominant element — the largest text is under 32px. Make one element clearly the title (40+).');
    if (maxFs / Math.max(1, minFs) < 1.6) issues.push('Hierarchy is flat — the biggest text should be at least 1.6× the smallest.');
  }

  return issues;
}

// Mechanical last-resort fix: flip text colors to a high-contrast choice
// against the background, clamp every element into bounds. Guarantees the
// slide is at least readable even if the AI never produces a clean version.
function autoFixSlide(slide) {
  const bg = slide.background || '#ffffff';
  const els = (slide.elements || []).map(el => {
    const fixed = { ...el };
    if (fixed.kind === 'text') {
      const ratio = contrastRatio(fixed.color || '#111827', bg);
      if (ratio < MIN_CONTRAST) fixed.color = pickHighContrastText(bg);
    }
    fixed.x = Math.max(3, Math.min(97, fixed.x));
    fixed.y = Math.max(3, Math.min(97, fixed.y));
    fixed.w = Math.max(5, Math.min(97 - fixed.x, fixed.w));
    fixed.h = Math.max(3, Math.min(97 - fixed.y, fixed.h));
    return fixed;
  });
  return { ...slide, background: bg, elements: els };
}

// ===== Web image lookup (Wikipedia) =====
// Free, no API key. The AI emits image elements with a `searchQuery`
// field; we resolve each one to a real URL before persisting.
async function searchWikipediaImage(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  try {
    // Direct page summary first — cleanest thumbnail match.
    const summary = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'RushilAI/1.0 (rushilkelapure@gmail.com)' },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (summary?.originalimage?.source) return summary.originalimage.source;
    if (summary?.thumbnail?.source) return summary.thumbnail.source;
    // Fall back to site-wide search + page images.
    const search = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=pageimages&piprop=original|thumbnail&pithumbsize=1200`,
      { headers: { 'User-Agent': 'RushilAI/1.0' } },
    ).then(r => r.ok ? r.json() : null).catch(() => null);
    const pages = search?.query?.pages;
    if (pages) {
      for (const k of Object.keys(pages)) {
        const p = pages[k];
        if (p.original?.source) return p.original.source;
        if (p.thumbnail?.source) return p.thumbnail.source;
      }
    }
  } catch (e) { console.warn('Wikipedia image search failed:', e.message); }
  return null;
}

// Strip adjectives / articles from a query to get at the main noun.
// "a detailed diagram of the Krebs cycle" → "Krebs cycle".
function simplifyQuery(q) {
  const cleaned = String(q || '')
    .replace(/\b(a|an|the|some|this|that|these|those|of|for|with|showing|illustrating|diagram|photo|image|picture|detailed|abstract|colorful|modern|professional)\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

async function searchWebImage(query) {
  // Try the original query, then a simplified noun-phrase version.
  const original = String(query || '').trim();
  const simplified = simplifyQuery(original);
  const attempts = [...new Set([original, simplified].filter(Boolean))];
  for (const q of attempts) {
    const url = await searchWikipediaImage(q);
    if (url) return url;
  }
  return null;
}

// Walk a composed slide, resolving any AI-requested image elements.
// If we CAN'T find an image, the element is dropped entirely so the user
// never sees a "no image" placeholder box.
async function resolveSlideImageQueries(slide) {
  if (!Array.isArray(slide.elements)) return slide;
  const resolved = [];
  for (const el of slide.elements) {
    if (el.kind !== 'image') { resolved.push(el); continue; }
    // Already has a real URL (http/https/data: from paste) — keep.
    if (el.src && /^(https?:|data:)/i.test(el.src)) { resolved.push(el); continue; }
    // Gather queries in priority order: searchQuery, query, slide title.
    const queries = [el.searchQuery, el.query, slide.title].filter(Boolean);
    let url = null;
    for (const q of queries) {
      url = await searchWebImage(q);
      if (url) break;
    }
    if (url) {
      resolved.push({ ...el, src: url });
    } else {
      console.log(`Dropping image element — no match for queries: ${queries.join(' | ')}`);
    }
  }
  slide.elements = resolved;
  return slide;
}

// ============================================================
// Hand-designed slide template library. Each template is a complete,
// polished layout — positioning, typography, color pairings, everything —
// with text slots addressed by `role`. The AI no longer designs slides
// from scratch; it PICKS which template fits the topic and FILLS the
// role slots. Because the designs are human-quality, every generated
// slide looks good by construction.
// ============================================================
const SLIDE_TEMPLATES = [
  {
    id: 'hero-light',
    match: 'Intro, section opener, chapter title, "welcome to X". Use when the slide is a high-energy title.',
    background: '#ffffff',
    layout: 'title',
    elements: [
      { kind: 'text', role: 'title',    x: 8,  y: 36, w: 84, h: 18, fontSize: 88, fontWeight: '700', color: '#111827', align: 'center' },
      { kind: 'text', role: 'subtitle', x: 15, y: 58, w: 70, h: 8,  fontSize: 24, fontWeight: '400', color: '#6b7280', align: 'center' },
    ],
  },
  {
    id: 'hero-dark',
    match: 'Dramatic opener, bold statement, powerful section transition on dark background.',
    background: '#0f172a',
    layout: 'title',
    elements: [
      { kind: 'text', role: 'title',    x: 8,  y: 36, w: 84, h: 18, fontSize: 88, fontWeight: '700', color: '#ffffff', align: 'center' },
      { kind: 'text', role: 'subtitle', x: 15, y: 58, w: 70, h: 8,  fontSize: 22, fontWeight: '400', color: '#94a3b8', align: 'center' },
    ],
  },
  {
    id: 'stat-hero',
    match: 'A headline number, percentage, or short phrase as the whole story. For data points.',
    background: '#ffffff',
    layout: 'freeform',
    elements: [
      { kind: 'text', role: 'stat',     x: 6,  y: 20, w: 88, h: 40, fontSize: 140, fontWeight: '800', color: '#2563eb', align: 'center' },
      { kind: 'text', role: 'title',    x: 15, y: 62, w: 70, h: 8,  fontSize: 26, fontWeight: '600', color: '#111827', align: 'center' },
      { kind: 'text', role: 'subtitle', x: 15, y: 74, w: 70, h: 12, fontSize: 18, fontWeight: '400', color: '#6b7280', align: 'center' },
    ],
  },
  {
    id: 'content-classic',
    match: 'Default concept slide. Title + supporting points below. Use when the topic needs explanation.',
    background: '#ffffff',
    layout: 'content',
    elements: [
      { kind: 'text', role: 'title', x: 6, y: 8,  w: 88, h: 12, fontSize: 50, fontWeight: '700', color: '#111827', align: 'left' },
      { kind: 'text', role: 'body',  x: 6, y: 26, w: 88, h: 65, fontSize: 24, fontWeight: '400', color: '#1f2937', align: 'left' },
    ],
  },
  {
    id: 'content-with-image',
    match: 'Concept + a photo or diagram. Title and bullets on the left, image on the right. Use when a visual would help.',
    background: '#ffffff',
    layout: 'freeform',
    elements: [
      { kind: 'text', role: 'title', x: 5,  y: 10, w: 50, h: 12, fontSize: 42, fontWeight: '700', color: '#111827', align: 'left' },
      { kind: 'text', role: 'body',  x: 5,  y: 28, w: 50, h: 64, fontSize: 20, fontWeight: '400', color: '#1f2937', align: 'left' },
      { kind: 'image', role: 'image', x: 58, y: 10, w: 37, h: 82 },
    ],
  },
  {
    id: 'quote',
    match: 'A memorable quote. For rhetorical emphasis, literary passages, or pull-quote style.',
    background: '#fef3c7',
    layout: 'quote',
    elements: [
      { kind: 'text', role: 'quote',       x: 8,  y: 28, w: 84, h: 34, fontSize: 44, fontWeight: '500', color: '#111827', align: 'center', italic: true },
      { kind: 'text', role: 'attribution', x: 20, y: 68, w: 60, h: 6,  fontSize: 20, fontWeight: '500', color: '#92400e', align: 'center' },
    ],
  },
  {
    id: 'summary-bold',
    match: 'Key takeaways / wrap-up / recap slide. 3-5 short points on a soft background.',
    background: '#dbeafe',
    layout: 'summary',
    elements: [
      { kind: 'text', role: 'title', x: 6, y: 10, w: 88, h: 12, fontSize: 46, fontWeight: '700', color: '#1e3a8a', align: 'left' },
      { kind: 'text', role: 'body',  x: 6, y: 28, w: 88, h: 62, fontSize: 24, fontWeight: '500', color: '#1e3a8a', align: 'left' },
    ],
  },
  {
    id: 'asymmetric-dark',
    match: 'Bold section transition. Oversized title, small tagline, dark background, offset layout.',
    background: '#111827',
    layout: 'freeform',
    elements: [
      { kind: 'text', role: 'title',    x: 5, y: 20, w: 68, h: 44, fontSize: 104, fontWeight: '800', color: '#ffffff', align: 'left' },
      { kind: 'text', role: 'subtitle', x: 5, y: 68, w: 52, h: 6,  fontSize: 18, fontWeight: '400', color: '#94a3b8', align: 'left' },
    ],
  },
  {
    id: 'two-column',
    match: 'Comparison — side-by-side ideas, pro/con, before/after, option A vs option B.',
    background: '#ffffff',
    layout: 'twoCol',
    elements: [
      { kind: 'text', role: 'title',    x: 6,  y: 8,  w: 88, h: 10, fontSize: 42, fontWeight: '700', color: '#111827', align: 'left' },
      { kind: 'text', role: 'colA',     x: 6,  y: 24, w: 42, h: 66, fontSize: 20, fontWeight: '400', color: '#1f2937', align: 'left' },
      { kind: 'text', role: 'colB',     x: 52, y: 24, w: 42, h: 66, fontSize: 20, fontWeight: '400', color: '#1f2937', align: 'left' },
    ],
  },
  {
    id: 'warm-content',
    match: 'Friendly / humanist content slide. Warmer palette. For people-focused topics.',
    background: '#fef3c7',
    layout: 'content',
    elements: [
      { kind: 'text', role: 'title', x: 6, y: 10, w: 88, h: 12, fontSize: 48, fontWeight: '700', color: '#92400e', align: 'left' },
      { kind: 'text', role: 'body',  x: 6, y: 28, w: 88, h: 62, fontSize: 22, fontWeight: '400', color: '#78350f', align: 'left' },
    ],
  },
];

// Heuristic template picker — simple feature matching on the topic so the
// server picks a sensible layout EVERY time, even if the AI call fails.
function pickTemplateForTopic(topic, deckTitle) {
  const t = String(topic || '').trim();
  const lower = t.toLowerCase();
  // Quote-ish: wrapped in quotes, or contains " said " / " quote "
  if (/^["\u201c\u2018]/.test(t) || /\bsaid\b|\bquote\b|\bquoted\b/i.test(lower)) return SLIDE_TEMPLATES.find(x => x.id === 'quote');
  // Stat-ish: starts with a number, or contains %, or "billion/million/thousand"
  if (/^\s*\$?\d/.test(t) || /%|billion|million|thousand|\bpercent\b|\b\d+x\b/i.test(lower)) return SLIDE_TEMPLATES.find(x => x.id === 'stat-hero');
  // Comparison
  if (/\bvs\.?\b|\bversus\b|\bcompare\b|\bcomparison\b|\bpros? and cons?\b|\bbefore and after\b/i.test(lower)) return SLIDE_TEMPLATES.find(x => x.id === 'two-column');
  // Summary / recap / takeaways
  if (/\btakeaways?\b|\bsummary\b|\brecap\b|\bconclusion\b|\bkey points?\b|\bin short\b/i.test(lower)) return SLIDE_TEMPLATES.find(x => x.id === 'summary-bold');
  // Hero / section opener (short — likely a section title)
  if (t.split(/\s+/).length <= 4 && t.length < 40) return SLIDE_TEMPLATES.find(x => x.id === 'hero-light');
  // Topics that obviously have a visual (people, places, natural phenomena, diagrams)
  if (/\bdiagram\b|\bhistory\b|\bmap\b|\barchitecture\b|\bart\b|\bphotograph\b|\bspecies\b|\bplant\b|\banimal\b|\bcountry\b|\bcity\b|\bbiography\b/i.test(lower)) return SLIDE_TEMPLATES.find(x => x.id === 'content-with-image');
  // Default: classic content slide
  return SLIDE_TEMPLATES.find(x => x.id === 'content-classic');
}

// Minimal copy-only prompt. The AI fills ONLY the slots the chosen
// template actually defines — no picking, no design.
function buildSlotPrompt(tmpl, topic, deckTitle) {
  const roleLines = tmpl.elements.map(el => {
    if (el.kind === 'image') return `- imageQuery (string) — a specific noun phrase for a web image search. Example: "Abraham Lincoln portrait"`;
    switch (el.role) {
      case 'title':    return `- title (string, under 10 words) — the slide's headline`;
      case 'subtitle': return `- subtitle (string, 1 short sentence) — supporting line`;
      case 'body':     return `- body (string) — 3-5 short points SEPARATED BY \\n. Each under 16 words. No bullet characters.`;
      case 'stat':     return `- stat (string, under 12 chars) — the headline number/phrase (e.g. "42%", "147B")`;
      case 'quote':       return `- quote (string) — the actual quote text`;
      case 'attribution': return `- attribution (string) — the speaker/source (e.g. "— Abraham Lincoln")`;
      case 'colA':     return `- colA (string) — content for the left column. \\n-separated list ok.`;
      case 'colB':     return `- colB (string) — content for the right column. \\n-separated list ok.`;
      default:         return `- ${el.role} (string)`;
    }
  }).join('\n');

  return `Deck title: "${deckTitle}".
Topic for THIS slide: "${topic}".
Archetype: ${tmpl.id} — ${tmpl.match}

Write the slide's copy. Fill every slot below with ACTUAL content about the topic — do NOT return placeholder text, instructions, or empty strings. If you can't think of content for a slot, invent plausible content for the topic.

Required slots (exact keys):
${roleLines}

Also include "notes" (string) — 1-2 sentences of speaker notes.

Output ONLY JSON:
{
${tmpl.elements.map(el => el.kind === 'image' ? '  "imageQuery": "..."' : `  "${el.role}": "..."`).join(',\n')},
  "notes": "..."
}`;
}

// Merge a chosen template + the AI's slot content into a full slide.
// Every text element gets its copy; image elements get their searchQuery.
function materializeTemplateSlide(tmpl, slots, id) {
  const elements = tmpl.elements.map((el, j) => {
    const base = {
      id: `${id}-el${j}`,
      kind: el.kind,
      x: el.x, y: el.y, w: el.w, h: el.h,
      fontSize: el.fontSize || 20,
      fontWeight: el.fontWeight || '400',
      italic: !!el.italic,
      underline: !!el.underline,
      align: el.align || 'left',
      color: el.color || '#111827',
      text: '',
      src: '',
      searchQuery: '',
    };
    if (el.kind === 'text') {
      base.text = String(slots?.[el.role] || '').slice(0, 1000);
    } else if (el.kind === 'image') {
      base.searchQuery = String(slots?.imageQuery || slots?.[el.role] || '').slice(0, 160);
    }
    return base;
  });
  // Drop text elements the AI left empty — keeps the design clean.
  const filtered = elements.filter(el => el.kind === 'image' || (el.text && el.text.trim()));
  return {
    id,
    layout: tmpl.layout || 'freeform',
    title: slots?.title || '',
    subtitle: slots?.subtitle || '',
    bullets: [],
    notes: '',
    image: '', imageCaption: '',
    background: tmpl.background,
    elements: filtered,
  };
}

// Pass 1 of "generate a slide from a topic": the AI drafts the raw
// content (title, bullets, notes, layout) — no positioning, no design
// yet. This gives the design pass the same anchor material that the
// improve flow naturally has (the slide the user already built),
// so both paths produce equally good final layouts.
async function draftSlideContent(topic, model) {
  const system = 'You are a presentation content writer. Output ONLY valid JSON. No markdown, no commentary.';
  const user = `Draft the CONTENT for a single slide about: "${topic}". Decide the archetype (title, stat, content, summary, quote, freeform) based on what fits the topic best.

Return this exact shape:
{
  "title": "Short slide title under 10 words",
  "subtitle": "Optional 1-sentence supporting line, or empty string",
  "bullets": ["3-5 short supporting points, each under 16 words, OR empty array if the slide archetype doesn't use bullets"],
  "notes": "1-3 sentences of speaker notes",
  "layout": "title" | "content" | "summary" | "quote" | "freeform",
  "imageIdea": "A specific noun-phrase search term if a photo/diagram would add value, or empty string"
}`;
  try {
    const result = await callGemini(system, [{ role: 'user', content: user }], model, 1200, { jsonMode: true, temperature: 0.85 });
    if (!result.success) return null;
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed?.title) return null;
    return parsed;
  } catch { return null; }
}

// Shared pipeline used by BOTH "generate a new slide" AND "improve this
// slide". The two endpoints differ only in what they do with the result
// (insert vs replace). Everything else — the design prompt, retry loop,
// validation, auto-fix, image resolution, searchQuery cleanup — is
// identical so outputs are equally good.
async function composeAndFinalizeSlide({ users, email, deck, topic, instruction, priorSlide, targetId, fallbackTitle }) {
  const model = modelForUser(users[email], email);
  const deckCtx = `Deck title: "${deck.title}".`;
  const seedContext = instruction
    ? `${deckCtx}\nInstruction for this slide: "${instruction}".\n`
    : `${deckCtx}\n`;
  // When we have a prior slide, pass it through the compose loop so the AI
  // can retain what's working and change what isn't.
  const { slide: composed, attempts, issues, autoFixed } =
    await aiComposeSlide(topic, seedContext, model, priorSlide);
  if (!composed) {
    return { error: `Could not produce a valid slide after ${attempts} attempts.` };
  }
  let slide = sanitizeComposedSlide(composed, targetId, fallbackTitle || topic);
  slide = await resolveSlideImageQueries(slide);
  slide.elements = slide.elements.map(el => { const { searchQuery, ...rest } = el; return rest; });
  return { slide, attempts, issues, autoFixed };
}

// Multi-pass AI composition loop. Generates a draft, checks it against the
// programmatic validator, and if it fails, sends the specific issue list
// BACK to the AI so the next attempt has concrete targets. Up to 4
// attempts; if it never validates, auto-fix the best attempt so we always
// return a readable slide.
async function aiComposeSlide(topic, seedContext, model, priorSlide = null) {
  let bestCandidate = null;
  let bestIssueCount = Infinity;
  let lastIssues = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const issueBlock = lastIssues?.length
      ? `\nThe previous draft had THESE issues — fix EVERY one of them:\n- ${lastIssues.join('\n- ')}\n`
      : '';
    const priorBlock = priorSlide
      ? `\nCurrent slide you are improving:\n${JSON.stringify(priorSlide)}\n`
      : '';
    const user = `${seedContext}${priorBlock}${issueBlock}
Compose a single slide about: "${topic}". Output ONLY the design-system JSON — background, notes, layout, elements[].`;

    const result = await callGemini(
      SLIDE_DESIGN_SYSTEM,
      [{ role: 'user', content: user }],
      model,
      3500,
      { temperature: 0.95, jsonMode: true },
    );
    if (!result.success) continue;

    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.elements) || !parsed.elements.length) {
      lastIssues = ['Output was not valid JSON with an elements array.'];
      continue;
    }

    const issues = validateSlideDesign(parsed);
    if (!issues.length) return { slide: parsed, attempts: attempt + 1, issues: [] };

    if (issues.length < bestIssueCount) {
      bestIssueCount = issues.length;
      bestCandidate = parsed;
    }
    lastIssues = issues;
  }

  // Loop exhausted — auto-fix the least-bad draft.
  const fallback = bestCandidate ? autoFixSlide(bestCandidate) : null;
  return { slide: fallback, attempts: 4, issues: lastIssues || [], autoFixed: true };
}

// Clamps, validates, and normalizes an AI-composed slide. Critically:
// ALWAYS persists an explicit background. Without one, the client
// fell back to the app theme — and the validator's assumption of white
// disagreed with a dark-themed render → black-on-black slides.
function sanitizeComposedSlide(parsed, id, fallbackTopic) {
  const validColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
  const layout = ['title','content','summary','twoCol','quote','freeform'].includes(parsed.layout)
    ? parsed.layout : 'freeform';
  const background = validColor(parsed.background) || '#ffffff';
  const elements = (parsed.elements || []).slice(0, 10).map((el, j) => ({
    id: `${id}-el${j}`,
    kind: el.kind === 'image' ? 'image' : 'text',
    x: clamp(Number(el.x) || 0, 0, 100),
    y: clamp(Number(el.y) || 0, 0, 100),
    w: clamp(Number(el.w) || 40, 5, 100),
    h: clamp(Number(el.h) || 10, 3, 100),
    text: el.kind === 'image' ? '' : String(el.text || '').slice(0, 1000),
    src: el.kind === 'image' ? String(el.src || '').slice(0, 2_000_000) : '',
    // Preserved through sanitize so `resolveSlideImageQueries` can look it
    // up. Stripped after image resolution (never persisted long-term).
    searchQuery: el.kind === 'image' ? String(el.searchQuery || el.query || '').slice(0, 160) : '',
    fontSize: clamp(Number(el.fontSize) || 20, 8, 160),
    fontWeight: ['400','500','600','700','800'].includes(String(el.fontWeight)) ? String(el.fontWeight) : '400',
    italic: !!el.italic,
    underline: !!el.underline,
    align: ['left','center','right'].includes(el.align) ? el.align : 'left',
    // If no color (or invalid), pick whichever of black/white contrasts better with the background.
    color: validColor(el.color) || pickHighContrastText(background),
  }));
  // Keep elements in-bounds: if anything extends past 100, pull it back.
  for (const el of elements) {
    if (el.x + el.w > 100) el.w = Math.max(5, 100 - el.x);
    if (el.y + el.h > 100) el.h = Math.max(3, 100 - el.y);
  }
  // Always run the mechanical contrast fixer — guarantees no unreadable
  // slide ever gets persisted, no matter what the AI produced.
  return autoFixSlide({
    id,
    layout,
    title: (elements[0]?.text || fallbackTopic || '').slice(0, 200),
    subtitle: '',
    bullets: [],
    notes: String(parsed.notes || '').slice(0, 1000),
    image: '', imageCaption: '',
    background,
    elements,
  });
}

// Improve / rewrite an existing slide with a free-text instruction. Uses
// the same design system as the generator so the rewritten slide is a
// fully composed layout, not a plain bulleted form.
app.post('/api/slideshows/:id/ai/improve', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    const idx = Number(req.body?.slideIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= (deck.slides || []).length) {
      return res.status(400).json({ error: 'slideIndex out of range' });
    }
    const instruction = String(req.body?.instruction || 'Improve clarity, hierarchy, and visual balance.').slice(0, 400);
    const target = deck.slides[idx];

    const priorSlide = {
      title: target.title, subtitle: target.subtitle,
      bullets: target.bullets, notes: target.notes,
      layout: target.layout, background: target.background,
      elements: Array.isArray(target.elements) ? target.elements : [],
    };
    const result = await composeAndFinalizeSlide({
      users, email, deck,
      // "Topic" for improve = what the current slide is about, with the
      // instruction providing the delta. The shared helper puts both into
      // the prompt the same way the generator does.
      topic: target.title || deck.title,
      instruction,
      priorSlide,
      targetId: target.id,
      fallbackTitle: target.title,
    });
    if (result.error) return res.status(500).json({ error: result.error });

    const updated = result.slide;
    console.log(`AI slide improved in ${result.attempts} attempt(s)${result.autoFixed ? ' (auto-fixed)' : ''}. Remaining issues: ${result.issues?.length || 0}`);
    // Preserve the slide's stable id + speaker notes unless the AI provided new ones.
    updated.id = target.id;
    if (!updated.notes) updated.notes = target.notes;
    deck.slides[idx] = updated;
    saveUsers(users);
    res.json({ slideshow: deck, slideIndex: idx });
  } catch (e) { console.error('AI improve error:', e); res.status(500).json({ error: e.message }); }
});

// ===== Vision-based slide review =====
// Client renders the slide to a PNG, we ship it straight to Gemini's
// multimodal endpoint with the slide JSON and ask for concrete element
// adjustments (new x/y/w/h/color/fontSize). The returned patches are
// applied to the slide and the new slide ships back to the client, which
// animates the elements into their new positions.
app.post('/api/slideshows/:id/ai/review-image', authMiddleware, async (req, res) => {
  try {
    if (!genAI) return res.status(500).json({ error: 'AI not configured' });
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Deck not found' });

    const idx = Number(req.body?.slideIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= (deck.slides || []).length) {
      return res.status(400).json({ error: 'slideIndex out of range' });
    }
    const image = String(req.body?.imageBase64 || '');
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    if (!base64 || base64.length < 100) return res.status(400).json({ error: 'Invalid image' });

    const slide = deck.slides[idx];
    const designPrompt = `You are a senior presentation designer reviewing a slide someone just rendered.

You'll get the RENDERED IMAGE of the slide plus the underlying JSON. Look at the image, judge the design, and return element-level adjustments.

Slide JSON (elements are indexed by array position):
${JSON.stringify({ background: slide.background, elements: slide.elements }, null, 2)}

Rules for your output:
- Look at the IMAGE, not just the JSON — trust what you see.
- If the text is unreadable on the background, fix it by changing the element color AND/OR the slide background.
- If an element is cut off, overlapping another element, or visually cramped, reposition it.
- If the hierarchy is flat, bump the most-important element's fontSize.
- Keep it MINIMAL — only patch elements that actually need it.
- All coords are 0-100 percentages of the slide.

Output ONLY JSON in this exact shape (no prose, no markdown):
{
  "rating": 1-10,
  "feedback": "1-2 sentence design note",
  "background": "#RRGGBB" | null,     // null = leave as-is
  "adjustments": [
    {
      "index": 0,                      // element index in the slide's elements array
      "patch": {                       // any subset of these fields
        "x": 10, "y": 20, "w": 80, "h": 15,
        "fontSize": 42, "fontWeight": "700",
        "color": "#111827", "align": "left"
      }
    }
  ]
}`;

    const m = genAI.getGenerativeModel({
      model: resolveModel(modelForUser(users[email], email)),
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    });
    const result = await m.generateContent([
      { text: designPrompt },
      { inlineData: { mimeType: 'image/png', data: base64 } },
    ]);
    const text = result?.response?.text?.() || '';
    const parsed = parseAIJson(text);
    if (!parsed) return res.status(500).json({ error: 'Could not parse critique' });

    // Apply adjustments.
    const validColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
    if (validColor(parsed.background)) slide.background = parsed.background;
    if (Array.isArray(parsed.adjustments)) {
      for (const adj of parsed.adjustments) {
        const i = Number(adj?.index);
        if (!Number.isFinite(i) || i < 0 || i >= (slide.elements || []).length) continue;
        const el = slide.elements[i];
        const p = adj.patch || {};
        if (Number.isFinite(Number(p.x))) el.x = clamp(Number(p.x), 0, 100);
        if (Number.isFinite(Number(p.y))) el.y = clamp(Number(p.y), 0, 100);
        if (Number.isFinite(Number(p.w))) el.w = clamp(Number(p.w), 5, 100);
        if (Number.isFinite(Number(p.h))) el.h = clamp(Number(p.h), 3, 100);
        if (Number.isFinite(Number(p.fontSize))) el.fontSize = clamp(Number(p.fontSize), 8, 160);
        if (['400','500','600','700','800'].includes(String(p.fontWeight))) el.fontWeight = String(p.fontWeight);
        if (['left','center','right'].includes(p.align)) el.align = p.align;
        if (validColor(p.color)) el.color = p.color;
      }
    }
    // One more pass of the mechanical safety net.
    deck.slides[idx] = autoFixSlide(slide);
    saveUsers(users);

    res.json({
      slideshow: deck,
      slideIndex: idx,
      rating: Number(parsed.rating) || null,
      feedback: String(parsed.feedback || '').slice(0, 400),
    });
  } catch (e) {
    console.error('Vision review error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update a slideshow (manual edits: rename, tweak slide content, reorder).
// Body: { title?, subtitle?, slides? } — slides is the full replacement array.
app.put('/api/slideshows/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Not found' });

    const { title, subtitle, slides } = req.body || {};
    if (title !== undefined) deck.title = String(title).slice(0, 200);
    if (subtitle !== undefined) deck.subtitle = String(subtitle).slice(0, 300);
    if (Array.isArray(slides)) {
      const VALID = ['title','content','summary','twoCol','imageLeft','imageRight','imageFull','quote','freeform'];
      const validColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
      deck.slides = slides.slice(0, 40).map((s, i) => ({
        id: s.id || `${deck.id}-${i}`,
        layout: VALID.includes(s.layout) ? s.layout : 'content',
        title: String(s.title || '').slice(0, 200),
        subtitle: String(s.subtitle || '').slice(0, 300),
        bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 10).map(b => String(b).slice(0, 300)) : [],
        notes: String(s.notes || '').slice(0, 2000),
        image: s.image ? String(s.image).slice(0, 600) : '',
        imageCaption: s.imageCaption ? String(s.imageCaption).slice(0, 200) : '',
        // Null-able: empty/missing means "follow the client theme".
        background: validColor(s.background) || null,
        // Once true, the client will NEVER re-synthesize legacy title/bullets
        // into freeform elements — an empty elements array stays empty.
        freeform: !!s.freeform,
        // Freeform elements: user-positioned text/image blocks. Coords are
        // percentages of the slide canvas so scaling stays consistent.
        elements: Array.isArray(s.elements) ? s.elements.slice(0, 40).map((el, j) => {
          const validKind = ['text','image','icon','shape','svg'].includes(el.kind) ? el.kind : 'text';
          const validColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
          return {
            id: el.id || `${s.id || deck.id + '-' + i}-el${j}`,
            kind: validKind,
            x: clamp(Number(el.x) || 0, 0, 100),
            y: clamp(Number(el.y) || 0, 0, 100),
            w: clamp(Number(el.w) || 40, 5, 100),
            h: clamp(Number(el.h) || 10, 3, 100),
            text: validKind === 'text' ? String(el.text || '').slice(0, 1000) : '',
            src: validKind === 'image' ? String(el.src || '').slice(0, 2_000_000) : '',
            // SVG markup — scripts/event handlers stripped.
            svg: validKind === 'svg' ? sanitizeSvg(String(el.svg || '')) : '',
            // Lucide icon name (e.g. "Lightbulb", "Rocket", "Leaf").
            iconName: validKind === 'icon' ? String(el.iconName || '').slice(0, 60) : '',
            // Decorative shape: rect | circle | pill.
            shape: validKind === 'shape' ? (['rect','circle','pill'].includes(el.shape) ? el.shape : 'rect') : '',
            fontSize: clamp(Number(el.fontSize) || 20, 8, 120),
            fontWeight: ['400','500','600','700','800'].includes(String(el.fontWeight)) ? String(el.fontWeight) : '400',
            italic: !!el.italic,
            underline: !!el.underline,
            align: ['left','center','right'].includes(el.align) ? el.align : 'left',
            color: validColor(el.color) || '#111827',
            // Secondary color used by shapes (outline / fill gradient) and icons.
            accent: validColor(el.accent) || null,
          };
        }) : [],
      }));
    }
    saveUsers(users);
    res.json({ slideshow: deck });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/slideshows/generate', authMiddleware, async (req, res) => {
  try {
    const { topic, slideCount, difficulty, style } = req.body || {};
    if (!topic?.trim()) return res.status(400).json({ error: 'Topic is required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const { system, user } = buildSlideshowPrompt({ topic: topic.trim(), slideCount, difficulty, style });
    const model = modelForUser(users[email], email);
    // jsonMode forces native JSON output — kills the parse-failure rate
    // that the previous "stricter retry prompt" was trying to compensate
    // for. Higher temperature gives the model room to vary archetypes
    // across the deck. 6k tokens covers up to 20 slides with notes.
    let result = await callGemini(system, [{ role: 'user', content: user }], model, 6000, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error });

    let parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed?.slides?.length) {
      const retry = await callGemini(system, [{ role: 'user', content: user }], model, 6000, { jsonMode: true, temperature: 0.4 });
      if (retry.success) parsed = parseAIJson(retry.data.content?.[0]?.text || '');
    }
    if (!parsed?.slides?.length) {
      return res.status(500).json({ error: 'AI response was malformed. Try again.' });
    }

    const VALID_LAYOUTS = ['title','content','summary','quote','stat','twoCol','freeform'];
    const deckId = crypto.randomUUID();
    const deck = {
      id: deckId,
      title: parsed.title || topic,
      subtitle: parsed.subtitle || '',
      topic: topic.trim(),
      slides: parsed.slides.map((s, i) => ({
        id: `${deckId}-${i}`,
        layout: VALID_LAYOUTS.includes(s.layout)
          ? s.layout
          : (i === 0 ? 'title' : i === parsed.slides.length - 1 ? 'summary' : 'content'),
        title: String(s.title || '').slice(0, 200),
        subtitle: String(s.subtitle || '').slice(0, 300),
        bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 6).map(b => String(b).slice(0, 300)) : [],
        notes: String(s.notes || '').slice(0, 1000),
      })),
      settings: { difficulty: difficulty || 'intermediate', style: style || 'educational' },
      createdAt: new Date().toISOString(),
    };

    users[email].data.slideshows.unshift(deck);
    saveUsers(users);

    res.json({ slideshow: deck });
  } catch (e) {
    console.error('Slideshow generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== PROFILE =====

app.get('/api/profile', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    res.json({ profile: users[email].data.profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TOPIC SUGGESTIONS =====
// Returns 3 AI-generated topic suggestions personalized to the student's
// history. Cached per-user on user.data.topicSuggestions for 30 min so
// mounting the hub repeatedly doesn't burn an LLM call each time. Pass
// ?refresh=1 to bypass the cache.
const TOPIC_SUGGESTIONS_TTL_MS = 30 * 60 * 1000; // 30 min

app.get('/api/suggestions/topics', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const userData = users[email].data;

    const cached = userData.topicSuggestions;
    const fresh = cached && (Date.now() - (cached.generatedAt || 0)) < TOPIC_SUGGESTIONS_TTL_MS;
    if (fresh && !req.query.refresh) {
      return res.json({ suggestions: cached.suggestions || [], cached: true });
    }

    // Build a compact history digest for the prompt.
    const curricula = (userData.curricula || []).map(c => ({
      title: c.title,
      description: c.description || c.settings?.topic || '',
    }));
    // Flatten all lessons across curricula + the standalone lessons list.
    const curriculumLessons = (userData.curricula || []).flatMap(c =>
      (c.units || []).flatMap(u => (u.lessons || []).map(l => ({
        title: l.title,
        difficulty: c.settings?.difficulty,
        isCompleted: !!l.isCompleted,
      })))
    );
    const standaloneLessons = (userData.lessons || []).map(l => ({
      title: l.title || l.topic,
      difficulty: l.difficulty,
      isCompleted: !!l.isCompleted,
    }));
    const lessons = [...standaloneLessons, ...curriculumLessons];
    const goals = (userData.goals || []).filter(g => g.status !== 'complete');

    // Weak spots: topics the student got wrong on recent assessments. We
    // grab question text from the 10 most recent assessment attempts and
    // surface up to 10 missed ones.
    const history = userData.assessmentHistory || [];
    const weakSpots = [];
    for (const h of history.slice(-10)) {
      for (const d of (h.details || h.result?.details || [])) {
        if (d.correct === false && d.question) weakSpots.push(d.question.slice(0, 100));
        if (weakSpots.length >= 10) break;
      }
      if (weakSpots.length >= 10) break;
    }

    const { system, user } = buildTopicSuggestionsPrompt({ curricula, lessons, goals, weakSpots });
    const model = modelForUser(users[email], email);
    const result = await callGemini(system, [{ role: 'user', content: user }], model, 1024);
    if (!result.success) {
      return res.status(result.status || 500).json({ error: result.error || 'Failed to generate suggestions' });
    }
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.slice(0, 3) : [];
    if (suggestions.length === 0) {
      return res.status(502).json({ error: 'AI returned no suggestions' });
    }

    // Cache back onto user
    userData.topicSuggestions = { suggestions, generatedAt: Date.now() };
    saveUsers(users);

    res.json({ suggestions, cached: false });
  } catch (e) {
    console.error('Topic suggestions error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== SOCIAL =====

// Social data file
const SOCIAL_FILE = join(DATA_DIR, 'social.json');
function loadSocial() { try { return JSON.parse(readFileSync(SOCIAL_FILE, 'utf-8')); } catch { return { profiles: {}, messages: {}, groups: {} }; } }
function saveSocial(data) { writeFileSync(SOCIAL_FILE, JSON.stringify(data, null, 2)); }

// Set/update social profile (handle + displayName)
app.post('/api/social/profile', authMiddleware, (req, res) => {
  try {
    const { handle, displayName } = req.body;
    if (!handle || !displayName) return res.status(400).json({ error: 'handle and displayName required' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(handle)) return res.status(400).json({ error: 'Handle must be 3-20 alphanumeric/underscore chars' });
    const social = loadSocial();
    // Check handle uniqueness
    const existing = Object.values(social.profiles).find(p => p.handle.toLowerCase() === handle.toLowerCase() && p.userId !== req.userId);
    if (existing) return res.status(409).json({ error: 'Handle already taken' });
    social.profiles[req.userId] = { userId: req.userId, handle, displayName, friends: social.profiles[req.userId]?.friends || [], createdAt: social.profiles[req.userId]?.createdAt || new Date().toISOString() };
    saveSocial(social);
    // Also save to user account for persistence
    try {
      const users = loadUsers();
      const email = findEmailById(users, req.userId);
      if (email) {
        users[email].data = migrateUserData(users[email].data);
        users[email].data.socialHandle = handle;
        users[email].data.socialDisplayName = displayName;
        saveUsers(users);
      }
    } catch {}
    res.json({ profile: social.profiles[req.userId] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get own social profile (with fallback recovery from users.json)
app.get('/api/social/profile', authMiddleware, (req, res) => {
  const social = loadSocial();
  let profile = social.profiles[req.userId] || null;
  // Recover from users.json if social.json lost the profile
  if (!profile) {
    try {
      const users = loadUsers();
      const email = findEmailById(users, req.userId);
      if (email && users[email].data?.socialHandle) {
        profile = { userId: req.userId, handle: users[email].data.socialHandle, displayName: users[email].data.socialDisplayName || users[email].name, friends: [], createdAt: new Date().toISOString() };
        social.profiles[req.userId] = profile;
        saveSocial(social);
      }
    } catch {}
  }
  res.json({ profile });
});

// Search users by handle
app.get('/api/social/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  if (!q) return res.json({ users: [] });
  const social = loadSocial();
  const users = loadUsers();
  const results = Object.values(social.profiles)
    .filter(p => p.userId !== req.userId && (p.handle.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q)))
    .slice(0, 20)
    .map(p => {
      const email = findEmailById(users, p.userId);
      return { ...p, plan: email ? getPlan(users[email], email) : 'free' };
    });
  res.json({ users: results });
});

// Send friend request
app.post('/api/social/friends/add', authMiddleware, (req, res) => {
  try {
    const { userId: friendId } = req.body;
    const social = loadSocial();
    if (!social.friendRequests) social.friendRequests = [];
    const myProfile = social.profiles[req.userId];
    const friendProfile = social.profiles[friendId];
    if (!myProfile || !friendProfile) return res.status(404).json({ error: 'Profile not found' });
    // Already friends
    if (myProfile.friends.includes(friendId)) return res.json({ status: 'already_friends' });
    // Already sent
    const existing = social.friendRequests.find(r => r.from === req.userId && r.to === friendId && r.status === 'pending');
    if (existing) return res.json({ status: 'already_sent' });
    // Check if they sent us one — auto-accept
    const incoming = social.friendRequests.find(r => r.from === friendId && r.to === req.userId && r.status === 'pending');
    if (incoming) {
      incoming.status = 'accepted';
      if (!myProfile.friends.includes(friendId)) myProfile.friends.push(friendId);
      if (!friendProfile.friends.includes(req.userId)) friendProfile.friends.push(req.userId);
      saveSocial(social);
      return res.json({ status: 'accepted' });
    }
    social.friendRequests.push({ id: crypto.randomUUID(), from: req.userId, to: friendId, status: 'pending', createdAt: new Date().toISOString() });
    saveSocial(social);
    res.json({ status: 'sent' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Accept friend request
app.post('/api/social/friends/accept', authMiddleware, (req, res) => {
  try {
    const { requestId } = req.body;
    const social = loadSocial();
    if (!social.friendRequests) social.friendRequests = [];
    const request = social.friendRequests.find(r => r.id === requestId && r.to === req.userId && r.status === 'pending');
    if (!request) return res.status(404).json({ error: 'Request not found' });
    request.status = 'accepted';
    const myProfile = social.profiles[req.userId];
    const friendProfile = social.profiles[request.from];
    if (myProfile && !myProfile.friends.includes(request.from)) myProfile.friends.push(request.from);
    if (friendProfile && !friendProfile.friends.includes(req.userId)) friendProfile.friends.push(req.userId);
    saveSocial(social);
    res.json({ status: 'accepted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Decline friend request
app.post('/api/social/friends/decline', authMiddleware, (req, res) => {
  try {
    const { requestId } = req.body;
    const social = loadSocial();
    if (!social.friendRequests) social.friendRequests = [];
    const request = social.friendRequests.find(r => r.id === requestId && r.to === req.userId && r.status === 'pending');
    if (request) request.status = 'declined';
    saveSocial(social);
    res.json({ status: 'declined' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get pending friend requests (incoming)
app.get('/api/social/friends/requests', authMiddleware, (req, res) => {
  const social = loadSocial();
  const requests = (social.friendRequests || []).filter(r => r.to === req.userId && r.status === 'pending').map(r => ({
    ...r, fromProfile: social.profiles[r.from] || null,
  }));
  res.json({ requests });
});

// Remove friend
app.post('/api/social/friends/remove', authMiddleware, (req, res) => {
  try {
    const { userId: friendId } = req.body;
    const social = loadSocial();
    const myProfile = social.profiles[req.userId];
    if (myProfile) myProfile.friends = myProfile.friends.filter(f => f !== friendId);
    const friendProfile = social.profiles[friendId];
    if (friendProfile) friendProfile.friends = friendProfile.friends.filter(f => f !== req.userId);
    saveSocial(social);
    res.json({ friends: myProfile?.friends || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get friends list with profiles
app.get('/api/social/friends', authMiddleware, (req, res) => {
  const social = loadSocial();
  const myProfile = social.profiles[req.userId];
  if (!myProfile) return res.json({ friends: [] });
  const users = loadUsers();
  const friends = myProfile.friends
    .map(fid => social.profiles[fid]).filter(Boolean)
    .map(p => {
      const email = findEmailById(users, p.userId);
      return { ...p, plan: email ? getPlan(users[email], email) : 'free' };
    });
  res.json({ friends });
});

// Get/create DM conversation
function getDmKey(a, b) { return [a, b].sort().join('::'); }

// Send DM
app.post('/api/social/dm/send', authMiddleware, (req, res) => {
  try {
    const { to, content } = req.body;
    if (!to || !content) return res.status(400).json({ error: 'to and content required' });
    const social = loadSocial();
    const key = getDmKey(req.userId, to);
    if (!social.messages[key]) social.messages[key] = [];
    const msg = { id: crypto.randomUUID(), from: req.userId, content, timestamp: new Date().toISOString() };
    social.messages[key].push(msg);
    if (social.messages[key].length > 500) social.messages[key] = social.messages[key].slice(-500);
    saveSocial(social);
    res.json({ message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get DM history
app.get('/api/social/dm/:userId', authMiddleware, (req, res) => {
  const social = loadSocial();
  const key = getDmKey(req.userId, req.params.userId);
  const senderProfile = social.profiles[req.params.userId];
  res.json({ messages: social.messages[key] || [], peer: senderProfile || null });
});

// List DM conversations
app.get('/api/social/dm', authMiddleware, (req, res) => {
  const social = loadSocial();
  const convos = [];
  for (const [key, msgs] of Object.entries(social.messages)) {
    if (!key.includes(req.userId)) continue;
    const otherId = key.split('::').find(id => id !== req.userId);
    if (!otherId) continue;
    const peer = social.profiles[otherId];
    if (!peer) continue;
    const lastMsg = msgs[msgs.length - 1];
    convos.push({ peerId: otherId, peer, lastMessage: lastMsg, messageCount: msgs.length });
  }
  convos.sort((a, b) => new Date(b.lastMessage?.timestamp || 0) - new Date(a.lastMessage?.timestamp || 0));
  res.json({ conversations: convos });
});

// Create group chat
app.post('/api/social/groups', authMiddleware, (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const social = loadSocial();
    const group = { id: crypto.randomUUID(), name, creatorId: req.userId, members: [req.userId, ...(memberIds || [])], messages: [], createdAt: new Date().toISOString() };
    social.groups[group.id] = group;
    saveSocial(social);
    res.json({ group });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List groups user is in
app.get('/api/social/groups', authMiddleware, (req, res) => {
  const social = loadSocial();
  const groups = Object.values(social.groups).filter(g => g.members.includes(req.userId)).map(g => {
    const lastMsg = g.messages[g.messages.length - 1];
    return { id: g.id, name: g.name, memberCount: g.members.length, lastMessage: lastMsg };
  });
  res.json({ groups });
});

// Get group detail + messages
app.get('/api/social/groups/:id', authMiddleware, (req, res) => {
  const social = loadSocial();
  const group = social.groups[req.params.id];
  if (!group || !group.members.includes(req.userId)) return res.status(404).json({ error: 'Group not found' });
  const members = group.members.map(mid => social.profiles[mid]).filter(Boolean);
  res.json({ group: { ...group, memberProfiles: members } });
});

// Send group message
app.post('/api/social/groups/:id/send', authMiddleware, (req, res) => {
  try {
    const { content } = req.body;
    const social = loadSocial();
    const group = social.groups[req.params.id];
    if (!group || !group.members.includes(req.userId)) return res.status(404).json({ error: 'Group not found' });
    const msg = { id: crypto.randomUUID(), from: req.userId, content, timestamp: new Date().toISOString() };
    group.messages.push(msg);
    if (group.messages.length > 500) group.messages = group.messages.slice(-500);
    saveSocial(social);
    res.json({ message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== TEXTBOOKS =====

const UPLOADS_DIR = join(DATA_DIR, 'uploads');
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// =========================================================
// FILE EXTRACT — generic endpoint the chat composer hits when the user
// drops a PDF / text file. Returns the extracted plain text so the
// client can prepend it to the outgoing message. Images are NOT
// extracted here — they go through the existing inline_data path
// (base64 in the message body) so Gemini sees the actual pixels.
// =========================================================
app.post('/api/files/extract', authMiddleware, upload.array('files', 5), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
    const out = [];
    for (const file of files) {
      try {
        const name = file.originalname || 'attachment';
        const isPdf = file.mimetype === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
        let text = '';
        if (isPdf) {
          const parsed = await pdfParse(file.buffer);
          text = parsed.text || '';
        } else if (file.mimetype?.startsWith('text/') || /\.(txt|md|csv|json|tex)$/i.test(name)) {
          text = file.buffer.toString('utf-8');
        } else {
          // Unsupported type for text-extract path. Caller should send
          // images via inline_data instead.
          out.push({ name, size: file.size, error: 'unsupported' });
          continue;
        }
        // Cap per-file text at 25k chars to protect the context window.
        text = text.slice(0, 25000).trim();
        out.push({ name, size: file.size, kind: isPdf ? 'pdf' : 'text', text });
      } catch (e) {
        out.push({ name: file.originalname || 'attachment', size: file.size, error: e.message || 'extract_failed' });
      }
    }
    res.json({ files: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// SOURCE-MATERIAL URL EXTRACTOR
//
// Stateless companion to /api/files/extract — fetches a single URL,
// strips HTML to plain text, returns it. Used by the New-Curriculum
// "Add sources" panel so the user can drop in textbook PDFs AND web
// pages alongside the topic, and the curriculum-generation prompt
// gets to see all of them.
// =========================================================
function htmlToPlainText(html) {
  if (!html) return '';
  return html
    // Drop entire <script> and <style> blocks (with content)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    // Convert block-ish tags to newlines BEFORE the tag-strip
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&[a-z0-9#]+;/gi, ' ')
    // Normalize whitespace
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

app.post('/api/sources/extract-url', authMiddleware, async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'URL required' });
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ error: 'Only http/https URLs are supported' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let html;
    try {
      const r = await fetch(parsed.href, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CovalentSources/1.0; +https://covalent.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);
      if (!r.ok) return res.status(400).json({ error: `Fetch failed (${r.status} ${r.statusText})` });
      const ctype = r.headers.get('content-type') || '';
      if (!/text\/(html|plain)|application\/(xhtml\+xml|xml)/i.test(ctype)) {
        return res.status(400).json({ error: `Unsupported content type: ${ctype || 'unknown'}` });
      }
      html = await r.text();
    } catch (e) {
      clearTimeout(timeout);
      return res.status(400).json({ error: `Could not fetch URL: ${e.message || 'unknown error'}` });
    }

    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const title = (titleMatch?.[1] || parsed.hostname).trim().slice(0, 200);
    const text = htmlToPlainText(html).slice(0, 25000);
    if (!text || text.length < 50) {
      return res.status(400).json({ error: 'Page had no readable text content' });
    }
    res.json({ url: parsed.href, title, kind: 'url', content: text, chars: text.length });
  } catch (e) {
    console.error('source extract-url failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// CURRICULUM EDIT — text instruction + optional PDF/text attachments
// =========================================================
app.post('/api/curriculum/:id/edit', authMiddleware, upload.array('files', 10), async (req, res) => {
  try {
    const { instruction } = req.body || {};
    if (!instruction || !instruction.trim()) {
      return res.status(400).json({ error: 'Instruction required' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const curriculum = (users[email].data.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    // Extract text from each attachment. PDFs go through pdf-parse; text
    // files are used as-is. Cap each attachment to 25k chars to protect
    // the context window.
    const contextPieces = [];
    const attachments = req.files || [];
    for (const file of attachments) {
      try {
        let text = '';
        if (file.mimetype === 'application/pdf' || (file.originalname || '').toLowerCase().endsWith('.pdf')) {
          const parsed = await pdfParse(file.buffer);
          text = parsed.text || '';
        } else {
          text = file.buffer.toString('utf-8');
        }
        text = text.slice(0, 25000);
        if (text.trim()) {
          contextPieces.push(`--- FILE: ${file.originalname || 'attachment'} ---\n${text}`);
        }
      } catch (e) {
        console.warn('Failed to parse attachment', file.originalname, e.message);
      }
    }

    // IMPORTANT: preserve chatHistory / phase / completion state. The model
    // only gets a SKELETON of the current curriculum (no per-lesson chat
    // history — that would blow the context, and we don't want the model
    // rewriting it anyway).
    const skeleton = {
      id: curriculum.id,
      title: curriculum.title,
      description: curriculum.description,
      settings: curriculum.settings,
      units: (curriculum.units || []).map(u => ({
        id: u.id,
        title: u.title,
        description: u.description,
        locked: false,
        lessons: (u.lessons || []).map(l => ({
          id: l.id,
          title: l.title,
          description: l.description,
          type: l.type,
        })),
      })),
    };

    const system = `You are editing a learning curriculum in JSON form. The user will give you an instruction and (optionally) some context files. Apply the instruction, keeping as much structure intact as possible.

RULES:
- Output ONLY a valid JSON object with the updated curriculum. No markdown, no explanation.
- Preserve existing ids on units/lessons whenever you keep them. For new units/lessons generate new ids using the pattern "\${curriculumId}-u\${n}" and "\${curriculumId}-u\${n}-l\${m}" with sensible numbers.
- Every unit must have a "lessons" array and "locked":false.
- Every lesson must have "id", "title", "description", and "type" (one of: "lesson", "math_tutor", "practice", "essay", "unit_test"). "math_tutor" = step-by-step worked problems on a handwriting canvas (math only). "essay" = a graded short essay (scored against a rubric).
- DO NOT invent user progress fields like chatHistory, isCompleted, score, phase — the server preserves those on the client side.
- If the instruction is ambiguous, use your best judgment. Do NOT refuse.

Return JSON with this exact shape:
{
  "title": "...",
  "description": "...",
  "units": [
    { "id": "...", "title": "...", "description": "...", "lessons": [
      { "id": "...", "title": "...", "description": "...", "type": "lesson" }
    ] }
  ]
}`;

    const userParts = [
      `CURRENT CURRICULUM (JSON):\n${JSON.stringify(skeleton, null, 2)}`,
    ];
    if (contextPieces.length) {
      userParts.push(`\nCONTEXT FILES:\n${contextPieces.join('\n\n')}`);
    }
    userParts.push(`\nINSTRUCTION FROM USER:\n${instruction.trim()}`);

    const result = await callGemini(
      system,
      [{ role: 'user', content: userParts.join('\n\n') }],
      modelForUser(users[email], email),
      8192,
      { jsonMode: true, temperature: 0.5 }
    );
    if (!result.success) return res.status(500).json({ error: result.error || 'Edit failed' });

    const text = result.data.content?.[0]?.text || '';
    const updated = parseAIJson(text);
    if (!updated || !Array.isArray(updated.units)) {
      console.error('Curriculum-edit parse failed. First 400 chars:', text.slice(0, 400));
      return res.status(500).json({ error: 'Model returned invalid JSON. Try again.' });
    }

    // Merge: for each unit/lesson, if the updated one has an id that matches
    // the existing, copy over user-progress fields (chatHistory, phase,
    // isCompleted, score, phaseData, content). New ones get fresh defaults.
    const oldLessonMap = new Map();
    for (const u of (curriculum.units || [])) {
      for (const l of (u.lessons || [])) {
        oldLessonMap.set(l.id, l);
      }
    }

    const newUnits = (updated.units || []).map((u, ui) => {
      const uid = u.id || `${curriculum.id}-u${ui}`;
      const lessons = (u.lessons || []).map((l, li) => {
        const lid = l.id || `${uid}-l${li}`;
        const existing = oldLessonMap.get(lid) || {};
        return {
          id: lid,
          title: l.title || 'Untitled',
          description: l.description || '',
          type: l.type || 'lesson',
          // preserve progress if present
          chatHistory: existing.chatHistory || [],
          phase: existing.phase ?? null,
          phaseData: existing.phaseData || {},
          content: existing.content ?? null,
          isCompleted: !!existing.isCompleted,
          score: existing.score ?? null,
        };
      });
      return {
        id: uid,
        title: u.title || 'Untitled Unit',
        description: u.description || '',
        locked: false,
        lessons,
      };
    });

    curriculum.title = updated.title || curriculum.title;
    curriculum.description = updated.description || curriculum.description;
    curriculum.units = newUnits;
    curriculum.updatedAt = new Date().toISOString();
    saveUsers(users);

    res.json({ curriculum });
  } catch (e) {
    console.error('curriculum edit error', e);
    res.status(500).json({ error: e.message });
  }
});

// (Standalone Textbooks app removed. Curriculum source-material upload
// — PDF + URL ingestion at /api/files/extract and /api/sources/extract-url
// — replaces it for the "give me a course aligned to this PDF" flow.)

// ===== ADMIN =====

function isAdmin(userId) {
  const social = loadSocial();
  const profile = social.profiles[userId];
  return profile?.handle === 'goon';
}

function adminMiddleware(req, res, next) {
  if (!isAdmin(req.userId)) return res.status(403).json({ error: 'Not authorized' });
  next();
}

// Enforce the free-plan message quota for AI chat endpoints.
// Pro / owner = unlimited. Free = FREE_DAILY_MESSAGE_LIMIT/day.
// On success, increments `usage.messages` and persists; adds `req.quota`
// and `req.userPlan` so handlers can surface remaining count.
function requireMessageQuota(req, res, next) {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  // Sourced (web-search) requests cost 2 messages against the daily cap.
  const sourced = !!(req.body && req.body.sourced);
  const cost = sourced ? 2 : 1;
  const result = consumeMessage(users, email, cost);
  if (!result.allowed) {
    return res.status(402).json({
      error: 'message_limit_reached',
      message: sourced
        ? `A sourced answer costs 2 messages and you only have ${result.remaining} left today. Upgrade to Pro for unlimited.`
        : `You've hit the free-plan daily limit of ${result.limit} messages. Upgrade to Pro for unlimited.`,
      limit: result.limit, remaining: result.remaining, plan: result.plan,
    });
  }
  saveUsers(users);
  req.quota = result;
  req.userPlan = result.plan;
  req.sourced = sourced;
  next();
}

// ===== STANDALONE LESSONS =====
// A simple single-lesson-at-a-time app: user requests a topic, gets one lesson,
// and can chat through the same 5-phase flow as curriculum lessons.

function findLesson(userData, lessonId) {
  return (userData.lessons || []).find(l => l.id === lessonId);
}

// List lessons (newest first)
app.get('/api/lessons', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lessons = (users[email].data.lessons || [])
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map(l => ({
        id: l.id,
        topic: l.topic,
        title: l.title,
        description: l.description,
        difficulty: l.difficulty,
        isCompleted: !!l.isCompleted,
        createdAt: l.createdAt,
        lastActiveAt: l.lastActiveAt,
        messageCount: (l.chatHistory || []).length,
        // New block-mode fields for the list UI: how far the user got
        // through the 8 blocks, and whether the lesson is even using
        // the new format (older rows just have chatHistory).
        blocksTotal: Array.isArray(l.blocks) ? l.blocks.length : 0,
        blocksDone: Array.isArray(l.blocks) ? l.blocks.filter(b => b.completedAt).length : 0,
      }));
    res.json({ lessons });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create a new standalone lesson (no AI generation — we just record the topic.
// The actual teaching happens in the chat endpoint below.)
app.post('/api/lessons', authMiddleware, (req, res) => {
  try {
    const { topic, difficulty } = req.body || {};
    if (!topic || !topic.trim()) return res.status(400).json({ error: 'Topic required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const cleanTopic = topic.trim().slice(0, 200);
    const id = `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lesson = {
      id,
      topic: cleanTopic,
      title: cleanTopic,
      description: `Single lesson on ${cleanTopic}`,
      difficulty: difficulty || users[email].data.preferences?.defaultDifficulty || 'beginner',
      type: 'lesson',
      chatHistory: [],
      isCompleted: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    if (!users[email].data.lessons) users[email].data.lessons = [];
    users[email].data.lessons.unshift(lesson);
    saveUsers(users);
    res.json({ lesson });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get single lesson
app.get('/api/lessons/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ lesson });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a lesson
app.delete('/api/lessons/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const before = (users[email].data.lessons || []).length;
    users[email].data.lessons = (users[email].data.lessons || []).filter(l => l.id !== req.params.id);
    if (users[email].data.lessons.length === before) return res.status(404).json({ error: 'Lesson not found' });
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chat history
app.get('/api/lessons/:id/history', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json({
      chatHistory: lesson.chatHistory || [],
      isCompleted: !!lesson.isCompleted,
      completionData: lesson.completionData || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset
app.post('/api/lessons/:id/reset', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    lesson.chatHistory = [];
    // Block-mode lessons: drop the cached blocks so the next view triggers
    // a fresh generation from scratch.
    lesson.blocks = [];
    lesson.isCompleted = false;
    lesson.completionData = null;
    lesson.lastActiveAt = Date.now();
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =========================================================
// STANDALONE-LESSON BLOCKS — same Claudius 4R/4Q + final SRS
// flow as curriculum lessons, but without a parent unit/course.
// Mirrors POST /api/curriculum/:id/lesson/:lessonId/blocks/* but
// operates on users[email].data.lessons[].
// =========================================================

app.post('/api/lessons/:id/blocks/generate', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Idempotent: return cached blocks if already generated.
    if (Array.isArray(lesson.blocks) && lesson.blocks.length >= 7) {
      return res.json({ blocks: lesson.blocks });
    }

    const sys = `You generate one complete lesson as 7 blocks: 4 readings interleaved with 3 mid-quizzes. Output ONLY valid JSON — no markdown, no fences, no commentary.`;
    const prompt = `Build a standalone lesson on "${lesson.topic || lesson.title}".
Difficulty: ${lesson.difficulty || 'beginner'}.

EXACTLY 7 blocks in this order:
  1. reading_1 — Core definition + framing of the topic. The simplest correct mental model.
  2. quiz_1   — 3 multiple-choice questions on reading 1.
  3. reading_2 — Mechanics. How it works, with a worked numeric / concrete example.
  4. quiz_2   — 3 multiple-choice questions on reading 2.
  5. reading_3 — SPACED-REPETITION review of readings 1 + 2. The student has now seen R1 and R2 — return to the trickiest concepts from BOTH readings, re-frame from a different angle, hit the most common misconceptions head-on, and add ONE bridging idea that ties them together. This is NOT a new sub-concept — it is intentional review designed to make R1 + R2 stick. 350-450 words.
  6. quiz_3   — 3 multiple-choice questions that mix R1, R2, and R3 (i.e. drag Q1/Q2-style content back in alongside the R3 framing).
  7. reading_4 — Synthesis + edge cases. Surface 1-2 lingering subtleties.

Each reading: 350-500 words of markdown (## sub-heading + body, with **bold**, lists, fenced code where useful, math via $...$ or $$...$$ if it fits).
Each quiz question: a "prompt" (string), 4 "choices" (strings, no A) B) prefixes — UI adds them), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible — each wrong option encodes a real misconception.

Return JSON exactly in this shape:
{
  "blocks": [
    {"type":"reading","title":"Reading 1 — <name>","content":"<markdown>"},
    {"type":"quiz","title":"Quiz 1","questions":[{"prompt":"...","choices":["...","...","...","..."],"answer":"...","explanation":"..."},...3 total...]},
    ...
    {"type":"reading","title":"Reading 4 — <name>","content":"<markdown>"}
  ]
}`;

    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 8192, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Lesson generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length !== 7) {
      console.error('lessons blocks/generate parse failed. Got', parsed?.blocks?.length, 'blocks');
      return res.status(500).json({ error: 'Lesson did not return 7 blocks. Try again.' });
    }

    const blocks = parsed.blocks.map((b, i) => {
      const opts = i === 4 ? { srs: true } : {};
      return stampBlock(lesson.id, b, i, opts);
    });

    lesson.blocks = blocks;
    lesson.lastActiveAt = Date.now();
    saveUsers(users);
    res.json({ blocks });
  } catch (e) {
    console.error('lessons blocks/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lessons/:id/blocks/final-quiz/generate', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length < 7) {
      return res.status(400).json({ error: 'Run blocks/generate first' });
    }
    if (lesson.blocks.length === 8) return res.json({ block: lesson.blocks[7] });

    const missed = collectMissedFromLesson(lesson);
    const missedBlock = missed.length
      ? `MISSED QUESTIONS FROM Q1-Q3 (use these as the spine of the final quiz — re-test the same concepts from a different angle, do NOT repeat the questions verbatim):\n${missed.map((m, i) => `  ${i + 1}. Prompt: ${m.prompt}\n     Student picked: ${m.userPicked}\n     Correct: ${m.correctAnswer}\n     Why it tripped them: ${m.explanation}`).join('\n')}`
      : `(The student got every Q1-Q3 question right. Push harder: 5 application / synthesis questions that integrate readings 1-4.)`;

    const sys = `You write the FINAL QUIZ for a lesson — a 5-question multiple-choice quiz that integrates the whole lesson. Output ONLY valid JSON.`;
    const prompt = `Lesson: "${lesson.topic || lesson.title}".
Difficulty: ${lesson.difficulty || 'beginner'}.

${missedBlock}

Write 5 multiple-choice questions:
- 3 of them must directly re-test the missed-concept areas from above (different angle, harder than the original question).
- 2 of them must test synthesis — pulling ideas from at least 2 different readings together.

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible — each wrong option encodes a real misconception.

Return JSON exactly:
{ "questions": [ ...5 total... ] }`;

    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 4096, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Final quiz generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'Final quiz returned no questions. Try again.' });
    }

    const block = stampBlock(lesson.id, { type: 'quiz', title: 'Final Quiz', questions: parsed.questions }, 7, { isFinal: true });
    lesson.blocks.push(block);
    saveUsers(users);
    res.json({ block });
  } catch (e) {
    console.error('lessons blocks/final-quiz/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lessons/:id/blocks/:bid/grade', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const block = (lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block || block.type !== 'quiz') return res.status(404).json({ error: 'Quiz block not found' });

    const responses = Array.isArray(req.body?.responses) ? req.body.responses : [];
    const results = block.questions.map(q => {
      const r = responses.find(x => x.qid === q.id);
      const given = r?.given || '';
      const correct = !!given && given.trim().toLowerCase() === String(q.answer || '').trim().toLowerCase();
      return { qid: q.id, given, correct };
    });
    const correctCount = results.filter(r => r.correct).length;
    const score = block.questions.length > 0 ? Math.round((correctCount / block.questions.length) * 100) : 0;

    block.score = score;
    block.responses = results;
    block.completedAt = new Date().toISOString();
    saveUsers(users);

    res.json({ score, results });
  } catch (e) {
    console.error('lessons blocks/grade failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lessons/:id/blocks/:bid/complete', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const block = (lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block) return res.status(404).json({ error: 'Block not found' });

    if (!block.completedAt) block.completedAt = new Date().toISOString();

    // Lesson completion: all 8 blocks done. Awards XP just like the legacy
    // chat-mode lesson did, so the user's profile / streak / level still
    // tick over correctly.
    const allDone = (lesson.blocks || []).length === 8 && (lesson.blocks || []).every(b => b.completedAt);
    if (allDone && !lesson.isCompleted) {
      lesson.isCompleted = true;
      lesson.completedAt = new Date().toISOString();
      const quizScores = (lesson.blocks || [])
        .filter(b => b.type === 'quiz' && typeof b.score === 'number').map(b => b.score);
      lesson.score = quizScores.length ? Math.round(quizScores.reduce((s, n) => s + n, 0) / quizScores.length) : null;
      // Mirror the chat-mode XP grant. 20 XP base, optionally tiered by score.
      ensureLessonCompletionFields(users[email].data);
      const xp = 20;
      users[email].data.profile.xp = (users[email].data.profile.xp || 0) + xp;
      while (users[email].data.profile.xp >= users[email].data.profile.xpToNextLevel) {
        users[email].data.profile.level++;
        users[email].data.profile.xp -= users[email].data.profile.xpToNextLevel;
        users[email].data.profile.xpToNextLevel = Math.floor(users[email].data.profile.xpToNextLevel * 1.5);
      }
      lesson.completionData = { xpEarned: xp, score: lesson.score };
    }
    saveUsers(users);
    res.json({ block, lesson: { isCompleted: !!lesson.isCompleted, score: lesson.score ?? null, completionData: lesson.completionData || null } });
  } catch (e) {
    console.error('lessons blocks/complete failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// Chat (SSE) — free-form single-lesson teaching. No phases; AI decides when done via [LESSON_DONE].
app.post('/api/lessons/:id/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { message, sourced, images } = req.body || {};
    req.sourced = !!sourced;
    req.images = Array.isArray(images) ? images : [];
    if (!message && !req.images.length) return res.status(400).json({ error: 'Message required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    if (!lesson.chatHistory) lesson.chatHistory = [];

    lesson.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    lesson.lastActiveAt = Date.now();

    const systemPrompt = buildStandaloneLessonPrompt(
      lesson,
      { difficulty: lesson.difficulty || 'beginner' },
      users[email].data.profile, users[email].data.preferences, lesson.chatHistory,
      users[email].data.assessmentHistory || []
    );
    const aiMessages = lesson.chatHistory.map(m => ({ role: m.role, content: m.content }));
    if (req.images?.length && aiMessages.length && aiMessages[aiMessages.length - 1].role === 'user') {
      aiMessages[aiMessages.length - 1].images = req.images;
    }

    const tierModel = modelForUser(users[email], email);
    await streamAIResponse(res, systemPrompt, aiMessages, async (fullContent, sources) => {
      const assistantMsg = { role: 'assistant', content: fullContent, timestamp: new Date().toISOString() };
      if (sources && sources.length) assistantMsg.sources = sources;
      lesson.chatHistory.push(assistantMsg);

      // Completion — AI-decided. Accepts [LESSON_DONE] (new) and [LESSON_COMPLETE] (legacy).
      // Gemini sometimes wraps the JSON in code fences and source-mode inserts
      // [n] citation markers in the text, so we sanitize before matching.
      const cleaned = fullContent
        .replace(/```(?:json|javascript|js)?\s*/gi, '')
        .replace(/```/g, '')
        .replace(/\s*\[\d+\]\s*/g, ' '); // strip inline [1][2]... citations
      const hasDoneMarker = /\[LESSON_(?:DONE|COMPLETE)\]/.test(cleaned);
      const doneMatch = hasDoneMarker ? extractLessonDoneJson(cleaned) : null;
      if (hasDoneMarker) {
        // Core fact: mark complete. This MUST persist regardless of any
        // downstream bookkeeping failure.
        lesson.isCompleted = true;
        lesson.completedAt = new Date().toISOString();
        ensureLessonCompletionFields(users[email].data);

        // XP + level (isolated so a parse failure can't block streak updates).
        if (doneMatch) {
          try {
            const completionData = JSON.parse(doneMatch);
            lesson.completionData = completionData;
            const xp = completionData.xpEarned || 20;
            users[email].data.profile.xp = (users[email].data.profile.xp || 0) + xp;
            if (users[email].data.profile.xp >= users[email].data.profile.xpToNextLevel) {
              users[email].data.profile.level++;
              users[email].data.profile.xp -= users[email].data.profile.xpToNextLevel;
              users[email].data.profile.xpToNextLevel = Math.floor(users[email].data.profile.xpToNextLevel * 1.5);
            }
          } catch (e) { console.warn('lesson completionData parse failed:', e.message); }
        } else {
          // No JSON blob — still record a minimal completion so the client
          // gets a consistent shape to render the completion banner.
          lesson.completionData = lesson.completionData || { xpEarned: 20, summary: 'Lesson completed.' };
          users[email].data.profile.xp = (users[email].data.profile.xp || 0) + 20;
        }

        // Streak bookkeeping — defensive so a bad field can't kill the save below.
        try {
          const today = new Date().toISOString().slice(0, 10);
          const streaks = users[email].data.studyStreaks;
          if (!users[email].data.dailyLog[today]) users[email].data.dailyLog[today] = { lessonsCompleted: 0 };
          users[email].data.dailyLog[today].lessonsCompleted++;
          if (streaks.lastActiveDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            streaks.currentStreak = streaks.lastActiveDate === yesterday ? streaks.currentStreak + 1 : 1;
            streaks.lastActiveDate = today;
            if (streaks.currentStreak > streaks.longestStreak) streaks.longestStreak = streaks.currentStreak;
          }
          streaks.weeklyActivity[new Date().getDay()] = (streaks.weeklyActivity[new Date().getDay()] || 0) + 1;
        } catch (e) { console.warn('lesson streak bookkeeping failed:', e.message); }
      }

      // Always persist — whether the lesson completed or not, chat history
      // + isCompleted flag + streak updates all need to survive.
      try { saveUsers(users); } catch (e) { console.error('saveUsers failed:', e.message); }
    }, tierModel, { enableWebSearch: !!req.sourced });
  } catch (e) {
    console.error('Standalone lesson chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});


// =========================================================
// MATH TUTOR — single endpoint, stateless from the server's POV.
// The client owns the conversation history (so users can fork / edit freely)
// and passes it in on each turn along with topic + custom instructions.
// =========================================================
app.post('/api/math-tutor/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { topic, customInstructions, messages, phase, images } = req.body || {};
    if (!topic || typeof topic !== 'string') return res.status(400).json({ error: 'topic required' });
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages required' });
    const validPhase = ['lesson', 'practice', 'grade'].includes(phase) ? phase : 'lesson';

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const systemPrompt = buildMathTutorPrompt(
      topic,
      customInstructions || '',
      users[email].data.profile,
      users[email].data.preferences,
      users[email].data.assessmentHistory || [],
      validPhase,
    );

    // Attach any images sent this turn to the last user message.
    const aiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    const imgs = Array.isArray(images) ? images : [];
    if (imgs.length && aiMessages.length && aiMessages[aiMessages.length - 1].role === 'user') {
      aiMessages[aiMessages.length - 1].images = imgs;
    }

    const tierModel = modelForUser(users[email], email);
    await streamAIResponse(
      res,
      systemPrompt,
      aiMessages,
      async () => {
        // No server-side persistence — client holds state. Just consume the quota.
      },
      tierModel,
      { enableWebSearch: false },
    );
  } catch (e) {
    console.error('Math tutor chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// =========================================================
// BILLING / PRO PLAN
// =========================================================

// Current user's plan + today's usage + limits.
app.get('/api/billing/status', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    ensureUsageBucket(users[email]);
    saveUsers(users);
    const plan = getPlan(users[email], email);
    const pro = plan === 'pro';
    res.json({
      plan,
      isOwner: isOwner(email),
      isAdvisor: isAdvisor(email),
      isBeta: canSeeBeta(email),
      proUntil: users[email].data.proUntil || null,
      proGrantedBy: users[email].data.proGrantedBy || null,
      limits: {
        messagesPerDay: FREE_DAILY_MESSAGE_LIMIT,
        quizBowlGamesPerDay: FREE_DAILY_QUIZBOWL_GAMES,
        curriculaPerWeek: FREE_WEEKLY_CURRICULA,
        debatesPerWeek: FREE_WEEKLY_DEBATES,
      },
      usage: {
        messages: users[email].data.usage.messages,
        quizBowlGames: users[email].data.usage.quizBowlGames,
        curricula: users[email].data.usage.curricula || 0,
        debates: users[email].data.usage.debates || 0,
        remainingMessages: pro ? null : Math.max(0, FREE_DAILY_MESSAGE_LIMIT - users[email].data.usage.messages),
        remainingQuizBowl: pro ? null : Math.max(0, FREE_DAILY_QUIZBOWL_GAMES - users[email].data.usage.quizBowlGames),
        remainingCurricula: pro ? null : Math.max(0, FREE_WEEKLY_CURRICULA - (users[email].data.usage.curricula || 0)),
        remainingDebates: pro ? null : Math.max(0, FREE_WEEKLY_DEBATES - (users[email].data.usage.debates || 0)),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Create a Stripe Checkout session. Frontend redirects to `url`.
app.post('/api/billing/create-checkout-session', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    // Reuse or create Stripe customer
    let customerId = users[email].data.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: users[email].name || undefined,
        metadata: { userId: req.userId },
      });
      customerId = customer.id;
      users[email].data.stripeCustomerId = customerId;
      saveUsers(users);
    }

    // Use a preconfigured STRIPE_PRICE_ID if set, otherwise create an inline
    // price so the user can test without pre-provisioning anything in Stripe.
    let priceConfig;
    if (STRIPE_PRICE_ID) {
      priceConfig = { price: STRIPE_PRICE_ID };
    } else {
      const usd = Number(process.env.PRO_PRICE_USD || '10');
      priceConfig = {
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          product_data: { name: 'RushilAI Pro', description: 'Unlimited messages, Gemini 3.1 Pro, unlimited Quiz Bowl, Pro badge.' },
          unit_amount: Math.round(usd * 100),
        },
      };
    }

    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ ...priceConfig, quantity: 1 }],
      success_url: `${origin}/?upgraded=1`,
      cancel_url: `${origin}/?upgraded=0`,
      metadata: { userId: req.userId },
      allow_promotion_codes: true,
    });
    res.json({ url: session.url, id: session.id });
  } catch (e) {
    console.error('checkout session failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Verify Stripe subscription status on-demand. Called by the frontend
// when the user returns from Checkout — works WITHOUT a configured
// webhook, which is why Pro wasn't activating before.
app.post('/api/billing/sync', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    let customerId = users[email].data.stripeCustomerId;
    // Payment Link creates a fresh customer — look it up by email if we don't have one yet.
    if (!customerId) {
      try {
        const found = await stripe.customers.list({ email, limit: 5 });
        if (found?.data?.length) {
          // Prefer a customer with an active/trialing subscription
          for (const c of found.data) {
            const s = await stripe.subscriptions.list({ customer: c.id, limit: 5, status: 'all' });
            if (s.data.some(x => x.status === 'active' || x.status === 'trialing')) { customerId = c.id; break; }
          }
          if (!customerId) customerId = found.data[0].id;
          users[email].data.stripeCustomerId = customerId;
        }
      } catch (e) { console.warn('customer email lookup failed', e.message); }
    }
    if (!customerId) return res.json({ plan: 'free', synced: false });

    // Pull the newest subscription for this customer
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 5, status: 'all' });
    const active = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
    if (active) {
      users[email].data.plan = 'pro';
      users[email].data.proGrantedBy = 'stripe';
      users[email].data.stripeSubscriptionId = active.id;
      users[email].data.proUntil = active.current_period_end
        ? new Date(active.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 35 * 86400000).toISOString();
    } else {
      // No active sub — but don't downgrade owner-granted Pro
      if (users[email].data.proGrantedBy === 'stripe') {
        users[email].data.plan = 'free';
        users[email].data.proUntil = null;
        users[email].data.stripeSubscriptionId = null;
      }
    }
    saveUsers(users);
    res.json({ plan: getPlan(users[email], email), synced: true, proUntil: users[email].data.proUntil });
  } catch (e) {
    console.error('billing sync failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Customer portal (manage/cancel subscription).
app.post('/api/billing/portal', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    const customerId = users[email]?.data?.stripeCustomerId;
    if (!customerId) return res.status(400).json({ error: 'No Stripe customer yet' });
    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/` });
    res.json({ url: portal.url });
  } catch (e) {
    console.error('portal failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Webhook handler (mounted as raw body above).
async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(500).send('Stripe not configured');
  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Fallback for local testing without a webhook secret set
      event = JSON.parse(req.body.toString('utf-8'));
    }
  } catch (err) {
    console.error('Webhook signature check failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const users = loadUsers();
    function userByCustomer(customerId) {
      const email = Object.keys(users).find(e => users[e].data?.stripeCustomerId === customerId);
      return email ? { email, user: users[email] } : null;
    }
    function userByEmail(emailAddr) {
      if (!emailAddr) return null;
      const key = Object.keys(users).find(e => e.toLowerCase() === emailAddr.toLowerCase());
      return key ? { email: key, user: users[key] } : null;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Payment Links create fresh Stripe customers — fall back to email lookup
      // so link-based payments still activate Pro for the right user.
      let entry = userByCustomer(session.customer);
      if (!entry) {
        const email = session.customer_email || session.customer_details?.email;
        entry = userByEmail(email);
        if (entry && session.customer) {
          entry.user.data = migrateUserData(entry.user.data);
          entry.user.data.stripeCustomerId = session.customer;
        }
      }
      if (entry) {
        entry.user.data = migrateUserData(entry.user.data);
        entry.user.data.plan = 'pro';
        entry.user.data.proGrantedBy = 'stripe';
        entry.user.data.stripeSubscriptionId = session.subscription || null;
        // Subscriptions don't give an end date on this event — we set a
        // 35-day grace. The subscription.updated webhook will refine it.
        entry.user.data.proUntil = new Date(Date.now() + 35 * 86400000).toISOString();
        saveUsers(users);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      let entry = userByCustomer(sub.customer);
      if (!entry && sub.customer) {
        try {
          const cust = await stripe.customers.retrieve(sub.customer);
          entry = userByEmail(cust?.email);
          if (entry) {
            entry.user.data = migrateUserData(entry.user.data);
            entry.user.data.stripeCustomerId = sub.customer;
          }
        } catch {}
      }
      if (entry) {
        entry.user.data = migrateUserData(entry.user.data);
        entry.user.data.stripeSubscriptionId = sub.id;
        if (sub.status === 'active' || sub.status === 'trialing') {
          entry.user.data.plan = 'pro';
          entry.user.data.proGrantedBy = 'stripe';
          const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          entry.user.data.proUntil = periodEnd ? periodEnd.toISOString() : null;
        } else if (sub.status === 'canceled' || sub.status === 'unpaid' || sub.status === 'incomplete_expired') {
          entry.user.data.plan = 'free';
          entry.user.data.proUntil = null;
        }
        saveUsers(users);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const entry = userByCustomer(sub.customer);
      if (entry) {
        entry.user.data = migrateUserData(entry.user.data);
        entry.user.data.plan = 'free';
        entry.user.data.proUntil = null;
        entry.user.data.stripeSubscriptionId = null;
        saveUsers(users);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('webhook handler error', err);
    res.status(500).send(err.message);
  }
}

// Owner-only: grant / revoke Pro to any user (no payment)
function ownerMiddleware(req, res, next) {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  if (!isOwner(email)) return res.status(403).json({ error: 'Owner only' });
  next();
}

app.post('/api/owner/grant-pro', authMiddleware, ownerMiddleware, (req, res) => {
  const { userId, email: targetEmail, until } = req.body || {};
  const users = loadUsers();
  let email = targetEmail && users[targetEmail] ? targetEmail : findEmailById(users, userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  users[email].data.plan = 'pro';
  users[email].data.proGrantedBy = 'owner';
  users[email].data.proUntil = until || null; // null = untimed
  saveUsers(users);
  res.json({ success: true, user: { email, plan: users[email].data.plan, proUntil: users[email].data.proUntil } });
});

app.post('/api/owner/revoke-pro', authMiddleware, ownerMiddleware, (req, res) => {
  const { userId, email: targetEmail } = req.body || {};
  const users = loadUsers();
  let email = targetEmail && users[targetEmail] ? targetEmail : findEmailById(users, userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  users[email].data.plan = 'free';
  users[email].data.proUntil = null;
  users[email].data.proGrantedBy = null;
  saveUsers(users);
  res.json({ success: true });
});

// Check if current user is admin
app.get('/api/admin/check', authMiddleware, (req, res) => {
  res.json({ isAdmin: isAdmin(req.userId) });
});

// List all users
// Match any auto-created demo user — landing-page mini-OS spins up a
// throwaway user per tab, and the legacy `dev@covalent.test` fixture.
// We filter them out of the admin list so the panel isn't flooded.
function isDemoOrDevEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test') || e === 'dev@covalent.test';
}

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const social = loadSocial();
  // ?includeDemo=1 — admin panel toggle to show/hide demo-landing-*
  // and *@covalent.test throwaway accounts. Default OFF so the panel
  // isn't flooded under normal use.
  const includeDemo = req.query.includeDemo === '1' || req.query.includeDemo === 'true';
  const list = Object.entries(users)
    .filter(([email]) => includeDemo || !isDemoOrDevEmail(email))
    .map(([email, u]) => {
    const plan = getPlan(u, email);
    const totalStudyMsgs = (u.data?.studySessions || []).reduce((n, s) => n + (s.messages?.length || 0), 0);
    const totalLessonMsgs = (u.data?.lessons || []).reduce((n, l) => n + (l.chatHistory?.length || 0), 0);
    let curriculumMsgs = 0;
    for (const c of (u.data?.curricula || [])) {
      for (const unit of (c.units || [])) {
        for (const l of (unit.lessons || [])) {
          curriculumMsgs += (l.chatHistory?.length || 0);
        }
      }
    }
    return {
      id: u.id, email, name: u.name,
      handle: social.profiles[u.id]?.handle || null,
      banned: !!u.banned,
      isDemo: isDemoOrDevEmail(email),
      plan,
      proUntil: u.data?.proUntil || null,
      proGrantedBy: u.data?.proGrantedBy || null,
      level: u.data?.profile?.level || 1,
      xp: u.data?.profile?.xp || 0,
      curriculaCount: (u.data?.curricula || []).length,
      notesCount: (u.data?.notes || []).length,
      studySessionCount: (u.data?.studySessions || []).length,
      lessonCount: (u.data?.lessons || []).length,
      // Cheap chat totals for the list view
      chatMessages: { study: totalStudyMsgs, lessons: totalLessonMsgs, curriculum: curriculumMsgs },
      usage: u.data?.usage || { day: null, messages: 0, quizBowlGames: 0 },
      visitCount: u.data?.visitCount || 0,
      lastVisitAt: u.data?.lastVisitAt || null,
      firstVisitAt: u.data?.firstVisitAt || null,
      createdAt: u.createdAt,
      lastActiveAt: u.data?.studyStreaks?.lastActiveDate || null,
    };
  });
  res.json({ users: list });
});

// Get user detail (full data)
app.get('/api/admin/users/:uid', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const social = loadSocial();
  const entry = Object.entries(users).find(([, u]) => u.id === req.params.uid);
  if (!entry) return res.status(404).json({ error: 'User not found' });
  // Demo / dev throwaway accounts are returnable when explicitly requested
  // via ?includeDemo=1 (admin panel toggle). Otherwise hidden.
  const includeDemo = req.query.includeDemo === '1' || req.query.includeDemo === 'true';
  if (!includeDemo && isDemoOrDevEmail(entry[0])) return res.status(404).json({ error: 'User not found' });
  const [email, u] = entry;
  u.data = migrateUserData(u.data);
  const plan = getPlan(u, email);

  // Flatten curriculum lesson chats for quick indexing in the detail view
  const curriculumChats = [];
  for (const c of (u.data.curricula || [])) {
    for (const unit of (c.units || [])) {
      for (const l of (unit.lessons || [])) {
        if (Array.isArray(l.chatHistory) && l.chatHistory.length) {
          curriculumChats.push({
            curriculumId: c.id, unitId: unit.id, lessonId: l.id,
            curriculumTitle: c.title, unitTitle: unit.title, lessonTitle: l.title,
            messageCount: l.chatHistory.length,
            lastActiveAt: l.chatHistory[l.chatHistory.length - 1]?.timestamp || null,
          });
        }
      }
    }
  }
  curriculumChats.sort((a, b) => (b.lastActiveAt || '').localeCompare(a.lastActiveAt || ''));

  res.json({
    user: {
      id: u.id, email, name: u.name, banned: !!u.banned,
      handle: social.profiles[u.id]?.handle || null,
      createdAt: u.createdAt,
      profile: u.data?.profile,
      // Billing
      plan,
      proUntil: u.data?.proUntil || null,
      proGrantedBy: u.data?.proGrantedBy || null,
      stripeCustomerId: u.data?.stripeCustomerId || null,
      stripeSubscriptionId: u.data?.stripeSubscriptionId || null,
      // Usage today
      usage: u.data?.usage || { day: null, messages: 0, quizBowlGames: 0 },
      // Visit tracking
      visitCount: u.data?.visitCount || 0,
      lastVisitAt: u.data?.lastVisitAt || null,
      firstVisitAt: u.data?.firstVisitAt || null,
      // Learning content
      curricula: (u.data?.curricula || []).map(c => ({
        id: c.id, title: c.title, unitCount: c.units?.length || 0,
        lessonCount: (c.units || []).reduce((n, u2) => n + (u2.lessons || []).length, 0),
        completedLessons: (c.units || []).reduce((n, u2) => n + (u2.lessons || []).filter(l => l.isCompleted).length, 0),
      })),
      notes: (u.data?.notes || []).map(n => ({ id: n.id, title: n.title, type: n.type, updatedAt: n.updatedAt })),
      goals: (u.data?.goals || []).map(g => ({ id: g.id, title: g.title, status: g.status })),
      flashcardDecks: (u.data?.flashcardDecks || []).map(d => ({ id: d.id, title: d.title, cardCount: d.cards?.length || 0 })),
      // Study sessions (metadata only — full content via /chats/study/:sid)
      studySessions: (u.data?.studySessions || []).map(s => ({
        id: s.id, title: s.title, messageCount: (s.messages || []).length,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
      })),
      // Standalone Lessons app
      standaloneLessons: (u.data?.lessons || []).map(l => ({
        id: l.id, topic: l.topic, title: l.title, difficulty: l.difficulty,
        isCompleted: !!l.isCompleted, messageCount: (l.chatHistory || []).length,
        createdAt: l.createdAt, lastActiveAt: l.lastActiveAt,
      })),
      // Curriculum lesson chats (flattened)
      curriculumChats,
      // Assessments
      assessmentHistory: (u.data?.assessmentHistory || []).map(a => ({
        id: a.id, title: a.title, score: a.score, total: a.total, percentage: a.percentage, createdAt: a.createdAt,
      })),
      // Streaks / daily activity
      studyStreaks: u.data?.studyStreaks || null,
    }
  });
});

// Get a specific study session's full transcript
app.get('/api/admin/users/:uid/chats/study/:sid', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const entry = Object.entries(users).find(([_, u]) => u.id === req.params.uid);
  if (!entry) return res.status(404).json({ error: 'User not found' });
  const [, u] = entry;
  const s = (u.data?.studySessions || []).find(x => x.id === req.params.sid);
  if (!s) return res.status(404).json({ error: 'Session not found' });
  res.json({ session: s });
});

// Get a standalone Lesson's chat transcript
app.get('/api/admin/users/:uid/chats/lesson/:lid', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const entry = Object.entries(users).find(([_, u]) => u.id === req.params.uid);
  if (!entry) return res.status(404).json({ error: 'User not found' });
  const [, u] = entry;
  const l = (u.data?.lessons || []).find(x => x.id === req.params.lid);
  if (!l) return res.status(404).json({ error: 'Lesson not found' });
  res.json({ lesson: l });
});

// Get a curriculum lesson's chat transcript (nested lookup)
app.get('/api/admin/users/:uid/chats/curriculum/:cid/:lid', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const entry = Object.entries(users).find(([_, u]) => u.id === req.params.uid);
  if (!entry) return res.status(404).json({ error: 'User not found' });
  const [, u] = entry;
  const curriculum = (u.data?.curricula || []).find(c => c.id === req.params.cid);
  if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
  let lesson = null, unitFound = null;
  for (const unit of (curriculum.units || [])) {
    const l = (unit.lessons || []).find(x => x.id === req.params.lid);
    if (l) { lesson = l; unitFound = unit; break; }
  }
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  res.json({
    curriculum: { id: curriculum.id, title: curriculum.title },
    unit: { id: unitFound.id, title: unitFound.title },
    lesson: {
      id: lesson.id, title: lesson.title, type: lesson.type, phase: lesson.phase,
      isCompleted: !!lesson.isCompleted, chatHistory: lesson.chatHistory || [],
    },
  });
});

// Ban/unban user
app.post('/api/admin/users/:uid/ban', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const email = Object.keys(users).find(e => users[e].id === req.params.uid);
  if (!email) return res.status(404).json({ error: 'User not found' });
  if (isDemoOrDevEmail(email)) return res.status(403).json({ error: 'Demo / dev accounts are protected. They\u2019re hidden from the panel and cannot be banned.' });
  users[email].banned = !users[email].banned;
  // If banning, kill their sessions
  if (users[email].banned) {
    for (const [token, sess] of Object.entries(sessions)) {
      if (sess.id === req.params.uid) delete sessions[token];
    }
    saveSessions();
  }
  saveUsers(users);
  res.json({ banned: users[email].banned });
});

// Delete user
app.delete('/api/admin/users/:uid', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const email = Object.keys(users).find(e => users[e].id === req.params.uid);
  if (!email) return res.status(404).json({ error: 'User not found' });
  // Demo / dev accounts are hidden from the panel and cannot be deleted —
  // wiping them mid-session would break the landing-page mini OS for
  // everyone currently using it.
  if (isDemoOrDevEmail(email)) return res.status(403).json({ error: 'Demo / dev accounts are protected. They\u2019re hidden from the panel and cannot be deleted.' });
  delete users[email];
  // Kill sessions
  for (const [token, sess] of Object.entries(sessions)) {
    if (sess.id === req.params.uid) delete sessions[token];
  }
  saveSessions();
  saveUsers(users);
  // Remove from social
  const social = loadSocial();
  delete social.profiles[req.params.uid];
  saveSocial(social);
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'covalent-ai' });
});


// =========================================================
// QUIZ BOWL — Head-to-head buzz multiplayer.
//
// Design choices to eliminate the lag that killed the old version:
//   - NO POLLING. Clients subscribe to an SSE stream per match and server
//     pushes every state transition.
//   - Word-by-word reveal runs CLIENT-SIDE from a shared `questionStartedAt`
//     timestamp, so both players see an identical reveal without per-tick
//     server round trips.
//   - Buzz is atomic on the server: first POST to /buzz that arrives wins;
//     all subsequent buzz POSTs get a 409 and the UI freezes as the loser.
//   - State is in-memory; matches expire 1h after last activity.
// =========================================================
const matches = new Map(); // matchId (code) -> state

// =========================================================
// QBReader integration — pull real, human-written pyramidal tossups
// from qbreader.org's public /api/random-tossup endpoint. Used by:
//   - Solo Quiz Bowl ("Past QB questions" mode in QuizBowlApp)
//   - (Optionally) multiplayer match start, when host picks QBReader.
// =========================================================
const QBREADER_BASE = 'https://www.qbreader.org/api';
// UI category → QBReader categories.
const QB_CATEGORY_MAP = {
  Science: ['Science'],
  History: ['History'],
  Literature: ['Literature'],
  Geography: ['Geography'],
  Math: ['Science'],          // QBReader files math under Science
  Art: ['Fine Arts'],
  Music: ['Fine Arts'],
  Philosophy: ['Philosophy'],
  'Pop Culture': ['Trash'],
  Mixed: [],
};
// UI difficulty → numeric difficulties (QBReader uses 1-10).
const QB_DIFFICULTY_MAP = {
  Easy:       [2, 3],
  Medium:     [3, 4, 5],
  Hard:       [5, 6, 7],
  Tournament: [7, 8, 9],
};
function qbStripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function qbExtractCanonical(answerHtml) {
  if (!answerHtml) return '';
  const m = answerHtml.match(/<u>([\s\S]*?)<\/u>/i);
  if (m) return qbStripHtml(m[1]);
  return qbStripHtml(answerHtml).split(/\[|\s+or\s+|\s+\(/)[0].trim();
}
function qbExtractAllAnswers(answerHtml) {
  if (!answerHtml) return [];
  const out = [];
  const re = /<u>([\s\S]*?)<\/u>/gi;
  let m;
  while ((m = re.exec(answerHtml)) !== null) {
    const t = qbStripHtml(m[1]);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
async function fetchQBReaderTossups({ count = 10, category = 'Mixed', difficulty = 'Medium' } = {}) {
  const cats = QB_CATEGORY_MAP[category] || [];
  const diffs = QB_DIFFICULTY_MAP[difficulty] || QB_DIFFICULTY_MAP.Medium;
  const params = new URLSearchParams({
    number: String(Math.max(1, Math.min(40, count))),
    difficulties: diffs.join(','),
  });
  if (cats.length) params.set('categories', cats.join(','));
  const url = `${QBREADER_BASE}/random-tossup?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let r;
  try {
    r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'covalent-ai/1.0 (+https://covalent.app)' },
    });
  } finally { clearTimeout(timeout); }
  if (!r.ok) throw new Error(`QBReader ${r.status} ${r.statusText}`);
  const data = await r.json();
  const tossups = (data?.tossups || []).map(t => {
    const text = t.question_sanitized || qbStripHtml(t.question);
    const canonical = qbExtractCanonical(t.answer);
    const alternates = qbExtractAllAnswers(t.answer);
    return {
      text,
      answer: canonical || qbStripHtml(t.answer_sanitized || t.answer || ''),
      answerHtml: t.answer || '',
      answerAlternates: alternates,
      source: 'qbreader',
      qbId: t._id,
      category: t.category,
      subcategory: t.subcategory,
      qbDifficulty: t.difficulty,
      setName: t.set?.name || '',
      year: t.set?.year || '',
      packet: t.packet?.name || '',
    };
  }).filter(q => q.text && q.answer);
  if (!tossups.length) throw new Error('QBReader returned no usable tossups');
  return tossups;
}

// GET /api/quizbowl/tossups — pull real tossups from QBReader by
// category + difficulty + count. Used by solo Quiz Bowl. The match
// flow (multiplayer) has its own AI generation path; this endpoint
// is the "Past QB questions" alternative for solo + future multiplayer.
app.get('/api/quizbowl/tossups', authMiddleware, async (req, res) => {
  try {
    const count = Math.max(1, Math.min(40, Number(req.query.count) || 10));
    const category = String(req.query.category || 'Mixed');
    const difficulty = String(req.query.difficulty || 'Medium');
    const tossups = await fetchQBReaderTossups({ count, category, difficulty });
    res.json({ tossups, source: 'qbreader' });
  } catch (e) {
    console.error('qbreader tossups failed:', e);
    res.status(502).json({ error: e.message || 'Failed to fetch from QBReader' });
  }
});

function newMatchCode() {
  // 6-char alphanumeric, uppercase for easy sharing. Collisions: retry.
  const alph = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 1/I/O/0 confusion
  for (let tries = 0; tries < 8; tries++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += alph[Math.floor(Math.random() * alph.length)];
    if (!matches.has(code)) return code;
  }
  return `M${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function pushMatchEvent(match, type, payload) {
  const body = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const p of match.players) {
    if (p.stream && !p.stream.writableEnded) {
      try {
        p.stream.write(body);
        // Force the event out of any Node/proxy buffer. Without this the
        // opponent occasionally sits on 'generating' because question_start
        // is sitting in a write buffer waiting for more data.
        if (typeof p.stream.flush === 'function') p.stream.flush();
      } catch {}
    }
  }
}

// Advance to next question (or end match). Used by host /next endpoint
// AND by the auto-advance timer that fires 5s after any reveal state.
function advanceMatchToNextQuestion(match) {
  if (match.revealTimeoutId) { clearTimeout(match.revealTimeoutId); match.revealTimeoutId = null; }
  if (match.questionTimeoutId) { clearTimeout(match.questionTimeoutId); match.questionTimeoutId = null; }
  const nextIdx = match.currentIdx + 1;
  if (nextIdx >= match.questions.length) {
    match.state = 'finished';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'match_end', { scores: match.scores });
    return;
  }
  match.currentIdx = nextIdx;
  match.state = 'playing';
  match.questionStartedAt = Date.now();
  match.buzzWinner = null;
  match.buzzAt = null;
  match.lockedOutForQ = {};
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'question_start', {
    idx: nextIdx,
    text: match.questions[nextIdx].text,
    startedAt: match.questionStartedAt,
    match: publicMatchState(match),
  });
  scheduleQuestionTimeout(match);
}

// Server-side "time's up" for the current question. If no correct answer
// comes in by the time the question has been fully read + a grace period,
// reveal the answer and auto-advance. This is what the user means by
// "at the end of the question, everyone shouldn't have to buzz wrong to move on."
function scheduleQuestionTimeout(match) {
  if (match.questionTimeoutId) clearTimeout(match.questionTimeoutId);
  const q = match.questions[match.currentIdx];
  if (!q) return;
  const words = (q.text || '').split(/\s+/).filter(Boolean).length || 1;
  const speed = match.revealSpeedMs || 140;
  const graceMs = 5000; // 5s after full read
  const totalMs = words * speed + graceMs;
  match.questionTimeoutId = setTimeout(() => {
    if (!matches.has(match.code)) return;
    if (match.state !== 'playing') return; // already in reveal or advanced
    match.state = 'reveal';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'answer_result', {
      userId: null,
      correct: false,
      answer: '',
      correctAnswer: q.answer,
      scores: match.scores,
      timeout: true,
      autoAdvanceInMs: 5000,
    });
    scheduleAutoAdvance(match, 5000);
  }, totalMs);
}

function scheduleAutoAdvance(match, delayMs = 5000) {
  if (match.revealTimeoutId) clearTimeout(match.revealTimeoutId);
  match.revealTimeoutId = setTimeout(() => {
    if (!matches.has(match.code)) return;
    if (match.state !== 'reveal') return; // host already advanced
    advanceMatchToNextQuestion(match);
  }, delayMs);
}

// When a player's SSE stream closes mid-game (tab close, network drop), give
// them 10s to reconnect before ending the match. Prevents dangling timers
// that kept the question "running" on the server even though the player
// couldn't see it anymore. A fresh /stream call cancels the grace.
function scheduleDisconnectAbandon(match, userId, graceMs = 10000) {
  if (!match.disconnectTimers) match.disconnectTimers = {};
  if (match.disconnectTimers[userId]) clearTimeout(match.disconnectTimers[userId]);
  match.disconnectTimers[userId] = setTimeout(() => {
    delete match.disconnectTimers[userId];
    if (!matches.has(match.code)) return;
    if (!['playing', 'reveal', 'generating'].includes(match.state)) return;
    if (match.questionTimeoutId) { clearTimeout(match.questionTimeoutId); match.questionTimeoutId = null; }
    if (match.revealTimeoutId)   { clearTimeout(match.revealTimeoutId);   match.revealTimeoutId = null; }
    match.state = 'finished';
    match.buzzWinner = null;
    match.buzzAt = null;
    pushMatchEvent(match, 'match_end', {
      scores: match.scores,
      abandoned: true,
      leftBy: userId,
      reason: 'disconnect',
    });
    match.players = match.players.filter(p => p.userId !== userId);
    if (!match.players.length) matches.delete(match.code);
  }, graceMs);
}

function cancelDisconnectAbandon(match, userId) {
  if (match.disconnectTimers?.[userId]) {
    clearTimeout(match.disconnectTimers[userId]);
    delete match.disconnectTimers[userId];
  }
}

function publicMatchState(match) {
  return {
    code: match.code,
    state: match.state,
    players: match.players.map(p => ({ userId: p.userId, name: p.name, score: match.scores[p.userId] || 0 })),
    currentIdx: match.currentIdx,
    totalQuestions: match.questions.length,
    currentQuestion: match.state === 'playing' && match.questions[match.currentIdx]
      ? { text: match.questions[match.currentIdx].text, startedAt: match.questionStartedAt }
      : null,
    buzzWinner: match.buzzWinner,
    buzzAt: match.buzzAt,
    hostId: match.hostId,
    category: match.category,
    difficulty: match.difficulty,
    revealSpeedMs: match.revealSpeedMs,
  };
}

function cleanupExpiredMatches() {
  const now = Date.now();
  for (const [code, match] of matches) {
    if (now - match.lastActivity > 60 * 60 * 1000) {
      for (const p of match.players) {
        if (p.stream && !p.stream.writableEnded) { try { p.stream.end(); } catch {} }
      }
      matches.delete(code);
    }
  }
}
setInterval(cleanupExpiredMatches, 5 * 60 * 1000);

// POST /api/quizbowl/match — create an empty match (instant). Question
// generation is deferred until /start so the host can configure the game
// AFTER the opponent has joined.
app.post('/api/quizbowl/match', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });

    const code = newMatchCode();
    const match = {
      code,
      state: 'waiting', // waiting | configuring | generating | playing | reveal | finished
      questions: [],
      currentIdx: 0,
      questionStartedAt: null,
      buzzWinner: null,
      buzzAt: null,
      players: [{ userId: req.userId, name: users[email].name || email.split('@')[0], stream: null }],
      hostId: req.userId,
      scores: { [req.userId]: 0 },
      category: 'Mixed', difficulty: 'Medium', revealSpeedMs: 140,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    matches.set(code, match);
    res.json({ code, match: publicMatchState(match) });
  } catch (e) { console.error('match create failed', e); res.status(500).json({ error: e.message }); }
});

// POST /api/quizbowl/match/:code/join — second player joins.
app.post('/api/quizbowl/match/:code/join', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.players.some(p => p.userId === req.userId)) {
    match.lastActivity = Date.now();
    return res.json({ match: publicMatchState(match) });
  }
  if (match.players.length >= 2) return res.status(409).json({ error: 'Match is full' });
  if (match.state !== 'waiting') return res.status(409).json({ error: 'Match already started' });

  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  match.players.push({ userId: req.userId, name: users[email].name || email.split('@')[0], stream: null });
  match.scores[req.userId] = 0;
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'player_joined', { match: publicMatchState(match) });
  res.json({ match: publicMatchState(match) });
});

// GET /api/quizbowl/match/:code/stream — SSE subscription for state pushes.
app.get('/api/quizbowl/match/:code/stream', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const player = match.players.find(p => p.userId === req.userId);
  if (!player) return res.status(403).json({ error: 'Not a player in this match' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Tell nginx / Render proxies not to buffer this stream.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  player.stream = res;
  match.lastActivity = Date.now();
  // Fresh stream = reconnect. If we were about to abandon this player,
  // cancel that grace timer — they're back.
  cancelDisconnectAbandon(match, req.userId);
  // Send current snapshot immediately so the client can render without a
  // separate GET round trip.
  res.write(`data: ${JSON.stringify({ type: 'snapshot', match: publicMatchState(match) })}\n\n`);
  if (typeof res.flush === 'function') res.flush();

  // Heartbeat every 20s to keep proxies from killing the stream.
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (player.stream === res) player.stream = null;
    // If the game is live and the player is still a member, schedule a
    // 10s abandon. Cancelled if they reconnect (see stream-open above).
    if (['playing', 'reveal', 'generating'].includes(match.state) &&
        match.players.some(p => p.userId === req.userId)) {
      scheduleDisconnectAbandon(match, req.userId);
    }
  });
});

// POST /api/quizbowl/match/:code/start — host configures + starts.
// Accepts { category, difficulty, questionCount, revealSpeedMs }. Question
// generation happens HERE (so no Gemini spend for matches that don't launch).
app.post('/api/quizbowl/match/:code/start', authMiddleware, async (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can start' });
  if (match.players.length < 2) return res.status(409).json({ error: 'Waiting for second player' });
  if (match.state === 'generating' || match.state === 'playing') {
    return res.status(409).json({ error: 'Match already starting' });
  }

  const {
    category = match.category || 'Mixed',
    difficulty = match.difficulty || 'Medium',
    questionCount = 10,
    revealSpeedMs = match.revealSpeedMs || 140,
  } = req.body || {};

  // Persist settings + flip to "generating" so the opponent sees a spinner.
  match.category = category;
  match.difficulty = difficulty;
  match.revealSpeedMs = revealSpeedMs;
  match.state = 'generating';
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'generating', { match: publicMatchState(match) });

  // Tell the client we're working even before the LLM returns.
  res.json({ ok: true });

  try {
    const sys = `You are a quiz bowl question writer. Write pyramidal tossup questions — each starts with obscure clues and progressively gets easier. Output ONLY valid JSON with no markdown, no code fences, no prose before or after.

Exact format:
{"questions":[{"text":"Full question text here.","answer":"Answer"}]}`;
    const userMsg = `Generate ${questionCount} pyramidal quiz bowl questions in category "${category}" at ${difficulty} difficulty. Return ONLY the JSON object described — nothing else.`;
    // Flash is faster + more reliable for raw-JSON tasks; Pro's thinking
    // tokens often consume the budget before emitting output.
    const result = await callGemini(sys, [{ role: 'user', content: userMsg }], GEMINI_FLASH, 8192);
    if (!result.success) throw new Error(result.error || 'Question generation failed');
    const text = result.data.content?.[0]?.text || '';
    const parsed = parseAIJson(text);
    if (!parsed?.questions?.length) {
      console.error('[match] parse failed. raw:', text.slice(0, 500));
      throw new Error('Failed to parse questions');
    }

    // Double-check the match still exists — someone may have left during gen.
    if (!matches.has(match.code)) return;
    match.questions = parsed.questions;
    match.currentIdx = 0;
    match.state = 'playing';
    match.questionStartedAt = Date.now();
    match.buzzWinner = null;
    match.buzzAt = null;
    match.lockedOutForQ = {};
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'question_start', {
      idx: 0,
      text: match.questions[0].text,
      startedAt: match.questionStartedAt,
      match: publicMatchState(match),
    });
    scheduleQuestionTimeout(match);
  } catch (e) {
    console.error('match start/generate failed', e);
    match.state = 'waiting';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'start_failed', { error: e.message, match: publicMatchState(match) });
  }
});

// POST /api/quizbowl/match/:code/buzz — atomic; first-in wins.
app.post('/api/quizbowl/match/:code/buzz', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'playing') return res.status(409).json({ error: 'Not in a live question' });
  if (!match.players.some(p => p.userId === req.userId)) return res.status(403).json({ error: 'Not a player' });
  if (match.buzzWinner) return res.status(409).json({ error: 'Already buzzed', winner: match.buzzWinner });

  match.buzzWinner = req.userId;
  match.buzzAt = Date.now();
  match.lastActivity = Date.now();
  // Pause the "question end" timeout while the buzzer decides on an answer.
  if (match.questionTimeoutId) { clearTimeout(match.questionTimeoutId); match.questionTimeoutId = null; }
  pushMatchEvent(match, 'buzz', { userId: req.userId, buzzAt: match.buzzAt });
  res.json({ ok: true, buzzAt: match.buzzAt });
});

// POST /api/quizbowl/match/:code/answer — only the buzz winner can submit.
app.post('/api/quizbowl/match/:code/answer', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'playing') return res.status(409).json({ error: 'Not in a live question' });
  if (match.buzzWinner !== req.userId) return res.status(403).json({ error: 'You did not buzz first' });

  const answer = String(req.body?.answer || '').trim();
  const correctAnswer = match.questions[match.currentIdx].answer;
  // Fuzzy compare: normalize + Levenshtein. Tightened from a previous version
  // that accepted any substring (so "a" matched "Albert Einstein") and had a
  // 25%-of-length Levenshtein bound (which also blew up on short answers).
  // Goal: forgive real typos and casing, REJECT one-letter scribbles and
  // arbitrary substrings.
  function norm(s) {
    return s
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|a|an)\b/g, '')                   // strip leading articles
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Damerau-Levenshtein: like standard Levenshtein but counts an adjacent
  // transposition as 1 edit (not 2). This is what makes "einstien" vs
  // "einstein" forgivable with cap=1 instead of needing cap=2.
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  const a = norm(answer);
  const c = norm(correctAnswer);

  // Quiz-bowl convention: the LAST whitespace-separated token of the answer
  // is the "key word" (last name, surname, key noun). E.g., "Albert Einstein"
  // \u2192 "einstein". Accepting just the key word is standard.
  const cTokens = c.split(/\s+/).filter(t => t.length >= 3);
  const keyWord = cTokens.length ? cTokens[cTokens.length - 1] : c;

  // Length-aware Levenshtein bound. Floor of: 1 typo for short, ~15% for long.
  // A bound of `floor(len/6)`, capped at 2 for the full answer and 1 for the
  // key word, accepts a single transposition / typo without bleeding into
  // semantic mismatches.
  function within(input, target, maxBound) {
    if (!input || !target) return false;
    const cap = Math.min(maxBound, Math.max(0, Math.floor(target.length / 6)));
    return lev(input, target) <= cap;
  }

  // Correct if any of:
  //   1. exact match after normalization
  //   2. typo of full answer (\u2264 floor(len/6), capped at 2)
  //   3. exact key word    ("einstein" for "albert einstein")
  //   4. typo of key word  (\u2264 floor(len/6), capped at 1) \u2014 at least 4 chars
  //
  // Deliberately NOT used (these were previous false-positive sources):
  //   - c.includes(a) / a.includes(c)  \u2192 matches one-letter answers
  //   - per-word `a.includes(w)`        \u2192 "the" inside "the einstein" matched
  //   - 25%-of-length Levenshtein       \u2192 too generous for short answers
  const correct = !!a && (
    a === c
    || within(a, c, 2)
    || (keyWord && keyWord.length >= 3 && a === keyWord)
    || (keyWord && keyWord.length >= 4 && within(a, keyWord, 1))
  );

  if (correct) {
    // Correct: question ends. Score awarded. Auto-advance in 5s.
    match.scores[req.userId] = (match.scores[req.userId] || 0) + 1;
    match.state = 'reveal';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'answer_result', {
      userId: req.userId, correct: true, answer, correctAnswer,
      scores: match.scores, autoAdvanceInMs: 5000,
    });
    scheduleAutoAdvance(match, 5000);
  } else {
    // Wrong: lock out this player, give the other a second chance.
    if (!match.lockedOutForQ) match.lockedOutForQ = {};
    match.lockedOutForQ[req.userId] = true;
    const pausedMs = Date.now() - (match.buzzAt || Date.now());
    match.questionStartedAt = (match.questionStartedAt || Date.now()) + pausedMs;
    const stillPlaying = match.players.filter(p => !match.lockedOutForQ[p.userId]);
    if (stillPlaying.length === 0) {
      // Everyone locked out → question over, auto-advance.
      match.state = 'reveal';
      match.lastActivity = Date.now();
      pushMatchEvent(match, 'answer_result', {
        userId: req.userId, correct: false, answer, correctAnswer,
        scores: match.scores, finalMiss: true, autoAdvanceInMs: 5000,
      });
      scheduleAutoAdvance(match, 5000);
    } else {
      match.buzzWinner = null;
      match.buzzAt = null;
      match.state = 'playing';
      match.lastActivity = Date.now();
      pushMatchEvent(match, 'wrong_answer', {
        userId: req.userId, answer, correctAnswer,
        lockedOut: Object.keys(match.lockedOutForQ),
        questionStartedAt: match.questionStartedAt,
      });
      // Resume the end-of-question timeout for the remaining player(s).
      scheduleQuestionTimeout(match);
    }
  }
  res.json({ ok: true, correct });
});

// POST /api/quizbowl/match/:code/next — host advances to the next question.
app.post('/api/quizbowl/match/:code/next', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can advance' });
  advanceMatchToNextQuestion(match);
  res.json({ ok: true, finished: match.state === 'finished' });
});

// POST /api/quizbowl/match/:code/leave — graceful exit.
//
// Leaving during a LIVE question (state=playing | reveal | generating) is
// treated as abandoning the match — we cancel ALL scheduled timers
// (question_end, auto_advance) and push `match_end` with abandoned=true.
// Without this, the questionTimeoutId / revealTimeoutId we scheduled
// earlier would keep firing and the remaining player would see the
// question "still going" even though their opponent bailed. That's the
// "stopping doesn't stop the question" bug.
app.post('/api/quizbowl/match/:code/leave', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.json({ ok: true });
  const idx = match.players.findIndex(p => p.userId === req.userId);
  if (idx >= 0) {
    try { match.players[idx].stream?.end(); } catch {}
    match.players.splice(idx, 1);
  }
  match.lastActivity = Date.now();

  const wasLive = ['playing', 'reveal', 'generating'].includes(match.state);
  if (wasLive) {
    if (match.questionTimeoutId) { clearTimeout(match.questionTimeoutId); match.questionTimeoutId = null; }
    if (match.revealTimeoutId)   { clearTimeout(match.revealTimeoutId);   match.revealTimeoutId = null; }
    match.state = 'finished';
    match.buzzWinner = null;
    match.buzzAt = null;
    pushMatchEvent(match, 'match_end', {
      scores: match.scores,
      abandoned: true,
      leftBy: req.userId,
    });
  }

  if (!match.players.length) {
    matches.delete(match.code);
  } else if (!wasLive) {
    // Lobby / waiting state: nobody is playing yet, just notify.
    pushMatchEvent(match, 'player_left', { userId: req.userId, match: publicMatchState(match) });
  }
  res.json({ ok: true });
});

// =========================================================
// DEBATE — head-to-head multiplayer with AI-graded turns + dual-end voting.
//
// Flow:
//   1. Host POSTs /api/debate/match → returns { code }. Match is in
//      'waiting' state with one player.
//   2. Opponent POSTs /api/debate/match/:code/join → match state stays
//      'waiting' until host configures.
//   3. Host POSTs /api/debate/match/:code/start with { topic, hostSide }.
//      Match flips to 'playing'. Each player has a side; turns alternate
//      starting with the FOR side.
//   4. Active player POSTs /api/debate/match/:code/move { argument }.
//      Server calls Gemini in JSON mode to score the argument on three
//      axes (argumentation, evidence, rhetoric, 1-10 each) + a 1-2
//      sentence feedback. Score added to match.turns + scoreboard.
//      Turn passes to opponent.
//   5. Either player POSTs /api/debate/match/:code/vote-end. When BOTH
//      players have voted, server asks Gemini for a final verdict and
//      flips match to 'finished'.
//   6. SSE stream pushes state updates ('turn_added', 'end_voted',
//      'finished') to both players.
// =========================================================

const debateMatches = new Map();

function newDebateCode() {
  // 5-char alphanumeric, avoiding ambiguous chars (0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!debateMatches.has(c)) return c;
  }
  return 'D' + Date.now().toString(36).toUpperCase().slice(-4);
}

function publicDebateState(match) {
  return {
    code: match.code,
    state: match.state,
    topic: match.topic || null,
    players: match.players.map(p => ({ userId: p.userId, name: p.name, side: p.side || null })),
    hostId: match.hostId,
    turns: match.turns.map(t => ({
      userId: t.userId, side: t.side, content: t.content,
      images: Array.isArray(t.images) ? t.images : [],
      score: t.score, feedback: t.feedback, at: t.at,
    })),
    turnOf: match.turnOf,
    scores: match.scores,
    endVotes: Array.from(match.endVotes),
    verdict: match.verdict || null,
    createdAt: match.createdAt,
  };
}

function pushDebateEvent(match, type, payload) {
  match.lastActivity = Date.now();
  // Always include the full public match snapshot in every event so the
  // client's setMatch(ev.match) path picks up turn additions, score
  // updates, and end-vote changes — not just the join / started /
  // finished events that historically carried the snapshot. Without
  // this, "turn_added" events were missing match and the opponent's UI
  // stayed frozen on the previous turn.
  const body = { type, match: publicDebateState(match), ...payload };
  for (const p of match.players) {
    const stream = p.stream;
    if (!stream || stream.writableEnded) continue;
    try { stream.write(`data: ${JSON.stringify(body)}\n\n`); stream.flush?.(); }
    catch {}
  }
}

// POST /api/debate/match — create empty match.
app.post('/api/debate/match', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const code = newDebateCode();
    const match = {
      code,
      state: 'waiting', // waiting | playing | finished
      topic: null,
      hostId: req.userId,
      players: [{ userId: req.userId, name: users[email].name || email.split('@')[0], side: null, stream: null }],
      turns: [],
      turnOf: null, // userId of player whose turn it is
      scores: { [req.userId]: 0 },
      endVotes: new Set(),
      verdict: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    debateMatches.set(code, match);
    res.json({ code, match: publicDebateState(match) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/debate/match/:code/join — second player joins.
app.post('/api/debate/match/:code/join', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.players.some(p => p.userId === req.userId)) {
    match.lastActivity = Date.now();
    return res.json({ match: publicDebateState(match) });
  }
  if (match.players.length >= 2) return res.status(409).json({ error: 'Match is full' });
  if (match.state !== 'waiting') return res.status(409).json({ error: 'Match already started' });
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  match.players.push({
    userId: req.userId,
    name: (email && users[email].name) || (email && email.split('@')[0]) || 'Opponent',
    side: null,
    stream: null,
  });
  match.scores[req.userId] = 0;
  match.lastActivity = Date.now();
  pushDebateEvent(match, 'player_joined', { match: publicDebateState(match) });
  res.json({ match: publicDebateState(match) });
});

// GET /api/debate/match/:code/stream — SSE for state pushes.
app.get('/api/debate/match/:code/stream', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const player = match.players.find(p => p.userId === req.userId);
  if (!player) return res.status(403).json({ error: 'Not a player in this match' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  player.stream = res;
  res.write(`data: ${JSON.stringify({ type: 'snapshot', match: publicDebateState(match) })}\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); res.flush?.(); } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (player.stream === res) player.stream = null;
  });
});

// POST /api/debate/match/:code/start — host configures topic + sides.
app.post('/api/debate/match/:code/start', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only host can start' });
  if (match.players.length < 2) return res.status(409).json({ error: 'Waiting for opponent' });
  if (match.state !== 'waiting') return res.status(409).json({ error: 'Already started' });

  const topic = String(req.body?.topic || '').trim();
  const hostSide = req.body?.hostSide === 'against' ? 'against' : 'for';
  if (!topic) return res.status(400).json({ error: 'Topic required' });

  match.topic = topic;
  match.players[0].side = hostSide;
  match.players[1].side = hostSide === 'for' ? 'against' : 'for';
  match.state = 'playing';
  // FOR side opens.
  match.turnOf = match.players.find(p => p.side === 'for').userId;
  match.lastActivity = Date.now();
  pushDebateEvent(match, 'started', { match: publicDebateState(match) });
  res.json({ match: publicDebateState(match) });
});

// POST /api/debate/match/:code/move — submit an argument; AI grades it.
app.post('/api/debate/match/:code/move', authMiddleware, async (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'playing') return res.status(409).json({ error: 'Not in playing state' });
  if (match.turnOf !== req.userId) return res.status(403).json({ error: 'Not your turn' });

  const argument = String(req.body?.argument || '').trim();
  // Sanitize incoming images. Each one must have a base64 data URL +
  // mime type; cap at 4 per turn.
  const incomingImages = Array.isArray(req.body?.images) ? req.body.images.slice(0, 4) : [];
  const images = incomingImages
    .filter(im => im && typeof im.dataUrl === 'string' && im.dataUrl.startsWith('data:'))
    .map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType || 'image/png' }));

  // Allow image-only turns (≥1 image), otherwise require ≥20 chars text.
  if (argument.length < 20 && images.length === 0) {
    return res.status(400).json({ error: 'Argument must be at least 20 characters (or attach an image)' });
  }

  const player = match.players.find(p => p.userId === req.userId);
  const opponent = match.players.find(p => p.userId !== req.userId);

  // AI grading. Three 1-10 axes + 1-2 sentence feedback. JSON mode forced.
  const prevTurns = match.turns.slice(-6).map(t =>
    `${t.side.toUpperCase()} (${t.userId === req.userId ? 'this player' : 'opponent'}): ${t.content.slice(0, 600)}`
  ).join('\n\n');
  const sys = `You are a debate judge. Grade the argument on three axes (1-10 integer each):
- argumentation (logical structure, claim → reasoning → conclusion)
- evidence (specific facts, examples, data — penalize hand-waving)
- rhetoric (clarity, persuasiveness, addressing the opponent's strongest point)
The argument may include attached images (charts, screenshots, photographs of evidence). Treat them as part of the argument — if the image carries the claim's evidence, weight it under "evidence"; if the user uses it rhetorically, weight it under "rhetoric".
Output STRICT JSON only.`;
  const usr = `Topic: "${match.topic}"
This player is arguing ${player.side.toUpperCase()}.

Previous turns (most recent last):
${prevTurns || '(none — opening statement)'}

NEW ARGUMENT from this player:
"""
${argument.slice(0, 8000) || '(no text — see attached image(s))'}
"""
${images.length ? `\n[The player attached ${images.length} image${images.length === 1 ? '' : 's'} — see the image(s) below.]` : ''}

Return JSON exactly:
{
  "argumentation": N,
  "evidence": N,
  "rhetoric": N,
  "feedback": "1-2 sentences naming the strongest move + the biggest weakness"
}`;
  try {
    const userMsg = { role: 'user', content: usr };
    if (images.length) userMsg.images = images;
    const aiResp = await callGemini(sys, [userMsg], MODEL_FLASH_LITE, 600, { jsonMode: true, temperature: 0.4 });
    let score = { argumentation: 5, evidence: 5, rhetoric: 5, total: 15 };
    let feedback = '';
    if (aiResp.success) {
      const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
      if (parsed) {
        score = {
          argumentation: Math.max(1, Math.min(10, Number(parsed.argumentation) || 5)),
          evidence:      Math.max(1, Math.min(10, Number(parsed.evidence)      || 5)),
          rhetoric:      Math.max(1, Math.min(10, Number(parsed.rhetoric)      || 5)),
        };
        score.total = score.argumentation + score.evidence + score.rhetoric;
        feedback = String(parsed.feedback || '').slice(0, 400);
      }
    }
    const turn = {
      userId: req.userId, side: player.side, content: argument,
      // Persist image data URLs so the opponent can render them. Capped
      // by the slice above (≤4 per turn).
      images: images.map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType })),
      score, feedback, at: Date.now(),
    };
    match.turns.push(turn);
    match.scores[req.userId] = (match.scores[req.userId] || 0) + score.total;
    // Turn passes to opponent.
    match.turnOf = opponent.userId;
    match.lastActivity = Date.now();
    pushDebateEvent(match, 'turn_added', { turn, scores: match.scores, turnOf: match.turnOf });
    res.json({ turn, match: publicDebateState(match) });
  } catch (e) {
    console.error('Debate move grading failed:', e);
    res.status(500).json({ error: e.message || 'Grading failed' });
  }
});

// POST /api/debate/match/:code/vote-end — vote to end. When both vote,
// AI generates final verdict and the match flips to 'finished'.
app.post('/api/debate/match/:code/vote-end', authMiddleware, async (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'playing') return res.status(409).json({ error: 'Match not in playing state' });
  if (!match.players.some(p => p.userId === req.userId)) return res.status(403).json({ error: 'Not a player' });

  match.endVotes.add(req.userId);
  const allVoted = match.players.every(p => match.endVotes.has(p.userId));
  match.lastActivity = Date.now();

  if (!allVoted) {
    pushDebateEvent(match, 'end_voted', {
      userId: req.userId,
      endVotes: Array.from(match.endVotes),
    });
    return res.json({ match: publicDebateState(match), finished: false });
  }

  // Both voted → AI generates final verdict.
  const transcript = match.turns.map((t, i) =>
    `Turn ${i + 1} — ${t.side.toUpperCase()} (score ${t.score.total}/30): ${t.content.slice(0, 800)}`
  ).join('\n\n') || '(no turns played)';

  const forPlayer = match.players.find(p => p.side === 'for');
  const againstPlayer = match.players.find(p => p.side === 'against');

  const sys = `You are a debate judge. Read the full transcript + per-turn scores and declare a winner with a SHORT, decisive verdict. Output STRICT JSON only.`;
  const usr = `Topic: "${match.topic}"

FOR side total: ${match.scores[forPlayer.userId] || 0}
AGAINST side total: ${match.scores[againstPlayer.userId] || 0}

Transcript:
${transcript}

Return JSON exactly:
{
  "winner": "for" | "against" | "tie",
  "summary": "3-5 sentences. Name the strongest argument from each side, then explain why your winner won.",
  "forStrongest": "1 sentence — strongest moment from the FOR side",
  "againstStrongest": "1 sentence — strongest moment from the AGAINST side"
}`;
  try {
    const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], DEFAULT_MODEL, 1500, { jsonMode: true, temperature: 0.3 });
    let verdict = {
      winner: (match.scores[forPlayer.userId] || 0) >= (match.scores[againstPlayer.userId] || 0) ? 'for' : 'against',
      summary: 'Both sides argued. Verdict generation failed; using raw scores as the tiebreak.',
      forStrongest: '', againstStrongest: '',
    };
    if (aiResp.success) {
      const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
      if (parsed && ['for', 'against', 'tie'].includes(parsed.winner)) {
        verdict = {
          winner: parsed.winner,
          summary: String(parsed.summary || '').slice(0, 1200),
          forStrongest: String(parsed.forStrongest || '').slice(0, 400),
          againstStrongest: String(parsed.againstStrongest || '').slice(0, 400),
        };
      }
    }
    match.verdict = verdict;
    match.state = 'finished';
    pushDebateEvent(match, 'finished', { match: publicDebateState(match) });
    res.json({ match: publicDebateState(match), finished: true });
  } catch (e) {
    console.error('Debate verdict generation failed:', e);
    res.status(500).json({ error: e.message || 'Verdict failed' });
  }
});

// POST /api/debate/match/:code/leave — graceful exit (clears stream).
app.post('/api/debate/match/:code/leave', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.json({ ok: true });
  const p = match.players.find(x => x.userId === req.userId);
  if (p && p.stream) { try { p.stream.end(); } catch {} p.stream = null; }
  res.json({ ok: true });
});

// =========================================================
// SINGLEPLAYER DEBATE — final verdict (called from /move when no
// multiplayer match exists). Splits the singleplayer flow's "End Debate"
// button so the AI gives a winner verdict instead of just a wrap-up.
// =========================================================
app.post('/api/debate/singleplayer/verdict', authMiddleware, async (req, res) => {
  try {
    const { topic, userSide, transcript } = req.body || {};
    if (!topic || !userSide || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'topic, userSide, transcript[] required' });
    }
    const sys = `You are a debate judge. Read the full transcript and declare a winner. Output STRICT JSON only.`;
    const lines = transcript.map((m, i) =>
      `Turn ${i + 1} — ${m.role === 'user' ? `STUDENT (${userSide.toUpperCase()})` : `AI (${userSide === 'for' ? 'AGAINST' : 'FOR'})`}: ${(m.content || '').slice(0, 1500)}`
    ).join('\n\n');
    const usr = `Topic: "${topic}"
Student argued ${userSide.toUpperCase()}; AI argued the opposite.

Transcript:
${lines}

Return JSON:
{
  "winner": "student" | "ai" | "tie",
  "studentScore": N,           // 0-100
  "aiScore": N,                // 0-100
  "summary": "3-5 sentences explaining who won and why.",
  "studentStrongest": "1 sentence — strongest moment from the student",
  "studentWeakest": "1 sentence — weakest moment from the student",
  "improve": "1-2 sentences — what the student should drill next"
}`;
    const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], DEFAULT_MODEL, 1500, { jsonMode: true, temperature: 0.3 });
    if (!aiResp.success) return res.status(500).json({ error: aiResp.error });
    const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
    if (!parsed) return res.status(500).json({ error: 'Failed to parse verdict' });
    res.json({ verdict: parsed });
  } catch (e) {
    console.error('Singleplayer verdict failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback (Express 5 syntax)
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Covalent server running on port ${PORT}`);
});
// redeploy 1776608927
// redeploy 1776609207
