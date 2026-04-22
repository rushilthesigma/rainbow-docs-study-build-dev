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
} from './prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3002;

// ===== Google Gemini =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// As of 2026-04 the 3.x family is exposed as `-preview` variants.
// Pro users get 3.1 Pro (latest), Free users get 3 Flash.
const GEMINI_PRO = 'gemini-3.1-pro-preview';
const GEMINI_FLASH = 'gemini-3-flash-preview';
const DEFAULT_MODEL = GEMINI_PRO;
const FALLBACK_MODEL = GEMINI_FLASH;
const resolveModel = (name) => name || DEFAULT_MODEL;
const fallbackFor = (name) => (name === GEMINI_PRO ? GEMINI_FLASH : GEMINI_FLASH);
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
const MODEL_PRO  = GEMINI_PRO;
const MODEL_FREE = GEMINI_FLASH;

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

// Normalizes and returns the live plan for a user. Owners are always Pro.
// Stripe-paid Pro users auto-expire when proUntil passes; we gracefully
// downgrade them here rather than running a cron.
function getPlan(user, email) {
  if (isOwner(email)) return 'pro';
  if (isAdvisor(email)) return 'pro';
  if (!user?.data) return 'free';
  if (user.data.plan !== 'pro') return 'free';
  if (!user.data.proUntil) return 'pro'; // untimed grant (owner-granted)
  if (new Date(user.data.proUntil).getTime() > Date.now()) return 'pro';
  // Lease expired — downgrade in-memory; persistence happens next saveUsers
  user.data.plan = 'free';
  return 'free';
}
function isPro(user, email) { return getPlan(user, email) === 'pro'; }
// Pro users can opt into the smaller/faster model via preferences.modelTier.
// Free users always get FREE (Flash) regardless of preference.
function modelForUser(user, email) {
  if (!isPro(user, email)) return MODEL_FREE;
  const tier = user?.data?.preferences?.modelTier;
  return tier === 'flash' ? MODEL_FREE : MODEL_PRO;
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
    },
    profile: { level: 1, xp: 0, xpToNextLevel: 100, strengths: [], weaknesses: [], topicScores: {} },
    goals: [],
    flashcardDecks: [],
    notes: [],
    studySessions: [],
    assessmentHistory: [],
    lessons: [],
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

// Robust JSON parser with multiple fallback strategies
function parseAIJson(text) {
  // Strategy 1: Direct parse
  try { return JSON.parse(text); } catch {}
  // Strategy 2: Strip markdown code fences
  const stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Strategy 3: Extract outermost JSON object
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  // Strategy 4: Extract JSON array
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(text.slice(firstBracket, lastBracket + 1)); } catch {}
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
        generationConfig: { maxOutputTokens: effectiveMaxTokens, temperature: 0.7 },
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
      // 404/invalid model on a 3.x id → downgrade this process, retry same attempt
      // No model downgrade — stay on 3.x. Surface the error if 3 is unavailable.
      if (isRateLimitError(err)) {
        if (attempt === 1) currentModel = fallbackFor(currentModel);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
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

// ===== CURRICULUM ROUTES =====

// Generate a new curriculum
app.post('/api/curriculum/generate', authMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings?.topic) return res.status(400).json({ error: 'Topic is required' });

    // Free plan: 1 curriculum generation per week. Pro: unlimited.
    const usersC = loadUsers();
    const emailC = findEmailById(usersC, req.userId);
    if (!emailC) return res.status(404).json({ error: 'User not found' });
    usersC[emailC].data = migrateUserData(usersC[emailC].data);
    const quota = consumeCurriculumGeneration(usersC, emailC);
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'curriculum_limit_reached',
        message: `You've already generated ${quota.limit} curriculum this week on the free plan. Upgrade to Pro for unlimited.`,
        limit: quota.limit, remaining: 0,
      });
    }
    saveUsers(usersC);

    const { system, user } = buildCurriculumPrompt(settings);
    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096);

    if (!result.success) return res.status(500).json({ error: result.error });

    const text = result.data.content?.[0]?.text || '';
    let curriculum = parseAIJson(text);
    if (!curriculum || !curriculum.units) {
      // Retry once with stronger JSON enforcement
      const retryResult = await callAnthropic(
        'You MUST output ONLY a valid JSON object. No markdown, no explanation, no text before or after. Just raw JSON.',
        [{ role: 'user', content: `${user}\n\nIMPORTANT: Output ONLY the JSON object, nothing else.` }],
        DEFAULT_MODEL, 4096
      );
      if (retryResult.success) {
        curriculum = parseAIJson(retryResult.data.content?.[0]?.text || '');
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

      // For math curricula, add a practice lesson with math canvas after every 2nd lesson
      if (isMathCurriculum && lessons.length >= 2) {
        const practiceLesson = {
          id: `${curriculumId}-u${ui}-practice`,
          title: `${unit.title} — Practice Problems`,
          description: `Solve practice problems for ${unit.title} using the math canvas`,
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
        // Insert before the last lesson
        lessons.splice(lessons.length - 1, 0, practiceLesson);
      }

      // Add unit test at end
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
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  if (!genAI) {
    res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY not configured' })}\n\n`);
    res.end();
    return;
  }

  // Source mode: sources are retrieved automatically via Google Search
  // grounding — tell the model it has the capability rather than browbeating
  // it into using the tool.
  const finalSystem = enableWebSearch
    ? `${systemPrompt}

---
You have Google Search. Use it on every response to ground your answer in real web sources. Run 2-4 queries before writing, then base your explanation on what the search returns. Write naturally — do not mention that you searched, and do not include your own "Sources:" list (the UI shows one below the message).`
    : systemPrompt;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const resolved = resolveModel(requestedModel);
    const tools = enableWebSearch ? [{ googleSearch: {} }] : undefined;
    const model = genAI.getGenerativeModel({
      model: resolved,
      systemInstruction: { role: 'system', parts: [{ text: finalSystem }] },
      tools,
      generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
    });

    if (enableWebSearch) {
      res.write(`data: ${JSON.stringify({ status: 'searching' })}\n\n`);
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
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    try { finalResponse = await result.response; } catch {}
    clearTimeout(timeout);

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
        res.write(`data: ${JSON.stringify({ source: s })}\n\n`);
      }

      if (sources.length > 0) {
        // Append [1][2][3]... at the very end of the message as a single
        // content event. Inline positioning isn't possible post-stream, so
        // we clump them — the <Sources> list below the message gives the
        // fully-clickable bibliography.
        const markerText = ' ' + sources.map((_, i) => `[${i + 1}]`).join('');
        appendedMarkers = markerText;
        res.write(`data: ${JSON.stringify({ content: markerText })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ status: 'no_sources' })}\n\n`);
      }
    }

    const finalContent = buffered + appendedMarkers;
    // Bookkeeping in onComplete (saving chat history, updating streaks, etc.)
    // must never surface as an AI error — the AI response is already done.
    if (onComplete) {
      try { await onComplete(finalContent, sources); }
      catch (bookkeepErr) { console.error('streamAIResponse onComplete threw:', bookkeepErr); }
    }
    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
    res.end();
  } catch (e) {
    clearTimeout(timeout);
    console.error('Gemini stream error:', e);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e?.message || String(e) })}\n\n`);
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

    // Build system prompt for current phase
    const systemPrompt = buildLessonChatPrompt(
      lesson.phase, lesson, unit, curriculum.settings,
      users[email].data.profile, users[email].data.preferences, lesson.chatHistory,
      users[email].data.assessmentHistory || []
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
      if (l) { l.chatHistory = []; l.phase = null; l.phaseData = {}; l.isCompleted = false; l.score = null; break; }
    }
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== STUDY MODE =====

app.post('/api/study/chat', authMiddleware, requireMessageQuota, async (req, res) => {
  try {
    const { message, sessionId, context, sourced, images } = req.body;
    req.sourced = !!sourced;
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
    }

    session.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    session.lastMessageAt = new Date().toISOString();

    const systemPrompt = buildStudyModePrompt(
      users[email].data.profile, users[email].data.goals,
      users[email].data.curricula, users[email].data.preferences,
      users[email].data.assessmentHistory || []
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
    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 2048);

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
      const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096);
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
      const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096);
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
    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 1024);
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
    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 1024);
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
    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096);
    if (!result.success) return res.status(500).json({ error: result.error });

    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed) return res.status(500).json({ error: 'Failed to parse assessment' });

    const assessment = { id: crypto.randomUUID(), ...parsed, createdAt: new Date().toISOString() };
    res.json({ assessment });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/assessment/grade', authMiddleware, (req, res) => {
  try {
    const { assessment, answers } = req.body;
    if (!assessment || !answers) return res.status(400).json({ error: 'Assessment and answers required' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

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
const TEXTBOOKS_FILE = join(DATA_DIR, 'textbooks.json');
function loadTextbooks() { try { return JSON.parse(readFileSync(TEXTBOOKS_FILE, 'utf-8')); } catch { return {}; } }
function saveTextbooks(data) { writeFileSync(TEXTBOOKS_FILE, JSON.stringify(data, null, 2)); }

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
- Every lesson must have "id", "title", "description", and "type" (one of: "lesson", "practice", "essay", "unit_test").
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

    const result = await callAnthropic(
      system,
      [{ role: 'user', content: userParts.join('\n\n') }],
      modelForUser(users[email], email),
      8192
    );
    if (!result.success) return res.status(500).json({ error: result.error || 'Edit failed' });

    const text = result.data.content?.[0]?.text || '';
    const updated = parseAIJson(text);
    if (!updated || !Array.isArray(updated.units)) {
      return res.status(500).json({ error: 'Model returned invalid JSON' });
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

// Upload + parse PDF
app.post('/api/textbooks/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text || '';
    const pageCount = parsed.numpages || 0;
    if (!text.trim()) return res.status(400).json({ error: 'Could not extract text from PDF' });

    const id = crypto.randomUUID();
    const textbooks = loadTextbooks();
    if (!textbooks[req.userId]) textbooks[req.userId] = [];

    // Store textbook (keep text for Q&A, truncate for storage if huge)
    const maxChars = 200000;
    const storedText = text.length > maxChars ? text.slice(0, maxChars) : text;

    textbooks[req.userId].unshift({
      id,
      title: req.file.originalname.replace(/\.pdf$/i, ''),
      fileName: req.file.originalname,
      pageCount,
      textLength: text.length,
      text: storedText,
      curriculum: null,
      chatHistory: [],
      uploadedAt: new Date().toISOString(),
    });

    // Keep only 20 textbooks per user
    if (textbooks[req.userId].length > 20) textbooks[req.userId] = textbooks[req.userId].slice(0, 20);
    saveTextbooks(textbooks);

    res.json({ textbook: { id, title: req.file.originalname.replace(/\.pdf$/i, ''), pageCount, textLength: text.length } });
  } catch (e) { console.error('Upload error:', e); res.status(500).json({ error: e.message }); }
});

// List textbooks
app.get('/api/textbooks', authMiddleware, (req, res) => {
  const textbooks = loadTextbooks();
  const list = (textbooks[req.userId] || []).map(t => ({ id: t.id, title: t.title, pageCount: t.pageCount, hasCurriculum: !!t.curriculum, uploadedAt: t.uploadedAt }));
  res.json({ textbooks: list });
});

// Get textbook detail
app.get('/api/textbooks/:id', authMiddleware, (req, res) => {
  const textbooks = loadTextbooks();
  const book = (textbooks[req.userId] || []).find(t => t.id === req.params.id);
  if (!book) return res.status(404).json({ error: 'Not found' });
  res.json({ textbook: { ...book, text: undefined, textPreview: book.text?.slice(0, 500) } });
});

// Generate curriculum from textbook
app.post('/api/textbooks/:id/generate-curriculum', authMiddleware, async (req, res) => {
  try {
    const textbooks = loadTextbooks();
    const book = (textbooks[req.userId] || []).find(t => t.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Not found' });

    // Use first ~15000 chars of text for curriculum generation (fits in context)
    const excerpt = book.text.slice(0, 15000);

    const system = `You are an expert curriculum designer. Given textbook content, create a structured curriculum outline. Output ONLY valid JSON with no markdown formatting, no code fences.`;
    const user = `Based on this textbook content, create a comprehensive curriculum:

TEXTBOOK: "${book.title}"
CONTENT EXCERPT:
${excerpt}

Create 4-8 units with 3-6 lessons each that cover the key topics from this textbook.

Return this exact JSON structure:
{
  "title": "Course Title based on textbook",
  "description": "1-2 sentence description",
  "units": [
    {
      "title": "Unit Title",
      "description": "Brief description",
      "lessons": [
        { "title": "Lesson Title", "description": "One-line summary" }
      ]
    }
  ]
}`;

    const result = await callAnthropic(system, [{ role: 'user', content: user }], DEFAULT_MODEL, 4096);
    if (!result.success) return res.status(500).json({ error: result.error });

    const text = result.data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed?.units) return res.status(500).json({ error: 'Failed to parse curriculum' });

    // Process like regular curriculum
    const curriculumId = crypto.randomUUID();
    parsed.id = curriculumId;
    parsed.textbookId = book.id;
    parsed.createdAt = new Date().toISOString();
    parsed.units = (parsed.units || []).map((unit, ui) => ({
      ...unit,
      id: `${curriculumId}-u${ui}`,
      locked: false,
      lessons: [
        ...(unit.lessons || []).map((lesson, li) => ({
          ...lesson,
          id: `${curriculumId}-u${ui}-l${li}`,
          type: 'lesson',
          chatHistory: [], phase: null, phaseData: {}, content: null, isCompleted: false, score: null,
        })),
        {
          id: `${curriculumId}-u${ui}-test`,
          title: `${unit.title} — Assessment`,
          description: `Test your knowledge of ${unit.title}`,
          type: 'unit_test',
          chatHistory: [], phase: null, phaseData: {}, content: null, isCompleted: false, score: null,
        },
      ],
    }));

    book.curriculum = parsed;
    saveTextbooks(textbooks);

    // Also save to user's curricula
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (email) {
      users[email].data = migrateUserData(users[email].data);
      users[email].data.curricula.unshift(parsed);
      saveUsers(users);
    }

    res.json({ curriculum: parsed });
  } catch (e) { console.error('Curriculum gen error:', e); res.status(500).json({ error: e.message }); }
});

// Chat with textbook (Q&A)
app.post('/api/textbooks/:id/chat', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    const textbooks = loadTextbooks();
    const book = (textbooks[req.userId] || []).find(t => t.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Not found' });

    book.chatHistory = book.chatHistory || [];
    book.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Use last 10 messages for context + textbook excerpt
    const recentHistory = book.chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content }));
    const excerpt = book.text.slice(0, 12000);

    const system = `You are a knowledgeable tutor helping a student understand their textbook. Answer questions based on the textbook content below. Use markdown for formatting. Be clear, educational, and reference specific concepts from the text.

TEXTBOOK: "${book.title}"
CONTENT:
${excerpt}

If the question is outside the textbook's scope, say so but still try to help.`;

    const result = await callAnthropic(system, recentHistory, DEFAULT_MODEL, 2048);
    if (!result.success) return res.status(500).json({ error: result.error });

    const reply = result.data.content?.[0]?.text || 'I could not generate a response.';
    book.chatHistory.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });

    if (book.chatHistory.length > 100) book.chatHistory = book.chatHistory.slice(-100);
    saveTextbooks(textbooks);

    res.json({ reply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete textbook
app.delete('/api/textbooks/:id', authMiddleware, (req, res) => {
  const textbooks = loadTextbooks();
  if (textbooks[req.userId]) {
    textbooks[req.userId] = textbooks[req.userId].filter(t => t.id !== req.params.id);
    saveTextbooks(textbooks);
  }
  res.json({ success: true });
});

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
    lesson.isCompleted = false;
    lesson.completionData = null;
    lesson.lastActiveAt = Date.now();
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const social = loadSocial();
  const list = Object.entries(users).map(([email, u]) => {
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
  const entry = Object.entries(users).find(([_, u]) => u.id === req.params.uid);
  if (!entry) return res.status(404).json({ error: 'User not found' });
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
      try { p.stream.write(body); } catch {}
    }
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
  res.flushHeaders();
  player.stream = res;
  match.lastActivity = Date.now();
  // Send current snapshot immediately so the client can render without a
  // separate GET round trip.
  res.write(`data: ${JSON.stringify({ type: 'snapshot', match: publicMatchState(match) })}\n\n`);

  // Heartbeat every 20s to keep proxies from killing the stream.
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (player.stream === res) player.stream = null;
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
    const sys = `You are a quiz bowl question writer. Write pyramidal tossup questions — each starts with obscure clues and progressively gets easier. Output ONLY valid JSON, no markdown.\n\nFormat: {"questions":[{"text":"Full question text...","answer":"Answer"}]}`;
    const userMsg = `Generate ${questionCount} pyramidal quiz bowl questions in category "${category}" at ${difficulty} difficulty. Return JSON: {"questions":[{"text":"...","answer":"..."}]}`;
    const result = await callGemini(sys, [{ role: 'user', content: userMsg }], DEFAULT_MODEL, 4096);
    if (!result.success) throw new Error(result.error || 'Question generation failed');
    const text = result.data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch {} }
    if (!parsed?.questions?.length) throw new Error('Failed to parse questions');

    // Double-check the match still exists — someone may have left during gen.
    if (!matches.has(match.code)) return;
    match.questions = parsed.questions;
    match.currentIdx = 0;
    match.state = 'playing';
    match.questionStartedAt = Date.now();
    match.buzzWinner = null;
    match.buzzAt = null;
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'question_start', {
      idx: 0,
      text: match.questions[0].text,
      startedAt: match.questionStartedAt,
      match: publicMatchState(match),
    });
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
  // Fuzzy compare: normalize + Levenshtein.
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim(); }
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    return d[m][n];
  }
  const a = norm(answer); const c = norm(correctAnswer);
  const thresh = Math.max(1, Math.floor(c.length * 0.25));
  const correct = !!a && (a === c || c.includes(a) || a.includes(c) || lev(a, c) <= thresh
    || c.split(/[\s,]+/).some(w => w.length > 2 && (a.includes(w) || lev(a, w) <= 1)));

  if (correct) {
    match.scores[req.userId] = (match.scores[req.userId] || 0) + 1;
    match.state = 'reveal';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'answer_result', {
      userId: req.userId, correct: true, answer, correctAnswer,
      scores: match.scores,
    });
  } else {
    // Wrong answer — the other player gets to hear the rest / buzz.
    match.state = 'reveal';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'answer_result', {
      userId: req.userId, correct: false, answer, correctAnswer,
      scores: match.scores,
    });
  }
  res.json({ ok: true, correct });
});

// POST /api/quizbowl/match/:code/next — host advances to the next question.
app.post('/api/quizbowl/match/:code/next', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can advance' });

  const nextIdx = match.currentIdx + 1;
  if (nextIdx >= match.questions.length) {
    match.state = 'finished';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'match_end', { scores: match.scores });
    return res.json({ ok: true, finished: true });
  }
  match.currentIdx = nextIdx;
  match.state = 'playing';
  match.questionStartedAt = Date.now();
  match.buzzWinner = null;
  match.buzzAt = null;
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'question_start', {
    idx: nextIdx,
    text: match.questions[nextIdx].text,
    startedAt: match.questionStartedAt,
    match: publicMatchState(match),
  });
  res.json({ ok: true });
});

// POST /api/quizbowl/match/:code/leave — graceful exit.
app.post('/api/quizbowl/match/:code/leave', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.json({ ok: true });
  const idx = match.players.findIndex(p => p.userId === req.userId);
  if (idx >= 0) {
    try { match.players[idx].stream?.end(); } catch {}
    match.players.splice(idx, 1);
  }
  match.lastActivity = Date.now();
  if (!match.players.length) {
    matches.delete(match.code);
  } else {
    pushMatchEvent(match, 'player_left', { userId: req.userId, match: publicMatchState(match) });
  }
  res.json({ ok: true });
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
