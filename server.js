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
  buildTopicSuggestionsPrompt, buildSlideshowPrompt, buildFlashSlideshowPrompt,
  buildSlideshowCriticPrompt, buildSlideshowReviserPrompt,
  buildSlideHtmlPrompt, buildDeckDesignBriefPrompt,
} from './prompts.js';
import { PAUSD_CATALOG, getPausdTemplate, listPausdCatalog } from './data/pausdCurricula.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3002;

// ===== Google Gemini =====
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Gemini 3 model family.
const GEMINI_PRO        = 'gemini-3-pro-preview';
const GEMINI_FLASH      = 'gemini-3-flash-preview';
const GEMINI_FLASH_LITE = 'gemini-3-flash-preview';
const DEFAULT_MODEL = GEMINI_FLASH;
const FALLBACK_MODEL = GEMINI_FLASH_LITE;

// How many blocks the AI generates per lesson, before the final quiz
// is appended. Difficulty drives this - beginner is a quick foothold,
// expert is a deep dive. The final quiz adds one more block on top.
const LESSON_BLOCK_COUNT = {
  beginner:     5,
  intermediate: 7,
  advanced:    10,
  expert:      14,
};
const resolveModel = (name) => name || DEFAULT_MODEL;
// Cascade: Pro → Flash → Flash Lite (each fallback step trades quality for
// availability + cost). Flash Lite has no further fallback.
const fallbackFor = (name) => {
  if (name === GEMINI_PRO) return GEMINI_FLASH;
  if (name === GEMINI_FLASH) return GEMINI_FLASH_LITE;
  return GEMINI_FLASH_LITE;
};
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY is not set - AI calls will fail');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Data storage - try multiple locations until one works
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

// Session storage - embedded in users.json for single-file persistence
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
// Per-tier prices created on Stripe (set in .env). Each tier maps to a
// price id + a checkout mode (subscription for recurring, payment for
// the one-time lifetime purchase). Unset => that tier disabled at checkout.
const TIER_PRICES = {
  plus:     { priceId: process.env.STRIPE_PRICE_PLUS_MONTHLY || '', mode: 'subscription', amountUsd: 4,  interval: 'month' },
  pro:      { priceId: process.env.STRIPE_PRICE_PRO_MONTHLY  || STRIPE_PRICE_ID || '', mode: 'subscription', amountUsd: 10, interval: 'month' },
  lifetime: { priceId: process.env.STRIPE_PRICE_LIFETIME     || '', mode: 'payment',      amountUsd: 20, interval: null },
};
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// ===== Plan / limits =====
// Five tiers, ladder Free → Plus-Lite (free, referral unlock) → Plus → Lifetime → Pro:
//   free       = baseline gating, what un-paid un-referred accounts get
//   plus-lite  = free, unlocks when the user has referred 2 friends
//                (≈ $2/month of value - roughly half of Plus)
//   plus       = $4/mo, 5x the free limits for casual learners
//   lifetime   = $20 one-time, sits between plus and pro on limits
//                (permanent access, generous but not unlimited)
//   pro        = $10/mo, unlimited everything
// "Paid" via isPro() = anything above plus-lite (so the referral bonus
// gates the same way free does - better limits but still rate-capped).
const LIMITS = {
  free:        { dailyMessages: 45,       dailyQB: 2,        weeklyCurricula: 2,        weeklyDebates: 2,        noteMaps: 2 },
  'plus-lite': { dailyMessages: 115,      dailyQB: 5,        weeklyCurricula: 3,        weeklyDebates: 3,        noteMaps: 3 },
  plus:        { dailyMessages: 225,      dailyQB: 9,        weeklyCurricula: 5,        weeklyDebates: 6,        noteMaps: 9 },
  lifetime:    { dailyMessages: 525,      dailyQB: 23,       weeklyCurricula: 12,       weeklyDebates: 15,       noteMaps: 23 },
  pro:         { dailyMessages: Infinity, dailyQB: Infinity, weeklyCurricula: Infinity, weeklyDebates: Infinity, noteMaps: Infinity },
};
const PAID_TIERS = new Set(['plus', 'lifetime', 'pro']);

// Referrals: each user owns one 8-char alphanumeric code. When two
// different users redeem the same code, the owner unlocks Plus-Lite.
// Codes are stamped on user creation + backfilled on migrate.
const REFERRAL_CODE_LEN = 8;
const REFERRAL_THRESHOLD = 2;                  // # of redemptions to unlock plus-lite
const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O/1/I/L

function generateReferralCode() {
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return out;
}
// Build an in-memory index { CODE -> email } so /redeem doesn't need to
// scan every user. Recomputed lazily - small enough (1 entry per user)
// to rebuild on demand.
function indexReferralCodes(users) {
  const map = new Map();
  for (const [email, u] of Object.entries(users)) {
    if (u?.data?.referralCode) map.set(u.data.referralCode, email);
  }
  return map;
}
// Allocate a fresh code that doesn't collide with any existing one.
// 30^8 = ~6.5e11 codes - collisions are vanishingly rare but we still
// retry up to 8x to be safe.
function allocateReferralCode(users) {
  const index = indexReferralCodes(users);
  for (let i = 0; i < 8; i++) {
    const code = generateReferralCode();
    if (!index.has(code)) return code;
  }
  // Fall back to a timestamp suffix - guaranteed unique even on collision.
  return generateReferralCode().slice(0, 4) + Date.now().toString(36).toUpperCase().slice(-4);
}
// Legacy aliases - kept so older code that read these constants doesn't
// break. New code should go through LIMITS[plan] instead.
const FREE_DAILY_MESSAGE_LIMIT = LIMITS.free.dailyMessages;
const FREE_DAILY_QUIZBOWL_GAMES = LIMITS.free.dailyQB;
const FREE_WEEKLY_CURRICULA = LIMITS.free.weeklyCurricula;
const FREE_WEEKLY_DEBATES = LIMITS.free.weeklyDebates;
const MODEL_PRO        = GEMINI_FLASH_LITE;
const MODEL_FREE       = GEMINI_FLASH_LITE;
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

// Resolve the user's effective plan tier. Lifetime trumps everything (it's
// a permanent grant). Recurring Plus/Pro require a future-dated proUntil
// (Stripe sets it at the billing-period end). Plus-Lite is a free bonus
// granted once `referralsUsed >= REFERRAL_THRESHOLD` (currently 2).
// Owners and advisors always see lifetime so demo accounts can use the
// product without paying.
function getPlan(user, email) {
  const d = user?.data || {};
  // The stored plan ALWAYS wins. Owners + advisors used to auto-resolve
  // to lifetime here, but that blocked admin from testing downgrades
  // on their own account. They can self-grant lifetime from the admin
  // PlanPicker; otherwise we only fall back to lifetime for owners
  // when they've never had a plan stamped at all.
  if (d.plan === 'lifetime' || d.lifetimePurchasedAt) return 'lifetime';
  const stillActive = !d.proUntil || new Date(d.proUntil) > new Date();
  if (d.plan === 'pro' && stillActive) return 'pro';
  if (d.plan === 'plus' && stillActive) return 'plus';
  if (d.plan === 'plus-lite' && stillActive) return 'plus-lite';
  if (d.plan === 'free') return 'free';
  // Untouched (null/undefined): owners + advisors get lifetime as a
  // convenience, the referral unlock kicks in for everyone else, and
  // the final fallback is free.
  if (isOwner(email) || isAdvisor(email)) return 'lifetime';
  if ((d.referralsUsed || 0) >= REFERRAL_THRESHOLD) return 'plus-lite';
  return 'free';
}
// "Pro" in the legacy sense = any paid tier. New code that needs to
// distinguish Plus vs Lifetime vs Pro should call getPlan() directly.
function isPro(user, email) { return PAID_TIERS.has(getPlan(user, email)); }
// Three tiers selectable via preferences.modelTier:
//   'pro'        → gemini-3.1-pro-preview          (default - deepest reasoning)
//   'flash'      → gemini-3.1-flash-preview        (balanced - faster, lower cost)
//   'flash-lite' → gemini-3.1-flash-lite-preview   (fastest + cheapest)
// Free users always get FREE (Flash) regardless of preference.
function modelForUser(user, email) {
  const tier = user?.data?.preferences?.modelTier;
  const plan = getPlan(user, email);
  // Gemini Pro: gated to the Pro subscription tier only.
  if (tier === 'pro' && plan === 'pro') return GEMINI_PRO;
  // Flash: gated to Plus and above (plus / lifetime / pro).
  if (tier === 'flash' && ['plus', 'lifetime', 'pro'].includes(plan)) return GEMINI_FLASH;
  // Everyone else (and any unlock-mismatch) gets Flash Lite.
  return GEMINI_FLASH_LITE;
}

// Daily limits are a ROLLING 24h window. Instead of a midnight reset,
// every message + QB game gets timestamped and we count entries inside
// the trailing window. Weekly limits (curricula / debates) still reset
// on ISO week change. `usage.day` is kept around for backward compat
// with anything that still reads it; the bucketed daily counters are
// no longer authoritative.
const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;  // 24h
function ensureUsageBucket(user) {
  const week = weekKey();
  if (!user.data.usage) user.data.usage = { day: null, messages: 0, quizBowlGames: 0, week: null, curricula: 0, debates: 0 };
  // Migrate any old daily counters to the rolling timestamp arrays on
  // first touch. Old numeric counts are dropped (we can't reconstruct
  // timestamps for them) so the user effectively gets a fresh 24h
  // window.
  if (!Array.isArray(user.data.usage.msgWindow)) user.data.usage.msgWindow = [];
  if (!Array.isArray(user.data.usage.qbWindow)) user.data.usage.qbWindow = [];
  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  user.data.usage.msgWindow = user.data.usage.msgWindow.filter(e => (e?.ts || 0) > cutoff);
  user.data.usage.qbWindow = user.data.usage.qbWindow.filter(ts => ts > cutoff);
  if (user.data.usage.week !== week) {
    user.data.usage.week = week;
    user.data.usage.curricula = 0;
    user.data.usage.debates = 0;
  }
}

// Sum the costs of every message logged inside the rolling window.
function rollingMsgUsage(user) {
  return (user.data.usage.msgWindow || []).reduce((n, e) => n + (e?.cost || 1), 0);
}

// Returns { allowed, remaining, limit, plan }. Mutates usage on allowed=true.
// `cost` is how many message-units the request counts as (2 for sourced).
function consumeMessage(users, email, cost = 1) {
  const u = users[email];
  if (!u) return { allowed: false, remaining: 0, limit: 0, plan: 'free' };
  const plan = getPlan(u, email);
  const cap = LIMITS[plan]?.dailyMessages ?? LIMITS.free.dailyMessages;
  if (cap === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity, plan };
  ensureUsageBucket(u);
  const used = rollingMsgUsage(u);
  if (used + cost > cap) {
    return { allowed: false, remaining: Math.max(0, cap - used), limit: cap, plan };
  }
  u.data.usage.msgWindow.push({ ts: Date.now(), cost });
  return { allowed: true, remaining: Math.max(0, cap - (used + cost)), limit: cap, plan, cost };
}
function consumeQuizBowlGame(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  const plan = getPlan(u, email);
  const cap = LIMITS[plan]?.dailyQB ?? LIMITS.free.dailyQB;
  if (cap === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity, plan };
  ensureUsageBucket(u);
  const used = u.data.usage.qbWindow.length;
  if (used >= cap) {
    return { allowed: false, remaining: 0, limit: cap, plan };
  }
  u.data.usage.qbWindow.push(Date.now());
  return { allowed: true, remaining: Math.max(0, cap - (used + 1)), limit: cap, plan };
}
// Weekly buckets - curricula / debates
function consumeCurriculumGeneration(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  const plan = getPlan(u, email);
  const cap = LIMITS[plan]?.weeklyCurricula ?? LIMITS.free.weeklyCurricula;
  if (cap === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity, plan };
  ensureUsageBucket(u);
  if ((u.data.usage.curricula || 0) >= cap) {
    return { allowed: false, remaining: 0, limit: cap, plan };
  }
  u.data.usage.curricula = (u.data.usage.curricula || 0) + 1;
  return { allowed: true, remaining: Math.max(0, cap - u.data.usage.curricula), limit: cap, plan };
}
function consumeDebate(users, email) {
  const u = users[email];
  if (!u) return { allowed: false };
  const plan = getPlan(u, email);
  const cap = LIMITS[plan]?.weeklyDebates ?? LIMITS.free.weeklyDebates;
  if (cap === Infinity) return { allowed: true, remaining: Infinity, limit: Infinity, plan };
  ensureUsageBucket(u);
  if ((u.data.usage.debates || 0) >= cap) {
    return { allowed: false, remaining: 0, limit: cap, plan };
  }
  u.data.usage.debates = (u.data.usage.debates || 0) + 1;
  return { allowed: true, remaining: Math.max(0, cap - u.data.usage.debates), limit: cap, plan };
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
      modelTier: 'flash-lite',
    },
    profile: { level: 1, xp: 0, xpToNextLevel: 100, strengths: [], weaknesses: [], topicScores: {} },
    goals: [],
    flashcardDecks: [],
    notes: [],
    // Obsidian-style knowledge graph(s) over the user's notes. Each map
    // has its own nodes+edges. The first map is the "default" - note
    // mirroring (auto-add a node for every note) only happens on it.
    // Other maps are user-curated.
    noteMaps: [{ id: 'default', name: 'Main Map', color: '#a78bfa', createdAt: 0, isDefault: true, nodes: [], edges: [] }],
    // Legacy single-graph field - kept null on new accounts. Old accounts
    // get migrated into noteMaps[] by migrateUserData.
    noteGraph: { nodes: [], edges: [] },
    studySessions: [],
    assessmentHistory: [],
    lessons: [],
    slideshows: [],               // AI-generated slide decks (legacy field - Slides was retired)
    // Each entry: { id, category, difficulty, source: 'qbreader'|'ai',
    //   score, total, durationMs, finishedAt, categoryStats: { [cat]: {correct, total} },
    //   perQuestion: [{category, correct, buzzWord, totalWords, answer, correctAnswer}] }
    // Newest-first. Capped at 200 sets server-side.
    quizbowlSets: [],

    // Server-side QB student model - never sent back to the student verbatim,
    // only used to bias packet recommendations. Updated incrementally on every
    // saved set (see updateSecretProfile). Backfilled from history on first
    // migration so existing accounts get value immediately.
    //   categoryProfile: per-category accuracy + recent trend + buzz pos
    //   answerProfile:   per-answer-string mastery (was the student right
    //                    about Krebs Cycle? Congress of Vienna?)
    //   strengths/weaknesses: top/bottom categories with enough attempts
    //   struggleTopics: specific answers missed multiple times - these are
    //                   the high-value drills
    //   masteryTopics: specific answers got 2+ times in a row - safe to skip
    //   buzzStyle:      aggressive/cautious/balanced based on avg buzz pos
    //   updatedAt:      ISO - used to skip rebuild if no new sets
    secretProfile: {
      version: 1,
      updatedAt: null,
      categoryProfile: {},
      answerProfile: {},
      strengths: [],
      weaknesses: [],
      struggleTopics: [],
      masteryTopics: [],
      buzzStyle: { avgPosition: 0, style: 'unknown', samples: 0 },
      totals: { sets: 0, questions: 0, correct: 0 },
    },


    // ----- Billing / plan state -----
    plan: 'free',                 // 'free' | 'plus-lite' | 'plus' | 'pro' | 'lifetime'
    proUntil: null,               // ISO string or null - when a recurring sub expires; null = untimed
    proGrantedBy: null,           // 'owner' | 'stripe' | null
    lifetimePurchasedAt: null,    // ISO when the one-time Lifetime charge cleared; sticky forever
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    // Usage counters - reset by helper when the date / week changes
    usage: { day: null, messages: 0, quizBowlGames: 0, week: null, curricula: 0, debates: 0 },

    // ----- Referrals -----
    // referralCode: the user's own shareable code (filled in on signup
    //               via migrateUserData if missing - never overwritten).
    // referredBy:   the code the user redeemed at signup (null if none).
    //               Each user can redeem at most one code, forever.
    // referralsUsed: how many OTHER users have redeemed THIS user's
    //                code. When this hits REFERRAL_THRESHOLD (2), the
    //                user is bumped to plus-lite (unless they're paid).
    referralCode: null,
    referredBy: null,
    referralsUsed: 0,

    // ----- Parent mode (parental controls + child profiles) -----
    // When `enabled`, the account owner is treated as a parent. Curricula
    // are namespaced under a `studentId` (one of `students[].id`), and the
    // active child is selected via `activeStudentId`. Parents enter a PIN
    // to leave child-locked mode and access the parental dashboard.
    parent: {
      enabled: false,
      pinHash: null,            // bcrypt hash of 4-6 digit PIN (null until setup)
      students: [],             // [{ id, name, color, avatar, grade, createdAt, controls }]
      adults: [],               // [{ id, name, color, avatar, createdAt }] - full-access family members
      activeStudentId: null,    // currently-selected child (null = family-manager / adult view)
      activeAdultId: null,      // currently-selected adult member
      lastParentUnlockAt: null, // ISO - when parent last entered PIN
    },
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
  // Backfill parent block - older accounts predate the parent-mode feature.
  if (!data.parent || typeof data.parent !== 'object') {
    data.parent = defaults.parent;
  } else {
    for (const key of Object.keys(defaults.parent)) {
      if (data.parent[key] === undefined) data.parent[key] = defaults.parent[key];
    }
  }
  // Migrate old top-level fields into preferences
  if (data.customInstructions !== undefined && !data.preferences.customInstructions) {
    data.preferences.customInstructions = data.customInstructions;
  }
  if (data.aiPersonality !== undefined && data.preferences.aiPersonality === 'friendly') {
    data.preferences.aiPersonality = data.aiPersonality;
  }
  // Clean phantom curricula from old RushilAI app - remove any without valid units/lessons structure
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
    // Retroactively unlock any previously-locked units - students can jump
    // ahead to any lesson at will now.
    for (const c of data.curricula) {
      for (const unit of (c.units || [])) {
        if (unit.locked) unit.locked = false;
      }
    }
  }
  // ── noteMaps migration ───────────────────────────────────────────────
  // Old accounts have a single `noteGraph`. New accounts get an array of
  // `noteMaps`. Convert the legacy field into the first (default) map so
  // existing graphs survive the upgrade.
  if (!Array.isArray(data.noteMaps) || data.noteMaps.length === 0) {
    const legacy = data.noteGraph && typeof data.noteGraph === 'object' ? data.noteGraph : null;
    data.noteMaps = [{
      id: 'default',
      name: 'Main Map',
      color: '#a78bfa',
      createdAt: Date.now(),
      isDefault: true,
      nodes: Array.isArray(legacy?.nodes) ? legacy.nodes : [],
      edges: Array.isArray(legacy?.edges) ? legacy.edges : [],
    }];
  }
  // Make sure exactly one map is flagged as default. If none, mark the first.
  if (!data.noteMaps.some(m => m.isDefault)) {
    data.noteMaps[0].isDefault = true;
  }
  // Backfill the QB secret profile from existing history on first migration.
  // Older accounts have quizbowlSets but no secretProfile - replay the sets
  // so the recommendation engine has something to work with on day one.
  if ((!data.secretProfile || !data.secretProfile.updatedAt) && Array.isArray(data.quizbowlSets) && data.quizbowlSets.length) {
    try {
      data.secretProfile = rebuildSecretProfileFromHistory(data.quizbowlSets);
    } catch (e) {
      // Don't block login on a bad rebuild - just leave the empty default.
      console.error('secretProfile rebuild failed:', e);
    }
  }
  // Backfill the user's shareable referral code if they don't have one
  // yet. We can't check for global collisions from inside this function
  // (it only sees one user's data), but 30^8 ≈ 6.5e11 codes means a
  // duplicate is vanishingly unlikely; the redeem endpoint also
  // re-validates so the worst case is one extra failed redeem attempt.
  if (!data.referralCode || typeof data.referralCode !== 'string' || data.referralCode.length !== REFERRAL_CODE_LEN) {
    data.referralCode = generateReferralCode();
  }
  if (typeof data.referralsUsed !== 'number') data.referralsUsed = 0;
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
//   1. Strict JSON (responseMimeType=application/json) - direct parse.
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
      // Strip line comments outside of strings (rough - relies on being a
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

// Pull JSON out of an [TAG] ... [/TAG] block. Returns the parsed object
// or null. Tolerates ``` fences inside the block and balances braces
// in case the model emits prose after the JSON.
function extractActionJson(fullText, tag) {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const i = fullText.indexOf(open);
  if (i < 0) return null;
  const after = fullText.slice(i + open.length);
  const j = after.indexOf(close);
  const body = (j >= 0 ? after.slice(0, j) : after).trim();
  return parseAIJson(body);
}

// Parse all [MAKE_*] action blocks the AI emitted in this study reply,
// materialize them into real artifacts (notes + launch payloads for QB
// and debate), and return a list the caller can stream to the client
// AND persist on the assistant message. Side-effects: mutates the
// passed-in user data (adds notes); saveUsers is the caller's job.
//
// Each returned artifact looks like:
//   { type, id?, title, launch: { appId, meta } }
// where `launch.meta` is what the desktop's openApp() spreads as props
// onto the destination app.
async function buildStudyArtifacts(fullText, userData) {
  const out = [];

  // ── [MAKE_NOTE] - create a real note with the full markdown body ──
  const noteJson = extractActionJson(fullText, 'MAKE_NOTE');
  if (noteJson && (noteJson.title || noteJson.content)) {
    if (!Array.isArray(userData.notes)) userData.notes = [];
    const note = {
      id: crypto.randomUUID(),
      title: String(noteJson.title || 'Untitled note').slice(0, 200),
      type: 'regular',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cues: [],
      mainNotes: String(noteJson.content || ''),
      summary: '',
      linkedCurriculumId: null,
      linkedLessonId: null,
    };
    userData.notes.unshift(note);
    out.push({
      type: 'note',
      id: note.id,
      title: note.title,
      launch: { appId: 'notes', label: 'Notes', meta: { initialNoteId: note.id, initialView: 'editor' } },
    });
  }

  // ── [MAKE_QUIZBOWL] - no game pre-created; we deep-link the QB hub
  //    pre-filled with topic + difficulty so the student can start. ──
  const qbJson = extractActionJson(fullText, 'MAKE_QUIZBOWL');
  if (qbJson && qbJson.topic) {
    const topic = String(qbJson.topic).slice(0, 200);
    const difficulty = ['elementary', 'middle', 'high', 'college'].includes(qbJson.difficulty)
      ? qbJson.difficulty
      : 'high';
    out.push({
      type: 'quizbowl',
      title: topic,
      launch: { appId: 'quizbowl', label: 'Quiz Bowl', meta: { initialTopic: topic, initialDifficulty: difficulty } },
    });
  }

  // ── [MAKE_DEBATE] - deep-link the debate app pre-configured. ──
  const debJson = extractActionJson(fullText, 'MAKE_DEBATE');
  if (debJson && debJson.topic) {
    const topic = String(debJson.topic).slice(0, 300);
    const side = ['pro', 'con'].includes(debJson.side) ? debJson.side : 'pro';
    out.push({
      type: 'debate',
      title: topic,
      launch: { appId: 'debate', label: 'Debate', meta: { initialTopic: topic, initialSide: side } },
    });
  }

  return out;
}

// ===== AUTH ROUTES =====

// Email + password signup - creates a brand-new account.
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const trimEmail = email.trim().toLowerCase();
    const users = loadUsers();
    if (users[trimEmail]) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    users[trimEmail] = {
      id: userId,
      email: trimEmail,
      name: name.trim(),
      password: hashed,
      verified: true,
      createdAt: new Date().toISOString(),
      data: createDefaultData(),
    };
    saveUsers(users);

    const token = generateToken();
    sessions[token] = { id: userId, email: trimEmail };
    saveSessions();

    res.json({
      success: true,
      token,
      user: { id: userId, email: trimEmail, name: name.trim(), data: users[trimEmail].data },
    });
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// Email + password login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const trimEmail = email.trim().toLowerCase();
    const users = loadUsers();
    const user = users[trimEmail];
    if (!user) {
      return res.status(401).json({ error: 'No account found with this email' });
    }
    if (!user.password) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please sign in with Google.' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const token = generateToken();
    sessions[token] = { id: user.id, email: trimEmail };
    saveSessions();

    res.json({
      success: true,
      token,
      user: { id: user.id, email: trimEmail, name: user.name, data: user.data || {} },
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
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
    // subsequent page load, so we use it as the visit signal - debounced to
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
      // signed-in dashboard with a demo session - see ProtectedRoute
      // in src/App.jsx, which force-logs-out + redirects.
      isDemo: isDemoOrDevEmail(email),
      data: {
        ...user.data,
        effectivePlan,
        isOwner: isOwner(email),
        isAdvisor: isAdvisor(email),
        isBeta: canSeeBeta(email),
        // Always strip the PIN hash before it leaves the server.
        parent: sanitizeParent(user.data.parent),
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

// =================================================================
// PARENT MODE
//
// A parent enables parent mode by setting a PIN. They can then create
// child profiles (students), switch between them, and view a parental
// dashboard showing each child's curricula + grades + recent activity.
//
// `activeStudentId` on user.data.parent gates which curricula are
// shown by /api/curriculum (a student-scoped view). Setting it to null
// returns to the unscoped parent view.
//
// Endpoints:
//   POST   /api/parent/setup            - first-time enable: set PIN + initial students
//   POST   /api/parent/verify-pin       - verify PIN to unlock parent view
//   GET    /api/parent/status           - current state (enabled, students, activeStudentId)
//   POST   /api/parent/students         - add a child (requires PIN)
//   DELETE /api/parent/students/:sid    - remove a child (requires PIN)
//   POST   /api/parent/students/:sid/switch - switch active child (requires PIN)
//   POST   /api/parent/exit-child       - leave child view (requires PIN)
//   GET    /api/parent/dashboard        - parental dashboard rollup
// =================================================================

function makeStudentId() { return 'st-' + crypto.randomBytes(6).toString('hex'); }

function isValidPin(pin) {
  return typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);
}

// Per-child parental controls. Stored on each student object as
// `student.controls`. Backfilled lazily by `ensureStudentControls()` so
// older students still get sane defaults the first time they're read.
//
// Fields:
//   blockedApps:     app ids the child can't see on the dock
//                    (e.g. ['debate', 'quizbowl']).
//   requireGraded:   when true, every new curriculum the child generates
//                    is forced into graded mode server-side, regardless
//                    of what the form sent.
//   difficultyFloor: minimum difficulty the child can pick when creating
//                    a new curriculum ('beginner' | 'intermediate' |
//                    'advanced' | 'expert' | null = no floor).
//   allowChats:      can the child use the open-ended Study Mode chat?
//                    Lesson chats stay on regardless - they're the
//                    teaching surface, not free-form chat.
function defaultStudentControls() {
  return {
    blockedApps: [],
    requireGraded: false,
    difficultyFloor: null,
    allowChats: true,
    socraticMode: false,
    blockAnswerHints: false,
  };
}

// Returns extra system-prompt text that enforces a child's anti-cheat
// guardrails. Empty string when no guardrails are active.
function buildChildGuardrails(child) {
  if (!child) return '';
  ensureStudentControls(child);
  const lines = [];
  if (child.controls.socraticMode) {
    lines.push(
      '⚠️ PARENTAL GUARDRAIL - SOCRATIC MODE: This is a child account. You MUST teach through guided questions only. Never state the answer to a homework or assignment problem directly. Instead, ask probing questions that help the student discover the answer themselves. If the student asks you to "just tell me the answer", respond with another question that moves them closer without revealing it.',
    );
  }
  if (child.controls.blockAnswerHints) {
    lines.push(
      '⚠️ PARENTAL GUARDRAIL - NO ANSWER HINTS: This is a child account. During graded assessments and practice problems you must NOT give hints, partial answers, or reveal the correct answer in any form. If the student asks for a hint on an assessment question, gently decline and encourage them to try their best on their own.',
    );
  }
  return lines.length ? '\n\n' + lines.join('\n\n') : '';
}

function ensureStudentControls(student) {
  if (!student.controls || typeof student.controls !== 'object') {
    student.controls = defaultStudentControls();
    return;
  }
  const def = defaultStudentControls();
  for (const k of Object.keys(def)) {
    if (student.controls[k] === undefined) student.controls[k] = def[k];
  }
}

async function hashPin(pin) {
  return bcrypt.hash(String(pin), 10);
}

async function checkPin(user, pin) {
  if (!user?.data?.parent?.pinHash) return false;
  if (!isValidPin(pin)) return false;
  try {
    return await bcrypt.compare(String(pin), user.data.parent.pinHash);
  } catch { return false; }
}

// Aggregates per-student progress from the curricula list.
// A curriculum belongs to a student when its `studentId` matches.
// Returns { totalCurricula, totalLessons, completedLessons, avgGrade, recentAssignments }
function summarizeStudent(user, studentId) {
  const curricula = (user?.data?.curricula || []).filter(c => c.studentId === studentId);
  let totalLessons = 0, completedLessons = 0, gradeSum = 0, gradeCount = 0;
  const recentAssignments = [];
  for (const c of curricula) {
    const courseGrade = computeCourseGrade(c);
    if (courseGrade.gradedCount > 0) {
      gradeSum += courseGrade.percent;
      gradeCount++;
    }
    for (const u of c.units || []) {
      for (const l of u.lessons || []) {
        totalLessons++;
        if (l.isCompleted) completedLessons++;
        if (l.assignment?.submission?.gradedAt) {
          recentAssignments.push({
            curriculumId: c.id,
            curriculumTitle: c.title,
            lessonId: l.id,
            lessonTitle: l.title,
            score: l.assignment.submission.score,
            letter: l.assignment.submission.letter,
            gradedAt: l.assignment.submission.gradedAt,
          });
        }
      }
    }
  }
  recentAssignments.sort((a, b) => new Date(b.gradedAt) - new Date(a.gradedAt));
  return {
    totalCurricula: curricula.length,
    totalLessons,
    completedLessons,
    avgGrade: gradeCount > 0 ? Math.round(gradeSum / gradeCount) : null,
    recentAssignments: recentAssignments.slice(0, 8),
    courses: curricula.map(c => ({
      id: c.id,
      title: c.title,
      ...computeCourseGrade(c),
      totalLessons: (c.units || []).reduce((s, u) => s + (u.lessons || []).length, 0),
      completedLessons: (c.units || []).reduce((s, u) => s + (u.lessons || []).filter(l => l.isCompleted).length, 0),
    })),
  };
}

// Weighted-average grade across all graded assignments in a curriculum.
// Each assignment is worth `weight` (default 1). Returns percent + letter +
// counts. Lessons without a graded assignment are skipped - they don't drag
// the average down until the student submits.
function computeCourseGrade(curriculum) {
  let total = 0, weightSum = 0, gradedCount = 0;
  for (const u of curriculum?.units || []) {
    for (const l of u.lessons || []) {
      const sub = l?.assignment?.submission;
      if (!sub || typeof sub.score !== 'number') continue;
      const w = Number(l.assignment.weight) || 1;
      total += sub.score * w;
      weightSum += w;
      gradedCount++;
    }
  }
  const percent = weightSum > 0 ? Math.round(total / weightSum) : null;
  return {
    percent,
    letter: percent == null ? null : percentToLetter(percent),
    gradedCount,
    graded: curriculum?.settings?.graded === true,
  };
}

function percentToLetter(p) {
  if (p >= 97) return 'A+';
  if (p >= 93) return 'A';
  if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C-';
  if (p >= 67) return 'D+';
  if (p >= 63) return 'D';
  if (p >= 60) return 'D-';
  return 'F';
}

// First-time enable: set PIN, optionally create initial students.
app.post('/api/parent/setup', authMiddleware, async (req, res) => {
  try {
    const { pin, students } = req.body || {};
    if (!isValidPin(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    user.data.parent.pinHash = await hashPin(pin);
    user.data.parent.enabled = true;
    user.data.parent.lastParentUnlockAt = new Date().toISOString();
    const initial = Array.isArray(students) ? students : [];
    for (const s of initial.slice(0, 6)) {
      if (!s?.name || typeof s.name !== 'string') continue;
      user.data.parent.students.push({
        id: makeStudentId(),
        name: s.name.slice(0, 40),
        color: s.color || pickColor(user.data.parent.students.length),
        grade: s.grade ? String(s.grade).slice(0, 20) : '',
        avatar: s.name.charAt(0).toUpperCase(),
        controls: defaultStudentControls(),
        createdAt: new Date().toISOString(),
      });
    }
    saveUsers(users);
    res.json({ parent: sanitizeParent(user.data.parent) });
  } catch (e) { console.error('parent/setup:', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/parent/verify-pin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    user.data.parent.lastParentUnlockAt = new Date().toISOString();
    user.data.parent.activeStudentId = null;
    saveUsers(users);
    res.json({ success: true, parent: sanitizeParent(user.data.parent) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/parent/status', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    res.json({ parent: sanitizeParent(users[email].data.parent) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parent/students', authMiddleware, async (req, res) => {
  try {
    const { pin, name, color, grade } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ error: 'name required' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not set up' });
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    if (user.data.parent.students.length >= 8) {
      return res.status(400).json({ error: 'Maximum 8 child profiles' });
    }
    const student = {
      id: makeStudentId(),
      name: name.trim().slice(0, 40),
      color: color || pickColor(user.data.parent.students.length),
      grade: grade ? String(grade).slice(0, 20) : '',
      avatar: name.trim().charAt(0).toUpperCase(),
      controls: defaultStudentControls(),
      createdAt: new Date().toISOString(),
    };
    user.data.parent.students.push(student);
    saveUsers(users);
    res.json({ student, parent: sanitizeParent(user.data.parent) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/parent/students/:sid', authMiddleware, async (req, res) => {
  try {
    const pin = req.headers['x-parent-pin'] || req.body?.pin;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    const before = user.data.parent.students.length;
    user.data.parent.students = user.data.parent.students.filter(s => s.id !== req.params.sid);
    if (user.data.parent.activeStudentId === req.params.sid) {
      user.data.parent.activeStudentId = null;
    }
    if (user.data.parent.students.length === before) {
      return res.status(404).json({ error: 'Student not found' });
    }
    saveUsers(users);
    res.json({ parent: sanitizeParent(user.data.parent) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Switch into a child profile. Doesn't require PIN - children should be
// able to swap between their own profiles freely (think: family iPad).
// Leaving child mode (back to parent view) DOES require PIN.
app.post('/api/parent/students/:sid/switch', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not set up' });
    const student = user.data.parent.students.find(s => s.id === req.params.sid);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    user.data.parent.activeStudentId = student.id;
    user.data.parent.activeAdultId = null; // clear any active adult
    saveUsers(users);
    res.json({ activeStudentId: student.id, student });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Select the parent admin profile from the ProfilePicker (or any "switch
// to admin" UI). When parent mode is enabled this REQUIRES the PIN -
// otherwise a child could just click "Parent Admin Panel" to escape
// restrictions. When parent mode is NOT yet set up, no PIN is needed and
// we send back `requiresSetup` so the client can route to the setup form.
//
// On success clears `activeStudentId` so the dock/sidebar/feature filters
// all fall back to the unrestricted parent view.
app.post('/api/parent/select-admin', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);

    if (!user.data.parent.enabled) {
      user.data.parent.activeStudentId = null;
      user.data.parent.activeAdultId = null;
      saveUsers(users);
      return res.json({ success: true, requiresSetup: true });
    }

    if (user.data.parent.pinHash) {
      const ok = await checkPin(user, pin);
      if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    }

    user.data.parent.activeStudentId = null;
    user.data.parent.activeAdultId = null;
    user.data.parent.lastParentUnlockAt = new Date().toISOString();
    saveUsers(users);
    res.json({ success: true, activeStudentId: null, activeAdultId: null });
  } catch (e) { console.error('parent/select-admin:', e); res.status(500).json({ error: e.message }); }
});


// ===== ADULT FAMILY MEMBERS =====
// Adults have full app access (no restrictions) but need PIN to enter the
// family manager panel. No PIN is needed to switch TO an adult profile.

// Add an adult family member (PIN-gated, family manager only).
app.post('/api/parent/adults', authMiddleware, async (req, res) => {
  try {
    const { pin, name, color } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name required' });
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not set up' });
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    if ((user.data.parent.adults || []).length >= 8) return res.status(400).json({ error: 'Max 8 adult profiles' });
    const adult = {
      id: crypto.randomUUID(),
      name: name.slice(0, 40),
      color: color || pickColor((user.data.parent.adults || []).length),
      avatar: name.charAt(0).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    user.data.parent.adults = user.data.parent.adults || [];
    user.data.parent.adults.push(adult);
    saveUsers(users);
    res.json({ adult, parent: sanitizeParent(user.data.parent) });
  } catch (e) { console.error('parent/adults post:', e); res.status(500).json({ error: e.message }); }
});

// Remove an adult family member (PIN-gated).
app.delete('/api/parent/adults/:aid', authMiddleware, async (req, res) => {
  try {
    const pin = req.headers['x-parent-pin'] || req.query?.pin;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    user.data.parent.adults = (user.data.parent.adults || []).filter(a => a.id !== req.params.aid);
    if (user.data.parent.activeAdultId === req.params.aid) user.data.parent.activeAdultId = null;
    saveUsers(users);
    res.json({ parent: sanitizeParent(user.data.parent) });
  } catch (e) { console.error('parent/adults delete:', e); res.status(500).json({ error: e.message }); }
});

// Switch to an adult profile. No PIN required - adults are trusted.
app.post('/api/parent/adults/:aid/switch', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not set up' });
    const adult = (user.data.parent.adults || []).find(a => a.id === req.params.aid);
    if (!adult) return res.status(404).json({ error: 'Adult not found' });
    user.data.parent.activeAdultId = adult.id;
    user.data.parent.activeStudentId = null; // clear any active child
    saveUsers(users);
    res.json({ activeAdultId: adult.id, adult });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Exit adult profile mode. No PIN required.
app.post('/api/parent/exit-adult', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    user.data.parent.activeAdultId = null;
    saveUsers(users);
    res.json({ success: true, activeAdultId: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Change the parent PIN. Authenticates with the OLD pin so a kid who
// somehow gets a session can't rotate the PIN out from under the parent.
app.post('/api/parent/change-pin', authMiddleware, async (req, res) => {
  try {
    const { oldPin, newPin } = req.body || {};
    if (!isValidPin(newPin)) return res.status(400).json({ error: 'New PIN must be 4-6 digits' });
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not enabled' });
    const ok = await checkPin(user, oldPin);
    if (!ok) return res.status(403).json({ error: 'Current PIN is incorrect' });
    user.data.parent.pinHash = await hashPin(newPin);
    user.data.parent.lastParentUnlockAt = new Date().toISOString();
    saveUsers(users);
    res.json({ success: true, parent: sanitizeParent(user.data.parent) });
  } catch (e) { console.error('parent/change-pin:', e); res.status(500).json({ error: e.message }); }
});

// Disable parent mode entirely. Wipes PIN + students + activeStudentId.
// Existing curricula stay where they are - just stop being scoped per
// student. PIN-gated so a child can't disable restrictions themselves.
app.post('/api/parent/disable', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.json({ success: true });
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    user.data.parent = {
      enabled: false,
      pinHash: null,
      students: [],
      activeStudentId: null,
      lastParentUnlockAt: null,
    };
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { console.error('parent/disable:', e); res.status(500).json({ error: e.message }); }
});

// Aggregate activity feed across ALL children. Used by the admin panel
// for a single-pane view of what every kid has been doing. Newest first,
// capped at 30 events to keep the response small.
app.get('/api/parent/activity', authMiddleware, async (req, res) => {
  try {
    const pin = req.headers['x-parent-pin'] || req.query?.pin;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not enabled' });
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });

    const events = [];
    const studentsById = Object.fromEntries((user.data.parent.students || []).map(s => [s.id, s]));
    for (const c of (user.data.curricula || [])) {
      const student = studentsById[c.studentId];
      if (!student) continue;
      events.push({
        kind: 'curriculum_created',
        studentId: student.id,
        studentName: student.name,
        studentColor: student.color,
        curriculumId: c.id,
        title: c.title,
        at: c.createdAt,
      });
      for (const u of c.units || []) {
        for (const l of u.lessons || []) {
          if (l.isCompleted && l.completedAt) {
            events.push({
              kind: 'lesson_completed',
              studentId: student.id,
              studentName: student.name,
              studentColor: student.color,
              curriculumId: c.id,
              curriculumTitle: c.title,
              lessonId: l.id,
              lessonTitle: l.title,
              score: l.score,
              at: l.completedAt,
            });
          }
          if (l.assignment?.submission?.gradedAt) {
            events.push({
              kind: 'assignment_graded',
              studentId: student.id,
              studentName: student.name,
              studentColor: student.color,
              curriculumId: c.id,
              curriculumTitle: c.title,
              lessonId: l.id,
              lessonTitle: l.title,
              score: l.assignment.submission.score,
              letter: l.assignment.submission.letter,
              at: l.assignment.submission.gradedAt,
            });
          }
        }
      }
    }
    for (const sess of (user.data.studySessions || [])) {
      if (!sess.studentId) continue;
      const student = studentsById[sess.studentId];
      if (!student) continue;
      events.push({
        kind: 'study_session',
        studentId: student.id,
        studentName: student.name,
        studentColor: student.color,
        sessionId: sess.id,
        title: sess.title || 'Study session',
        messageCount: (sess.messages || []).length,
        at: sess.lastMessageAt || sess.startedAt,
      });
    }
    events.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    res.json({ events: events.slice(0, 30) });
  } catch (e) { console.error('parent/activity:', e); res.status(500).json({ error: e.message }); }
});

app.post('/api/parent/exit-child', authMiddleware, async (req, res) => {
  try {
    const { pin } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    user.data.parent.activeStudentId = null;
    user.data.parent.lastParentUnlockAt = new Date().toISOString();
    saveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/parent/dashboard', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    if (!user.data.parent.enabled) return res.status(400).json({ error: 'Parent mode not set up' });
    const students = user.data.parent.students.map(s => ({
      ...s,
      summary: summarizeStudent(user, s.id),
    }));
    res.json({ students });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update a child's controls. PIN-gated - the child can't lift their own
// restrictions. Accepts a partial controls object; unspecified keys keep
// their previous value.
app.put('/api/parent/students/:sid/controls', authMiddleware, async (req, res) => {
  try {
    const { pin, controls } = req.body || {};
    if (!controls || typeof controls !== 'object') {
      return res.status(400).json({ error: 'controls object required' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    const student = user.data.parent.students.find(s => s.id === req.params.sid);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    ensureStudentControls(student);

    // Validate + merge each field defensively.
    const def = defaultStudentControls();
    if (Array.isArray(controls.blockedApps)) {
      // Cap + dedupe + only allow known app ids. The list mirrors
      // appRegistry - we don't import the JS module so we keep a
      // server-side allowlist instead.
      const ALLOWED = ['curricula', 'lessons', 'study', 'notes', 'mathtutor', 'debate', 'quizbowl'];
      student.controls.blockedApps = [...new Set(controls.blockedApps.filter(a => ALLOWED.includes(a)))].slice(0, ALLOWED.length);
    }
    if (typeof controls.requireGraded === 'boolean') student.controls.requireGraded = controls.requireGraded;
    if (typeof controls.allowChats === 'boolean') student.controls.allowChats = controls.allowChats;
    if (typeof controls.socraticMode === 'boolean') student.controls.socraticMode = controls.socraticMode;
    if (typeof controls.blockAnswerHints === 'boolean') student.controls.blockAnswerHints = controls.blockAnswerHints;
    if (controls.difficultyFloor === null || ['beginner', 'intermediate', 'advanced', 'expert'].includes(controls.difficultyFloor)) {
      student.controls.difficultyFloor = controls.difficultyFloor;
    }

    saveUsers(users);
    res.json({ student, parent: sanitizeParent(user.data.parent) });
  } catch (e) { console.error('parent/controls:', e); res.status(500).json({ error: e.message }); }
});

// List a child's chats (PIN-gated). Returns lesson chats AND study sessions
// in a single feed. Each entry is a metadata stub - the full transcript is
// fetched separately via the next endpoint to keep the list response small.
app.get('/api/parent/students/:sid/chats', authMiddleware, async (req, res) => {
  try {
    const pin = req.headers['x-parent-pin'] || req.query?.pin;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    const student = user.data.parent.students.find(s => s.id === req.params.sid);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const chats = [];
    // Lesson chats - pulled from every lesson in every curriculum owned
    // by this child.
    for (const c of (user.data.curricula || [])) {
      if (c.studentId !== student.id) continue;
      for (const u of c.units || []) {
        for (const l of u.lessons || []) {
          if (!Array.isArray(l.chatHistory) || l.chatHistory.length === 0) continue;
          const last = l.chatHistory[l.chatHistory.length - 1];
          chats.push({
            kind: 'lesson',
            id: `${c.id}::${l.id}`,
            curriculumId: c.id,
            curriculumTitle: c.title,
            lessonId: l.id,
            lessonTitle: l.title,
            messageCount: l.chatHistory.length,
            lastActivity: last?.timestamp || l.completedAt || null,
            preview: lastUserPreview(l.chatHistory),
          });
        }
      }
    }
    // Study sessions - open-ended chats outside the curriculum.
    for (const sess of (user.data.studySessions || [])) {
      if (sess.studentId && sess.studentId !== student.id) continue;
      // Legacy sessions without studentId belong to the parent, not a child -
      // skip them so a parent's own study chats don't leak into the child's
      // viewer.
      if (!sess.studentId) continue;
      chats.push({
        kind: 'study',
        id: sess.id,
        title: sess.title || 'Untitled study session',
        messageCount: (sess.messages || []).length,
        lastActivity: sess.updatedAt || sess.createdAt || null,
        preview: lastUserPreview(sess.messages),
      });
    }
    chats.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
    res.json({ chats });
  } catch (e) { console.error('parent/chats list:', e); res.status(500).json({ error: e.message }); }
});

function lastUserPreview(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user' && messages[i]?.content) {
      return String(messages[i].content).slice(0, 140);
    }
  }
  return '';
}

// Full transcript for one chat. `kind=lesson` expects id = "curriculumId::lessonId".
// `kind=study` expects a session id.
app.get('/api/parent/students/:sid/chats/:kind/:id', authMiddleware, async (req, res) => {
  try {
    const pin = req.headers['x-parent-pin'] || req.query?.pin;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const user = users[email];
    user.data = migrateUserData(user.data);
    const ok = await checkPin(user, pin);
    if (!ok) return res.status(403).json({ error: 'Incorrect PIN' });
    const student = user.data.parent.students.find(s => s.id === req.params.sid);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (req.params.kind === 'lesson') {
      const [cid, lid] = String(req.params.id).split('::');
      const curriculum = (user.data.curricula || []).find(c => c.id === cid && c.studentId === student.id);
      if (!curriculum) return res.status(404).json({ error: 'Lesson not found' });
      const found = findLessonInCurriculum(curriculum, lid);
      if (!found) return res.status(404).json({ error: 'Lesson not found' });
      return res.json({
        kind: 'lesson',
        title: `${found.lesson.title} (${curriculum.title})`,
        messages: found.lesson.chatHistory || [],
      });
    }
    if (req.params.kind === 'study') {
      const sess = (user.data.studySessions || []).find(s => s.id === req.params.id && s.studentId === student.id);
      if (!sess) return res.status(404).json({ error: 'Study session not found' });
      return res.json({
        kind: 'study',
        title: sess.title || 'Study session',
        messages: sess.messages || [],
      });
    }
    res.status(400).json({ error: 'Unknown chat kind' });
  } catch (e) { console.error('parent/chats get:', e); res.status(500).json({ error: e.message }); }
});

// Strip pinHash before sending parent state to the client. Also backfills
// per-student controls on the way out so the UI always gets a populated
// `controls` object even on legacy student records.
function sanitizeParent(parent) {
  if (!parent) return null;
  const { pinHash, ...safe } = parent;
  safe.students = (safe.students || []).map(s => {
    ensureStudentControls(s);
    return s;
  });
  safe.adults = safe.adults || [];
  return { ...safe, hasPin: !!pinHash };
}

function pickColor(i) {
  const palette = ['#3B82F6', '#A855F7', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#8B5CF6'];
  return palette[i % palette.length];
}

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
      // Pro models on long-form structured outputs (slideshows, 16k tokens)
      // routinely run 60-180s; flash finishes in 5-15s. A single 60s ceiling
      // aborted advanced-mode generations roughly half the time, and 240s
      // still tripped on the bespoke-HTML design phase where Pro is asked
      // to write rich HTML + SVG.
      const isProModel = /pro/i.test(String(resolved));
      const callTimeoutMs = isProModel ? 360_000 : 60_000;
      const timeout = setTimeout(() => controller.abort(), callTimeoutMs);

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
          // disableThinking: skip Gemini 3's built-in CoT for cheap,
          // short generative calls (debate topic suggestions, etc).
          // Without this, the model burns the entire token budget on a
          // hidden `thoughtSignature` and the visible JSON gets cut off
          // mid-sentence - which broke the AI debate-topic chip.
          ...(opts.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
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
        // Any URLs without matching supports - still surface them
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

// Back-compat alias - all existing call sites use `callAnthropic`.
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
// fences and inline citation markers - caller should pre-sanitize if needed.
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

// Was unauthenticated + ungated for a long time, which meant every
// /api/chat call bypassed the daily message cap entirely. Now requires
// auth and consumes from the user's bucket (cost 2 for sourced/web
// search calls, 1 otherwise). Returns 402 with `message_limit_reached`
// on overflow so the client can pop the upgrade chip.
app.post('/api/chat', authMiddleware, async (req, res) => {
  try {
    const { messages, system, model, max_tokens, sourced, jsonMode, disableThinking } = req.body;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const cost = sourced ? 2 : 1;
    const quota = consumeMessage(users, email, cost);
    if (!quota.allowed) {
      const upgradeKind = quota.plan === 'free' ? 'refer' : 'upgrade';
      const upgradeHint = upgradeKind === 'refer'
        ? 'Refer 2 friends to unlock Plus-Lite (free) for higher limits.'
        : 'Upgrade to the next plan for more daily messages.';
      return res.status(402).json({
        error: 'message_limit_reached',
        message: `You've hit today's message limit (${quota.limit}). ${upgradeHint}`,
        limit: quota.limit, remaining: quota.remaining, plan: quota.plan, upgradeKind,
      });
    }
    saveUsers(users);
    const systemPrompt = system || 'You are a helpful AI assistant.';
    const result = await callGemini(systemPrompt, messages, model, max_tokens || 4096, {
      enableWebSearch: !!sourced,
      jsonMode: !!jsonMode,
      disableThinking: !!disableThinking,
    });
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

    // Condensed prompt for the demo - force a compact structure so
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
    // us valid JSON - the Flash model occasionally wraps output in prose.
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

    const system = 'You are a flashcard author. Output ONLY valid JSON - no markdown, no fences, no explanation.';
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
      system = 'You are a warm, conversational tutor. Use markdown - headings (##), bold, bulleted lists, numbered steps, and code blocks where useful. Keep replies under 250 words unless the student asks for depth. End with one short check-for-understanding question when it fits.';
    } else {
      if (!topic) return res.status(400).json({ error: 'Topic or messages required' });
      system = 'You are a warm, conversational tutor. Use markdown - headings (##), bold, bulleted lists, numbered steps, and code blocks where useful. Keep the opening to 150-220 words.';
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
// Ask 3-4 clarifying questions about a topic before generation. The
// student's answers (sent back as `settings.refinements`) anchor the
// syllabus to what they actually want - scope, prior background, goal.
app.post('/api/curriculum/refine', authMiddleware, async (req, res) => {
  try {
    const { topic, difficulty, audience } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
      return res.status(400).json({ error: 'topic required' });
    }
    const system = `You output strict JSON. Given a study topic, produce 4-5 short clarifying questions a curriculum designer should ask before building a course. Mix two question types:
- "mcq": one plain-English sentence with 3-4 multiple-choice answer options that span the realistic spread (not a fake "all of the above"). Use these for scope, prior background, and depth choices where the realistic answer set is small and known.
- "open": one plain-English sentence the student answers in their own words. Use these (at least 1, up to 2) for things MCQs can't pin down - the specific goal, prior context, a concrete project or class the course should serve, or anything where the realistic answer space is too wide to enumerate. Include a short \`placeholder\` hint (under 80 chars) showing the kind of answer expected.

Aim for 2-3 mcq questions plus 1-2 open questions. Questions should disambiguate scope, prior background, and the student's goal.

Output schema (no markdown, no prose):
{ "questions": [
  { "id": "kebab-case", "type": "mcq", "question": "...", "options": ["...", "...", "..."] },
  { "id": "kebab-case", "type": "open", "question": "...", "placeholder": "e.g. ..." }
] }`;
    const user = `Topic: "${String(topic).slice(0, 200)}"
Difficulty hint: ${difficulty || 'unspecified'}
Audience hint: ${audience || 'unspecified'}

Generate 4-5 clarifying questions, mixing mcq and open types as described.`;
    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_FLASH_LITE, 900, {
      jsonMode: true, disableThinking: true, temperature: 0.4,
    });
    if (!result.success) return res.status(500).json({ error: result.error });
    const text = result.data.content?.[0]?.text || '';
    const parsed = parseAIJson(text);
    if (!parsed?.questions || !Array.isArray(parsed.questions)) {
      return res.status(500).json({ error: 'Failed to parse refinement questions.' });
    }
    const questions = parsed.questions.slice(0, 5).map((q, i) => {
      const opts = Array.isArray(q.options) ? q.options.slice(0, 4).map(o => String(o).slice(0, 120)) : [];
      // Default to mcq when options are present, open otherwise - covers
      // models that forget the `type` field but get the shape right.
      const declared = String(q.type || '').toLowerCase();
      const type = declared === 'open' || (declared !== 'mcq' && opts.length < 2) ? 'open' : 'mcq';
      const base = {
        id: String(q.id || `q-${i + 1}`),
        type,
        question: String(q.question || '').slice(0, 240),
      };
      if (type === 'open') {
        base.placeholder = String(q.placeholder || '').slice(0, 80);
      } else {
        base.options = opts;
      }
      return base;
    }).filter(q => q.question && (q.type === 'open' || (q.options && q.options.length >= 2)));
    res.json({ questions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/curriculum/generate', authMiddleware, async (req, res) => {
  try {
    const { settings, sources: rawSources } = req.body;
    if (!settings?.topic) return res.status(400).json({ error: 'Topic is required' });

    // Parental controls: if the request is on behalf of an active child,
    // apply their controls BEFORE running the AI. This is the server-side
    // backstop - the client UI also reflects the same rules, but we
    // can't trust client-only enforcement.
    {
      const usersCC = loadUsers();
      const emailCC = findEmailById(usersCC, req.userId);
      const activeChildId = usersCC?.[emailCC]?.data?.parent?.activeStudentId;
      const activeChild = activeChildId
        ? usersCC[emailCC].data.parent.students.find(s => s.id === activeChildId)
        : null;
      if (activeChild) {
        ensureStudentControls(activeChild);
        if (activeChild.controls.requireGraded) settings.graded = true;
        const floor = activeChild.controls.difficultyFloor;
        if (floor) {
          const order = ['beginner', 'intermediate', 'advanced', 'expert'];
          const cur = order.indexOf(settings.difficulty);
          const min = order.indexOf(floor);
          if (cur < min) settings.difficulty = floor;
        }
      }
    }

    // Sources: optional array of { title, kind: 'pdf'|'text'|'url', content, url? }.
    // Already-extracted text - files come from /api/files/extract and URLs
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
    // Flash Lite for curriculum generation - fastest model, structured JSON
    // output is schema-constrained so quality is the same as heavier models.
    // 4096 tokens is plenty for 5-8 units × 4-7 lessons (title + description).
    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_FLASH_LITE, 4096, { jsonMode: true, temperature: 0.7 });

    if (!result.success) return res.status(500).json({ error: result.error });

    const text = result.data.content?.[0]?.text || '';
    let curriculum = parseAIJson(text);
    if (!curriculum || !curriculum.units) {
      console.warn('Curriculum first attempt parse failed. First 400 chars:', text.slice(0, 400));
      // Retry once with stronger JSON enforcement and even lower temperature.
      const retryResult = await callGemini(
        'You MUST output ONLY a valid JSON object. No markdown, no explanation, no text before or after. Just raw JSON.',
        [{ role: 'user', content: `${user}\n\nIMPORTANT: Output ONLY the JSON object, nothing else.` }],
        GEMINI_FLASH_LITE, 4096, { jsonMode: true, temperature: 0.3 }
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

    // Scope this curriculum to the active child profile (if parent mode
    // is active). Falls back to null = "belongs to the parent / unscoped".
    const ownerParent = usersC[emailC]?.data?.parent;
    const activeStudent = ownerParent?.enabled ? (ownerParent.activeStudentId || null) : null;
    curriculum.studentId = activeStudent;

    // Graded mode metadata. When enabled, each lesson gets an assignment
    // generated lazily on first visit (see /assignment/generate endpoint),
    // and a course-level grade is computed as a weighted average.
    curriculum.graded = settings.graded === true;
    curriculum.gradingPolicy = curriculum.graded
      ? {
          scale: 'percent+letter',
          assignmentDefaultWeight: 1,
          autoAssign: true,
        }
      : null;
    // Persist the source materials the user attached - minus their full
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
          title: `${unit.title} - Math Tutor`,
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
          title: `${unit.title} - Practice Problems`,
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
          title: `${unit.title} - Graded Essay`,
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
        title: `${unit.title} - Assessment`,
        description: `Test your knowledge of ${unit.title}`,
        type: 'unit_test',
        chatHistory: [],
        phase: null,
        phaseData: {},
        content: null,
        isCompleted: false,
        score: null,
      });

      // All units unlocked - student can jump to any lesson at any time.
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

// List all curricula (summaries). When parent mode is active AND a student
// is selected, only that student's courses are returned. When no student
// is selected (parent view), all courses are returned with their studentId
// so the parental dashboard can group them.
app.get('/api/curriculum', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const parent = users[email].data.parent;
    const activeStudentId = parent?.enabled ? parent.activeStudentId : null;
    let raw = users[email].data?.curricula || [];
    if (activeStudentId) raw = raw.filter(c => c.studentId === activeStudentId);
    const curricula = raw.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      settings: c.settings,
      studentId: c.studentId || null,
      graded: c.graded === true,
      courseGrade: computeCourseGrade(c),
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
// PAUSD CATALOG - pre-built Khan-Academy-style courses at PAUSD rigor.
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

    // Bail if already enrolled - show them the existing one rather than
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
        // Honor explicit `type` from the catalog template - math_tutor and
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
              title: `${unit.title} - Math Tutor`,
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
              title: `${unit.title} - Practice Problems`,
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
            title: `${unit.title} - Graded Essay`,
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
          title: `${unit.title} - Assessment`,
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
      GEMINI_FLASH,
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

// Parse questions from plain-text format - far more robust than JSON.
// Handles minor formatting variations without failing the whole response.
function parseQuestionsFromText(text) {
  const questions = [];
  // Split on blank lines between questions, or on "N." / "N)" at line start
  const raw = text.replace(/\r\n/g, '\n');
  const blocks = raw.split(/\n(?=\d+[\.\)]\s)/);

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // First line: strip leading "N." / "N)" numbering
    const qText = lines[0].replace(/^\d+[\.\)]\s*/, '').trim();
    if (!qText || qText.length < 5) continue;

    const options = [];
    let correct = '';
    let explanation = '';

    for (const line of lines.slice(1)) {
      // Option lines: "A) ...", "A. ...", "A: ..."
      const optMatch = line.match(/^([A-Da-d])[\.\)\:]\s+(.+)/);
      if (optMatch) {
        options.push(`${optMatch[1].toUpperCase()}) ${optMatch[2].trim()}`);
        continue;
      }
      // Correct answer line
      const answerMatch = line.match(/^(?:correct|answer|ans)[\s\:\-]+([A-Da-d])/i);
      if (answerMatch) { correct = answerMatch[1].toUpperCase(); continue; }
      // Explanation line
      const expMatch = line.match(/^(?:explanation|explain|why|reason)[\s\:\-]+(.+)/i);
      if (expMatch) { explanation = expMatch[1].trim(); continue; }
      // Bare explanation after correct is set (continuation line)
      if (correct && !explanation && line.length > 15 && !/^[A-D][\.\)]/i.test(line)) {
        explanation = line;
      }
    }

    if (qText && options.length >= 2 && correct) {
      questions.push({
        id: `q${questions.length + 1}`,
        question: qText,
        options,
        correct,
        explanation,
      });
    }
  }
  return questions;
}

// Get or generate a cached assessment for a lesson
app.get('/api/curriculum/:id/lesson/:lessonId/assessment', authMiddleware, async (req, res) => {
  try {
    const { refresh } = req.query;
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });

    const curriculum = (users[email].data?.curricula || []).find(c => c.id === req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });

    let lesson = null;
    let unit = null;
    for (const u of curriculum.units || []) {
      const l = (u.lessons || []).find(l => l.id === req.params.lessonId);
      if (l) { lesson = l; unit = u; break; }
    }
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Return cached assessment unless refresh is requested
    if (lesson.cachedAssessment && refresh !== '1') {
      return res.json({ assessment: lesson.cachedAssessment });
    }

    const difficulty = curriculum.settings?.difficulty || 'beginner';
    const topic = unit.title;
    const lessonContent = lesson.content ? lesson.content.slice(0, 3000) : '';
    const contentHint = lessonContent
      ? `\n\nLesson content for context:\n${lessonContent}`
      : '';

    // Plain-text format - the model is much more reliable at this than JSON.
    // Regex parsing below is tolerant of minor formatting variations.
    const sys = 'You are a quiz writer. Output ONLY the numbered questions in the exact format shown. No intro, no outro, no markdown.';
    const usr = `Write exactly 12 rigorous multiple-choice questions on "${topic}" (${difficulty} level). Test deep understanding: application, analysis, edge cases.${contentHint}

Use EXACTLY this format for every question (blank line between questions):

1. Question text here?
A) First option
B) Second option
C) Third option
D) Fourth option
Correct: B
Explanation: Why B is correct and the others are not.

2. Next question?
A) ...`;

    let questions = [];
    for (let attempt = 0; attempt < 3 && questions.length < 6; attempt++) {
      const result = await callGemini(sys, [{ role: 'user', content: usr }], GEMINI_FLASH_LITE, 4096, { temperature: 0.5 });
      if (result.success) {
        const text = result.data.content?.[0]?.text || '';
        const parsed = parseQuestionsFromText(text);
        if (parsed.length > questions.length) questions = parsed;
      }
    }

    if (questions.length < 3) return res.status(502).json({ error: 'Could not generate. Try again.' });

    const assessment = {
      id: crypto.randomUUID(),
      title: topic,
      type: 'quiz',
      questions,
      createdAt: new Date().toISOString(),
    };

    // Cache in lesson so next load is instant
    const usersAfter = loadUsers();
    const curr = (usersAfter[email]?.data?.curricula || []).find(c => c.id === req.params.id);
    if (curr) {
      for (const u of curr.units || []) {
        const l = (u.lessons || []).find(l => l.id === req.params.lessonId);
        if (l) { l.cachedAssessment = assessment; break; }
      }
      saveUsers(usersAfter);
    }

    res.json({ assessment });
  } catch (e) {
    console.error('Assessment fetch error:', e);
    res.status(500).json({ error: e.message });
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

  // 1. Explicit model signal - [STATUS: advance] OR legacy [PHASE_COMPLETE]
  const modelSaidAdvance = /\[STATUS:\s*advance\]/i.test(fullContent)
    || fullContent.includes('[PHASE_COMPLETE]')
    || fullContent.includes('[LESSON_COMPLETE]');

  // 2. Safety fallback - too many turns in this phase
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
// SSE event schema (unchanged from the old Anthropic impl - frontend consumers
// depend on this exact shape):
//   { content: "..." }                     (text delta)
//   { source: { url, title } }             (new source discovered)
//   { status: "searching"|"reading"|"no_sources" }
//   { done: true, sources: [{url,title}] } (end)
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
    // Critical for Render / nginx - without this they buffer SSE chunks and the
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

  // Inject true model identity at the TOP of the system prompt so it takes
  // Source mode: sources are retrieved automatically via Google Search
  // grounding - tell the model it has the capability rather than browbeating
  // it into using the tool.
  const finalSystem = enableWebSearch
    ? `${systemPrompt}

---
SOURCE MODE - NON-NEGOTIABLE RULES:
- You have Google Search. Use it on EVERY single response - short answers, follow-ups, clarifications, and "yes/no" replies included. No message is exempt.
- Run 2-4 queries before writing each response, then base every factual claim on what the search returns.
- Cite the supporting source inline using [1], [2], … markers placed immediately after the claim they back. The UI renders the sources list below your message; do NOT write your own "Sources:" footer.
- If search returns nothing useful, say so plainly and refuse to fabricate - do not fall back to model-only answers in source mode.
- Write naturally and do not mention that you searched.`
    : systemPrompt;

  const controller = new AbortController();
  // 5-minute hard cap. Long lessons with quiz blocks + grounded source mode
  // can take a while; 180s was clipping legitimate streams.
  const timeout = setTimeout(() => controller.abort(), 300000);

  // Heartbeat - without periodic bytes, intermediate proxies (Cloudflare,
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
      // disableThinking: callers that want snappy first-token latency (study
      // chat, simple Q&A) pass this true. Lessons / curriculum gen leave it
      // off so the model can plan multi-section structured output.
      generationConfig: {
        maxOutputTokens: 32768,
        temperature: 0.7,
        ...(opts.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
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

    // Always stream tokens live - both source and non-source mode. In source
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
        MAX_TOKENS: '\n\n_[response cut off - hit length limit; ask the AI to continue]_',
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

      // Some grounding responses emit chunks without matching supports - add
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
        // we clump them - the <Sources> list below the message gives the
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
    // must never surface as an AI error - the AI response is already done.
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

    // PAUSD courses are textbook-only. Force web search OFF - the AI must
    // teach inside the chapter scope of the assigned textbook (Big Ideas
    // Math, NGSS), not pull random sources from the wider internet.
    if (curriculum.source === 'pausd') req.sourced = false;

    // If the curriculum has attached source material (pdfs / urls), the
    // model answers ONLY from those - same rule as Study Mode. The
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
    // prompt builder can compose a "course memory" block - what was already
    // taught (with scores + summaries), what's coming up, where this lesson
    // sits - so the AI builds on prior lessons instead of re-teaching them.
    const _activeChildLC = (() => {
      const aid = users[email].data?.parent?.activeStudentId;
      return aid ? (users[email].data.parent.students || []).find(s => s.id === aid) : null;
    })();
    const systemPrompt = buildLessonChatPrompt(
      lesson.phase, lesson, unit, curriculum.settings,
      users[email].data.profile, users[email].data.preferences, lesson.chatHistory,
      users[email].data.assessmentHistory || [],
      curriculum
    ) + buildChildGuardrails(_activeChildLC);

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

      // Check for lesson completion - sanitize code fences + citation markers first.
      const cleanedCurr = fullContent
        .replace(/```(?:json|javascript|js)?\s*/gi, '')
        .replace(/```/g, '')
        .replace(/\s*\[\d+\]\s*/g, ' ');
      if (/\[LESSON_COMPLETE\]/.test(cleanedCurr)) {
        // Always mark complete - nothing below can block this.
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
// is graded - that endpoint reads which questions the student got
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

// =================================================================
// GRADED MODE - per-lesson assignments + AI grading
//
// When a curriculum is created with `settings.graded === true`, each
// lesson can have an `assignment` attached: a small prompt + rubric that
// the student responds to in writing. Submissions are graded by the AI
// (rubric-based) and the score rolls up into a course grade.
//
// Lesson shape additions:
//   lesson.assignment = {
//     prompt: string,        // the assignment prompt
//     rubric: [{ label, weight, criterion }],
//     weight: number,        // weight in course grade (default 1)
//     generatedAt: ISO,
//     submission: {          // null until the student submits
//       text: string,
//       submittedAt: ISO,
//       score: number 0-100,
//       letter: 'A'..'F',
//       feedback: string,
//       perRubric: [{ label, score, note }],
//       gradedAt: ISO,
//     } | null,
//   }
// =================================================================

// Lazy generation: called when the student first opens the assignment view
// for a graded lesson. Idempotent - if `assignment` already exists, return it.
app.post('/api/curriculum/:id/lesson/:lessonId/assignment/generate', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    if (curriculum.graded !== true) return res.status(400).json({ error: 'Curriculum is not in graded mode' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });

    // Already generated - return as-is.
    if (found.lesson.assignment?.prompt) {
      return res.json({ assignment: found.lesson.assignment });
    }

    const system = `You design rigorous short-form assignments for a graded online course. Output STRICT JSON only. The assignment should make the student demonstrate ACTUAL understanding of the lesson - not just recall a definition.

The student will write a 150-400 word response. The rubric is what the AI uses to grade them. Each rubric criterion is concrete and observable (e.g. "Correctly identifies the bias-variance tradeoff and applies it to the example"), not vague (e.g. "Shows understanding").`;
    const user = `Design ONE assignment for the lesson:
Unit: "${found.unit.title}"
Lesson: "${found.lesson.title}"
Lesson description: "${found.lesson.description || ''}"
Course: "${curriculum.title}"
Difficulty: ${curriculum.settings?.difficulty || 'intermediate'}

Return JSON:
{
  "prompt": "The assignment prompt - 1-3 sentences, ends with a clear ask. Should require synthesis or application, not just recall.",
  "rubric": [
    { "label": "<2-4 word criterion name>", "weight": <int 1-3>, "criterion": "<one sentence describing what an A response demonstrates for this criterion>" }
  ]
}

Rubric should have 3-4 criteria. Weights are relative (3 = most important). Do NOT wrap the JSON in markdown.`;

    const result = await callGemini(system, [{ role: 'user', content: user }], modelForUser(users[email], email), 1200, {
      jsonMode: true, temperature: 0.7,
    });
    if (!result.success) return res.status(500).json({ error: result.error });
    const text = result.data.content?.[0]?.text || '';
    const parsed = parseAIJson(text);
    if (!parsed?.prompt || !Array.isArray(parsed.rubric)) {
      return res.status(500).json({ error: 'Failed to generate assignment' });
    }

    found.lesson.assignment = {
      prompt: String(parsed.prompt).slice(0, 1200),
      rubric: parsed.rubric.slice(0, 5).map(r => ({
        label: String(r.label || 'Criterion').slice(0, 60),
        weight: Math.max(1, Math.min(3, Number(r.weight) || 1)),
        criterion: String(r.criterion || '').slice(0, 400),
      })),
      weight: 1,
      generatedAt: new Date().toISOString(),
      submission: null,
    };
    saveUsers(users);
    res.json({ assignment: found.lesson.assignment });
  } catch (e) {
    console.error('assignment/generate failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/curriculum/:id/lesson/:lessonId/assignment/submit', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Submission must be at least 20 characters' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const assignment = found.lesson.assignment;
    if (!assignment?.prompt) return res.status(400).json({ error: 'Assignment not generated yet' });

    const rubricLines = (assignment.rubric || [])
      .map((r, i) => `${i + 1}. [weight ${r.weight}] ${r.label}: ${r.criterion}`)
      .join('\n');
    const system = `You are a rigorous but fair teacher grading a short-form assignment. Score each rubric criterion 0-100 based on what the student actually demonstrated. Be specific in feedback - quote the student where useful, point to what's missing, and say what an A-grade response would have added.

Output STRICT JSON only. No markdown fences.`;
    const userMsg = `LESSON: "${found.lesson.title}" (unit: "${found.unit.title}")
COURSE: "${curriculum.title}"

ASSIGNMENT PROMPT:
"""
${assignment.prompt}
"""

RUBRIC (grade each criterion 0-100; weights are relative):
${rubricLines}

STUDENT SUBMISSION:
"""
${String(text).slice(0, 6000)}
"""

Return JSON:
{
  "perRubric": [
    { "label": "<must match rubric label>", "score": <0-100>, "note": "<1-2 sentence justification, specific to what the student wrote>" }
  ],
  "feedback": "<3-5 sentences of overall feedback addressed to the student. Mention 1 strength, 1-2 specific gaps, and one concrete next step.>"
}`;

    const result = await callGemini(system, [{ role: 'user', content: userMsg }], modelForUser(users[email], email), 1600, {
      jsonMode: true, temperature: 0.4,
    });
    if (!result.success) return res.status(500).json({ error: result.error });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.perRubric)) {
      return res.status(500).json({ error: 'Failed to grade submission' });
    }

    // Weighted average across the rubric.
    let total = 0, weightSum = 0;
    const perRubric = (assignment.rubric || []).map(r => {
      const match = parsed.perRubric.find(p => String(p.label).toLowerCase() === r.label.toLowerCase());
      const score = match ? Math.max(0, Math.min(100, Number(match.score) || 0)) : 0;
      total += score * r.weight;
      weightSum += r.weight;
      return {
        label: r.label,
        score,
        note: match?.note ? String(match.note).slice(0, 500) : '',
      };
    });
    const finalScore = weightSum > 0 ? Math.round(total / weightSum) : 0;

    assignment.submission = {
      text: String(text).slice(0, 6000),
      submittedAt: new Date().toISOString(),
      score: finalScore,
      letter: percentToLetter(finalScore),
      feedback: String(parsed.feedback || '').slice(0, 1200),
      perRubric,
      gradedAt: new Date().toISOString(),
    };
    // Submitting an assignment marks the lesson complete.
    found.lesson.isCompleted = true;
    if (found.lesson.score == null) found.lesson.score = finalScore;
    saveUsers(users);

    res.json({
      submission: assignment.submission,
      courseGrade: computeCourseGrade(curriculum),
    });
  } catch (e) {
    console.error('assignment/submit failed:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/curriculum/:id/grade', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    res.json({ courseGrade: computeCourseGrade(curriculum) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


function stampBlock(lessonId, b, i, opts = {}) {
  const blockId = `${lessonId}-b${i}`;
  const typeLabel = {
    reading: 'Reading', quiz: 'Quiz', example: 'Worked Example',
    recap: 'Recap', application: 'In the Wild', challenge: 'Challenge', open: 'Open Answer',
  }[b.type] || 'Step';
  const base = {
    id: blockId,
    type: b.type,
    title: b.title || `${typeLabel} ${i + 1}`,
    completedAt: null,
    ...(opts.srs ? { srs: true } : {}),
    ...(opts.isFinal ? { isFinal: true } : {}),
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
      steps: (Array.isArray(b.steps) ? b.steps : []).map(s => ({
        label: String(s?.label || ''),
        text: String(s?.text || ''),
      })),
      tryThis: String(b.tryThis || ''),
    };
  }
  if (b.type === 'recap') {
    return {
      ...base,
      bullets: (Array.isArray(b.bullets) ? b.bullets : []).map(String),
    };
  }
  if (b.type === 'challenge') {
    return {
      ...base,
      prompt: String(b.prompt || ''),
      hint: String(b.hint || ''),
      solution: String(b.solution || ''),
    };
  }
  if (b.type === 'open') {
    return {
      ...base,
      prompt: String(b.prompt || ''),
      minWords: Math.max(20, Math.min(200, Number(b.minWords) || 50)),
      rubric: (Array.isArray(b.rubric) ? b.rubric : []).map(r => ({
        label: String(r?.label || ''),
        criterion: String(r?.criterion || ''),
        weight: Math.max(1, Math.min(5, Number(r?.weight) || 1)),
      })),
      submission: null,
      score: null,
    };
  }
  // Unknown type - preserve raw shape so frontend can render best-effort.
  return { ...base, ...b };
}

// Returns the missed-question summaries from any quiz blocks already
// graded on this lesson - used to feed SRS context into R3 / final quiz
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

    const difficulty = curriculum.difficulty || 'intermediate';
    const blockCount = LESSON_BLOCK_COUNT[difficulty] || LESSON_BLOCK_COUNT.intermediate;
    const middleCount = blockCount - 2;
    const sys = `You generate one complete lesson as ${blockCount} blocks. You pick the right MIX of block types for the topic - see the schema. Output ONLY valid JSON - no markdown, no fences, no commentary.`;
    const prompt = `Build the lesson "${lesson.title}" from the unit "${unit.title}" of the course "${curriculum.title}".
${lesson.description ? `Lesson goal: ${lesson.description}\n` : ''}${curriculum.description ? `Course context: ${curriculum.description}\n` : ''}
Difficulty: ${difficulty}.

EXACTLY ${blockCount} blocks total (this length is set by the course difficulty - do not deviate). You decide the type of each MIDDLE block based on what best serves this topic. Pick a varied, motivated mix - not all the same type.

FIXED slots:
  Slot 1:  "reading"  - Core definition + framing of the topic. The simplest correct mental model. 350-500 words of markdown.
  Slot ${blockCount}: "reading"  - Synthesis + edge cases. Tie the lesson to the surrounding course; surface 1-2 lingering subtleties. 350-500 words.

MIDDLE slots (slots 2 through ${blockCount - 1}, ${middleCount} blocks total) - pick from these types:
  • "reading"     - A second teaching pass (mechanics, examples). 350-500 words of markdown.
  • "quiz"        - 3 multiple-choice questions on what's been read so far.
  • "example"     - A WORKED EXAMPLE. One concrete problem the student would actually face, broken into 3-5 numbered solution steps the student can reveal one at a time, then a short "now you try" prompt.
  • "recap"       - A CONCEPT RECAP. 4-6 tight bullet points summarising what's been covered so far. Used after dense material to reinforce.
  • "application" - A REAL-WORLD APPLICATION. 200-300 words of markdown showing where this concept shows up - a product, an event, a phenomenon the student has likely encountered.
  • "challenge"   - A STRETCH PROBLEM. A harder, non-obvious question with a hint and a full solution. Inserts difficulty when the lesson gets too smooth.
  • "open"        - An OPEN-ANSWER prompt. A short question the student must answer in their own words (40-150 words). MUST include a 2-3 item rubric - each item is { label, criterion (one sentence describing what an A-grade response shows), weight (1-3) }.
  • "discussion"  - AN AI DISCUSSION. The student chats back-and-forth with an AI tutor about what they just learned. Give a thoughtful opening question + 3-5 specific talking points the AI should hit across the conversation.
  • "matching"    - A MATCHING MINIGAME. 5-7 pairs of terms and their definitions/examples the student matches by clicking. Great for vocabulary, formula↔meaning, or cause↔effect drills.
  • "fill-blank"  - A FILL-IN-THE-BLANK exercise. 4-6 sentences with one key word/phrase omitted. The student types the missing piece. Good for keyword recall after a reading.

RULES for the middle ${middleCount} blocks:
  • Include AT LEAST 2 "quiz" blocks (the lesson needs graded checkpoints).
  • Include AT LEAST ${middleCount >= 5 ? 3 : 2} NON-quiz, NON-reading types - mix freely from {example, recap, application, challenge, open, discussion, matching, fill-blank}. Variety is the point.
  • Include AT LEAST 1 "open" OR "discussion" block somewhere in the middle so the student has to express their understanding in their own words.
  • For lessons of ${middleCount >= 4 ? '4+' : 'any'} middle blocks, include AT LEAST 1 INTERACTIVE type - pick from {matching, fill-blank, discussion} - so the lesson isn't just read-and-quiz.
  • A "quiz" or "open" block should follow material it can test - never put a checkpoint before the relevant teaching content.
  • A "recap" should come AFTER at least one reading or example.
  • A "challenge" should come AFTER the relevant teaching content.
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
  open:        {"type":"open","title":"...","prompt":"<markdown question, 1-3 sentences>","minWords":<40-80>,"rubric":[{"label":"...","criterion":"...","weight":<1-3>}, ...2-3 total...]}
  discussion:  {"type":"discussion","title":"...","prompt":"<the AI's opening question to the student, 1-2 sentences>","talkingPoints":["<concept the AI should make sure gets discussed>", ...3-5 total...]}
  matching:    {"type":"matching","title":"...","instructions":"<one-line how-to>","pairs":[{"term":"<short term>","definition":"<definition or example, 1 sentence>"}, ...5-7 pairs...]}
  fill-blank:  {"type":"fill-blank","title":"...","instructions":"<one-line how-to>","sentences":[{"before":"<text before the blank>","answer":"<single word or short phrase>","after":"<text after the blank>","hint":"<optional short hint>"}, ...4-6 sentences...]}

Markdown inside content/problem/prompt/solution: ## sub-headings, **bold**, lists, fenced code where useful, math via $...$ or $$...$$ if it fits.
Distractors in quizzes must be plausible - each wrong option encodes a real misconception named in the explanation.

Return JSON in this shape:
{ "blocks": [ <block 1>, <block 2>, ... <block ${blockCount}> ] }`;

    // Speed: Flash (not Pro) is plenty for structured-JSON lesson generation
    // and runs ~2-3x faster. Reading + quiz quality is identical because
    // the prompt does the heavy lifting. Pro is reserved for free-form
    // tutoring where reasoning depth matters.
    // Bump the token ceiling for longer lessons - expert mode emits
    // ~14 blocks with a couple readings inside, easily 6k tokens of
    // markdown alone. Flash's hard cap is 8192; we'll use Pro for the
    // deepest two tiers where the ceiling matters.
    const maxTokens = blockCount >= 10 ? 12000 : 8192;
    const model = blockCount >= 10 ? GEMINI_PRO : GEMINI_FLASH;
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], model, maxTokens, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Lesson generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length !== blockCount) {
      console.error('Block parse failed. Got', parsed?.blocks?.length, 'blocks, expected', blockCount);
      return res.status(500).json({ error: `Lesson did not return ${blockCount} blocks. Try again.` });
    }

    // No SRS slot anymore - the AI mixes types as it sees fit, so a
    // hard-coded spaced-repetition reading at index 4 no longer makes
    // sense. The "recap" type covers reinforcement when the AI decides
    // that's what the lesson needs.
    const blocks = parsed.blocks.map((b, i) => stampBlock(lesson.id, b, i));

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
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length < 3) {
      return res.status(400).json({ error: 'Run blocks/generate first' });
    }
    // Idempotent: if the last block is already the final quiz, return it.
    const last = lesson.blocks[lesson.blocks.length - 1];
    if (last?.isFinal) return res.json({ block: last });

    const missed = collectMissedFromLesson(lesson);
    const missedBlock = missed.length
      ? `MISSED QUESTIONS FROM THE LESSON QUIZZES (use these as the spine of the final quiz - re-test the same concepts from a different angle, do NOT repeat the questions verbatim):\n${missed.map((m, i) => `  ${i + 1}. Prompt: ${m.prompt}\n     Student picked: ${m.userPicked}\n     Correct: ${m.correctAnswer}\n     Why it tripped them: ${m.explanation}`).join('\n')}`
      : `(The student got every mid-quiz question right. Push harder: 5 application / synthesis questions that integrate the lesson's readings.)`;

    const sys = `You write the FINAL QUIZ for a lesson - a 5-question multiple-choice quiz that integrates the whole lesson. Output ONLY valid JSON.`;
    const prompt = `Lesson: "${lesson.title}" (unit: "${unit.title}", course: "${curriculum.title}").
Difficulty: ${curriculum.difficulty || 'intermediate'}.

${missedBlock}

Write 5 multiple-choice questions:
- 3 of them must directly re-test the missed-concept areas from above (different angle, harder than the original question).
- 2 of them must test synthesis - pulling ideas from at least 2 different readings together.

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible - each wrong option encodes a real misconception.

Return JSON exactly:
{ "questions": [ ...5 total... ] }`;

    // Flash for speed - same reasoning as the bulk block generator.
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 4096, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Final quiz generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'Final quiz returned no questions. Try again.' });
    }

    const block = stampBlock(lesson.id, { type: 'quiz', title: 'Final Quiz', questions: parsed.questions }, lesson.blocks.length, { isFinal: true });
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

// Open-answer grader. Same rubric-driven scoring path as assignments,
// but the submission lives on the block itself so the lesson runner
// can render the verdict inline. Idempotent: re-submitting overwrites
// the previous grade.
app.post('/api/curriculum/:id/lesson/:lessonId/blocks/:bid/grade-open', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Submission must be at least 20 characters' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const curriculum = findUserCurriculum(users, email, req.params.id);
    if (!curriculum) return res.status(404).json({ error: 'Curriculum not found' });
    const found = findLessonInCurriculum(curriculum, req.params.lessonId);
    if (!found) return res.status(404).json({ error: 'Lesson not found' });
    const block = (found.lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block || block.type !== 'open') return res.status(404).json({ error: 'Open-answer block not found' });

    const rubric = Array.isArray(block.rubric) && block.rubric.length
      ? block.rubric
      : [{ label: 'Understanding', criterion: 'Demonstrates accurate understanding of the lesson concept.', weight: 1 }];

    const rubricLines = rubric.map((r, i) => `${i + 1}. [weight ${r.weight ?? 1}] ${r.label}: ${r.criterion}`).join('\n');
    const system = `You are a rigorous but fair teacher grading a short-form open-answer prompt embedded in a lesson. Score each rubric criterion 0-100 based on what the student actually demonstrated. Be specific in feedback - quote the student where useful, point to what's missing, and say what an A-grade response would have added.

Output STRICT JSON only. No markdown fences.`;
    const userMsg = `LESSON: "${found.lesson.title}" (unit: "${found.unit.title}")
COURSE: "${curriculum.title}"

PROMPT:
"""
${block.prompt || ''}
"""

RUBRIC (grade each criterion 0-100; weights are relative):
${rubricLines}

STUDENT SUBMISSION:
"""
${String(text).slice(0, 6000)}
"""

Return JSON:
{
  "perRubric": [
    { "label": "<must match rubric label>", "score": <0-100>, "note": "<1-2 sentence justification, specific to what the student wrote>" }
  ],
  "feedback": "<3-5 sentences of overall feedback addressed to the student. Mention 1 strength, 1-2 specific gaps, and one concrete next step.>"
}`;

    const result = await callGemini(system, [{ role: 'user', content: userMsg }], modelForUser(users[email], email), 1400, {
      jsonMode: true, temperature: 0.4,
    });
    if (!result.success) return res.status(500).json({ error: result.error });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.perRubric)) {
      return res.status(500).json({ error: 'Failed to grade submission' });
    }

    let total = 0, weightSum = 0;
    const perRubric = rubric.map(r => {
      const w = Number(r.weight) || 1;
      const match = parsed.perRubric.find(p => String(p.label).toLowerCase() === String(r.label).toLowerCase());
      const score = match ? Math.max(0, Math.min(100, Number(match.score) || 0)) : 0;
      total += score * w;
      weightSum += w;
      return { label: r.label, score, note: match?.note ? String(match.note).slice(0, 500) : '' };
    });
    const finalScore = weightSum > 0 ? Math.round(total / weightSum) : 0;

    block.submission = {
      text: String(text).slice(0, 6000),
      submittedAt: new Date().toISOString(),
      score: finalScore,
      letter: percentToLetter(finalScore),
      perRubric,
      feedback: String(parsed.feedback || '').slice(0, 2000),
    };
    block.score = finalScore;
    block.completedAt = block.submission.submittedAt;
    saveUsers(users);

    res.json({ submission: block.submission });
  } catch (e) {
    console.error('blocks/grade-open failed:', e);
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
// MIDTERMS / FINALS - course-level SRS exams
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
      ? `MISSED QUESTION POOL (every wrong answer the student gave across the course - use these as the spine):\n${missed.slice(0, 30).map((m, i) => `  ${i + 1}. [${m.unit} / ${m.lesson}] Q: ${m.prompt}\n     Picked: ${m.userPicked}  Correct: ${m.correctAnswer}\n     Why: ${m.explanation}`).join('\n')}`
      : `(The student got every quiz right so far. Push harder: write ${questionCount} application/synthesis questions integrating the whole course.)`;

    const sys = `You write a ${kind === 'final' ? 'final exam' : 'midterm'} for a course. ${questionCount} multiple-choice questions, integrating concepts across the whole course. Output ONLY valid JSON - no markdown, no fences.`;
    const prompt = `Course: "${curriculum.title}".
${curriculum.description ? `Course description: ${curriculum.description}\n` : ''}Difficulty: ${curriculum.difficulty || 'intermediate'}.
Units covered:
${(curriculum.units || []).map((u, i) => `  ${i + 1}. ${u.title}${u.description ? ` - ${u.description}` : ''}`).join('\n')}

${missedBlock}

Write ${questionCount} multiple-choice questions for the ${kind}.
- ${kind === 'final' ? '~70%' : '~60%'} should re-test the missed-concept areas above (DIFFERENT angle, harder than the original - never repeat verbatim).
- The rest must test synthesis - pulling concepts from MULTIPLE units together.
- ${kind === 'final' ? 'The final has 2-3 cumulative "boss" questions that demand application across 3+ units.' : 'The midterm leans on the FIRST half of the course material.'}

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).

Return JSON exactly:
{ "questions": [ ...${questionCount} total... ] }`;

    // Flash for speed - exams are 12-20 multiple-choice questions, no
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

    // examId might be `<cid>-midterm` or `<cid>-final` - locate accordingly.
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
    //     model must answer ONLY from those - no web fallback. So when
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

    // Parental block: if the active child has Study Mode disabled, refuse
    // at the API layer - the client also hides the icon, but this is the
    // backstop in case a child opens the URL directly.
    {
      const activeId = users[email].data?.parent?.activeStudentId;
      if (activeId) {
        const child = users[email].data.parent.students.find(s => s.id === activeId);
        if (child) {
          ensureStudentControls(child);
          if (!child.controls.allowChats || child.controls.blockedApps.includes('study')) {
            return res.status(403).json({ error: 'Study mode is disabled for this profile.' });
          }
        }
      }
    }

    // Find or create session
    let session = sessionId ? (users[email].data.studySessions || []).find(s => s.id === sessionId) : null;
    // Stamp the active child id onto new sessions so the parent chat
    // viewer can filter to "Maya's chats" vs "Leo's chats".
    const activeChildIdSC = users[email].data?.parent?.activeStudentId || null;
    if (!session) {
      session = {
        id: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        lastMessageAt: null,
        messages: [],
        context: context || {},
        studentId: activeChildIdSC,
      };
      users[email].data.studySessions.unshift(session);
    } else if (context && (context.curriculumId !== undefined || context.sources !== undefined)) {
      // Mid-session context updates: caller flipped on curriculum
      // integration or attached sources after the session started.
      // Merge into the persisted context so subsequent turns inherit it.
      session.context = { ...(session.context || {}), ...context };
    }

    session.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    session.lastMessageAt = new Date().toISOString();

    const _activeChildSM = (() => {
      const aid = users[email].data?.parent?.activeStudentId;
      return aid ? (users[email].data.parent.students || []).find(s => s.id === aid) : null;
    })();
    const systemPrompt = buildStudyModePrompt(
      users[email].data.profile, users[email].data.goals,
      users[email].data.curricula, users[email].data.preferences,
      users[email].data.assessmentHistory || [],
      session.context || null
    ) + buildChildGuardrails(_activeChildSM);

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

      // [MAKE_*] action tokens: create the real artifact(s), attach them
      // to the assistant message (so reloads restore the Open cards),
      // and stream each as a metadata event so the panel can render the
      // card before the user sees the bubble finish.
      try {
        const artifacts = await buildStudyArtifacts(fullContent, users[email].data);
        if (artifacts.length) {
          msg.artifacts = artifacts;
          for (const a of artifacts) {
            try { res.write(`data: ${JSON.stringify({ artifact: a })}\n\n`); } catch {}
          }
        }
      } catch (e) {
        console.error('buildStudyArtifacts error:', e);
      }

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
      // disableThinking: study chat is the "ask a question, get a quick
      // answer" surface - first-token latency dominates the perceived
      // speed. Web-search mode keeps thinking on so the model can plan
      // its searches; everything else skips the hidden CoT phase.
    }, tierModel, { enableWebSearch: !!req.sourced, disableThinking: !req.sourced });
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
    // Flash-Lite + disableThinking: cues are a fixed-shape, short JSON list;
    // Gemini 3's CoT here just burns latency without improving the keywords.
    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_FLASH_LITE, 1024, { jsonMode: true, temperature: 0.4, disableThinking: true });
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
    // Same speed trick as cue gen: tight summary, no need for CoT.
    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_FLASH_LITE, 1024, { jsonMode: true, temperature: 0.4, disableThinking: true });
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

// ===== NOTE MAPS (Obsidian-style knowledge graphs) =====
//
// A user has many `noteMaps`. The first one flagged `isDefault: true` is
// the auto-sync map - every existing note is mirrored as a node here so
// the canvas isn't empty for users who have notes but haven't opened the
// map. Other maps are user-curated.
//
// The legacy `noteGraph` field (single graph) is kept in sync with the
// default map for any older code path that still reads it.

const GRAPH_PALETTE = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb7185', '#c084fc'];
const MAP_PALETTE = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee'];

function ensureNoteMaps(userData) {
  if (!Array.isArray(userData.noteMaps) || userData.noteMaps.length === 0) {
    userData.noteMaps = [{
      id: 'default', name: 'Main Map', color: '#a78bfa',
      createdAt: Date.now(), isDefault: true, nodes: [], edges: [],
    }];
  }
  if (!userData.noteMaps.some(m => m.isDefault)) {
    userData.noteMaps[0].isDefault = true;
  }
  for (const m of userData.noteMaps) {
    if (!Array.isArray(m.nodes)) m.nodes = [];
    if (!Array.isArray(m.edges)) m.edges = [];
  }
  return userData.noteMaps;
}

function getDefaultMap(userData) {
  const maps = ensureNoteMaps(userData);
  return maps.find(m => m.isDefault) || maps[0];
}

function findMap(userData, mapId) {
  const maps = ensureNoteMaps(userData);
  return maps.find(m => m.id === mapId) || null;
}

// Legacy alias. The single-graph field mirrors the default map so any
// route still reading `noteGraph` keeps working.
function ensureNoteGraph(userData) {
  const def = getDefaultMap(userData);
  userData.noteGraph = { nodes: def.nodes, edges: def.edges };
  return def;
}

// Cleanup pass for a single map: drops note-backed nodes whose note was
// deleted, refreshes labels when a note title changes, and drops orphan
// edges. Does NOT auto-add nodes - pulling notes into a map is an
// explicit user action (client picks them with "Pull from notes").
function cleanupMap(map, notes) {
  let changed = false;
  const liveNoteIds = new Set(notes.map(n => n.id));
  const beforeLen = map.nodes.length;
  map.nodes = map.nodes.filter(n => n.source !== 'note' || liveNoteIds.has(n.noteId));
  if (map.nodes.length !== beforeLen) changed = true;

  const byNoteId = new Map(notes.map(n => [n.id, n]));
  for (const node of map.nodes) {
    if (node.source !== 'note') continue;
    const n = byNoteId.get(node.noteId);
    if (n && n.title && node.label !== n.title) {
      node.label = n.title;
      changed = true;
    }
  }

  const liveNodeIds = new Set(map.nodes.map(n => n.id));
  const beforeEdges = map.edges.length;
  map.edges = map.edges.filter(e => liveNodeIds.has(e.from) && liveNodeIds.has(e.to));
  if (map.edges.length !== beforeEdges) changed = true;
  return changed;
}

// Legacy helper kept so any older callsite still compiles. It now only
// cleans up - it never auto-adds note nodes.
function syncGraphWithNotes(userData) {
  const notes = Array.isArray(userData.notes) ? userData.notes : [];
  let changed = false;
  for (const map of ensureNoteMaps(userData)) {
    if (cleanupMap(map, notes)) changed = true;
  }
  return changed;
}

// Shared sanitize: enforce shape and size limits on a {nodes, edges} pair.
function sanitizeGraph(nodes, edges) {
  const safeNodes = (nodes || []).slice(0, 500).map(n => ({
    id: String(n.id || crypto.randomUUID()).slice(0, 80),
    noteId: n.noteId ? String(n.noteId).slice(0, 80) : null,
    label: String(n.label || 'Untitled').slice(0, 120),
    source: (n.source === 'note' || n.source === 'ai' || n.source === 'topic') ? n.source : 'topic',
    color: typeof n.color === 'string' ? n.color.slice(0, 24) : GRAPH_PALETTE[0],
    x: Number.isFinite(n.x) ? Number(n.x) : 0,
    y: Number.isFinite(n.y) ? Number(n.y) : 0,
  }));
  const liveIds = new Set(safeNodes.map(n => n.id));
  const seenEdgeKey = new Set();
  const safeEdges = [];
  for (const e of (edges || []).slice(0, 2000)) {
    const a = String(e.from || '');
    const b = String(e.to || '');
    if (!a || !b || a === b) continue;
    if (!liveIds.has(a) || !liveIds.has(b)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenEdgeKey.has(key)) continue;
    seenEdgeKey.add(key);
    safeEdges.push({ from: a, to: b, label: e.label ? String(e.label).slice(0, 60) : '' });
  }
  return { nodes: safeNodes, edges: safeEdges };
}

// ── Multi-map endpoints ─────────────────────────────────────────────
// GET /api/note-maps → list summaries (no node bodies).
app.get('/api/note-maps', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    syncGraphWithNotes(users[email].data);
    saveUsers(users);
    const maps = users[email].data.noteMaps.map(m => ({
      id: m.id,
      name: m.name,
      color: m.color,
      createdAt: m.createdAt,
      isDefault: !!m.isDefault,
      nodeCount: m.nodes.length,
      edgeCount: m.edges.length,
    }));
    res.json({ maps });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/note-maps → create a new (non-default) map.
app.post('/api/note-maps', authMiddleware, (req, res) => {
  try {
    const { name, color } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const plan = getPlan(users[email], email);
    const cap = LIMITS[plan]?.noteMaps ?? LIMITS.free.noteMaps;
    if (cap !== Infinity && users[email].data.noteMaps.length >= cap) {
      return res.status(402).json({
        error: 'note_map_limit_reached',
        message: `Your plan caps note maps at ${cap}. Upgrade for more.`,
        limit: cap, plan,
      });
    }
    const map = {
      id: `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: String(name || 'New Map').slice(0, 80) || 'New Map',
      color: typeof color === 'string' ? color.slice(0, 24) : MAP_PALETTE[users[email].data.noteMaps.length % MAP_PALETTE.length],
      createdAt: Date.now(),
      isDefault: false,
      nodes: [], edges: [],
    };
    users[email].data.noteMaps.push(map);
    saveUsers(users);
    res.json({ map });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/note-maps/:mid → full map body.
app.get('/api/note-maps/:mid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const map = findMap(users[email].data, req.params.mid);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    // Only the default map auto-syncs notes; others are user-curated.
    if (map.isDefault) {
      const changed = syncGraphWithNotes(users[email].data);
      if (changed) saveUsers(users);
    }
    res.json({ map });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/note-maps/:mid → update name / color / nodes / edges.
app.put('/api/note-maps/:mid', authMiddleware, (req, res) => {
  try {
    const { name, color, nodes, edges } = req.body || {};
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const map = findMap(users[email].data, req.params.mid);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    if (typeof name === 'string') map.name = name.slice(0, 80) || map.name;
    if (typeof color === 'string') map.color = color.slice(0, 24);
    if (Array.isArray(nodes) && Array.isArray(edges)) {
      const sanitized = sanitizeGraph(nodes, edges);
      map.nodes = sanitized.nodes;
      map.edges = sanitized.edges;
    }
    saveUsers(users);
    res.json({ map });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/note-maps/:mid → delete a map. Cannot delete the default.
app.delete('/api/note-maps/:mid', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const map = findMap(users[email].data, req.params.mid);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    if (map.isDefault) return res.status(400).json({ error: 'Cannot delete the default map.' });
    users[email].data.noteMaps = users[email].data.noteMaps.filter(m => m.id !== map.id);
    saveUsers(users);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Legacy single-graph endpoints (kept as aliases for the default map)
app.get('/api/note-graph', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const changed = syncGraphWithNotes(users[email].data);
    if (changed) saveUsers(users);
    const def = getDefaultMap(users[email].data);
    res.json({ graph: { nodes: def.nodes, edges: def.edges } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/note-graph', authMiddleware, (req, res) => {
  try {
    const { nodes, edges } = req.body || {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ error: 'nodes and edges must be arrays' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const def = getDefaultMap(users[email].data);
    const sanitized = sanitizeGraph(nodes, edges);
    def.nodes = sanitized.nodes;
    def.edges = sanitized.edges;
    saveUsers(users);
    res.json({ graph: { nodes: def.nodes, edges: def.edges } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Shared AI-suggestion helper used by both legacy and per-map suggest
// routes. Returns { suggestions } or a Response-ready { error }.
async function buildGraphSuggestions(userData, graph, { focus, focusNodeId, count }) {
  const n = Math.max(2, Math.min(8, Number(count) || 4));
  if (graph.nodes.length === 0 && !focus) {
    return { error: 'Add a note or a focus topic first.', status: 400 };
  }
  const notesById = new Map((userData.notes || []).map(nt => [nt.id, nt]));
  const contextBlobs = [];
  for (const node of graph.nodes.slice(0, 30)) {
    if (node.source !== 'note' || !node.noteId) continue;
    const note = notesById.get(node.noteId);
    if (!note) continue;
    const body = String(note.mainNotes || '').slice(0, 400);
    if (body) contextBlobs.push(`- ${node.label}: ${body.replace(/\s+/g, ' ').trim()}`);
  }
  const existingLabels = graph.nodes.map(n => n.label);
  const focusNode = focusNodeId ? graph.nodes.find(n => n.id === focusNodeId) : null;
  const system = 'You expand a student\'s study knowledge graph. Output ONLY valid JSON, no markdown, no preamble.';
  const userPrompt = [
    `Suggest ${n} NEW concept nodes to add to the graph.`,
    focusNode ? `Anchor the suggestions around the existing node "${focusNode.label}".` : '',
    focus && String(focus).trim() ? `Student wants more depth on: ${String(focus).trim()}` : '',
    existingLabels.length ? `Do NOT propose anything that duplicates an existing label. Existing labels:\n${existingLabels.map(l => `- ${l}`).join('\n')}` : '',
    contextBlobs.length ? `Excerpts from existing notes (use as context):\n${contextBlobs.join('\n')}` : '',
    '',
    'Return this exact JSON shape and nothing else:',
    '{"suggestions":[{"label":"short concept name (<=40 chars)","rationale":"one short sentence on why it belongs","connectTo":["label of existing node it relates to", "..."]}]}',
    'Each connectTo entry MUST exactly match an existing label. 1-3 connections per suggestion.',
  ].filter(Boolean).join('\n\n');
  const result = await callGemini(
    system,
    [{ role: 'user', content: userPrompt }],
    GEMINI_FLASH_LITE,
    1024,
    { jsonMode: true, temperature: 0.7, disableThinking: true },
  );
  if (!result.success) return { error: 'AI call failed', status: 500 };
  const parsed = parseAIJson(result.data.content?.[0]?.text || '');
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return { error: 'AI did not return suggestions', status: 500 };
  }
  const existingByLabel = new Map(graph.nodes.map(node => [node.label.toLowerCase(), node]));
  const suggestions = parsed.suggestions.slice(0, n).map((s, i) => {
    const rawLabel = String(s?.label || '').trim().slice(0, 60);
    if (!rawLabel) return null;
    if (existingByLabel.has(rawLabel.toLowerCase())) return null;
    const rawConnect = Array.isArray(s?.connectTo) ? s.connectTo : [];
    const connectIds = [];
    for (const targetLabel of rawConnect) {
      const m = existingByLabel.get(String(targetLabel || '').toLowerCase().trim());
      if (m) connectIds.push(m.id);
    }
    if (focusNode && !connectIds.includes(focusNode.id)) connectIds.unshift(focusNode.id);
    return {
      tempId: `sugg_${Date.now()}_${i}`,
      label: rawLabel,
      rationale: String(s?.rationale || '').slice(0, 200),
      connectTo: connectIds,
    };
  }).filter(Boolean);
  return { suggestions };
}

// Per-map suggest: scope AI suggestions to a specific map.
app.post('/api/note-maps/:mid/suggest', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const map = findMap(users[email].data, req.params.mid);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    if (map.isDefault) syncGraphWithNotes(users[email].data);
    const out = await buildGraphSuggestions(users[email].data, map, req.body || {});
    if (out.error) return res.status(out.status || 500).json({ error: out.error });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy single-graph suggest - now scoped to the default map.
app.post('/api/note-graph/suggest', authMiddleware, async (req, res) => {
  try {
    const { focus, focusNodeId, count } = req.body || {};
    void focus; void focusNodeId; void count;  // body passed through below
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    syncGraphWithNotes(users[email].data);
    const graph = getDefaultMap(users[email].data);
    const out = await buildGraphSuggestions(users[email].data, graph, req.body || {});
    if (out.error) return res.status(out.status || 500).json({ error: out.error });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== ASSESSMENTS =====

// One Flash-Lite call. Tight inline prompt that bypasses the verbose
// buildAssessmentPrompt helper. Retries once on parse failure with a
// shorter prompt so a single bad response doesn't surface as an error
// to the user.
async function generateAssessmentOnce({ topic, type, questionCount, difficulty, context }) {
  const isEssay = type === 'essay';
  const sys = 'Output ONLY valid JSON. No markdown, no preamble, no commentary. Just the JSON object.';
  // Optional note/source context - when present, the quiz must be grounded
  // in this text rather than the model's general knowledge of the topic.
  const ctxBlock = context && String(context).trim()
    ? `\n\nGROUND THE QUESTIONS IN THIS SOURCE MATERIAL - do NOT pull from outside knowledge. Every question must be answerable from the text below:\n"""\n${String(context).slice(0, 12000)}\n"""\n`
    : '';
  const usr = isEssay
    ? `Create an essay assessment on "${topic}" (${difficulty} level).${ctxBlock}
Return this exact JSON:
{"title":"Essay: ${topic}","type":"essay","prompt":"the essay question (1-2 sentences)","rubric":[{"criterion":"...","maxScore":5,"description":"..."},{"criterion":"...","maxScore":5,"description":"..."},{"criterion":"...","maxScore":5,"description":"..."}]}`
    : `Create ${questionCount} multiple-choice questions on "${topic}" (${difficulty} level). Each option starts with "A) ", "B) ", "C) ", or "D) ". The "correct" field is just the letter.${ctxBlock}
Return this exact JSON:
{"title":"Quiz: ${topic}","type":"quiz","questions":[{"id":"q1","question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":"why A is right"}]}`;

  // Tight maxOutputTokens - 2k is plenty for 5 short MCQs and forces
  // the model to wrap quickly instead of padding explanations.
  // disableThinking: Gemini 3's CoT on a one-shot JSON quiz add ~3-8s of
  // hidden-token latency without measurably improving question quality.
  const result = await callGemini(sys, [{ role: 'user', content: usr }], GEMINI_FLASH_LITE, 2048, { jsonMode: true, temperature: 0.5, disableThinking: true });
  if (!result.success) return null;
  const parsed = parseAIJson(result.data.content?.[0]?.text || '');
  if (!parsed) return null;
  // Sanity-check shape so a malformed response surfaces as null
  // rather than a half-broken assessment.
  if (isEssay) {
    if (!parsed.prompt) return null;
  } else {
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
  }
  return parsed;
}

app.post('/api/assessment/generate', authMiddleware, async (req, res) => {
  try {
    const { topic, type = 'quiz', questionCount = 5, difficulty = 'beginner', context = '' } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic required' });

    // First attempt.
    let parsed = await generateAssessmentOnce({ topic, type, questionCount, difficulty, context });
    // One retry if the first response didn't parse cleanly. Catches
    // the rare jsonMode hiccup without making the user click again.
    if (!parsed) parsed = await generateAssessmentOnce({ topic, type, questionCount, difficulty, context });
    if (!parsed) return res.status(502).json({ error: 'Could not generate. Try again.' });

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

    // ===== ESSAY PATH - AI grades against rubric =====
    if (assessment.type === 'essay') {
      const essayText = String(answers.essay || '').trim();
      if (!essayText) return res.status(400).json({ error: 'Essay text required' });
      if (essayText.length < 30) return res.status(400).json({ error: 'Essay must be at least 30 characters' });

      const rubric = Array.isArray(assessment.rubric) ? assessment.rubric : [];
      const rubricLines = rubric.map((r, i) =>
        `${i + 1}. ${r.criterion} (max ${r.maxScore || 5} pts) - ${r.description || ''}`
      ).join('\n') || '(no rubric provided - grade holistically out of 5 for organization, evidence, and analysis)';

      const sys = `You are a strict but fair essay grader. Grade the student's essay against the rubric. Output ONLY valid JSON - no markdown, no preamble.`;
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

      const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], GEMINI_FLASH, 2000, { jsonMode: true, temperature: 0.4 });
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
  // Only allow content starting with <svg or a single tag - reject anything else.
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
        s(1, 'content', 'The Problem',             '', ['Pain point 1', 'Pain point 2', 'Who feels it most'], 'Make it visceral - name the user.'),
        s(2, 'content', 'Our Solution',            '', ['Core feature', 'What makes us different', 'Why it works'], 'Demo here if you have one.'),
        s(3, 'content', 'Why Now',                 '', ['Shift 1', 'Shift 2', 'Shift 3'], 'Timing is everything.'),
        s(4, 'content', 'Traction',                '', ['Users / revenue', 'Growth rate', 'Notable signals'], 'Hard numbers only.'),
        s(5, 'content', 'The Team',                '', ['Founder 1 - role', 'Founder 2 - role', 'Advisors'], 'Why this team can win.'),
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
        s(3, 'content', 'Themes',               '', ['Theme 1 - supporting quote', 'Theme 2 - supporting quote'], ''),
        s(4, 'quote',   '"A resonant quote from the book."', '- Character / page #', [], ''),
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
    const list = (users[email].data.slideshows || []).map(s => {
      const first = (s.slides || [])[0];
      return {
        id: s.id, title: s.title, topic: s.topic,
        slideCount: (s.slides || []).length,
        createdAt: s.createdAt,
        palette: s.palette,
        font: s.font,
        firstSlide: first ? {
          id: first.id, layout: first.layout,
          elements: first.elements, background: first.background,
          title: first.title, body: first.body, accent: first.accent,
          eyebrow: first.eyebrow, subtitle: first.subtitle,
          bullets: first.bullets, items: first.items,
          imageDataUrl: first.imageDataUrl || null,
          html: first.html || '',
        } : null,
      };
    });
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
    // Heal legacy slides on read - runs the same mechanical contrast fixer
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

// Create a blank slideshow. Body: { title } - everything else defaults.
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
// pairings, positioning math) so what comes back is composable - we insert
// the returned `elements[]` as-is instead of synthesizing a boring
// title/bullets layout from scratch. The prompt is the difference between
// "looks like a form" and "looks designed."
const SLIDE_DESIGN_SYSTEM = `You are a senior presentation designer composing ONE information-dense slide. Your priority is CONTENT: every pixel of space should carry useful information. Visual decoration is secondary - but the slide must still look clean and professional, never ugly.

## Core philosophy
Function over form. A slide packed with substantive, well-organized text beats a sparse slide with a big icon. Audiences come for information, not aesthetics.

## Archetypes - 90% of slides should be CONTENT or COMPARISON
- CONTENT (default): title top-left, large body text block filling 60-70% of the canvas. Use whenever there is anything to explain.
- COMPARISON: title + two equal-width columns of dense text. Use for vs., before/after, pros/cons.
- SUMMARY: title + numbered or bulleted takeaway list. Use for recaps.
- QUOTE: large italic quote + attribution. ONLY when the slide IS a quote - not just to break things up.
- HERO: short punchy title + 1-sentence subtitle, NO body. Use ONLY for section openers and title slides - never for content.

Do NOT use HERO slides for content. Do NOT leave slides sparse just to look "designed".

## NO decorative graphics
- Do NOT output icon elements.
- Do NOT output shape elements.
- Do NOT output image elements.
- The ONLY allowed kind is "text". Every element must contain real, substantive prose or data.

## Composition rules
- Fill 75-90% of the canvas with text. Whitespace should be margins, not gaps.
- Padding: ≥4% from every edge.
- Background + text must have a WCAG contrast ratio of 4.5+. NON-NEGOTIABLE. Common safe pairings:
    light bg (#ffffff, #f9fafb, #fef3c7, #dbeafe, #d1fae5) ↔ dark text (#111827, #1f2937)
    dark bg (#0f172a, #1e293b, #111827, #1e1e2e, #2563eb) ↔ light text (#ffffff, #f3f4f6)
- One accent color allowed on the title only.
- Elements must NOT overlap.

## Font sizes
- Title: 38-52 (smaller = more title text fits)
- Subtitle / section label: 18-22
- Body / bullets: 17-21 (smaller so more lines fit)
- Captions: 13-16

Weights: 700 for titles, 500 for subtitles, 400 for body.

## Body text - this is the most important part
Body elements must contain COMPLETE SENTENCES. Each bullet/point should be 20-35 words explaining the concept in enough depth that someone who has never heard of the topic understands it. Do NOT write fragment labels. Do NOT write 3-word bullets. Write paragraphs or rich bullet lists.

## Coordinate system
x, y, w, h are PERCENTAGES of the slide (0-100). Each element stays within 3-97 on every axis. Elements must NOT overlap significantly.

## Packing text
Pack lines into ONE text element with "\\n" between them. Do NOT create one element per bullet. A body element should be w:88, h:65 or larger.

## Output
Return ONLY valid JSON - no markdown, no code fences, no commentary:
{
  "background": "#RRGGBB",
  "notes": "2-3 sentences of detailed speaker notes the presenter says aloud",
  "layout": "title" | "content" | "summary" | "quote" | "freeform",
  "elements": [
    { "kind": "text", "x": 6, "y": 8, "w": 88, "h": 12, "text": "...", "fontSize": 46, "fontWeight": "700", "italic": false, "underline": false, "align": "left", "color": "#RRGGBB" },
    { "kind": "text", "x": 6, "y": 24, "w": 88, "h": 68, "text": "...", "fontSize": 19, "fontWeight": "400", "italic": false, "underline": false, "align": "left", "color": "#RRGGBB" }
  ]
}

Typically 2-3 text elements per slide (title + body, or title + two columns). The body element should be large and full of detail. A good slide looks like a dense Wikipedia section rendered beautifully, not an airport billboard.`;

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
    const system = `You are a presentation content writer. Your priority is information density. Every slide should teach the viewer something substantive. Default to "content" layout unless the slide is purely a title/opener or a literal quote.

Output ONLY valid JSON - no markdown, no fences.`;
    const user = `Deck title: "${deck.title || 'Untitled'}".
Topic: "${topic}".

Compose the slide. Use "content" unless the topic is a section opener ("title") or a literal quote ("quote").

JSON shape:
{
  "title": "Short title under 10 words",
  "subtitle": "",
  "bullets": ["5-7 complete-sentence points, each 20-35 words - real teaching sentences that explain the concept in depth, not fragment labels. Empty array only for title/quote slides."],
  "notes": "2-4 sentences of detailed speaker notes that add context beyond the slide text",
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
      // Legacy field stays null - renderer uses theme default. Matches how
      // the bulk-generated slides work.
      background: null,
      elements: [],
    };

    deck.slides.splice(insertAfter + 1, 0, newSlide);
    saveUsers(users);
    console.log(`AI slide inserted at ${insertAfter + 1} - layout=${newSlide.layout}, ${newSlide.bullets.length} bullets`);
    res.json({ slideshow: deck, insertedAt: insertAfter + 1 });
  } catch (e) { console.error('AI slide error:', e); res.status(500).json({ error: e.message }); }
});

// ===== Programmatic slide-design validator =====
// The text-only "self critique" pass was unreliable - the AI would happily
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
// Hard minimum - 4.5 on anything. The "3.0 for large text" WCAG allowance
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
    if (maxFs < 32) issues.push('No dominant element - the largest text is under 32px. Make one element clearly the title (40+).');
    if (maxFs / Math.max(1, minFs) < 1.6) issues.push('Hierarchy is flat - the biggest text should be at least 1.6× the smallest.');
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
    // Direct page summary first - cleanest thumbnail match.
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
    // Already has a real URL (http/https/data: from paste) - keep.
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
      console.log(`Dropping image element - no match for queries: ${queries.join(' | ')}`);
    }
  }
  slide.elements = resolved;
  return slide;
}

// ============================================================
// Hand-designed slide template library. Each template is a complete,
// polished layout - positioning, typography, color pairings, everything -
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
    match: 'Comparison - side-by-side ideas, pro/con, before/after, option A vs option B.',
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

// Heuristic template picker - simple feature matching on the topic so the
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
  // Hero / section opener (short - likely a section title)
  if (t.split(/\s+/).length <= 4 && t.length < 40) return SLIDE_TEMPLATES.find(x => x.id === 'hero-light');
  // Default: classic content slide - text-first, no images
  return SLIDE_TEMPLATES.find(x => x.id === 'content-classic');
}

// Minimal copy-only prompt. The AI fills ONLY the slots the chosen
// template actually defines - no picking, no design.
function buildSlotPrompt(tmpl, topic, deckTitle) {
  const roleLines = tmpl.elements.map(el => {
    if (el.kind === 'image') return `- imageQuery (string) - a specific noun phrase for a web image search. Example: "Abraham Lincoln portrait"`;
    switch (el.role) {
      case 'title':    return `- title (string, under 10 words) - the slide's headline`;
      case 'subtitle': return `- subtitle (string, 1 short sentence) - supporting line`;
      case 'body':     return `- body (string) - 5-7 complete-sentence points SEPARATED BY \\n. Each point is 20-35 words that explains the concept in depth - not a label, a real sentence. No bullet characters.`;
      case 'stat':     return `- stat (string, under 12 chars) - the headline number/phrase (e.g. "42%", "147B")`;
      case 'quote':       return `- quote (string) - the actual quote text`;
      case 'attribution': return `- attribution (string) - the speaker/source (e.g. "- Abraham Lincoln")`;
      case 'colA':     return `- colA (string) - content for the left column. 3-4 complete-sentence points separated by \\n, each 20-30 words.`;
      case 'colB':     return `- colB (string) - content for the right column. 3-4 complete-sentence points separated by \\n, each 20-30 words.`;
      default:         return `- ${el.role} (string)`;
    }
  }).join('\n');

  return `Deck title: "${deckTitle}".
Topic for THIS slide: "${topic}".
Archetype: ${tmpl.id} - ${tmpl.match}

Write the slide's copy. Fill every slot below with ACTUAL content about the topic - do NOT return placeholder text, instructions, or empty strings. If you can't think of content for a slot, invent plausible content for the topic.

Required slots (exact keys):
${roleLines}

Also include "notes" (string) - 1-2 sentences of speaker notes.

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
  // Drop text elements the AI left empty - keeps the design clean.
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
// content (title, bullets, notes, layout) - no positioning, no design
// yet. This gives the design pass the same anchor material that the
// improve flow naturally has (the slide the user already built),
// so both paths produce equally good final layouts.
async function draftSlideContent(topic, model) {
  const system = 'You are a presentation content writer. Output ONLY valid JSON. No markdown, no commentary.';
  const user = `Draft the CONTENT for a single slide about: "${topic}". Default to "content" layout unless the slide is purely a title/section opener or a quote. Every slide should be information-dense.

Return this exact shape:
{
  "title": "Short slide title under 10 words",
  "subtitle": "Optional 1-sentence supporting line, or empty string",
  "bullets": ["5-7 complete-sentence points, each 20-35 words, explaining the concept in depth - not fragment labels, real teaching sentences. Use empty array only for title/quote slides."],
  "notes": "2-4 sentences of detailed speaker notes that elaborate on the body content",
  "layout": "title" | "content" | "summary" | "quote" | "freeform",
  "imageIdea": ""
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
// (insert vs replace). Everything else - the design prompt, retry loop,
// validation, auto-fix, image resolution, searchQuery cleanup - is
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
      ? `\nThe previous draft had THESE issues - fix EVERY one of them:\n- ${lastIssues.join('\n- ')}\n`
      : '';
    const priorBlock = priorSlide
      ? `\nCurrent slide you are improving:\n${JSON.stringify(priorSlide)}\n`
      : '';
    const user = `${seedContext}${priorBlock}${issueBlock}
Compose a single slide about: "${topic}". Output ONLY the design-system JSON - background, notes, layout, elements[].`;

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

  // Loop exhausted - auto-fix the least-bad draft.
  const fallback = bestCandidate ? autoFixSlide(bestCandidate) : null;
  return { slide: fallback, attempts: 4, issues: lastIssues || [], autoFixed: true };
}

// Clamps, validates, and normalizes an AI-composed slide. Critically:
// ALWAYS persists an explicit background. Without one, the client
// fell back to the app theme - and the validator's assumption of white
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
  // Always run the mechanical contrast fixer - guarantees no unreadable
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
- Look at the IMAGE, not just the JSON - trust what you see.
- If the text is unreadable on the background, fix it by changing the element color AND/OR the slide background.
- If an element is cut off, overlapping another element, or visually cramped, reposition it.
- If the hierarchy is flat, bump the most-important element's fontSize.
- Keep it MINIMAL - only patch elements that actually need it.
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
// Body: { title?, subtitle?, slides? } - slides is the full replacement array.
// Retroactively re-design every slide in an existing deck via the bespoke
// HTML pipeline. Useful for decks generated before HTML design was added -
// or for fixing up a deck where the user wants a fresh look without
// changing the content.
app.post('/api/slideshows/:id/redesign', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Not found' });
    const model = modelForUser(users[email], email);
    const stats = await generateBespokeHtmlForDeck({ deck, model });
    deck.htmlDesigned = stats.generated;
    saveUsers(users);
    res.json({ slideshow: deck, stats });
  } catch (e) {
    console.error('[slideshow-redesign] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/slideshows/:id', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const deck = (users[email].data.slideshows || []).find(s => s.id === req.params.id);
    if (!deck) return res.status(404).json({ error: 'Not found' });

    const { title, subtitle, slides, palette, font } = req.body || {};
    if (title !== undefined) deck.title = String(title).slice(0, 200);
    if (subtitle !== undefined) deck.subtitle = String(subtitle).slice(0, 300);
    const VP = ['ink','newsprint','ocean','forest','plum','coral','mono','sun','midnight','slate','rose','sage'];
    const VF = ['editorial','modern','humanist','geometric'];
    if (palette && VP.includes(palette)) deck.palette = palette;
    if (font && VF.includes(font)) deck.font = font;
    if (Array.isArray(slides)) {
      const ALL_LAYOUTS = ['title','agenda','section','hero','content','bullets','cards','numbered','compare',
        'twoCol','split','stat','quote','bigText','summary','imageHero','imageRight','imageLeft','imageFull','freeform'];
      const validColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : null;
      deck.slides = slides.slice(0, 40).map((s, i) => ({
        id: s.id || `${deck.id}-${i}`,
        layout: ALL_LAYOUTS.includes(s.layout) ? s.layout : 'content',
        eyebrow: String(s.eyebrow || '').slice(0, 80),
        title: String(s.title || '').slice(0, 240),
        subtitle: String(s.subtitle || '').slice(0, 300),
        body: String(s.body || '').slice(0, 3000),
        bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 10).map(b => String(b).slice(0, 500)) : [],
        items: Array.isArray(s.items) ? s.items.slice(0, 8).map(it => ({ label: String(it?.label||'').slice(0,80), body: String(it?.body||'').slice(0,600) })) : [],
        accent: String(s.accent || '').slice(0, 80),
        imagePrompt: String(s.imagePrompt || '').slice(0, 400),
        notes: String(s.notes || '').slice(0, 2000),
        imageDataUrl: s.imageDataUrl ? String(s.imageDataUrl).slice(0, 5_000_000) : '',
        // Preserve bespoke HTML so saves don't wipe the LLM-designed render
        // path. Cap at 60k like the sanitizer to be safe.
        html: s.html ? String(s.html).slice(0, 60_000) : '',
        background: validColor(s.background) || null,
        freeform: !!s.freeform,
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
            // SVG markup - scripts/event handlers stripped.
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

// AI image generation for slideshow slides.
// Returns a base64 data URL via Gemini's image-generation model.
app.post('/api/images/generate', authMiddleware, async (req, res) => {
  try {
    if (!genAI) return res.status(500).json({ error: 'AI not configured' });
    const { prompt } = req.body || {};
    if (!String(prompt || '').trim()) return res.status(400).json({ error: 'prompt required' });

    const safePrompt = String(prompt).slice(0, 400);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Create a clean, visually striking image for a presentation slide about: ${safePrompt}. Style: modern, minimal, high-contrast. No text overlays. Cinematic composition, editorial photography quality.` }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    });
    const parts = result?.response?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return res.json({ imageDataUrl: `data:${mime};base64,${part.inlineData.data}` });
      }
    }
    return res.status(500).json({ error: 'No image returned by model' });
  } catch (e) {
    console.error('Image gen error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== Slideshow theme/font tokens (mirrored from client) =====
// Kept in sync with src/components/desktop/apps/SlideshowApp.jsx so the
// HTML-design prompt knows the actual color and typography palette the
// renderer will apply. If these drift, slides will look off - keep them
// in lock-step.
const SLIDESHOW_THEMES = {
  newsprint: { mode: 'light', bg: '#fbf7f0', surface: '#f3ece0', border: '#d8cbb1', text: '#1a1a1a', muted: '#5b5443', faint: '#a8a08c', accent: '#9b1c1c', accent2: '#1a3a5c', font: 'editorial' },
  ink:       { mode: 'light', bg: '#ffffff', surface: '#f4f4f5', border: '#e4e4e7', text: '#0a0a0a', muted: '#52525b', faint: '#a1a1aa', accent: '#2563eb', accent2: '#0f172a', font: 'modern'    },
  mono:      { mode: 'light', bg: '#f5f5f4', surface: '#e7e5e4', border: '#d6d3d1', text: '#1c1917', muted: '#57534e', faint: '#a8a29e', accent: '#1c1917', accent2: '#78716c', font: 'geometric' },
  sun:       { mode: 'light', bg: '#fef9e7', surface: '#fef3c7', border: '#facc15', text: '#1f1300', muted: '#78350f', faint: '#a16207', accent: '#d97706', accent2: '#b45309', font: 'humanist'  },
  sage:      { mode: 'light', bg: '#f3f7f2', surface: '#e0ebe0', border: '#a7c4a3', text: '#0e1f0e', muted: '#3f5b3d', faint: '#6b8e69', accent: '#15803d', accent2: '#0e3d20', font: 'humanist'  },
  rose:      { mode: 'light', bg: '#fdf2f8', surface: '#fce7f3', border: '#f9a8d4', text: '#3a0e2c', muted: '#831843', faint: '#be185d', accent: '#be185d', accent2: '#831843', font: 'editorial' },
  midnight:  { mode: 'dark',  bg: '#0a0a16', surface: '#13132a', border: '#2a2a4a', text: '#ffffff', muted: '#a5b4fc', faint: '#6b7280', accent: '#a78bfa', accent2: '#7c3aed', font: 'modern'    },
  slate:     { mode: 'dark',  bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f8fafc', muted: '#cbd5e1', faint: '#64748b', accent: '#38bdf8', accent2: '#0ea5e9', font: 'geometric' },
  ocean:     { mode: 'dark',  bg: '#02132f', surface: '#0a2547', border: '#1e3a5f', text: '#f0f9ff', muted: '#7dd3fc', faint: '#38bdf8', accent: '#22d3ee', accent2: '#0891b2', font: 'modern'    },
  forest:    { mode: 'dark',  bg: '#06140e', surface: '#0e2419', border: '#1e3d2c', text: '#f0fdf4', muted: '#86efac', faint: '#4ade80', accent: '#4ade80', accent2: '#16a34a', font: 'humanist'  },
  plum:      { mode: 'dark',  bg: '#1a0b1d', surface: '#2d1230', border: '#4a2050', text: '#fdf4ff', muted: '#e9d5ff', faint: '#c084fc', accent: '#f0abfc', accent2: '#c026d3', font: 'editorial' },
  coral:     { mode: 'dark',  bg: '#1a0808', surface: '#2a0d0d', border: '#4a1818', text: '#fff7ed', muted: '#fed7aa', faint: '#fb923c', accent: '#fb7185', accent2: '#f43f5e', font: 'editorial' },
};
const SLIDESHOW_FONTS = {
  editorial: { head: '"Fraunces", "Playfair Display", Georgia, serif',     body: '"Inter", system-ui, sans-serif' },
  modern:    { head: '"Space Grotesk", "Inter", system-ui, sans-serif',    body: '"Inter", system-ui, sans-serif' },
  humanist:  { head: '"Lora", "Source Serif 4", Georgia, serif',           body: '"Inter", system-ui, sans-serif' },
  geometric: { head: '"Manrope", "Inter", system-ui, sans-serif',          body: '"Manrope", "Inter", system-ui, sans-serif' },
};

// HTML sanitiser. We trust Gemini broadly but strip the obvious foot-guns:
// scripts, on* event handlers, javascript: URLs, external <link>/<script>
// references. Whitelist <img src> to https/data URLs only. Keep everything
// else - Gemini's <style> blocks, <svg>, <div>, etc. are fine.
function sanitizeSlideHtml(raw) {
  if (!raw) return '';
  let html = String(raw).slice(0, 60_000);
  // Strip markdown fences if the model wrapped its output despite our ask.
  html = html.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Strip <script>…</script> entirely.
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Strip <link> / <meta> / <iframe> tags entirely.
  html = html.replace(/<(link|meta|iframe|object|embed)\b[^>]*>/gi, '');
  // Remove any on* event handler attributes.
  html = html.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  // Strip javascript: URLs anywhere.
  html = html.replace(/javascript\s*:/gi, '');
  // Strip @import in <style> - would let model fetch external CSS.
  html = html.replace(/@import\b[^;]*;?/gi, '');
  // Strip url(...) references that aren't data: or https: (no http://, no //)
  // Allow {{IMAGE}} placeholder verbatim.
  html = html.replace(/url\(\s*["']?(?!(data:|https:|\{\{IMAGE\}\}))[^"')]+["']?\s*\)/gi, 'none');
  return html.trim();
}

// Compare the model's HTML output against the source slide content and
// flag whichever required fields were dropped. Most common failure mode:
// the model writes a title + decoration and forgets the body/bullets,
// leaving a near-empty slide.
//
// "Present" is a substring test on visible text (HTML tags stripped, case
// insensitive). For body we sample the first ~20 chars - covers fragmented
// rendering like <span>Struct</span>ured knowledge. For bullets/items we
// require at least the leading word of each to appear.
function checkSlideContentPresent(html, slide) {
  if (!html) return { ok: false, missing: ['html'] };
  // Strip tags, normalise whitespace, lowercase for substring matching.
  const visible = String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const has = (needle) => {
    const s = String(needle || '').trim().toLowerCase();
    if (!s) return true;
    // Match on the first 24 chars (or full string if shorter) - enough to
    // disambiguate, short enough to survive minor punctuation rewrites.
    return visible.includes(s.slice(0, Math.min(24, s.length)));
  };
  const missing = [];
  // Title is required on every layout that has one.
  if (slide.title && !has(slide.title)) missing.push('title');
  // Layouts where body is the whole point - missing body = empty slide.
  const bodyRequired = !['title', 'section', 'bigText', 'quote'].includes(slide.layout);
  if (bodyRequired && slide.body && slide.body.length > 20 && !has(slide.body)) missing.push('body');
  // Bullets / items: require ≥70% present.
  if (Array.isArray(slide.bullets) && slide.bullets.length) {
    const hit = slide.bullets.filter(b => has(b)).length;
    if (hit / slide.bullets.length < 0.7) missing.push(`bullets (${hit}/${slide.bullets.length})`);
  }
  if (Array.isArray(slide.items) && slide.items.length) {
    const hit = slide.items.filter(it => has(it.label) || has(it.body)).length;
    if (hit / slide.items.length < 0.7) missing.push(`items (${hit}/${slide.items.length})`);
  }
  return { ok: missing.length === 0, missing };
}

// Pre-pass: one Pro call that writes a deck-wide design brief - shared mood,
// type scale, motif, accent rules, diagram style. Every per-slide call is
// then handed this brief so the 10 slides feel like one deck instead of 10
// random web pages. This is the single biggest visual-quality lever; on its
// own it noticeably tightens the deck even without changing the per-slide
// model. Returns null on failure - per-slide calls then run without a brief.
async function generateDeckDesignBrief({ deck, theme, font }) {
  try {
    const p = buildDeckDesignBriefPrompt({ deck, theme, font });
    const r = await callGemini(p.system, [{ role: 'user', content: p.user }],
      GEMINI_PRO, 2500, { temperature: 0.6 });
    if (!r.success) {
      console.warn(`[slideshow-brief] FAILED: ${r.error}`);
      return null;
    }
    const text = String(r.data.content?.[0]?.text || '').trim();
    if (text.length < 200) {
      console.warn(`[slideshow-brief] too short (${text.length} chars), discarding`);
      return null;
    }
    console.log(`[slideshow-brief] generated (${text.length} chars)`);
    return text;
  } catch (e) {
    console.warn(`[slideshow-brief] THREW: ${e.message}`);
    return null;
  }
}

// Parallel bespoke HTML generation for every slide in the deck. Two-stage:
//   1. One Pro call writes a deck-wide design brief (shared mood, motif,
//      type scale, accent rules). Without this the deck reads as 10
//      unrelated designs; with it the deck has visual DNA.
//   2. Each slide is coded in parallel with the brief as shared context.
//      Pro model + 10k tokens lets the designer write rich SVG diagrams
//      and proper editorial layouts, not template fills.
// Failures fall back gracefully (slide.html stays empty and the renderer
// uses the template path).
async function generateBespokeHtmlForDeck({ deck, model, onProgress }) {
  const themeKey = (Object.keys(SLIDESHOW_THEMES).includes(deck.palette)) ? deck.palette : 'newsprint';
  const theme = SLIDESHOW_THEMES[themeKey];
  const fontKey = SLIDESHOW_FONTS[deck.font] ? deck.font : (theme.font || 'editorial');
  const font = SLIDESHOW_FONTS[fontKey];
  const total = deck.slides.length;
  // Per-slide HTML uses Flash, not Pro. Pro on 10k-token bespoke HTML output
  // aborted roughly half the time in practice - Pro is too slow for this
  // exact workload with the 360s ceiling. Flash + a Pro-written design
  // brief is both faster and far more reliable: the brief carries the
  // design intelligence, and Flash is plenty capable of implementing it.
  const designModel = GEMINI_FLASH;
  console.log(`[slideshow-html] starting design for ${total} slides on theme=${themeKey} font=${fontKey} model=${designModel}`);

  // Stage 1: deck-wide design brief (~15-30s on Pro).
  onProgress?.({ phase: 'Drafting design brief…', pct: 82 });
  const designBrief = await generateDeckDesignBrief({ deck, theme, font });
  onProgress?.({ phase: `Coding ${total} slides in HTML…`, pct: 86 });

  // Stage 2: per-slide HTML, parallel. Brief is shared context.
  // Each slide gets up to TWO attempts - if the first attempt drops content
  // (a real failure mode where the model writes just title + decoration),
  // we retry once with a more pointed prompt. Beats shipping an empty slide.
  let completed = 0;
  const tasks = deck.slides.map((slide, i) => (async () => {
    const tickProgress = () => {
      completed++;
      onProgress?.({ phase: `Designed ${completed}/${total} slides…`, pct: 86 + Math.floor((completed / total) * 10) });
    };
    const attempt = async (retryNote) => {
      const p = buildSlideHtmlPrompt({ slide, deck, theme, font, slideIndex: i, totalSlides: total, designBrief });
      const userMsg = retryNote ? `${p.user}\n\n# Retry note\n${retryNote}` : p.user;
      const r = await callGemini(p.system, [{ role: 'user', content: userMsg }],
        designModel, 10000, { temperature: 0.7 });
      if (!r.success) return { ok: false, error: r.error };
      const text = r.data.content?.[0]?.text || '';
      const cleaned = sanitizeSlideHtml(text);
      if (!cleaned || cleaned.length < 60) return { ok: false, error: 'empty response' };
      const presence = checkSlideContentPresent(cleaned, slide);
      if (!presence.ok) return { ok: false, error: 'missing content', cleaned, presence };
      return { ok: true, html: cleaned };
    };
    try {
      let result = await attempt(null);
      // Retry once if the model dropped required content (most common
      // quality regression - title + decoration with no body/bullets).
      if (!result.ok && result.error === 'missing content') {
        console.warn(`[slideshow-html] slide ${i} (${slide.layout}) missing content on attempt 1: ${result.presence.missing.join(', ')} - retrying`);
        result = await attempt(`Your previous attempt dropped these required fields: ${result.presence.missing.join(', ')}. Render them ALL in full. Do not output a title-only slide.`);
      }
      tickProgress();
      if (!result.ok) {
        console.warn(`[slideshow-html] slide ${i} (${slide.layout}) FAILED: ${result.error}${result.presence ? ' (' + result.presence.missing.join(', ') + ')' : ''}`);
        return { ok: false, error: result.error };
      }
      const cleaned = result.html;
      // Sanity: must contain a <div class="slide" or similar root.
      if (!cleaned.includes('class="slide"') && !cleaned.includes("class='slide'")) {
        return { ok: true, html: `<div class="slide" style="position:relative;width:100%;height:100%;background:${theme.bg};color:${theme.text};font-family:${font.body};overflow:hidden;">${cleaned}</div>` };
      }
      return { ok: true, html: cleaned };
    } catch (e) {
      tickProgress();
      console.warn(`[slideshow-html] slide ${i} (${slide.layout}) THREW: ${e.message}`);
      return { ok: false, error: e.message };
    }
  })());

  const results = await Promise.all(tasks);
  let successCount = 0;
  deck.slides = deck.slides.map((s, i) => {
    if (results[i]?.ok && results[i].html) {
      successCount++;
      return { ...s, html: results[i].html };
    }
    return s;
  });
  if (designBrief) deck.designBrief = designBrief;
  console.log(`[slideshow-html] ${successCount}/${total} slides bespoke-designed (brief=${designBrief ? 'yes' : 'no'})`);
  return { generated: successCount, total };
}

// ===== Slideshow auto-review (critic + reviser loop) =====
// Runs after the first-pass deck generation. The critic model produces a
// structured list of issues; the reviser model edits the deck to address
// each one. We loop up to MAX_REVIEW_PASSES (2) or until the critic
// returns "ship it" (no high-severity issues + score ≥ 9).
//
// We use the FLASH-LITE model for the critic - it's cheap, fast, and good
// at structured output. The reviser uses the same model the user picked
// for generation, since it needs to write quality prose.
const MAX_REVIEW_PASSES = 2;

async function reviewAndPolishDeck({ topic, parsed, model }) {
  const log = [];
  for (let pass = 1; pass <= MAX_REVIEW_PASSES; pass++) {
    let critique = null;
    try {
      const cp = buildSlideshowCriticPrompt({ topic, deck: parsed });
      const cr = await callGemini(cp.system, [{ role: 'user', content: cp.user }],
        GEMINI_FLASH, 3500, { jsonMode: true, temperature: 0.15 });
      if (!cr.success) {
        log.push({ pass, ok: false, reason: 'critic call failed', error: cr.error });
        break;
      }
      critique = parseAIJson(cr.data.content?.[0]?.text || '');
    } catch (e) {
      log.push({ pass, ok: false, reason: 'critic threw', error: e.message });
      break;
    }
    if (!critique || !Array.isArray(critique.issues)) {
      log.push({ pass, ok: false, reason: 'critic returned malformed JSON' });
      break;
    }

    const issues = critique.issues || [];
    const score = Number(critique.overallScore) || 0;
    const summary = String(critique.summary || '').slice(0, 200);
    const highCount = issues.filter(i => i.severity === 'high').length;
    log.push({ pass, ok: true, score, summary, issueCount: issues.length, highCount });
    console.log(`[slideshow-review] pass ${pass}: score=${score}, issues=${issues.length} (${highCount} high)`);

    // Ship-it threshold: nothing major and score is 9+. Or no issues at all.
    if (issues.length === 0 || (score >= 9 && highCount === 0)) {
      log[log.length - 1].verdict = 'ship';
      break;
    }

    // Run the reviser. Cap issues at 12 to keep the reviser focused.
    const trimmed = issues.slice(0, 12);
    let revised = null;
    try {
      const rp = buildSlideshowReviserPrompt({ topic, deck: parsed, issues: trimmed });
      const rr = await callGemini(rp.system, [{ role: 'user', content: rp.user }],
        model, 6000, { jsonMode: true, temperature: 0.3 });
      if (!rr.success) {
        log.push({ pass, ok: false, reason: 'reviser call failed', error: rr.error });
        break;
      }
      revised = parseAIJson(rr.data.content?.[0]?.text || '');
    } catch (e) {
      log.push({ pass, ok: false, reason: 'reviser threw', error: e.message });
      break;
    }
    if (Array.isArray(revised?.slides) && revised.slides.length === parsed.slides.length) {
      // Merge revised slides - preserve fields the reviser dropped.
      parsed.slides = parsed.slides.map((orig, idx) => {
        const r = revised.slides[idx] || {};
        return {
          ...orig,        // keep original fields as a baseline
          ...r,           // overwrite anything the reviser changed
          id: orig.id,    // never change the id
        };
      });
      log[log.length - 1].applied = true;
    } else {
      log.push({ pass, ok: false, reason: 'reviser returned wrong slide count' });
      break;
    }
  }
  return log;
}

app.post('/api/slideshows/improve-slide', authMiddleware, async (req, res) => {
  try {
    const { topic, slide, intent } = req.body || {};
    if (!slide) return res.status(400).json({ error: 'slide required' });

    const intentGuides = {
      sharpen: 'Tighten and sharpen - cut filler, prefer punchy, concrete wording. Aim for ~20% fewer words while keeping every fact.',
      expand: 'Add more substance - bring in concrete examples, numbers, or specifics. Bullets/items can grow up to one more line each. Do not pad with fluff.',
      engaging: 'Make it more engaging - open with a hook, use vivid concrete language, prefer active voice. Keep the facts; lift the energy.',
      bullets: 'Restructure into clear bullet points - convert body prose into 4-6 strong bullets, each starting with a key term in **bold**.',
      polish: 'Polish grammar, flow, and word choice. Fix any awkward phrasing. Do not change meaning or content.',
      simplify: 'Simplify - write so a smart non-expert gets it on first read. Shorter sentences, plain words, no jargon unless essential.',
    };
    const intentLine = intentGuides[intent] || 'Rewrite to be clearer, more impactful, and more substantive.';

    const system = `You are an expert presentation editor. Given a single slide's content, rewrite it according to the user's specific intent below. Keep the same layout and general structure. Return ONLY valid JSON matching exactly the same fields provided - no extra keys, no commentary.

User intent: ${intentLine}

Rules:
- Titles: punchy, concrete, ≤ 8 words
- Body prose: dense, specific, no filler - every sentence must earn its place. Prefer active voice.
- Bullets: each starts with a strong verb or key term in **bold**, followed by a concise factual sentence
- Items (cards/numbered): label ≤ 4 words, body 1-2 tight sentences with a concrete detail
- Preserve the layout field exactly`;

    const user = `Topic context: "${topic || 'unknown'}"\n\nSlide to improve:\n${JSON.stringify(slide, null, 2)}\n\nReturn the improved slide as JSON with the same fields.`;

    const result = await callGemini(system, [{ role: 'user', content: user }], GEMINI_PRO, 4096, { jsonMode: true, temperature: 0.5 });
    if (!result.success) return res.status(500).json({ error: result.error });

    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed) return res.status(500).json({ error: 'AI response was malformed' });

    return res.json({ slide: parsed });
  } catch (e) {
    console.error('improve-slide error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/slideshows/generate', authMiddleware, async (req, res) => {
  // SSE keeps the connection alive past Render's 30s proxy timeout.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); res.flush?.(); } catch {} };
  // Heartbeat every 8s - prevents Render's 30s idle-connection kill.
  const keepalive = setInterval(() => { try { res.write(': keepalive\n\n'); res.flush?.(); } catch {} }, 8000);

  try {
    const { topic, slideCount, difficulty, style, template, customInfo, sourceText, palette: userPalette, mode: genMode } = req.body || {};
    if (!topic?.trim()) { send({ type: 'error', error: 'Topic is required' }); return res.end(); }

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) { send({ type: 'error', error: 'User not found' }); return res.end(); }
    users[email].data = migrateUserData(users[email].data);

    send({ type: 'progress', phase: 'Drafting slides…', pct: 10 });
    const safeSourceText = sourceText ? String(sourceText).slice(0, 20000) : undefined;
    const { system, user } = genMode === 'flash'
      ? buildFlashSlideshowPrompt({ topic: topic.trim(), slideCount: Math.min(Number(slideCount) || 8, 10) })
      : buildSlideshowPrompt({ topic: topic.trim(), slideCount, difficulty, style, template, customInfo, sourceText: safeSourceText });
    // Flash: bumped to GEMINI_FLASH (not Lite) + 8k tokens so flash decks
    // can actually carry substantive bodies/bullets - Lite + 4k was capping
    // body fields at 1-2 sentences. Advanced: Pro + full prompt = ~90s.
    const model = genMode === 'flash' ? GEMINI_FLASH : GEMINI_PRO;
    console.log(`[slideshow-generate] mode=${genMode} model=${model}`);
    const maxTokens = genMode === 'flash' ? 8192 : 16384;
    let result = await callGemini(system, [{ role: 'user', content: user }], model, maxTokens, { jsonMode: true, temperature: 0.7 });
    if (!result.success) { send({ type: 'error', error: result.error }); return res.end(); }

    send({ type: 'progress', phase: 'Writing content…', pct: 38 });
    let parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed?.slides?.length) {
      send({ type: 'progress', phase: 'Retrying generation…', pct: 44 });
      const retry = await callGemini(system, [{ role: 'user', content: user }], model, maxTokens, { jsonMode: true, temperature: 0.4 });
      if (retry.success) parsed = parseAIJson(retry.data.content?.[0]?.text || '');
    }
    if (!parsed?.slides?.length) {
      send({ type: 'error', error: 'AI response was malformed. Try again.' }); return res.end();
    }

    // Flash skips review and bespoke HTML - one AI call, done in ~15s.
    let reviewLog = [];
    if (genMode !== 'flash') {
      send({ type: 'progress', phase: 'Reviewing content…', pct: 55 });
      reviewLog = await reviewAndPolishDeck({ topic: topic.trim(), parsed, model });
      send({ type: 'progress', phase: 'Applying revisions…', pct: 72 });
    }

    const VALID_LAYOUTS = [
      'title','hero','content','summary','quote','stat','twoCol','section','split','freeform',
      // Google-Slides-grade additions: structured layouts the prompt now produces.
      'agenda','bullets','cards','numbered','compare','bigText',
      // Image-forward layouts - picture is the visual element, not a wash.
      'imageHero','imageRight','imageLeft','imageFull',
    ];
    // Track HTML generation outcome so the client can show a status chip.
    let htmlGenStats = { generated: 0, total: 0 };
    const VALID_PALETTES = ['ink','newsprint','ocean','forest','plum','coral','mono','sun','midnight','slate','rose','sage'];
    const VALID_FONTS = ['editorial','modern','humanist','geometric'];
    const deckId = crypto.randomUUID();
    const deck = {
      id: deckId,
      title: parsed.title || topic,
      subtitle: parsed.subtitle || '',
      topic: topic.trim(),
      // Per-deck visual hints from the LLM. The renderer uses these to pick a
      // theme + font pairing automatically; user can still override in the UI.
      palette: VALID_PALETTES.includes(userPalette) ? userPalette : (VALID_PALETTES.includes(parsed.palette) ? parsed.palette : 'newsprint'),
      font: VALID_FONTS.includes(parsed.font) ? parsed.font : 'editorial',
      slides: parsed.slides.map((s, i) => ({
        id: `${deckId}-${i}`,
        layout: VALID_LAYOUTS.includes(s.layout)
          ? s.layout
          : (i === 0 ? 'title' : i === parsed.slides.length - 1 ? 'summary' : 'content'),
        eyebrow: String(s.eyebrow || '').slice(0, 60),
        title: String(s.title || '').slice(0, 240),
        subtitle: String(s.subtitle || '').slice(0, 300),
        body: String(s.body || '').slice(0, 3000),
        bullets: Array.isArray(s.bullets) ? s.bullets.slice(0, 10).map(b => String(b).slice(0, 500)) : [],
        // Structured items for cards / numbered / compare / agenda layouts.
        // Each item is {label, body} where label is a short header and body
        // is one short clause/sentence. Anything malformed is dropped silently.
        items: Array.isArray(s.items)
          ? s.items.slice(0, 6).map(it => ({
              label: String(it?.label || '').slice(0, 80),
              body:  String(it?.body  || '').slice(0, 600),
            })).filter(it => it.label || it.body)
          : [],
        accent: String(s.accent || '').slice(0, 60),
        imagePrompt: String(s.imagePrompt || '').slice(0, 240),
        notes: String(s.notes || '').slice(0, 1000),
      })),
      settings: { difficulty: difficulty || 'intermediate', style: style || 'educational' },
      // Auto-review trace: which passes ran, score per pass, issue counts.
      // Surfaced in the UI so the user can see what the AI critic flagged
      // and what the reviser fixed.
      reviewLog,
      createdAt: new Date().toISOString(),
    };

    // Flash skips bespoke HTML - uses template renderer, saves ~20s.
    if (genMode !== 'flash') {
      send({ type: 'progress', phase: 'Drafting design brief…', pct: 80 });
      try {
        htmlGenStats = await generateBespokeHtmlForDeck({
          deck,
          model,
          onProgress: ({ phase, pct }) => send({ type: 'progress', phase, pct }),
        });
        deck.htmlDesigned = htmlGenStats.generated;
      } catch (e) {
        console.warn('[slideshow-html] generation failed:', e.message);
        deck.htmlDesigned = 0;
      }
    }

    users[email].data.slideshows.unshift(deck);
    saveUsers(users);

    clearInterval(keepalive);
    send({ type: 'done', slideshow: deck });
    res.end();
  } catch (e) {
    clearInterval(keepalive);
    console.error('Slideshow generate error:', e);
    send({ type: 'error', error: e.message });
    res.end();
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
    // Check if they sent us one - auto-accept
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
// FILE EXTRACT - generic endpoint the chat composer hits when the user
// drops a PDF / text file. Returns the extracted plain text so the
// client can prepend it to the outgoing message. Images are NOT
// extracted here - they go through the existing inline_data path
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
// Stateless companion to /api/files/extract - fetches a single URL,
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
// CURRICULUM EDIT - text instruction + optional PDF/text attachments
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
    // history - that would blow the context, and we don't want the model
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
- DO NOT invent user progress fields like chatHistory, isCompleted, score, phase - the server preserves those on the client side.
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
// - PDF + URL ingestion at /api/files/extract and /api/sources/extract-url
// - replaces it for the "give me a course aligned to this PDF" flow.)

// ===== ADMIN =====

function isAdmin(userId) {
  // Owners (OWNER_EMAILS) always have admin access. Legacy fallback:
  // any social profile with the @goon handle stays admin too, since
  // existing tooling relied on that.
  const users = loadUsers();
  const email = findEmailById(users, userId);
  if (isOwner(email)) return true;
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
    const upgradeKind = result.plan === 'free' ? 'refer' : 'upgrade';
    const upgradeHint = upgradeKind === 'refer'
      ? 'Refer 2 friends to unlock Plus-Lite (free) for higher limits.'
      : 'Upgrade to the next plan for more daily messages.';
    return res.status(402).json({
      error: 'message_limit_reached',
      message: sourced
        ? `A sourced answer costs 2 messages and you only have ${result.remaining} left today. ${upgradeHint}`
        : `You've hit today's message limit (${result.limit}). ${upgradeHint}`,
      limit: result.limit, remaining: result.remaining, plan: result.plan, upgradeKind,
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

// Create a new standalone lesson (no AI generation - we just record the topic.
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
// STANDALONE-LESSON BLOCKS - same Claudius 4R/4Q + final SRS
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

    const difficulty = lesson.difficulty || 'beginner';
    const blockCount = LESSON_BLOCK_COUNT[difficulty] || LESSON_BLOCK_COUNT.intermediate;
    const middleCount = blockCount - 2;
    const sys = `You generate one complete lesson as ${blockCount} blocks. You pick the right MIX of block types for the topic - see the schema. Output ONLY valid JSON - no markdown, no fences, no commentary.`;
    const prompt = `Build a standalone lesson on "${lesson.topic || lesson.title}".
Difficulty: ${difficulty}.

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
  open:        {"type":"open","title":"...","prompt":"<markdown question, 1-3 sentences>","minWords":<40-80>,"rubric":[{"label":"...","criterion":"...","weight":<1-3>}, ...2-3 total...]}
  discussion:  {"type":"discussion","title":"...","prompt":"<the AI's opening question to the student, 1-2 sentences>","talkingPoints":["<concept the AI should make sure gets discussed>", ...3-5 total...]}
  matching:    {"type":"matching","title":"...","instructions":"<one-line how-to>","pairs":[{"term":"<short term>","definition":"<definition or example, 1 sentence>"}, ...5-7 pairs...]}
  fill-blank:  {"type":"fill-blank","title":"...","instructions":"<one-line how-to>","sentences":[{"before":"<text before the blank>","answer":"<single word or short phrase>","after":"<text after the blank>","hint":"<optional short hint>"}, ...4-6 sentences...]}

Markdown inside content/problem/prompt/solution: ## sub-headings, **bold**, lists, fenced code where useful, math via $...$ or $$...$$ if it fits.
Distractors in quizzes must be plausible.

Return JSON in this shape:
{ "blocks": [ <block 1>, <block 2>, ... <block ${blockCount}> ] }`;

    const maxTokens = blockCount >= 10 ? 12000 : 8192;
    const model = blockCount >= 10 ? GEMINI_PRO : GEMINI_FLASH;
    const result = await callGemini(sys, [{ role: 'user', content: prompt }], model, maxTokens, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Lesson generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length !== blockCount) {
      console.error('lessons blocks/generate parse failed. Got', parsed?.blocks?.length, 'blocks, expected', blockCount);
      return res.status(500).json({ error: `Lesson did not return ${blockCount} blocks. Try again.` });
    }

    const blocks = parsed.blocks.map((b, i) => stampBlock(lesson.id, b, i));

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
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length < 3) {
      return res.status(400).json({ error: 'Run blocks/generate first' });
    }
    const last = lesson.blocks[lesson.blocks.length - 1];
    if (last?.isFinal) return res.json({ block: last });

    const missed = collectMissedFromLesson(lesson);
    const missedBlock = missed.length
      ? `MISSED QUESTIONS FROM Q1-Q3 (use these as the spine of the final quiz - re-test the same concepts from a different angle, do NOT repeat the questions verbatim):\n${missed.map((m, i) => `  ${i + 1}. Prompt: ${m.prompt}\n     Student picked: ${m.userPicked}\n     Correct: ${m.correctAnswer}\n     Why it tripped them: ${m.explanation}`).join('\n')}`
      : `(The student got every Q1-Q3 question right. Push harder: 5 application / synthesis questions that integrate readings 1-4.)`;

    const sys = `You write the FINAL QUIZ for a lesson - a 5-question multiple-choice quiz that integrates the whole lesson. Output ONLY valid JSON.`;
    const prompt = `Lesson: "${lesson.topic || lesson.title}".
Difficulty: ${lesson.difficulty || 'beginner'}.

${missedBlock}

Write 5 multiple-choice questions:
- 3 of them must directly re-test the missed-concept areas from above (different angle, harder than the original question).
- 2 of them must test synthesis - pulling ideas from at least 2 different readings together.

Each question: a "prompt", 4 "choices" (no A) B) prefixes), an "answer" (the EXACT text of the correct choice), and an "explanation" (1-2 sentences naming the misconception each wrong option encodes).
Distractors must be plausible - each wrong option encodes a real misconception.

Return JSON exactly:
{ "questions": [ ...5 total... ] }`;

    const result = await callGemini(sys, [{ role: 'user', content: prompt }], GEMINI_FLASH, 4096, { jsonMode: true, temperature: 0.6 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Final quiz generation failed' });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'Final quiz returned no questions. Try again.' });
    }

    const block = stampBlock(lesson.id, { type: 'quiz', title: 'Final Quiz', questions: parsed.questions }, lesson.blocks.length, { isFinal: true });
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

// Standalone-lesson twin of the curriculum open-answer grader.
app.post('/api/lessons/:id/blocks/:bid/grade-open', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return res.status(400).json({ error: 'Submission must be at least 20 characters' });
    }
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const lesson = findLesson(users[email].data, req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const block = (lesson.blocks || []).find(b => b.id === req.params.bid);
    if (!block || block.type !== 'open') return res.status(404).json({ error: 'Open-answer block not found' });

    const rubric = Array.isArray(block.rubric) && block.rubric.length
      ? block.rubric
      : [{ label: 'Understanding', criterion: 'Demonstrates accurate understanding of the lesson concept.', weight: 1 }];

    const rubricLines = rubric.map((r, i) => `${i + 1}. [weight ${r.weight ?? 1}] ${r.label}: ${r.criterion}`).join('\n');
    const system = `You are a rigorous but fair teacher grading a short-form open-answer prompt embedded in a lesson. Score each rubric criterion 0-100 based on what the student actually demonstrated. Be specific in feedback.

Output STRICT JSON only.`;
    const userMsg = `LESSON: "${lesson.topic || lesson.title}".

PROMPT:
"""
${block.prompt || ''}
"""

RUBRIC (grade each criterion 0-100; weights are relative):
${rubricLines}

STUDENT SUBMISSION:
"""
${String(text).slice(0, 6000)}
"""

Return JSON: { "perRubric": [{"label":"...","score":<0-100>,"note":"..."}], "feedback": "3-5 sentences" }`;

    const result = await callGemini(system, [{ role: 'user', content: userMsg }], modelForUser(users[email], email), 1400, {
      jsonMode: true, temperature: 0.4,
    });
    if (!result.success) return res.status(500).json({ error: result.error });
    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed || !Array.isArray(parsed.perRubric)) {
      return res.status(500).json({ error: 'Failed to grade submission' });
    }

    let total = 0, weightSum = 0;
    const perRubric = rubric.map(r => {
      const w = Number(r.weight) || 1;
      const match = parsed.perRubric.find(p => String(p.label).toLowerCase() === String(r.label).toLowerCase());
      const score = match ? Math.max(0, Math.min(100, Number(match.score) || 0)) : 0;
      total += score * w;
      weightSum += w;
      return { label: r.label, score, note: match?.note ? String(match.note).slice(0, 500) : '' };
    });
    const finalScore = weightSum > 0 ? Math.round(total / weightSum) : 0;

    block.submission = {
      text: String(text).slice(0, 6000),
      submittedAt: new Date().toISOString(),
      score: finalScore,
      letter: percentToLetter(finalScore),
      perRubric,
      feedback: String(parsed.feedback || '').slice(0, 2000),
    };
    block.score = finalScore;
    block.completedAt = block.submission.submittedAt;
    saveUsers(users);
    res.json({ submission: block.submission });
  } catch (e) {
    console.error('lessons blocks/grade-open failed:', e);
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

// Chat (SSE) - free-form single-lesson teaching. No phases; AI decides when done via [LESSON_DONE].
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

      // Completion - AI-decided. Accepts [LESSON_DONE] (new) and [LESSON_COMPLETE] (legacy).
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
          // No JSON blob - still record a minimal completion so the client
          // gets a consistent shape to render the completion banner.
          lesson.completionData = lesson.completionData || { xpEarned: 20, summary: 'Lesson completed.' };
          users[email].data.profile.xp = (users[email].data.profile.xp || 0) + 20;
        }

        // Streak bookkeeping - defensive so a bad field can't kill the save below.
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

      // Always persist - whether the lesson completed or not, chat history
      // + isCompleted flag + streak updates all need to survive.
      try { saveUsers(users); } catch (e) { console.error('saveUsers failed:', e.message); }
    }, tierModel, { enableWebSearch: !!req.sourced });
  } catch (e) {
    console.error('Standalone lesson chat error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});


// =========================================================
// MATH TUTOR - single endpoint, stateless from the server's POV.
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
        // No server-side persistence - client holds state. Just consume the quota.
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
      usage: (() => {
        const d = users[email].data;
        const msgs = (d.usage?.msgWindow || []).reduce((n, e) => n + (e?.cost || 1), 0);
        const qb = (d.usage?.qbWindow || []).length;
        return {
          messages: msgs,
          quizBowlGames: qb,
          curricula: d.usage?.curricula || 0,
          debates: d.usage?.debates || 0,
          remainingMessages: pro ? null : Math.max(0, FREE_DAILY_MESSAGE_LIMIT - msgs),
          remainingQuizBowl: pro ? null : Math.max(0, FREE_DAILY_QUIZBOWL_GAMES - qb),
          remainingCurricula: pro ? null : Math.max(0, FREE_WEEKLY_CURRICULA - (d.usage?.curricula || 0)),
          remainingDebates: pro ? null : Math.max(0, FREE_WEEKLY_DEBATES - (d.usage?.debates || 0)),
        };
      })(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Public: pricing config - what the client needs to render the tier
// picker. Each entry tells the frontend whether the tier is buyable
// (priceId present) and how to label/price it.
// Per-user usage snapshot for the Upgrade popover.
// Returns the caller's current plan, the LIMITS row for it, AND how
// much they've already used in the current day / week buckets so the
// UI can render "X / Y" gauges per resource.
app.get('/api/billing/usage', authMiddleware, (req, res) => {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  ensureUsageBucket(users[email]);
  const plan = getPlan(users[email], email);
  const limits = LIMITS[plan] || LIMITS.free;
  const u = users[email].data;
  // Daily counters report the rolling 24h window.
  const msgUsed = (u.usage?.msgWindow || []).reduce((n, e) => n + (e?.cost || 1), 0);
  const qbUsed = (u.usage?.qbWindow || []).length;
  res.json({
    plan,
    limits,
    windowHours: 24,
    used: {
      dailyMessages: msgUsed,
      dailyQB: qbUsed,
      weeklyCurricula: u.usage?.curricula || 0,
      weeklyDebates: u.usage?.debates || 0,
      noteMaps: (u.noteMaps || []).length,
    },
  });
});

app.get('/api/billing/tiers', (req, res) => {
  res.json({
    tiers: {
      free: {
        id: 'free', label: 'Free', amountUsd: 0, interval: 'month', mode: null, buyable: false,
        limits: LIMITS.free,
      },
      // Referral unlock - never billed, never bought via Stripe. The
      // amountUsd is displayed as "value", not a price; the unlock copy
      // ("Refer 2 friends") is rendered on the client.
      'plus-lite': {
        id: 'plus-lite', label: 'Plus-Lite', amountUsd: 2, interval: 'month', mode: null,
        buyable: false, unlock: 'referral', referralsRequired: REFERRAL_THRESHOLD,
        limits: LIMITS['plus-lite'],
      },
      plus: {
        id: 'plus', label: 'Plus', amountUsd: TIER_PRICES.plus.amountUsd, interval: 'month',
        mode: TIER_PRICES.plus.mode, buyable: !!TIER_PRICES.plus.priceId,
        limits: LIMITS.plus,
      },
      lifetime: {
        id: 'lifetime', label: 'Lifetime', amountUsd: TIER_PRICES.lifetime.amountUsd, interval: 'once',
        mode: TIER_PRICES.lifetime.mode, buyable: !!TIER_PRICES.lifetime.priceId,
        limits: LIMITS.lifetime,
      },
      pro: {
        id: 'pro', label: 'Pro', amountUsd: TIER_PRICES.pro.amountUsd, interval: 'month',
        mode: TIER_PRICES.pro.mode, buyable: !!TIER_PRICES.pro.priceId,
        limits: LIMITS.pro,
      },
    },
  });
});

// ===== Referrals =====
// GET /api/referral/my-code - returns the caller's own code + how many
// people have redeemed it and how many more are needed to unlock the
// Plus-Lite tier. Client uses this on Settings + the top bar so the
// progress is visible.
app.get('/api/referral/my-code', authMiddleware, (req, res) => {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  const d = users[email].data;
  // migrate stamped a code if missing, but persist any new one.
  saveUsers(users);
  res.json({
    code: d.referralCode,
    referralsUsed: d.referralsUsed || 0,
    referralsRequired: REFERRAL_THRESHOLD,
    unlocked: (d.referralsUsed || 0) >= REFERRAL_THRESHOLD,
    redeemedCode: d.referredBy || null,
  });
});

// POST /api/referral/redeem { code } - current user redeems someone
// else's code. Rules:
//   - code is exactly REFERRAL_CODE_LEN alphanumeric chars
//   - code must exist on some other account
//   - caller hasn't redeemed any code before (one per lifetime)
//   - caller is not the owner of the code (no self-referral)
// On success: caller.referredBy = code, owner.referralsUsed += 1.
app.post('/api/referral/redeem', authMiddleware, (req, res) => {
  const raw = (req.body?.code || '').toString().toUpperCase().trim();
  if (!/^[A-Z0-9]{8}$/.test(raw)) {
    return res.status(400).json({ error: 'invalid_format', message: 'Codes are 8 letters or numbers.' });
  }
  const users = loadUsers();
  const myEmail = findEmailById(users, req.userId);
  if (!myEmail) return res.status(404).json({ error: 'User not found' });
  users[myEmail].data = migrateUserData(users[myEmail].data);

  // Already redeemed once? Hard stop - one redemption per user, forever.
  if (users[myEmail].data.referredBy) {
    return res.status(409).json({
      error: 'already_redeemed',
      message: 'You\'ve already used a referral code.',
      code: users[myEmail].data.referredBy,
    });
  }

  // Self-referral guard.
  if (users[myEmail].data.referralCode === raw) {
    return res.status(400).json({ error: 'self_referral', message: 'You can\'t redeem your own code.' });
  }

  // Find the owner.
  const ownerEmail = Object.keys(users).find(e => users[e].data?.referralCode === raw);
  if (!ownerEmail) {
    return res.status(404).json({ error: 'not_found', message: 'That code doesn\'t match any account.' });
  }
  users[ownerEmail].data = migrateUserData(users[ownerEmail].data);

  // Apply: stamp redemption + bump the owner's counter.
  users[myEmail].data.referredBy = raw;
  users[ownerEmail].data.referralsUsed = (users[ownerEmail].data.referralsUsed || 0) + 1;

  saveUsers(users);

  const ownerUnlocked = users[ownerEmail].data.referralsUsed >= REFERRAL_THRESHOLD;
  res.json({
    ok: true,
    redeemedCode: raw,
    ownerReferralsUsed: users[ownerEmail].data.referralsUsed,
    ownerUnlocked,
    // The redeemer doesn't get an instant boost themselves - they get
    // a tiny welcome bump (1 extra free message + 1 QB game today) so
    // the action feels rewarding. The owner gets the real prize.
    welcomeBonus: { messages: 1, quizBowlGames: 1 },
  });
});

// Create a Stripe Checkout session for a specific tier. Body shape:
//   { tier: 'plus' | 'pro' | 'lifetime' }
// Subscriptions use mode='subscription'; the one-time Lifetime charge
// uses mode='payment'. Legacy callers that POST no body still work -
// they fall back to the Pro monthly tier.
app.post('/api/billing/create-checkout-session', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const requestedTier = (req.body?.tier || 'pro').toLowerCase();
    const cfg = TIER_PRICES[requestedTier];
    if (!cfg) return res.status(400).json({ error: 'unknown_tier', tier: requestedTier });
    if (!cfg.priceId && !STRIPE_PRICE_ID) {
      return res.status(500).json({ error: `tier "${requestedTier}" has no Stripe price configured` });
    }

    // Reuse or create Stripe customer.
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

    const priceId = cfg.priceId || STRIPE_PRICE_ID;
    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const session = await stripe.checkout.sessions.create({
      mode: cfg.mode,
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?upgraded=1&tier=${requestedTier}`,
      cancel_url: `${origin}/?upgraded=0`,
      // The webhook reads `metadata.tier` to decide which plan to set
      // when a subscription event arrives - without it, a Plus
      // subscription would be indistinguishable from a Pro one.
      metadata: { userId: req.userId, tier: requestedTier },
      ...(cfg.mode === 'subscription'
        ? { subscription_data: { metadata: { userId: req.userId, tier: requestedTier } } }
        : {}),
      allow_promotion_codes: true,
    });
    res.json({ url: session.url, id: session.id, tier: requestedTier });
  } catch (e) {
    console.error('checkout session failed', e);
    res.status(500).json({ error: e.message });
  }
});

// Verify Stripe subscription status on-demand. Called by the frontend
// when the user returns from Checkout - works WITHOUT a configured
// webhook, which is why Pro wasn't activating before.
app.post('/api/billing/sync', authMiddleware, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    let customerId = users[email].data.stripeCustomerId;
    // Payment Link creates a fresh customer - look it up by email if we don't have one yet.
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
      // No active sub - but don't downgrade owner-granted Pro
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

    // Map a Stripe Price object → our internal tier id ('plus' | 'pro' |
    // 'lifetime'). Falls back to whatever tier metadata the checkout
    // session set ('tier' in subscription_data.metadata), then to 'pro'
    // for legacy events that predate the multi-tier setup.
    function tierFromPriceId(priceId, fallback = 'pro') {
      if (!priceId) return fallback;
      for (const [tier, cfg] of Object.entries(TIER_PRICES)) {
        if (cfg.priceId && cfg.priceId === priceId) return tier;
      }
      return fallback;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Payment Links create fresh Stripe customers - fall back to email lookup
      // so link-based payments still activate the right tier for the right user.
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
        const tier = session.metadata?.tier || (session.mode === 'payment' ? 'lifetime' : 'pro');
        if (tier === 'lifetime' || session.mode === 'payment') {
          // One-time Lifetime purchase - sticky forever, never expires.
          entry.user.data.plan = 'lifetime';
          entry.user.data.proGrantedBy = 'stripe';
          entry.user.data.lifetimePurchasedAt = new Date().toISOString();
          entry.user.data.proUntil = null;
        } else {
          // Subscription (Plus or Pro). The subscription.updated event
          // will refine proUntil to the actual period_end; we set a 35-day
          // grace here so the upgrade is felt immediately.
          entry.user.data.plan = (tier === 'plus') ? 'plus' : 'pro';
          entry.user.data.proGrantedBy = 'stripe';
          entry.user.data.stripeSubscriptionId = session.subscription || null;
          entry.user.data.proUntil = new Date(Date.now() + 35 * 86400000).toISOString();
        }
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
        // Lifetime trumps everything - don't downgrade a lifetime user
        // if a subscription event happens to flow through for them.
        if (entry.user.data.plan === 'lifetime' || entry.user.data.lifetimePurchasedAt) {
          saveUsers(users);
        } else {
          entry.user.data.stripeSubscriptionId = sub.id;
          const subPriceId = sub.items?.data?.[0]?.price?.id;
          const tier = sub.metadata?.tier || tierFromPriceId(subPriceId, 'pro');
          if (sub.status === 'active' || sub.status === 'trialing') {
            entry.user.data.plan = (tier === 'plus') ? 'plus' : 'pro';
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
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const entry = userByCustomer(sub.customer);
      if (entry) {
        entry.user.data = migrateUserData(entry.user.data);
        // Same lifetime guard - a deleted subscription shouldn't strip
        // a Lifetime grant.
        if (entry.user.data.plan !== 'lifetime' && !entry.user.data.lifetimePurchasedAt) {
          entry.user.data.plan = 'free';
          entry.user.data.proUntil = null;
          entry.user.data.stripeSubscriptionId = null;
        }
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

// Owner grant - body { userId|email, tier, until }. `tier` defaults to
// 'pro' for back-compat with the original /grant-pro semantics. Lifetime
// grants also stamp `lifetimePurchasedAt` so the user model treats them
// as permanent (not just a sub with no end date).
app.post('/api/owner/grant-pro', authMiddleware, ownerMiddleware, (req, res) => {
  const { userId, email: targetEmail, until, tier: requestedTier } = req.body || {};
  const tier = ['plus-lite', 'plus', 'pro', 'lifetime'].includes(requestedTier) ? requestedTier : 'pro';
  const users = loadUsers();
  let email = targetEmail && users[targetEmail] ? targetEmail : findEmailById(users, userId);
  if (!email) return res.status(404).json({ error: 'User not found' });
  users[email].data = migrateUserData(users[email].data);
  users[email].data.plan = tier;
  users[email].data.proGrantedBy = 'owner';
  users[email].data.proUntil = (tier === 'lifetime') ? null : (until || null);
  if (tier === 'lifetime') {
    users[email].data.lifetimePurchasedAt = users[email].data.lifetimePurchasedAt || new Date().toISOString();
  }
  saveUsers(users);
  res.json({ success: true, user: { email, plan: users[email].data.plan, proUntil: users[email].data.proUntil, lifetimePurchasedAt: users[email].data.lifetimePurchasedAt } });
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
  // Revoke clears Lifetime too - admin escape hatch for chargebacks /
  // refunds. The Stripe-side refund happens separately.
  users[email].data.lifetimePurchasedAt = null;
  saveUsers(users);
  res.json({ success: true });
});

// Check if current user is admin
app.get('/api/admin/check', authMiddleware, (req, res) => {
  res.json({ isAdmin: isAdmin(req.userId) });
});

// List all users
// Match any auto-created demo user - landing-page mini-OS spins up a
// throwaway user per tab, and the legacy `dev@covalent.test` fixture.
// We filter them out of the admin list so the panel isn't flooded.
function isDemoOrDevEmail(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('demo-landing-') || e.endsWith('@covalent.test') || e === 'dev@covalent.test';
}

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = loadUsers();
  const social = loadSocial();
  // ?includeDemo=1 - admin panel toggle to show/hide demo-landing-*
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
      // Study sessions (metadata only - full content via /chats/study/:sid)
      studySessions: (u.data?.studySessions || []).map(s => ({
        id: s.id, title: s.title, messageCount: (s.messages || []).length,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
      })),
      // Standalone Lessons app - include a summary of the generated
      // blocks so admins can see WHAT the lesson actually contains, not
      // just the title. Block bodies are trimmed to keep the payload sane.
      standaloneLessons: (u.data?.lessons || []).map(l => ({
        id: l.id, topic: l.topic, title: l.title, difficulty: l.difficulty,
        isCompleted: !!l.isCompleted, messageCount: (l.chatHistory || []).length,
        createdAt: l.createdAt, lastActiveAt: l.lastActiveAt,
        blockCount: (l.blocks || []).length,
        blocks: (l.blocks || []).slice(0, 40).map(b => ({
          type: b.type || 'text',
          title: b.title || b.heading || null,
          preview: typeof b.content === 'string'
            ? b.content.slice(0, 240)
            : typeof b.body === 'string'
              ? b.body.slice(0, 240)
              : typeof b.text === 'string'
                ? b.text.slice(0, 240)
                : null,
          score: b.score ?? null,
        })),
      })),
      // Curriculum lesson chats (flattened)
      curriculumChats,
      // Assessments (standalone quiz/essay tool)
      assessmentHistory: (u.data?.assessmentHistory || []).map(a => ({
        id: a.id, title: a.title, score: a.score, total: a.total, percentage: a.percentage, createdAt: a.createdAt,
      })),
      // Lesson in-block quiz scores (standalone Lessons app)
      lessonQuizResults: (u.data?.lessons || [])
        .filter(l => (l.blocks || []).some(b => b.type === 'quiz' && b.score != null))
        .map(l => ({
          lessonId: l.id,
          lessonTitle: l.title || l.topic || '(untitled)',
          overallScore: l.score ?? null,
          completedAt: l.lastActiveAt || l.createdAt || null,
          quizBlocks: (l.blocks || [])
            .filter(b => b.type === 'quiz' && b.score != null)
            .map(b => ({ title: b.title || 'Quiz', score: b.score })),
        })),
      // Curriculum lesson in-block quiz scores
      curriculumQuizResults: (u.data?.curricula || []).flatMap(c =>
        (c.units || []).flatMap(unit =>
          (unit.lessons || [])
            .filter(l => (l.blocks || []).some(b => b.type === 'quiz' && b.score != null))
            .map(l => ({
              curriculumTitle: c.title,
              unitTitle: unit.title,
              lessonTitle: l.title || '(untitled)',
              overallScore: l.score ?? null,
              quizBlocks: (l.blocks || [])
                .filter(b => b.type === 'quiz' && b.score != null)
                .map(b => ({ title: b.title || 'Quiz', score: b.score })),
            }))
        )
      ),
      // Streaks / daily activity
      studyStreaks: u.data?.studyStreaks || null,
      // Debate history - multiplayer / tournament matches the user has
      // finished. Recorded by recordDebateHistoryEntry on match end.
      // Lives on the user document (u.debateHistory), not under u.data.
      debateHistory: (u.debateHistory || []).slice(0, 50).map(d => ({
        code: d.code,
        topic: d.topic,
        mode: d.mode,
        finishedAt: d.finishedAt,
        mySide: d.mySide,
        myScore: d.myScore,
        opponent: d.opponent ? { name: d.opponent.name, side: d.opponent.side } : null,
        opponentScore: d.opponentScore,
        result: d.result,
        verdict: d.verdict ? {
          winner: d.verdict.winner,
          summary: typeof d.verdict.summary === 'string' ? d.verdict.summary.slice(0, 400) : null,
        } : null,
        turnCount: Array.isArray(d.turns) ? d.turns.length : 0,
        tournament: d.tournament || null,
      })),
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
  // Demo / dev accounts are hidden from the panel and cannot be deleted -
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
// QUIZ BOWL - Head-to-head buzz multiplayer.
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
// QBReader integration - pull real, human-written pyramidal tossups
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
// Pull the NAQT power mark "(*)" out of a tossup. Returns the cleaned
// display text plus the word index at the mark - the cutoff for +15
// vs +10 scoring. If the source has no mark, powerWordIndex is null
// and the question simply scores +10/-5/0 with no power bonus path.
// Recognises common variants: "(*)", "( * )", "( *)", "(* )".
function parseTossupText(raw) {
  if (!raw || typeof raw !== 'string') return { text: '', powerWordIndex: null };
  const text = raw.trim();
  const re = /\s*\(\s*\*\s*\)\s*/;
  const m = text.match(re);
  if (!m) return { text, powerWordIndex: null };
  const before = text.slice(0, m.index).trim();
  const after = text.slice(m.index + m[0].length).trim();
  const clean = (before + (after ? ' ' + after : '')).trim();
  const powerWordIndex = before.split(/\s+/).filter(Boolean).length;
  return { text: clean, powerWordIndex };
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
    const rawText = t.question_sanitized || qbStripHtml(t.question);
    const { text, powerWordIndex } = parseTossupText(rawText);
    const canonical = qbExtractCanonical(t.answer);
    const alternates = qbExtractAllAnswers(t.answer);
    return {
      text,
      powerWordIndex,
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

// ===== QUIZ BOWL HISTORY / RECOMMENDATIONS =====
//
// `quizbowlSets` lives on user.data - each completed solo set is saved
// here so the QuizBowl hub view can show past sets, category-level
// performance, and recommend training rounds against the player's
// weakest categories. Multiplayer matches are not saved here (those
// have their own lifecycle in the in-memory match registry).

const QB_CATEGORIES = ['Science', 'History', 'Literature', 'Geography', 'Math', 'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed'];

// Build a category accuracy map from a user's saved sets. Mixed gets
// split into its per-question categories so a single mixed round
// counts against every category it touched.
function computeQBCategoryStats(sets) {
  const out = {};
  for (const s of sets || []) {
    for (const q of s.perQuestion || []) {
      const cat = q.category || s.category || 'Mixed';
      if (!out[cat]) out[cat] = { correct: 0, total: 0 };
      out[cat].total++;
      if (q.correct) out[cat].correct++;
    }
  }
  return out;
}

// ============================================================
// SECRET STUDENT PROFILE
// ============================================================
// A hidden model of the student kept server-side, updated after every
// completed set. The student never sees this directly - it just biases
// the packet recommendations toward their actual weak spots.
// ============================================================

// Trim a tossup answer down to a stable key. QBReader answers come back
// with parenthetical pronouns, "or X" alternates, [accept Y] notes, and
// case variation - we collapse all of that so "(George) Washington" and
// "washington" map to the same answer-object.
function normalizeAnswerKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')      // [accept ...] notes
    .replace(/\([^)]*\)/g, ' ')       // (parenthetical)
    .replace(/\bor\b.*$/, ' ')        // "X or Y" → keep X only
    .replace(/<[^>]+>/g, ' ')         // any html tags
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// Score the student's "buzz style" from average buzz position.
// Earlier buzzes = more aggressive (and risk-tolerant), later = cautious.
function classifyBuzzStyle(avgPosition) {
  if (avgPosition <= 0) return 'unknown';
  if (avgPosition < 40) return 'aggressive';
  if (avgPosition < 70) return 'balanced';
  return 'cautious';
}

// Roll a single saved set into the student's secret profile. Mutates the
// profile in place. Safe to call on a fresh empty profile or a populated
// one - uses incremental averages so we never need to replay history.
function updateSecretProfile(profile, entry) {
  if (!profile || !entry || !Array.isArray(entry.perQuestion)) return;

  profile.categoryProfile = profile.categoryProfile || {};
  profile.answerProfile = profile.answerProfile || {};
  profile.totals = profile.totals || { sets: 0, questions: 0, correct: 0 };
  profile.buzzStyle = profile.buzzStyle || { avgPosition: 0, style: 'unknown', samples: 0 };

  profile.totals.sets++;

  const buzzPositions = [];

  for (const q of entry.perQuestion) {
    const cat = q.category || entry.category || 'Mixed';
    const correct = !!q.correct;

    profile.totals.questions++;
    if (correct) profile.totals.correct++;

    // --- Category profile (per-category rolling stats) ---
    const cp = profile.categoryProfile[cat] || {
      attempts: 0, correct: 0, accuracy: 0,
      recent: [],            // rolling window of last 30 booleans
      recentAccuracy: 0,
      lastSeenAt: null,
      buzzPositions: [],     // last 20 buzz positions (0-100)
      avgBuzzPosition: 0,
    };
    cp.attempts++;
    if (correct) cp.correct++;
    cp.accuracy = Math.round((cp.correct / cp.attempts) * 100);
    cp.recent.push(correct);
    if (cp.recent.length > 30) cp.recent.shift();
    cp.recentAccuracy = Math.round((cp.recent.filter(Boolean).length / cp.recent.length) * 100);
    cp.lastSeenAt = entry.finishedAt || new Date().toISOString();

    // Buzz position for this category - only count actual buzzes (>=0).
    if (typeof q.buzzWord === 'number' && q.buzzWord >= 0 && typeof q.totalWords === 'number' && q.totalWords > 0) {
      const pos = Math.round((q.buzzWord / q.totalWords) * 100);
      cp.buzzPositions.push(pos);
      if (cp.buzzPositions.length > 20) cp.buzzPositions.shift();
      cp.avgBuzzPosition = Math.round(cp.buzzPositions.reduce((a, b) => a + b, 0) / cp.buzzPositions.length);
      buzzPositions.push(pos);
    }
    profile.categoryProfile[cat] = cp;

    // --- Answer profile (per-answer-object mastery) ---
    const key = normalizeAnswerKey(q.correctAnswer || q.answer);
    if (key && key.length >= 3) {
      const ap = profile.answerProfile[key] || {
        category: cat, seen: 0, correct: 0, lastSeenAt: null,
        lastCorrect: null, recent: [],
      };
      ap.seen++;
      if (correct) ap.correct++;
      ap.lastCorrect = correct;
      ap.lastSeenAt = entry.finishedAt || new Date().toISOString();
      ap.recent.push(correct);
      if (ap.recent.length > 5) ap.recent.shift();
      profile.answerProfile[key] = ap;
    }
  }

  // --- Buzz style rollup ---
  if (buzzPositions.length) {
    const oldSamples = profile.buzzStyle.samples;
    const oldAvg = profile.buzzStyle.avgPosition;
    const newSamples = oldSamples + buzzPositions.length;
    const newSum = oldAvg * oldSamples + buzzPositions.reduce((a, b) => a + b, 0);
    profile.buzzStyle.avgPosition = Math.round(newSum / newSamples);
    profile.buzzStyle.samples = newSamples;
    profile.buzzStyle.style = classifyBuzzStyle(profile.buzzStyle.avgPosition);
  }

  // --- Derived: strengths, weaknesses, struggle/mastery topics ---
  // Categories with 5+ attempts qualify for strength/weakness ranking.
  const ranked = Object.entries(profile.categoryProfile)
    .filter(([, v]) => (v.attempts || 0) >= 5)
    .map(([cat, v]) => ({ category: cat, accuracy: v.accuracy, recentAccuracy: v.recentAccuracy, attempts: v.attempts }));

  profile.strengths = [...ranked]
    .filter(r => r.accuracy >= 70)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 5);

  profile.weaknesses = [...ranked]
    .filter(r => r.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  // Struggle: seen 2+ times, missed at least half. These are the
  // highest-leverage drill targets - the student keeps tripping on them.
  profile.struggleTopics = Object.entries(profile.answerProfile)
    .filter(([, v]) => v.seen >= 2 && v.correct / v.seen < 0.5)
    .sort(([, a], [, b]) => (a.correct / a.seen) - (b.correct / b.seen))
    .slice(0, 12)
    .map(([k, v]) => ({ topic: k, category: v.category, seen: v.seen, correct: v.correct }));

  // Mastery: seen 2+ times, got every recent attempt right.
  profile.masteryTopics = Object.entries(profile.answerProfile)
    .filter(([, v]) => v.seen >= 2 && v.recent.length >= 2 && v.recent.every(Boolean))
    .slice(0, 12)
    .map(([k, v]) => ({ topic: k, category: v.category, seen: v.seen }));

  profile.updatedAt = new Date().toISOString();
}

// Build a compact text block for Gemini that summarises the student. We
// keep it under ~30 lines so it fits comfortably in the recommendations
// prompt without blowing the token budget.
function buildSecretProfileContext(profile) {
  if (!profile || !profile.totals?.questions) return null;
  const lines = [];
  const totalAcc = profile.totals.questions
    ? Math.round((profile.totals.correct / profile.totals.questions) * 100) : 0;
  lines.push(`Overall: ${profile.totals.correct}/${profile.totals.questions} (${totalAcc}%) across ${profile.totals.sets} sets.`);

  if (profile.weaknesses?.length) {
    lines.push('Weak categories: ' + profile.weaknesses
      .map(w => `${w.category} ${w.accuracy}% (recent ${w.recentAccuracy}%, n=${w.attempts})`)
      .join('; '));
  }
  if (profile.strengths?.length) {
    lines.push('Strong categories: ' + profile.strengths
      .map(s => `${s.category} ${s.accuracy}% (n=${s.attempts})`)
      .join('; '));
  }
  if (profile.struggleTopics?.length) {
    lines.push('Specific answers the student keeps missing: ' +
      profile.struggleTopics.slice(0, 8).map(s => `"${s.topic}" (${s.category}, ${s.correct}/${s.seen})`).join(', '));
  }
  if (profile.masteryTopics?.length) {
    lines.push('Already mastered (skip): ' +
      profile.masteryTopics.slice(0, 8).map(m => `"${m.topic}"`).join(', '));
  }
  if (profile.buzzStyle?.style && profile.buzzStyle.style !== 'unknown') {
    lines.push(`Buzz style: ${profile.buzzStyle.style} (avg ${profile.buzzStyle.avgPosition}% through question, n=${profile.buzzStyle.samples}).`);
  }
  return lines.join('\n');
}

// Rebuild the entire secret profile from a user's saved sets. Used when
// migrating older accounts that have history but no profile yet.
function rebuildSecretProfileFromHistory(sets) {
  const profile = {
    version: 1, updatedAt: null,
    categoryProfile: {}, answerProfile: {},
    strengths: [], weaknesses: [],
    struggleTopics: [], masteryTopics: [],
    buzzStyle: { avgPosition: 0, style: 'unknown', samples: 0 },
    totals: { sets: 0, questions: 0, correct: 0 },
  };
  // sets are newest-first in storage; replay oldest-first so "recent"
  // windows actually reflect recency.
  const ordered = [...(sets || [])].reverse();
  for (const s of ordered) updateSecretProfile(profile, s);
  return profile;
}

// POST /api/quizbowl/sets - save a completed solo set. Body shape
// matches the on-disk record above; we backfill `id` + `finishedAt`
// so the client doesn't have to.
app.post('/api/quizbowl/sets', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const { category, difficulty, source, score, points, total, durationMs, perQuestion = [], categoryStats = null } = req.body || {};
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Invalid set' });

    const entry = {
      id: crypto.randomUUID(),
      category: category || 'Mixed',
      difficulty: difficulty || 'Medium',
      source: source === 'ai' ? 'ai' : 'qbreader',
      score: Number(score) || 0,
      points: Number.isFinite(points) ? Number(points) : null,
      total: Number(total) || 0,
      durationMs: Number(durationMs) || 0,
      finishedAt: new Date().toISOString(),
      perQuestion: Array.isArray(perQuestion) ? perQuestion.slice(0, 50) : [],
      categoryStats: categoryStats && typeof categoryStats === 'object' ? categoryStats : null,
    };

    users[email].data.quizbowlSets = users[email].data.quizbowlSets || [];
    users[email].data.quizbowlSets.unshift(entry);
    if (users[email].data.quizbowlSets.length > 200) {
      users[email].data.quizbowlSets = users[email].data.quizbowlSets.slice(0, 200);
    }

    // Roll category accuracy into profile.topicScores so other surfaces
    // (study mode strength prompts, dashboard, AI recommendations)
    // know this user is weak / strong in this area.
    const prof = users[email].data.profile;
    prof.topicScores = prof.topicScores || {};
    for (const q of entry.perQuestion) {
      const key = ('qb-' + (q.category || entry.category || 'mixed')).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const existing = prof.topicScores[key] || { score: 0, attempts: 0 };
      existing.attempts++;
      const pct = q.correct ? 100 : 0;
      existing.score = Math.round((existing.score * (existing.attempts - 1) + pct) / existing.attempts);
      existing.lastAttempt = new Date().toISOString();
      prof.topicScores[key] = existing;
    }
    // Refresh strengths/weaknesses derived lists (top + bottom topicScores)
    const allScores = Object.entries(prof.topicScores);
    prof.strengths = allScores.filter(([, v]) => (v.attempts || 0) >= 3 && v.score >= 75).map(([k]) => k).slice(0, 5);
    prof.weaknesses = allScores.filter(([, v]) => (v.attempts || 0) >= 3 && v.score < 60).map(([k]) => k).slice(0, 5);

    // Update the hidden student model. This is what packet recommendations
    // actually read - the student never sees it directly.
    if (!users[email].data.secretProfile) {
      users[email].data.secretProfile = rebuildSecretProfileFromHistory(users[email].data.quizbowlSets.slice(1));
    }
    updateSecretProfile(users[email].data.secretProfile, entry);

    saveUsers(users);
    res.json({ ok: true, set: entry });
  } catch (e) {
    console.error('QB save set error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quizbowl/sets - history with aggregate stats. Returns
// { sets, stats } so the client doesn't have to compute the rollups.
app.get('/api/quizbowl/sets', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const sets = users[email].data.quizbowlSets || [];
    const categoryStats = computeQBCategoryStats(sets);
    const totalQuestions = sets.reduce((s, x) => s + (x.total || 0), 0);
    const totalCorrect = sets.reduce((s, x) => s + (x.score || 0), 0);
    const totalDurationMs = sets.reduce((s, x) => s + (x.durationMs || 0), 0);
    res.json({
      sets,
      stats: {
        sets: sets.length,
        totalQuestions,
        totalCorrect,
        accuracy: totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
        studyMs: totalDurationMs,
        categoryStats,
        lastPlayedAt: sets[0]?.finishedAt || null,
      },
    });
  } catch (e) {
    console.error('QB list sets error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quizbowl/recommendations - Gemini picks 3 specific niche sub-topics
// to drill based on the student's category history. Each recommendation launches
// an AI-generated set focused on that exact topic. Falls back to static logic
// if Gemini is unavailable.
app.get('/api/quizbowl/recommendations', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const sets = users[email].data.quizbowlSets || [];
    const cats = computeQBCategoryStats(sets);
    const secret = users[email].data.secretProfile;

    const playedSet = new Set(Object.keys(cats));
    const unplayed = QB_CATEGORIES.filter(c => c !== 'Mixed' && !playedSet.has(c));
    const lastDiff = sets[0]?.difficulty || 'Medium';

    // The secret-profile context is the meat of the prompt - it tells
    // Gemini exactly what the student is weak at, both at the category
    // level and at the level of specific answers they keep blanking on.
    const profileBlock = buildSecretProfileContext(secret);

    // Fallback legacy summary if the profile isn't built yet (e.g. fresh
    // account or migration not yet run).
    const perfLines = Object.entries(cats)
      .map(([cat, v]) => `${cat}: ${Math.round((v.correct / v.total) * 100)}% (${v.total} questions)`)
      .join(', ');
    const contextBlock = profileBlock
      ? profileBlock + (unplayed.length ? `\nUnplayed categories: ${unplayed.join(', ')}.` : '') + `\nLast difficulty: ${lastDiff}.`
      : sets.length
        ? `Performance: ${perfLines || 'none'}. Unplayed categories: ${unplayed.join(', ') || 'none'}. Last difficulty used: ${lastDiff}.`
        : 'New student with no history. Suggest beginner-friendly entry points.';

    const NICHE_HISTORY_TOPICS = [
      'Congress of Vienna', 'Peloponnesian War', 'Meiji Restoration', 'Haitian Revolution',
      'Tang Dynasty', 'Byzantine Iconoclasm', 'Thirty Years War', 'Fall of Constantinople',
      'Scramble for Africa', 'Indian Partition 1947', 'Weimar Republic', 'Mughal Empire',
      'French Wars of Religion', 'Reconquista', 'Seven Years War', 'Opium Wars',
    ];
    const historyTopic = NICHE_HISTORY_TOPICS[Math.floor(Math.random() * NICHE_HISTORY_TOPICS.length)];

    // Top weak category, used both for the prompt's "drill weakness" slot
    // and for the fallback path when Gemini isn't reachable.
    const weakestCategory = secret?.weaknesses?.[0]?.category
      || Object.entries(cats)
        .filter(([, v]) => v.total >= 3)
        .map(([cat, v]) => ({ cat, acc: v.correct / v.total }))
        .sort((a, b) => a.acc - b.acc)[0]?.cat
      || null;
    const topStruggleTopics = (secret?.struggleTopics || []).slice(0, 5).map(s => s.topic);

    const prompt = `You are a quiz bowl coach designing a personalised practice set.

STUDENT PROFILE (kept private - do not echo back to the student):
${contextBlock}

Recommend EXACTLY 3 packets (specific niche sub-topics) for pyramidal tossup practice. Each packet should pull the student toward mastery using what you know about them:

PACKET COMPOSITION (3 packets total):
1. ONE packet that drills their #1 weakness - ${weakestCategory ? `target "${weakestCategory}"` : 'pick the category with the lowest accuracy'}. If you see specific answer-objects they keep missing (${topStruggleTopics.length ? topStruggleTopics.map(t => `"${t}"`).join(', ') : 'none recorded yet'}), aim the topic NEAR those - same era, same scientific concept, same author's circle. Don't re-ask the exact same answer; orbit it.
2. ONE packet that reinforces a strength they haven't fully cemented (a category with recent dip vs all-time, or a category they crushed once but haven't revisited). If no strengths yet, pick a niche History topic the student has not seen.
3. ONE packet that EXPANDS their range - pick a niche topic in an unplayed or thin category to broaden coverage.

RULES:
- Be specific. "Krebs Cycle" not "Biology". "Congress of Vienna" not "History". "Waiting for Godot" not "Literature".
- Each topic must anchor 8-10 distinct tossup questions.
- Skip any answer-object in their "Already mastered" list - they're done with those.
- Match difficulty to recent performance: if weak category < 50%, drop to Easy; if strong category, push to Hard. Default Medium.
- At least 1 of the 3 packets must be a History sub-topic (good fallback if you're stuck: "${historyTopic}", "Reconstruction Era", "Punic Wars").
- "reason" must reference their actual profile - e.g. "you're at 38% in Science and missed 'mitochondria' twice" - not generic encouragement.

Return ONLY valid JSON with no markdown:
{"recommendations":[{"topic":"Specific Topic Name","category":"Science|History|Literature|Geography|Math|Art|Music|Philosophy|Pop Culture","difficulty":"Easy|Medium|Hard","reason":"One sentence referencing their profile","targetsWeakness":"category or specific topic this drills, or null","expectedImpact":"high|medium|low"}]}`;

    const result = await callGemini(null, [{ role: 'user', content: prompt }], GEMINI_FLASH, 700, { jsonMode: true, temperature: 0.85 });
    if (result.success) {
      let parsed;
      try { parsed = typeof result.text === 'string' ? JSON.parse(result.text) : result.text; } catch {}
      if (parsed?.recommendations?.length) {
        const recs = parsed.recommendations.slice(0, 3).map(r => {
          // Map Gemini's profile-aware kind: if it explicitly named a weakness,
          // tag the rec as train-weakness so the UI badge matches.
          let kind = 'niche';
          if (r.targetsWeakness && weakestCategory && r.category === weakestCategory) kind = 'train-weakness';
          else if (r.category && unplayed.includes(r.category)) kind = 'explore';
          return {
            kind,
            topic: r.topic,
            category: r.category || 'Mixed',
            difficulty: r.difficulty || 'Medium',
            reason: r.reason || '',
            source: 'ai',
            customInstructions: `Focus every question specifically on: ${r.topic}`,
            targetsWeakness: r.targetsWeakness || null,
            expectedImpact: r.expectedImpact || 'medium',
          };
        });
        // Guarantee at least one History rec - inject if Gemini missed it.
        const hasHistory = recs.some(r => r.category === 'History');
        if (!hasHistory) {
          recs[recs.length - 1] = {
            kind: 'niche',
            topic: historyTopic,
            category: 'History',
            difficulty: lastDiff || 'Medium',
            reason: `Niche history deep-dive - a great QB staple worth mastering.`,
            source: 'ai',
            customInstructions: `Focus every question specifically on: ${historyTopic}`,
            targetsWeakness: null,
            expectedImpact: 'medium',
          };
        }
        return res.json({ recommendations: recs });
      }
    }

    // Fallback: profile-aware static recommendations (used when Gemini is
    // unreachable). Pulls directly from the secret profile so it stays
    // personalised even without the LLM.
    const recs = [];

    // Slot 1 - drill weakness. Prefer the secret-profile weakness; fall
    // back to the legacy stats-only weakness if no profile yet.
    if (weakestCategory) {
      const struggle = topStruggleTopics[0];
      recs.push({
        kind: 'train-weakness',
        category: weakestCategory,
        difficulty: 'Medium',
        source: 'qbreader',
        reason: struggle
          ? `Weakest category - you missed "${struggle}" recently.`
          : `Weakest category in your profile.`,
        targetsWeakness: weakestCategory,
        expectedImpact: 'high',
      });
    }
    // Slot 2 - niche history (always present, QB staple).
    recs.push({
      kind: 'niche', topic: historyTopic, category: 'History',
      difficulty: lastDiff || 'Medium', source: 'ai',
      reason: `Niche history set - great for building depth in QB.`,
      customInstructions: `Focus every question specifically on: ${historyTopic}`,
      targetsWeakness: null,
      expectedImpact: 'medium',
    });
    // Slot 3 - explore unplayed or warm up.
    if (unplayed.length) {
      const pick = unplayed.find(c => c !== 'History') || unplayed[0];
      recs.push({
        kind: 'explore', category: pick, difficulty: 'Easy', source: 'qbreader',
        reason: `New territory for you - try ${pick}.`,
        targetsWeakness: null, expectedImpact: 'medium',
      });
    } else {
      recs.push({
        kind: 'mixed', category: 'Mixed', difficulty: lastDiff, source: 'qbreader',
        reason: sets.length ? `Continue from last (${lastDiff}).` : 'Warm-up round.',
        targetsWeakness: null, expectedImpact: 'low',
      });
    }
    res.json({ recommendations: recs.slice(0, 3) });
  } catch (e) {
    console.error('QB recommendations error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quizbowl/patterns - compute buzz timing analytics from the
// user's history. Returns insights about when the user tends to buzz,
// how that correlates with accuracy, and per-category buzz habits.
app.get('/api/quizbowl/patterns', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);
    const sets = users[email].data.quizbowlSets || [];

    // Flatten all per-question records that have valid buzz data.
    const allQs = [];
    for (const s of sets) {
      for (const q of (s.perQuestion || [])) {
        if (typeof q.buzzWord === 'number' && typeof q.totalWords === 'number' && q.totalWords > 0) {
          allQs.push({ ...q, setCategory: s.category, setDifficulty: s.difficulty });
        }
      }
    }

    if (!allQs.length) {
      return res.json({ patterns: null, message: 'Not enough data yet. Play a few sets first.' });
    }

    const buzzed = allQs.filter(q => q.buzzWord >= 0);
    const timedOut = allQs.filter(q => q.buzzWord < 0);

    // Buzz position as fraction (0 = first word, 1 = last word).
    const positions = buzzed.map(q => q.buzzWord / q.totalWords);
    const avgPosition = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : 0;

    // Thirds: early (0-33%), mid (33-66%), late (66-100%).
    const early = buzzed.filter(q => q.buzzWord / q.totalWords < 0.33);
    const mid = buzzed.filter(q => { const p = q.buzzWord / q.totalWords; return p >= 0.33 && p < 0.66; });
    const late = buzzed.filter(q => q.buzzWord / q.totalWords >= 0.66);

    function accOf(arr) {
      if (!arr.length) return 0;
      return Math.round((arr.filter(q => q.correct).length / arr.length) * 100);
    }

    // Per-category buzz habits.
    const catMap = {};
    for (const q of buzzed) {
      const cat = q.category || q.setCategory || 'Mixed';
      if (!catMap[cat]) catMap[cat] = { buzzes: [], correct: 0, total: 0 };
      catMap[cat].buzzes.push(q.buzzWord / q.totalWords);
      catMap[cat].total++;
      if (q.correct) catMap[cat].correct++;
    }
    const categoryPatterns = Object.entries(catMap)
      .filter(([, v]) => v.total >= 2)
      .map(([cat, v]) => ({
        category: cat,
        avgBuzzPosition: Math.round((v.buzzes.reduce((a, b) => a + b, 0) / v.buzzes.length) * 100),
        accuracy: Math.round((v.correct / v.total) * 100),
        total: v.total,
      }))
      .sort((a, b) => a.avgBuzzPosition - b.avgBuzzPosition);

    // Trend: last 5 sets vs all-time. Compares avg buzz position.
    const recentQs = [];
    for (const s of sets.slice(0, 5)) {
      for (const q of (s.perQuestion || [])) {
        if (typeof q.buzzWord === 'number' && q.buzzWord >= 0 && typeof q.totalWords === 'number' && q.totalWords > 0) {
          recentQs.push(q.buzzWord / q.totalWords);
        }
      }
    }
    const recentAvg = recentQs.length ? recentQs.reduce((a, b) => a + b, 0) / recentQs.length : avgPosition;
    const trend = avgPosition > 0 ? Math.round(((avgPosition - recentAvg) / avgPosition) * 100) : 0;
    // Positive trend means recent buzzes are earlier (improving).

    // Optimal buzz zone: the position range where accuracy is highest.
    // Bucket into 10 bins and find the one with the best accuracy.
    const BINS = 10;
    const bins = Array.from({ length: BINS }, () => ({ correct: 0, total: 0 }));
    for (const q of buzzed) {
      const bin = Math.min(BINS - 1, Math.floor((q.buzzWord / q.totalWords) * BINS));
      bins[bin].total++;
      if (q.correct) bins[bin].correct++;
    }
    const optimalBin = bins
      .map((b, i) => ({ bin: i, acc: b.total >= 2 ? b.correct / b.total : 0, total: b.total }))
      .filter(b => b.total >= 2)
      .sort((a, b) => b.acc - a.acc)[0];
    const optimalZone = optimalBin
      ? { start: Math.round((optimalBin.bin / BINS) * 100), end: Math.round(((optimalBin.bin + 1) / BINS) * 100), accuracy: Math.round(optimalBin.acc * 100) }
      : null;

    res.json({
      patterns: {
        totalBuzzes: buzzed.length,
        totalTimeouts: timedOut.length,
        avgBuzzPosition: Math.round(avgPosition * 100), // percent through the question
        overallAccuracy: accOf(buzzed),
        early: { count: early.length, accuracy: accOf(early) },
        mid: { count: mid.length, accuracy: accOf(mid) },
        late: { count: late.length, accuracy: accOf(late) },
        timeoutRate: allQs.length ? Math.round((timedOut.length / allQs.length) * 100) : 0,
        categoryPatterns,
        trend, // positive = getting faster (earlier buzzes recently)
        optimalZone,
        // Recent 20 buzzes for the sparkline chart.
        recentBuzzes: buzzed.slice(-20).map(q => ({
          position: Math.round((q.buzzWord / q.totalWords) * 100),
          correct: !!q.correct,
          category: q.category || q.setCategory || 'Mixed',
        })),
      },
    });
  } catch (e) {
    console.error('QB patterns error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quizbowl/niche-recommendations - ask Gemini to suggest specific
// niche sub-topics within a category for targeted AI drilling. Useful when
// the student wants to go deeper than a broad QB category allows.
// ?category=Science&difficulty=Medium
app.get('/api/quizbowl/niche-recommendations', authMiddleware, async (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    const category = req.query.category || 'Science';
    const difficulty = req.query.difficulty || 'Medium';

    const sets = users[email].data.quizbowlSets || [];
    const cats = computeQBCategoryStats(sets);
    const catStats = cats[category];

    const contextLine = catStats
      ? `The student has answered ${catStats.total} ${category} questions and got ${Math.round((catStats.correct / catStats.total) * 100)}% right.`
      : `The student is exploring ${category} for the first time.`;

    const prompt = `You are a quiz bowl coach. Suggest 6 specific niche sub-topics within the ${category} category for a student to drill as pyramidal quiz bowl tossup questions at ${difficulty} level.

${contextLine}

Return ONLY valid JSON with no markdown:
{"niches":[{"topic":"Specific Sub-topic Name","reason":"One sentence why this is worth drilling"}]}

Requirements:
- Topics must be specific enough to generate focused tossups (e.g. "Krebs Cycle" not "Biology", "Thirty Years War" not "European History")
- Cover a range of difficulty within ${difficulty} level
- Stay within standard quiz bowl ${category} territory
- Make the reasons brief and motivating`;

    const result = await callGemini(null, [{ role: 'user', content: prompt }], GEMINI_FLASH, 600, { jsonMode: true, temperature: 0.85 });
    if (!result.success) return res.status(500).json({ error: result.error || 'Gemini failed' });

    let parsed;
    try {
      parsed = typeof result.text === 'string' ? JSON.parse(result.text) : result.text;
    } catch {
      const m = (result.text || '').match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }
    if (!parsed?.niches?.length) return res.status(500).json({ error: 'No suggestions generated' });

    res.json({ niches: parsed.niches.slice(0, 6) });
  } catch (e) {
    console.error('QB niche-recommendations error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/quizbowl/tossups - pull real tossups from QBReader by
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
    scoringFormat: match.scoringFormat || 'standard',
    maxPlayers: QUIZBOWL_MAX_PLAYERS,
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

// POST /api/quizbowl/match - create an empty match (instant). Question
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
      scoringFormat: 'standard',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    matches.set(code, match);
    res.json({ code, match: publicMatchState(match) });
  } catch (e) { console.error('match create failed', e); res.status(500).json({ error: e.message }); }
});

// Max players allowed in a single QB match. Bumped from the original
// strict 1v1 cap so a full tournament room (8 humans) can play together.
const QUIZBOWL_MAX_PLAYERS = 8;

// Scoring format rules mirroring the client. Three data models coexist:
//   - NAQT (the default 'standard'): word-position based - +15 if buzz
//     word < powerWordIndex, +10 if before end, +0 if after, -5 if wrong
//     interrupt, 0 if wrong after end. See https://www.naqt.com/rules/
//   - Flat: `getPts`/`negPts` (+ optional `powerThreshold`/`powerPts`).
//   - Tiered: `tiers: [{ upTo, pts }]` (ascending) with `afterEndPts`,
//     `negDuring`, `negAfter` - needed for real IAC Playoff (6/5/4/3).
const QUIZBOWL_FORMATS = {
  standard:     { naqt: true, powerPts: 15, getPts: 10, afterEndPts: 10, negDuring: -5, negAfter: 0 },
  'iac-prelim': { powerThreshold: null, powerPts: null, getPts: 1,  negPts: 0 },
  'iac-playoff':{
    tiers: [{ upTo: 0.33, pts: 6 }, { upTo: 0.66, pts: 5 }, { upTo: 1.0, pts: 4 }],
    afterEndPts: 3, negDuring: -2, negAfter: -1,
    powerThreshold: 0.33, powerPts: 6, getPts: 4, negPts: -2,
  },
  jv:           { powerThreshold: null, powerPts: null, getPts: 10, negPts: 0  },
};

function quizbowlScoreForBuzz(match, { correct }) {
  const fmt = QUIZBOWL_FORMATS[match.scoringFormat] || QUIZBOWL_FORMATS.standard;
  const q = match.questions ? match.questions[match.currentIdx] : null;
  const totalWords = q ? ((q.text || '').split(/\s+/).filter(Boolean).length || 1) : 1;
  const totalReadMs = totalWords * (match.revealSpeedMs || 140);
  const elapsed = (match.buzzAt || Date.now()) - (match.questionStartedAt || Date.now());
  const wordsRead = Math.max(0, Math.min(totalWords, Math.floor(elapsed / Math.max(1, match.revealSpeedMs || 140))));
  const afterEnd = elapsed >= totalReadMs;

  // NAQT path - the real standard scoring quiz bowl uses.
  if (fmt.naqt) {
    if (correct) {
      const powerIdx = q && Number.isInteger(q.powerWordIndex) ? q.powerWordIndex : null;
      // +15 only if (a) the question has a power mark recorded and
      // (b) the buzz landed before the mark.
      if (powerIdx != null && wordsRead < powerIdx) return fmt.powerPts;
      return afterEnd ? fmt.afterEndPts : fmt.getPts;
    }
    // Wrong: -5 only when the buzz interrupted (came before end-of-read).
    return afterEnd ? fmt.negAfter : fmt.negDuring;
  }

  // Legacy paths (IAC variants + JV) keep the time-ratio model.
  const ratio = Math.max(0, Math.min(1, elapsed / Math.max(1, totalReadMs)));
  if (!correct) {
    if (afterEnd && fmt.negAfter != null) return fmt.negAfter;
    if (fmt.negDuring != null) return fmt.negDuring;
    return fmt.negPts || 0;
  }
  if (Array.isArray(fmt.tiers) && fmt.tiers.length) {
    if (afterEnd && fmt.afterEndPts != null) return fmt.afterEndPts;
    for (const tier of fmt.tiers) if (ratio < tier.upTo) return tier.pts;
    return fmt.tiers[fmt.tiers.length - 1].pts;
  }
  if (fmt.powerThreshold != null && ratio < fmt.powerThreshold) return fmt.powerPts;
  return fmt.getPts || 0;
}

// POST /api/quizbowl/match/:code/join - additional player joins.
app.post('/api/quizbowl/match/:code/join', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.players.some(p => p.userId === req.userId)) {
    match.lastActivity = Date.now();
    return res.json({ match: publicMatchState(match) });
  }
  if (match.players.length >= QUIZBOWL_MAX_PLAYERS) return res.status(409).json({ error: 'Match is full' });
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

// GET /api/quizbowl/match/:code/stream - SSE subscription for state pushes.
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
  // cancel that grace timer - they're back.
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

// POST /api/quizbowl/match/:code/start - host configures + starts.
// Accepts { category, difficulty, questionCount, revealSpeedMs }. Question
// generation happens HERE (so no Gemini spend for matches that don't launch).
app.post('/api/quizbowl/match/:code/start', authMiddleware, async (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can start' });
  if (match.players.length < 2) return res.status(409).json({ error: 'Waiting for more players' });
  if (match.state === 'generating' || match.state === 'playing') {
    return res.status(409).json({ error: 'Match already starting' });
  }

  const {
    category = match.category || 'Mixed',
    difficulty = match.difficulty || 'Medium',
    questionCount = 10,
    revealSpeedMs = match.revealSpeedMs || 140,
    scoringFormat = match.scoringFormat || 'standard',
  } = req.body || {};

  // Persist settings + flip to "generating" so the opponent sees a spinner.
  match.category = category;
  match.difficulty = difficulty;
  match.revealSpeedMs = revealSpeedMs;
  match.scoringFormat = QUIZBOWL_FORMATS[scoringFormat] ? scoringFormat : 'standard';
  match.state = 'generating';
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'generating', { match: publicMatchState(match) });

  // Tell the client we're working even before the LLM returns.
  res.json({ ok: true });

  try {
    const sys = `You are a quiz bowl question writer. Write pyramidal tossup questions - each starts with obscure clues and progressively gets easier. Include a NAQT-style power mark "(*)" placed roughly 60-70% of the way through each question (after the hard clues but before the "giveaway" clue) - buzzing before the mark earns +15, after earns +10. Output ONLY valid JSON with no markdown, no code fences, no prose before or after.

Exact format:
{"questions":[{"text":"Hard clues here, more clues, (*) easier clues here, giveaway clue.","answer":"Answer"}]}`;
    const userMsg = `Generate ${questionCount} pyramidal quiz bowl questions in category "${category}" at ${difficulty} difficulty. Each MUST contain exactly one (*) power mark. Return ONLY the JSON object described - nothing else.`;
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

    // Double-check the match still exists - someone may have left during gen.
    if (!matches.has(match.code)) return;
    // Strip power marks into structured powerWordIndex so the scorer can
    // award +15 vs +10. Questions without (*) score flat +10 / -5 / 0.
    match.questions = parsed.questions.map(q => {
      const { text, powerWordIndex } = parseTossupText(q.text || '');
      return { ...q, text, powerWordIndex };
    });
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

// POST /api/quizbowl/match/:code/buzz - atomic; first-in wins.
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

// POST /api/quizbowl/match/:code/answer - only the buzz winner can submit.
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
  //   4. typo of key word  (\u2264 floor(len/6), capped at 1), at least 4 chars
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
    // Correct: question ends. Score awarded per scoringFormat. Auto-advance in 5s.
    const pts = quizbowlScoreForBuzz(match, { correct: true });
    match.scores[req.userId] = (match.scores[req.userId] || 0) + pts;
    match.state = 'reveal';
    match.lastActivity = Date.now();
    pushMatchEvent(match, 'answer_result', {
      userId: req.userId, correct: true, answer, correctAnswer,
      scores: match.scores, autoAdvanceInMs: 5000, ptsGained: pts,
    });
    scheduleAutoAdvance(match, 5000);
  } else {
    // Wrong: apply neg, lock out this player, give the others a chance.
    const negPts = quizbowlScoreForBuzz(match, { correct: false });
    if (negPts) match.scores[req.userId] = (match.scores[req.userId] || 0) + negPts;
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
        scores: match.scores, finalMiss: true, autoAdvanceInMs: 5000, ptsGained: negPts,
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
        scores: match.scores, ptsGained: negPts,
      });
      // Resume the end-of-question timeout for the remaining player(s).
      scheduleQuestionTimeout(match);
    }
  }
  res.json({ ok: true, correct });
});

// POST /api/quizbowl/match/:code/next - host advances to the next question.
app.post('/api/quizbowl/match/:code/next', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can advance' });
  advanceMatchToNextQuestion(match);
  res.json({ ok: true, finished: match.state === 'finished' });
});

// POST /api/quizbowl/match/:code/end - host ends the match immediately.
// Stops all pending timers, snapshots current scores, and pushes match_end.
// Lets the host call the game early without burning through the rest of
// the question bank - useful when running a custom-length packet or when
// time's just up.
app.post('/api/quizbowl/match/:code/end', authMiddleware, (req, res) => {
  const match = matches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only the host can end the match' });
  if (match.state === 'finished') return res.json({ ok: true, alreadyFinished: true });
  if (match.questionTimeoutId) { clearTimeout(match.questionTimeoutId); match.questionTimeoutId = null; }
  if (match.revealTimeoutId)   { clearTimeout(match.revealTimeoutId);   match.revealTimeoutId = null; }
  match.state = 'finished';
  match.buzzWinner = null;
  match.buzzAt = null;
  match.lastActivity = Date.now();
  pushMatchEvent(match, 'match_end', {
    scores: match.scores,
    endedByHost: true,
  });
  res.json({ ok: true });
});

// POST /api/quizbowl/match/:code/leave - graceful exit.
//
// Leaving during a LIVE question (state=playing | reveal | generating) is
// treated as abandoning the match - we cancel ALL scheduled timers
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
// DEBATE - head-to-head multiplayer with AI-graded turns + dual-end voting.
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
      timedOut: !!t.timedOut,
    })),
    turnOf: match.turnOf,
    scores: match.scores,
    endVotes: Array.from(match.endVotes),
    // Per-player ready check-ins. Host can only call /start when every
    // current player is in this list.
    readyUserIds: Array.from(match.readyUserIds || []),
    verdict: match.verdict || null,
    createdAt: match.createdAt,
    // Timed-mode metadata for client countdowns.
    timedMode: !!match.timedMode,
    turnLimitMs: match.turnLimitMs || 0,
    turnStartedAt: match.turnStartedAt || 0,
    // Round cap (per side). 0 = infinite - match ends only on vote-end.
    maxRounds: match.maxRounds || 0,
    // Live spectator count. Eliminated tournament players + the organizer
    // can open the match stream as read-only watchers.
    spectatorCount: match.spectators ? match.spectators.size : 0,
    // Link back to the parent tournament so clients know this is a
    // bracket match (used to decide spectator capability).
    tournamentCode: match.tournamentCode || null,
    // Live-typing state - only meaningful when timedMode is on. Both
    // players see the field; the active player ignores their own draft
    // for display purposes.
    draftText: match.draftText || '',
    draftBy: match.draftBy || null,
  };
}

function pushDebateEvent(match, type, payload) {
  match.lastActivity = Date.now();
  // Always include the full public match snapshot in every event so the
  // client's setMatch(ev.match) path picks up turn additions, score
  // updates, and end-vote changes - not just the join / started /
  // finished events that historically carried the snapshot. Without
  // this, "turn_added" events were missing match and the opponent's UI
  // stayed frozen on the previous turn.
  const body = { type, match: publicDebateState(match), ...payload };
  const writeTo = (stream) => {
    if (!stream || stream.writableEnded) return;
    try { stream.write(`data: ${JSON.stringify(body)}\n\n`); stream.flush?.(); }
    catch {}
  };
  for (const p of match.players) writeTo(p.stream);
  // Fan out to spectators too.
  if (match.spectators) for (const s of match.spectators.values()) writeTo(s);
}

// POST /api/debate/match - create empty match.
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
      // Each player must check in before the host can start the match.
      readyUserIds: new Set(),
      // Spectator SSE streams keyed by userId. Populated for tournament
      // bracket matches when an eliminated player / organizer opens the
      // match stream. Count is exposed via publicDebateState.
      spectators: new Map(),
      verdict: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    debateMatches.set(code, match);
    res.json({ code, match: publicDebateState(match) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/debate/match/:code/join - second player joins.
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

// GET /api/debate/match/:code/stream - SSE for state pushes.
// Players get the regular player-stream slot. If the requester isn't a
// player but the match is part of a tournament they're in (or organize),
// they're admitted as a spectator - counted in match.spectators and
// included in pushDebateEvent fanout.
app.get('/api/debate/match/:code/stream', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  const player = match.players.find(p => p.userId === req.userId);

  // Decide spectator eligibility when not a player.
  let isSpectator = false;
  if (!player) {
    const t = match.tournamentCode ? tournaments.get(match.tournamentCode) : null;
    if (t && (t.players.some(p => p.userId === req.userId) || t.hostId === req.userId)) {
      isSpectator = true;
    } else {
      return res.status(403).json({ error: 'Not a player in this match' });
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (player) player.stream = res;
  else {
    if (!match.spectators) match.spectators = new Map();
    // Replace any prior stream for this user (reconnect path).
    const prev = match.spectators.get(req.userId);
    if (prev && !prev.writableEnded) { try { prev.end(); } catch {} }
    match.spectators.set(req.userId, res);
    // Broadcast new spectator count to everyone else.
    pushDebateEvent(match, 'spectator_joined', { match: publicDebateState(match), userId: req.userId });
    // If this match is part of a tournament, also refresh the tournament
    // snapshot so the bracket view's spectator badge updates live.
    if (match.tournamentCode) {
      const t = tournaments.get(match.tournamentCode);
      if (t) pushTournamentEvent(t, 'match_updated', { tournament: publicTournamentState(t) });
    }
  }
  res.write(`data: ${JSON.stringify({ type: 'snapshot', match: publicDebateState(match) })}\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); res.flush?.(); } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (player && player.stream === res) player.stream = null;
    if (isSpectator && match.spectators && match.spectators.get(req.userId) === res) {
      match.spectators.delete(req.userId);
      // Push updated count.
      pushDebateEvent(match, 'spectator_left', { match: publicDebateState(match), userId: req.userId });
      if (match.tournamentCode) {
        const t = tournaments.get(match.tournamentCode);
        if (t) pushTournamentEvent(t, 'match_updated', { tournament: publicTournamentState(t) });
      }
    }
  });
});

// POST /api/debate/match/:code/ready - toggle the caller's ready check-in.
// Body: { ready: bool }. Defaults to true (set ready) when omitted.
app.post('/api/debate/match/:code/ready', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'waiting') return res.status(409).json({ error: 'Match already started' });
  if (!match.players.some(p => p.userId === req.userId)) return res.status(403).json({ error: 'Not a player' });
  if (!match.readyUserIds) match.readyUserIds = new Set();
  const wantReady = req.body?.ready !== false;
  if (wantReady) match.readyUserIds.add(req.userId);
  else match.readyUserIds.delete(req.userId);
  match.lastActivity = Date.now();
  pushDebateEvent(match, 'ready_changed', { match: publicDebateState(match) });
  res.json({ match: publicDebateState(match) });
});

// POST /api/debate/match/:code/start - host configures topic + sides.
app.post('/api/debate/match/:code/start', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.hostId !== req.userId) return res.status(403).json({ error: 'Only host can start' });
  if (match.players.length < 2) return res.status(409).json({ error: 'Waiting for opponent' });
  if (match.state !== 'waiting') return res.status(409).json({ error: 'Already started' });
  // Every player must have checked in via /ready before the host can start.
  if (!match.readyUserIds) match.readyUserIds = new Set();
  if (match.players.some(p => !match.readyUserIds.has(p.userId))) {
    return res.status(409).json({ error: 'Both players must ready up before starting' });
  }

  const topic = String(req.body?.topic || '').trim();
  const hostSide = req.body?.hostSide === 'against' ? 'against' : 'for';
  if (!topic) return res.status(400).json({ error: 'Topic required' });

  match.topic = topic;
  match.players[0].side = hostSide;
  match.players[1].side = hostSide === 'for' ? 'against' : 'for';
  match.state = 'playing';
  // FOR side opens.
  match.turnOf = match.players.find(p => p.side === 'for').userId;
  // Timed mode: host can enable a per-turn time limit. Default off.
  // If on, every turn (starting now) has 120s; players who miss the
  // window get a 0-score turn and play continues.
  match.timedMode = !!req.body?.timedMode;
  match.turnLimitMs = match.timedMode ? 120_000 : 0;
  // Round cap (per side). Clamp to [0, 20]; 0 = infinite.
  const rawRounds = Number(req.body?.maxRounds);
  match.maxRounds = Number.isFinite(rawRounds) && rawRounds > 0 ? Math.min(20, Math.floor(rawRounds)) : 0;
  match.turnStartedAt = Date.now();
  match.lastActivity = Date.now();
  pushDebateEvent(match, 'started', { match: publicDebateState(match) });
  res.json({ match: publicDebateState(match) });
});

// POST /api/debate/match/:code/move - submit an argument; AI grades it.
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

  const player = match.players.find(p => p.userId === req.userId);
  const opponent = match.players.find(p => p.userId !== req.userId);

  // Timed mode: detect timeouts either from an explicit client marker
  // (client auto-submits when its countdown hits 0) or from a server-side
  // check that the player blew past the per-turn window. Generous 5s
  // grace covers the auto-submit POST's network round trip.
  const explicitTimeout = !!req.body?.timedOut;
  const elapsedMs = match.turnStartedAt ? Date.now() - match.turnStartedAt : 0;
  const exceededLimit = match.timedMode && match.turnLimitMs > 0 && elapsedMs > match.turnLimitMs + 5000;
  const isTimeout = explicitTimeout || exceededLimit;
  const hasContent = argument.trim().length > 0 || images.length > 0;

  // Empty timeout: nothing to grade, instant 0/0/0 and advance play.
  if (isTimeout && !hasContent) {
    const turn = {
      userId: req.userId,
      side: player.side,
      content: '(time expired - no argument submitted)',
      images: [],
      score: { argumentation: 0, evidence: 0, rhetoric: 0, total: 0 },
      feedback: 'Time expired. No argument was made in the allotted 2 minutes.',
      at: Date.now(),
      timedOut: true,
    };
    match.turns.push(turn);
    match.scores[req.userId] = (match.scores[req.userId] || 0) + 0;
    match.turnOf = opponent.userId;
    match.turnStartedAt = Date.now();
    match.draftText = '';
    match.draftBy = null;
    match.lastActivity = Date.now();
    pushDebateEvent(match, 'turn_added', { turn, scores: match.scores, turnOf: match.turnOf, turnStartedAt: match.turnStartedAt });
    // Auto-finalize if every player has now hit the per-side cap.
    if (match.maxRounds > 0 && match.players.every(p => match.turns.filter(t => t.userId === p.userId).length >= match.maxRounds)) {
      try { await finalizeDebateMatch(match); } catch (e) { console.error('Auto-finalize failed:', e); }
    }
    return res.json({ turn, match: publicDebateState(match) });
  }

  // Normal-submit minimum-length gate. Timeouts with content bypass it -
  // even a couple of sentences is worth grading rather than zeroing out.
  if (!isTimeout && argument.length < 20 && images.length === 0) {
    return res.status(400).json({ error: 'Argument must be at least 20 characters (or attach an image)' });
  }

  // AI grading. Three 1-10 axes + 1-2 sentence feedback. JSON mode forced.
  const prevTurns = match.turns.slice(-6).map(t =>
    `${t.side.toUpperCase()} (${t.userId === req.userId ? 'this player' : 'opponent'}): ${t.content.slice(0, 600)}`
  ).join('\n\n');
  const sys = `You are a strict, opinionated debate judge. Grade the argument on three axes (1-10 integer each):
- argumentation (logical structure, claim → reasoning → conclusion)
- evidence (specific facts, examples, data - penalize hand-waving)
- rhetoric (clarity, persuasiveness, addressing the opponent's strongest point)

USE THE FULL 1-10 RANGE. Do NOT default everything to 5. Anchor:
- 1-2: incoherent, nothing supported, off-topic, or a single weak sentence.
- 3-4: below average - has a claim but support is vague or generic.
- 5-6: average debate-class output - claim plus a reason or two, not memorable.
- 7-8: strong - specific evidence, addresses opponent, clean logical structure.
- 9-10: exceptional - surprising specifics, decisive counter to opponent, quotable.
You MUST score each axis independently - it is normal for the same argument to score 8 on argumentation and 3 on evidence. Avoid giving 5/5/5; if you find yourself there, push at least one axis up or down based on which way the argument actually leans.

The argument may include attached images (charts, screenshots, photographs of evidence). Treat them as part of the argument - if the image carries the claim's evidence, weight it under "evidence"; if the user uses it rhetorically, weight it under "rhetoric". If the player ran out of time and submitted nothing or near-nothing, all three axes are 1.

Output STRICT JSON only.`;
  const usr = `Topic: "${match.topic}"
This player is arguing ${player.side.toUpperCase()}.

Previous turns (most recent last):
${prevTurns || '(none - opening statement)'}

NEW ARGUMENT from this player:
"""
${argument.slice(0, 8000) || '(no text - see attached image(s))'}
"""
${images.length ? `\n[The player attached ${images.length} image${images.length === 1 ? '' : 's'} - see the image(s) below.]` : ''}

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
    // maxOutputTokens bumped 600 → 2000. The grader prompt + JSON response
    // can run close to 600 once the per-axis feedback is included, and a
    // truncated response makes parseAIJson fail → we'd fall back to the
    // default 5/5/5 = 15 every time. 2000 is plenty of headroom.
    const aiResp = await callGemini(sys, [userMsg], MODEL_FLASH_LITE, 2000, { jsonMode: true, temperature: 0.7 });
    let score = { argumentation: 5, evidence: 5, rhetoric: 5, total: 15 };
    let feedback = '';
    let graded = false;
    if (aiResp.success) {
      const rawText = aiResp.data.content?.[0]?.text || '';
      const parsed = parseAIJson(rawText);
      if (parsed && (parsed.argumentation != null || parsed.evidence != null || parsed.rhetoric != null)) {
        // Use Number.isFinite so a legitimate 0 doesn't get bumped to 5
        // by the truthy-fallback. Also accept missing axes - they default
        // to 5 rather than dropping the whole grade.
        const num = (v, fallback = 5) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : fallback;
        };
        score = {
          argumentation: num(parsed.argumentation),
          evidence:      num(parsed.evidence),
          rhetoric:      num(parsed.rhetoric),
        };
        score.total = score.argumentation + score.evidence + score.rhetoric;
        feedback = String(parsed.feedback || '').slice(0, 400);
        graded = true;
      } else {
        console.warn('[debate-grade] parse failed', { len: rawText.length, sample: rawText.slice(0, 200) });
      }
    } else {
      console.warn('[debate-grade] call failed', aiResp.error);
    }
    if (!graded) console.warn('[debate-grade] using fallback 5/5/5 score');
    const turn = {
      userId: req.userId, side: player.side, content: argument,
      // Persist image data URLs so the opponent can render them. Capped
      // by the slice above (≤4 per turn).
      images: images.map(im => ({ dataUrl: im.dataUrl, mimeType: im.mimeType })),
      score, feedback, at: Date.now(),
      // Flag auto-submitted-on-timeout turns so the client can show a
      // small "auto-submitted" hint next to the score.
      timedOut: isTimeout,
    };
    match.turns.push(turn);
    match.scores[req.userId] = (match.scores[req.userId] || 0) + score.total;
    // Turn passes to opponent. Reset the per-turn clock for timed mode,
    // and clear any draft text so the opponent's panel resets cleanly.
    match.turnOf = opponent.userId;
    match.turnStartedAt = Date.now();
    match.draftText = '';
    match.draftBy = null;
    match.lastActivity = Date.now();
    pushDebateEvent(match, 'turn_added', { turn, scores: match.scores, turnOf: match.turnOf, turnStartedAt: match.turnStartedAt });
    // Auto-finalize if every player has now hit the per-side cap.
    if (match.maxRounds > 0 && match.players.every(p => match.turns.filter(t => t.userId === p.userId).length >= match.maxRounds)) {
      try { await finalizeDebateMatch(match); } catch (e) { console.error('Auto-finalize failed:', e); }
    }
    res.json({ turn, match: publicDebateState(match) });
  } catch (e) {
    console.error('Debate move grading failed:', e);
    res.status(500).json({ error: e.message || 'Grading failed' });
  }
});

// POST /api/debate/match/:code/draft - live-typing broadcast. The
// active player POSTs their in-progress argument text every ~500ms
// while typing; the server forwards via SSE so the opponent can see
// the draft as it's written. Pure transient state - never persisted,
// dropped on disconnect, and only honored when timedMode is on (to
// keep the non-timed mode feeling private).
app.post('/api/debate/match/:code/draft', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.state !== 'playing') return res.status(409).json({ error: 'Not in playing state' });
  if (match.turnOf !== req.userId) return res.status(403).json({ error: 'Not your turn' });
  if (!match.timedMode) return res.json({ ok: true }); // silently no-op when not timed
  const text = String(req.body?.text || '').slice(0, 4000);
  match.lastActivity = Date.now();
  // Only push if the text actually changed - avoids flooding the
  // opponent's SSE with no-op events while the client polls.
  if (match.draftText === text && match.draftBy === req.userId) return res.json({ ok: true });
  match.draftText = text;
  match.draftBy = req.userId;
  pushDebateEvent(match, 'draft', { draftText: text, draftBy: req.userId });
  res.json({ ok: true });
});

// POST /api/debate/match/:code/vote-end - vote to end. When both vote,
// AI generates final verdict and the match flips to 'finished'.
// Per-user debate history. Stored on the user record in users.json so
// finished matches survive server restarts and show up under Debate ▸
// History for each player.
function recordDebateHistoryEntry(userId, entry) {
  if (!userId) return;
  const users = loadUsers();
  // users.json is keyed by email, not userId - look up the email first.
  // Previous code did `users[userId]` which was always undefined, so
  // every history write silently no-op'd.
  const email = findEmailById(users, userId);
  if (!email) return;
  const u = users[email];
  if (!u) return;
  if (!Array.isArray(u.debateHistory)) u.debateHistory = [];
  u.debateHistory.unshift(entry);
  // Cap at 100 most-recent matches per user to keep users.json from
  // growing unbounded with transcripts.
  if (u.debateHistory.length > 100) u.debateHistory.length = 100;
  saveUsers(users);
}

// Shared verdict-generation path. Used by /vote-end (both players agreed)
// and by /move when a round cap is hit (auto-finalize). Mutates the match
// in place - sets verdict + state='finished' and pushes the SSE event.
async function finalizeDebateMatch(match) {
  const transcript = match.turns.map((t, i) =>
    `Turn ${i + 1} - ${t.side.toUpperCase()} (score ${t.score.total}/30): ${t.content.slice(0, 800)}`
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
  "forStrongest": "1 sentence - strongest moment from the FOR side",
  "againstStrongest": "1 sentence - strongest moment from the AGAINST side"
}`;

  const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], DEFAULT_MODEL, 1500, { jsonMode: true, temperature: 0.3 });
  let verdict = {
    winner: (match.scores[forPlayer.userId] || 0) >= (match.scores[againstPlayer.userId] || 0) ? 'for' : 'against',
    summary: 'Verdict generation failed; using raw scores as the tiebreak.',
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

  // If this match is part of a tournament bracket, advance it.
  if (match.tournamentCode) {
    try { advanceTournamentBracket(match.tournamentCode, match.code); }
    catch (e) { console.error('Tournament advance failed:', e); }
  }

  // Persist a per-player history record. We store the public turn list
  // (content + score + side) so the history view can show full transcripts
  // without keeping the live match object around indefinitely.
  const finishedAt = Date.now();
  const publicTurns = match.turns.map(t => ({
    userId: t.userId, side: t.side, content: t.content,
    score: t.score, feedback: t.feedback, at: t.at, timedOut: !!t.timedOut,
  }));
  // Tournament context - if this is a bracket match, attach the parent
  // tournament's name + round so the history view can label it.
  let tournamentContext = null;
  if (match.tournamentCode) {
    const t = tournaments.get(match.tournamentCode);
    if (t) {
      tournamentContext = {
        code: t.code,
        name: t.name || t.topic,
        round: match.tournamentRound || null,
        totalRounds: Math.log2(t.size),
      };
    }
  }
  for (const p of match.players) {
    const oppPlayer = match.players.find(x => x.userId !== p.userId);
    recordDebateHistoryEntry(p.userId, {
      mode: tournamentContext ? 'tournament' : 'multiplayer',
      code: match.code,
      topic: match.topic,
      finishedAt,
      mySide: p.side,
      myScore: match.scores[p.userId] || 0,
      opponent: oppPlayer ? { userId: oppPlayer.userId, name: oppPlayer.name, side: oppPlayer.side } : null,
      opponentScore: oppPlayer ? (match.scores[oppPlayer.userId] || 0) : 0,
      verdict,
      result: verdict.winner === 'tie' ? 'tie' : (verdict.winner === p.side ? 'win' : 'loss'),
      timedMode: !!match.timedMode,
      maxRounds: match.maxRounds || 0,
      tournament: tournamentContext,
      turns: publicTurns,
    });
  }
  return verdict;
}

// Record a forfeit-style verdict in both players' history. Used when a
// tournament participant leaves mid-match - the leaver loses, the
// opponent wins, but we still want the row in both histories.
function recordForfeitHistory(match, leaverId) {
  if (!match || !Array.isArray(match.players) || match.players.length < 2) return;
  const finishedAt = match.lastActivity || Date.now();
  const publicTurns = (match.turns || []).map(t => ({
    userId: t.userId, side: t.side, content: t.content,
    score: t.score, feedback: t.feedback, at: t.at, timedOut: !!t.timedOut,
  }));
  let tournamentContext = null;
  if (match.tournamentCode) {
    const t = tournaments.get(match.tournamentCode);
    if (t) {
      tournamentContext = {
        code: t.code,
        name: t.name || t.topic,
        round: match.tournamentRound || null,
        totalRounds: Math.log2(t.size),
      };
    }
  }
  const verdict = match.verdict || { winner: null, summary: 'Forfeit.', forStrongest: '', againstStrongest: '' };
  for (const p of match.players) {
    const oppPlayer = match.players.find(x => x.userId !== p.userId);
    const iLost = p.userId === leaverId;
    recordDebateHistoryEntry(p.userId, {
      mode: tournamentContext ? 'tournament' : 'multiplayer',
      code: match.code,
      topic: match.topic,
      finishedAt,
      mySide: p.side,
      myScore: match.scores[p.userId] || 0,
      opponent: oppPlayer ? { userId: oppPlayer.userId, name: oppPlayer.name, side: oppPlayer.side } : null,
      opponentScore: oppPlayer ? (match.scores[oppPlayer.userId] || 0) : 0,
      verdict,
      result: iLost ? 'loss' : 'win',
      forfeit: true,
      timedMode: !!match.timedMode,
      maxRounds: match.maxRounds || 0,
      tournament: tournamentContext,
      turns: publicTurns,
    });
  }
}

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

  try {
    await finalizeDebateMatch(match);
    res.json({ match: publicDebateState(match), finished: true });
  } catch (e) {
    console.error('Debate verdict generation failed:', e);
    res.status(500).json({ error: e.message || 'Verdict failed' });
  }
});

// POST /api/debate/match/:code/leave - graceful exit. Notifies the
// remaining player via SSE so they can show a "your opponent left"
// modal instead of staring at a frozen scoreboard, and marks the match
// abandoned so subsequent move/vote calls won't 500.
app.post('/api/debate/match/:code/leave', authMiddleware, (req, res) => {
  const match = debateMatches.get(req.params.code);
  if (!match) return res.json({ ok: true });
  const leaver = match.players.find(x => x.userId === req.userId);
  if (!leaver) return res.json({ ok: true });
  pushDebateEvent(match, 'player_left', {
    leaverId: leaver.userId,
    leaverName: leaver.name || 'Opponent',
  });
  if (match.state === 'playing' || match.state === 'waiting') {
    match.state = 'abandoned';
    match.lastActivity = Date.now();
  }
  if (leaver.stream) { try { leaver.stream.end(); } catch {} leaver.stream = null; }
  res.json({ ok: true });
});

// =========================================================
// SINGLEPLAYER DEBATE - final verdict (called from /move when no
// multiplayer match exists). Splits the singleplayer flow's "End Debate"
// button so the AI gives a winner verdict instead of just a wrap-up.
// =========================================================

// GET /api/debate/my-active-tournament - return the in-progress
// tournament this user is participating in (player or organizer-host),
// if any. Used by the debate mode menu to surface a Rejoin button so
// signing in on a second device doesn't strand the user.
app.get('/api/debate/my-active-tournament', authMiddleware, (req, res) => {
  for (const t of tournaments.values()) {
    if (t.state === 'finished') continue;
    const isPlayer = Array.isArray(t.players) && t.players.some(p => p.userId === req.userId && !p.eliminated);
    const isOrganizer = t.hostId === req.userId;
    if (isPlayer || isOrganizer) {
      return res.json({ tournament: publicTournamentState(t) });
    }
  }
  res.json({ tournament: null });
});

// POST /api/debate/suggest-topics - return 6 fresh AI-picked debate
// topics. Optional body { theme: string, exclude: string[] } to bias the
// suggestions. Used by every debate setup screen (solo, 1v1, tournament).
app.post('/api/debate/suggest-topics', authMiddleware, async (req, res) => {
  try {
    const theme = String(req.body?.theme || '').trim().slice(0, 120);
    const exclude = Array.isArray(req.body?.exclude) ? req.body.exclude.slice(0, 20).map(s => String(s).slice(0, 200)) : [];
    const sys = `You generate single-sentence debate resolutions. Output STRICT JSON only.

Each topic should:
- Be debatable from both sides with real arguments.
- Be short (under 12 words).
- Mix categories: tech, education, ethics, policy, culture, science.
- Avoid loaded language; phrase as a claim ("X should Y") or a question.
- Be fresh - DON'T repeat any of the user's excluded topics or near-duplicates.`;
    const usr = `Return JSON exactly:
{ "topics": ["...", "...", "...", "...", "...", "..."] }

Constraints:
- 6 topics, no more, no less
- ${theme ? `Loosely themed around: ${theme}` : 'Mix of categories'}
${exclude.length ? `- Avoid these (and close paraphrases): ${exclude.map(e => `"${e}"`).join(', ')}` : ''}`;

    // disableThinking=true: this is a short generative task, no reasoning
    // needed. Without it Gemini 3 Flash burns the entire 1500-token budget
    // on hidden chain-of-thought and the JSON gets truncated mid-array.
    const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], MODEL_FLASH_LITE, 1500, { jsonMode: true, temperature: 0.95, disableThinking: true });
    if (!aiResp.success) return res.status(500).json({ error: aiResp.error || 'AI call failed' });
    const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
    let topics = Array.isArray(parsed?.topics) ? parsed.topics : [];
    topics = topics.map(t => String(t || '').trim()).filter(Boolean).slice(0, 6);
    if (!topics.length) return res.status(500).json({ error: 'No topics returned' });
    res.json({ topics });
  } catch (e) {
    console.error('Debate topic suggest failed:', e);
    res.status(500).json({ error: e.message || 'Suggest failed' });
  }
});

app.post('/api/debate/singleplayer/verdict', authMiddleware, async (req, res) => {
  try {
    const { topic, userSide, transcript } = req.body || {};
    if (!topic || !userSide || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'topic, userSide, transcript[] required' });
    }
    const sys = `You are a debate judge. Read the full transcript and declare a winner. Output STRICT JSON only.`;
    const lines = transcript.map((m, i) =>
      `Turn ${i + 1} - ${m.role === 'user' ? `STUDENT (${userSide.toUpperCase()})` : `AI (${userSide === 'for' ? 'AGAINST' : 'FOR'})`}: ${(m.content || '').slice(0, 1500)}`
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
  "studentStrongest": "1 sentence - strongest moment from the student",
  "studentWeakest": "1 sentence - weakest moment from the student",
  "improve": "1-2 sentences - what the student should drill next"
}`;
    const aiResp = await callGemini(sys, [{ role: 'user', content: usr }], DEFAULT_MODEL, 1500, { jsonMode: true, temperature: 0.3 });
    if (!aiResp.success) return res.status(500).json({ error: aiResp.error });
    const parsed = parseAIJson(aiResp.data.content?.[0]?.text || '');
    if (!parsed) return res.status(500).json({ error: 'Failed to parse verdict' });

    // Save to history.
    const aiSide = userSide === 'for' ? 'against' : 'for';
    recordDebateHistoryEntry(req.userId, {
      mode: 'solo',
      topic,
      finishedAt: Date.now(),
      mySide: userSide,
      myScore: Number(parsed.studentScore) || 0,
      opponent: { userId: null, name: 'AI', side: aiSide },
      opponentScore: Number(parsed.aiScore) || 0,
      verdict: {
        winner: parsed.winner,
        summary: String(parsed.summary || '').slice(0, 1200),
        studentStrongest: String(parsed.studentStrongest || '').slice(0, 400),
        studentWeakest: String(parsed.studentWeakest || '').slice(0, 400),
        improve: String(parsed.improve || '').slice(0, 400),
      },
      result: parsed.winner === 'tie' ? 'tie' : (parsed.winner === 'student' ? 'win' : 'loss'),
      turns: (transcript || []).map(m => ({
        side: m.role === 'user' ? userSide : aiSide,
        content: (m.content || '').slice(0, 4000),
      })),
    });
    res.json({ verdict: parsed });
  } catch (e) {
    console.error('Singleplayer verdict failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// =========================================================
// TOURNAMENTS - single-elimination brackets of 4/8/16 players.
// Players join a tournament code, host starts when full, server pairs
// players randomly and spawns standard debate matches for each pairing.
// When each match finishes (via finalizeDebateMatch), the bracket
// advances; once one winner remains the tournament is finished.
// =========================================================
const tournaments = new Map();

function newTournamentCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 12; attempt++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (!tournaments.has(c)) return c;
  }
  return 'T' + Date.now().toString(36).toUpperCase().slice(-4);
}

function publicTournamentState(t) {
  return {
    code: t.code,
    state: t.state,
    size: t.size,
    name: t.name || t.topic,
    topic: t.topic,
    roundTopics: t.roundTopics || {},
    timedMode: !!t.timedMode,
    maxRounds: t.maxRounds || 0,
    hostId: t.hostId,
    hostName: t.hostName || null,
    // When false the host is organizer-only (not in the bracket). UI
    // uses this to hide the "your match is ready" CTA and show an
    // organizer chip instead.
    hostPlays: t.hostPlays !== false,
    players: t.players.map(p => ({
      userId: p.userId, name: p.name,
      eliminated: !!p.eliminated, eliminatedAt: p.eliminatedAt || null,
      eliminatedInRound: p.eliminatedInRound || null,
    })),
    bracket: t.bracket.map(b => {
      const m = debateMatches.get(b.code);
      return {
        round: b.round, matchIndex: b.matchIndex,
        code: b.code, players: b.players, winnerId: b.winnerId,
        state: b.state,
        // Snapshot of in-match scores so the bracket view can show live progress.
        scores: m
          ? b.players.reduce((acc, uid) => { acc[uid] = m.scores[uid] || 0; return acc; }, {})
          : null,
        // Live spectator count so the bracket can show "👁 N" badges.
        spectatorCount: m?.spectators?.size || 0,
      };
    }),
    champion: t.champion || null,
    createdAt: t.createdAt,
  };
}

function pushTournamentEvent(t, type, payload = {}) {
  t.lastActivity = Date.now();
  const body = { type, tournament: publicTournamentState(t), ...payload };
  const writeTo = (stream) => {
    if (!stream || stream.writableEnded) return;
    try { stream.write(`data: ${JSON.stringify(body)}\n\n`); stream.flush?.(); }
    catch {}
  };
  for (const p of t.players) writeTo(p.stream);
  // Organizer-host (when not playing) still needs bracket updates.
  if (t.hostStream && !t.players.some(p => p.userId === t.hostId)) writeTo(t.hostStream);
}

// Fisher-Yates so opening pairings are random.
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Spawn the matches for one round of the bracket. `playerIds` must be a
// power-of-2 list ordered such that adjacent pairs play each other.
function createTournamentRound(t, roundNum, playerIds) {
  for (let i = 0; i < playerIds.length; i += 2) {
    const a = playerIds[i];
    const b = playerIds[i + 1];
    const pa = t.players.find(p => p.userId === a);
    const pb = t.players.find(p => p.userId === b);
    if (!pa || !pb) continue;
    // Random side assignment - coin flip per match.
    const aIsFor = Math.random() < 0.5;
    const code = newDebateCode();
    // Per-round topic if host set one for this round, otherwise the main
    // tournament topic.
    const roundTopic = (t.roundTopics && t.roundTopics[roundNum]) || t.topic;
    const match = {
      code,
      state: 'playing',
      topic: roundTopic,
      hostId: a,
      players: [
        { userId: pa.userId, name: pa.name, side: aIsFor ? 'for' : 'against', stream: null },
        { userId: pb.userId, name: pb.name, side: aIsFor ? 'against' : 'for', stream: null },
      ],
      turns: [],
      turnOf: aIsFor ? pa.userId : pb.userId, // FOR side opens
      scores: { [pa.userId]: 0, [pb.userId]: 0 },
      endVotes: new Set(),
      readyUserIds: new Set([pa.userId, pb.userId]), // pre-readied - match is live
      // Eliminated players + the organizer can subscribe here as spectators.
      spectators: new Map(),
      verdict: null,
      timedMode: !!t.timedMode,
      turnLimitMs: t.timedMode ? 120_000 : 0,
      turnStartedAt: Date.now(),
      maxRounds: t.maxRounds || 0,
      tournamentCode: t.code,
      tournamentRound: roundNum,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      draftText: '',
      draftBy: null,
    };
    debateMatches.set(code, match);
    t.bracket.push({
      round: roundNum,
      matchIndex: i / 2,
      code,
      players: [a, b],
      winnerId: null,
      state: 'playing',
    });
  }
}

// Called from finalizeDebateMatch when a tournament-linked match ends.
// Records the winner, eliminates the loser, and either starts the next
// round (carrying winners forward in bracket order) or marks the
// tournament finished if this was the final.
function advanceTournamentBracket(tournamentCode, finishedMatchCode) {
  const t = tournaments.get(tournamentCode);
  if (!t || t.state !== 'playing') return;
  const entry = t.bracket.find(b => b.code === finishedMatchCode);
  if (!entry || entry.state === 'finished') return;
  const match = debateMatches.get(finishedMatchCode);
  if (!match || !match.verdict) return;

  let winnerId = null;
  if (match.verdict.winner === 'tie') {
    // Score tiebreak - higher total wins; if still tied, FOR side wins.
    const forP = match.players.find(p => p.side === 'for');
    const againstP = match.players.find(p => p.side === 'against');
    const forScore = match.scores[forP.userId] || 0;
    const againstScore = match.scores[againstP.userId] || 0;
    winnerId = forScore >= againstScore ? forP.userId : againstP.userId;
  } else {
    const winnerP = match.players.find(p => p.side === match.verdict.winner);
    winnerId = winnerP?.userId || null;
  }
  entry.winnerId = winnerId;
  entry.state = 'finished';

  // Mark loser eliminated.
  for (const p of match.players) {
    if (p.userId === winnerId) continue;
    const tp = t.players.find(x => x.userId === p.userId);
    if (tp && !tp.eliminated) {
      tp.eliminated = true;
      tp.eliminatedAt = Date.now();
      tp.eliminatedInRound = entry.round;
    }
  }

  // Round complete?
  const roundEntries = t.bracket.filter(b => b.round === entry.round).sort((a, b) => a.matchIndex - b.matchIndex);
  const allDone = roundEntries.every(b => b.state === 'finished');
  if (!allDone) {
    pushTournamentEvent(t, 'match_finished', { tournament: publicTournamentState(t) });
    return;
  }
  const winners = roundEntries.map(b => b.winnerId).filter(Boolean);
  if (winners.length <= 1) {
    t.state = 'finished';
    t.champion = winners[0] || null;
    t.finishedAt = Date.now();
    pushTournamentEvent(t, 'finished', { tournament: publicTournamentState(t) });
    return;
  }
  createTournamentRound(t, entry.round + 1, winners);
  pushTournamentEvent(t, 'round_advanced', { tournament: publicTournamentState(t) });
}

// POST /api/debate/tournament - create empty tournament; host joins.
app.post('/api/debate/tournament', authMiddleware, (req, res) => {
  try {
    const size = [4, 8, 16].includes(Number(req.body?.size)) ? Number(req.body.size) : 8;
    const topic = String(req.body?.topic || '').trim();
    // Optional human-readable tournament name. Defaults to topic so
    // existing API consumers see no behavior change.
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const timedMode = !!req.body?.timedMode;
    const rawRounds = Number(req.body?.maxRounds);
    // Tournaments need finite per-match round caps so the bracket can
    // actually advance. Default to 5, clamp to [3, 10].
    const maxRounds = Number.isFinite(rawRounds) && rawRounds >= 3 ? Math.min(10, Math.floor(rawRounds)) : 5;
    if (!topic) return res.status(400).json({ error: 'Topic required' });

    // Optional per-round topics. Host can give the semi / final etc. its
    // own topic; any round missing here falls back to the main topic.
    // Body shape: { roundTopics: { "1": "...", "2": "...", ... } }
    const totalRounds = Math.log2(size);
    const roundTopics = {};
    const incoming = req.body?.roundTopics;
    if (incoming && typeof incoming === 'object') {
      for (let r = 1; r <= totalRounds; r++) {
        const v = incoming[r] ?? incoming[String(r)];
        if (typeof v === 'string' && v.trim()) {
          roundTopics[r] = v.trim().slice(0, 300);
        }
      }
    }

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });

    // Host can opt out of playing - they organize and watch, others fill
    // the bracket. Defaults to playing (true) for backwards-compat.
    const hostPlays = req.body?.hostPlays !== false;
    const hostName = users[email].name || email.split('@')[0];

    const code = newTournamentCode();
    const t = {
      code,
      state: 'waiting',
      size,
      name: name || topic.slice(0, 60),
      topic,
      roundTopics,
      timedMode,
      maxRounds,
      hostId: req.userId,
      hostName,
      hostPlays,
      // When the host is just organizing, their SSE stream is parked
      // here so pushTournamentEvent can deliver updates without them
      // having a player slot.
      hostStream: null,
      players: hostPlays
        ? [{ userId: req.userId, name: hostName, stream: null }]
        : [],
      bracket: [],
      champion: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    tournaments.set(code, t);
    res.json({ code, tournament: publicTournamentState(t) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/debate/tournament/:code/join - add a player to the lobby.
app.post('/api/debate/tournament/:code/join', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.state !== 'waiting') return res.status(409).json({ error: 'Tournament already started' });
  // Organizer-only host calling /join is a no-op - they're already in
  // the tournament via t.hostId, just not as a player.
  if (!t.hostPlays && req.userId === t.hostId) {
    t.lastActivity = Date.now();
    return res.json({ tournament: publicTournamentState(t) });
  }
  if (t.players.some(p => p.userId === req.userId)) {
    t.lastActivity = Date.now();
    return res.json({ tournament: publicTournamentState(t) });
  }
  if (t.players.length >= t.size) return res.status(409).json({ error: 'Tournament is full' });
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  t.players.push({
    userId: req.userId,
    name: (email && users[email].name) || (email && email.split('@')[0]) || 'Player',
    stream: null,
  });
  t.lastActivity = Date.now();
  pushTournamentEvent(t, 'player_joined', { tournament: publicTournamentState(t) });
  res.json({ tournament: publicTournamentState(t) });
});

// GET /api/debate/tournament/:code/stream - SSE for bracket updates.
app.get('/api/debate/tournament/:code/stream', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const player = t.players.find(p => p.userId === req.userId);
  const isOrganizer = !player && t.hostId === req.userId; // organizer-only host
  if (!player && !isOrganizer) return res.status(403).json({ error: 'Not in this tournament' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (player) player.stream = res;
  else t.hostStream = res;
  res.write(`data: ${JSON.stringify({ type: 'snapshot', tournament: publicTournamentState(t) })}\n\n`);
  res.flush?.();

  const heartbeat = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); res.flush?.(); } catch {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    if (player && player.stream === res) player.stream = null;
    if (isOrganizer && t.hostStream === res) t.hostStream = null;
  });
});

// POST /api/debate/tournament/:code/kick - host removes a player from
// the lobby. Only allowed while the tournament is in 'waiting' state.
app.post('/api/debate/tournament/:code/kick', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.hostId !== req.userId) return res.status(403).json({ error: 'Only host can kick' });
  if (t.state !== 'waiting') return res.status(409).json({ error: 'Cannot kick after tournament starts' });
  const targetId = String(req.body?.userId || '');
  if (!targetId) return res.status(400).json({ error: 'userId required' });
  if (targetId === t.hostId) return res.status(400).json({ error: 'Host cannot kick themselves' });
  const target = t.players.find(p => p.userId === targetId);
  if (!target) return res.status(404).json({ error: 'Player not in lobby' });

  // Tell the kicked player directly before closing their stream, so their
  // client can show a "you were kicked" toast and bail out.
  if (target.stream && !target.stream.writableEnded) {
    try {
      target.stream.write(`data: ${JSON.stringify({ type: 'kicked' })}\n\n`);
      target.stream.flush?.();
      target.stream.end();
    } catch {}
    target.stream = null;
  }
  t.players = t.players.filter(p => p.userId !== targetId);
  t.lastActivity = Date.now();
  pushTournamentEvent(t, 'player_kicked', { tournament: publicTournamentState(t), kickedId: targetId });
  res.json({ tournament: publicTournamentState(t) });
});

// POST /api/debate/tournament/:code/start - host starts when lobby is full.
app.post('/api/debate/tournament/:code/start', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  if (t.hostId !== req.userId) return res.status(403).json({ error: 'Only host can start' });
  if (t.state !== 'waiting') return res.status(409).json({ error: 'Already started' });
  if (t.players.length < t.size) return res.status(409).json({ error: `Need ${t.size - t.players.length} more player(s)` });

  // Random opening pairings.
  const ids = t.players.map(p => p.userId);
  shuffleInPlace(ids);
  createTournamentRound(t, 1, ids);
  t.state = 'playing';
  t.startedAt = Date.now();
  pushTournamentEvent(t, 'started', { tournament: publicTournamentState(t) });
  res.json({ tournament: publicTournamentState(t) });
});

// GET /api/debate/tournament/:code - fetch current state. Useful for
// players returning to the bracket view from inside a match.
app.get('/api/debate/tournament/:code', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const isPlayer = t.players.some(p => p.userId === req.userId);
  const isOrganizer = t.hostId === req.userId; // organizer-host counts as in-tournament
  if (!isPlayer && !isOrganizer) return res.status(403).json({ error: 'Not in this tournament' });
  res.json({ tournament: publicTournamentState(t) });
});

// POST /api/debate/tournament/:code/leave - leave the lobby (waiting),
// or forfeit your current bracket match (playing).
app.post('/api/debate/tournament/:code/leave', authMiddleware, (req, res) => {
  const t = tournaments.get(req.params.code);
  if (!t) return res.json({ ok: true });
  // Organizer-only host leaving (or cancelling) before start.
  if (t.hostId === req.userId && !t.players.some(p => p.userId === req.userId)) {
    pushTournamentEvent(t, 'cancelled', {});
    if (t.hostStream) { try { t.hostStream.end(); } catch {} t.hostStream = null; }
    tournaments.delete(t.code);
    return res.json({ ok: true, cancelled: true });
  }
  const player = t.players.find(p => p.userId === req.userId);
  if (!player) return res.json({ ok: true });

  if (t.state === 'waiting') {
    // Remove from lobby. Host leaving cancels the tournament.
    if (t.hostId === req.userId) {
      pushTournamentEvent(t, 'cancelled', {});
      tournaments.delete(t.code);
      return res.json({ ok: true, cancelled: true });
    }
    t.players = t.players.filter(p => p.userId !== req.userId);
    if (player.stream) { try { player.stream.end(); } catch {} }
    pushTournamentEvent(t, 'player_left', { tournament: publicTournamentState(t) });
    return res.json({ ok: true });
  }

  // Mid-tournament leave → forfeit any in-progress match they're in.
  const live = t.bracket.find(b => b.state === 'playing' && b.players.includes(req.userId));
  if (live) {
    const match = debateMatches.get(live.code);
    if (match && match.state === 'playing') {
      // Award the win to the opponent and let advance logic eliminate
      // the leaver. Synthetic verdict so finalizeDebateMatch isn't needed.
      const oppEntry = match.players.find(p => p.userId !== req.userId);
      match.verdict = {
        winner: oppEntry?.side || 'for',
        summary: `${player.name} forfeited.`,
        forStrongest: '',
        againstStrongest: '',
      };
      match.state = 'finished';
      match.lastActivity = Date.now();
      pushDebateEvent(match, 'finished', { match: publicDebateState(match) });
      // Forfeit goes into both players' history before the bracket
      // advances - finalizeDebateMatch isn't called here.
      try { recordForfeitHistory(match, req.userId); } catch (e) { console.error('Forfeit history failed:', e); }
      advanceTournamentBracket(t.code, match.code);
    }
  } else {
    // Not in a live match - just mark eliminated.
    player.eliminated = true;
    player.eliminatedAt = Date.now();
    pushTournamentEvent(t, 'player_left', { tournament: publicTournamentState(t) });
  }
  if (player.stream) { try { player.stream.end(); } catch {} player.stream = null; }
  res.json({ ok: true });
});

// GET /api/debate/history - list this user's finished matches.
app.get('/api/debate/history', authMiddleware, (req, res) => {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  const u = email ? users[email] : null;
  const history = Array.isArray(u?.debateHistory) ? u.debateHistory : [];
  // Summary list (lightweight) - exclude full transcripts by default to
  // keep the response small. Fetch individual entries via ?full=1 when
  // viewing a specific record.
  const wantFull = req.query?.full === '1';
  res.json({
    history: wantFull ? history : history.map(h => ({
      mode: h.mode, code: h.code || null, topic: h.topic, finishedAt: h.finishedAt,
      mySide: h.mySide, myScore: h.myScore, opponent: h.opponent, opponentScore: h.opponentScore,
      result: h.result, verdict: h.verdict ? { winner: h.verdict.winner, summary: h.verdict.summary } : null,
      timedMode: !!h.timedMode, maxRounds: h.maxRounds || 0,
      tournament: h.tournament || null,
      forfeit: !!h.forfeit,
      turnCount: Array.isArray(h.turns) ? h.turns.length : 0,
    })),
    stats: {
      total: history.length,
      wins: history.filter(h => h.result === 'win').length,
      losses: history.filter(h => h.result === 'loss').length,
      ties: history.filter(h => h.result === 'tie').length,
    },
  });
});

// GET /api/debate/history/:id - fetch one match with full transcript.
// `id` is the finishedAt timestamp (history records are keyed by it
// since match codes get reused once a match leaves the live Map).
app.get('/api/debate/history/:id', authMiddleware, (req, res) => {
  const users = loadUsers();
  const email = findEmailById(users, req.userId);
  const u = email ? users[email] : null;
  const history = Array.isArray(u?.debateHistory) ? u.debateHistory : [];
  const id = Number(req.params.id);
  const entry = history.find(h => h.finishedAt === id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json({ entry });
});

// ═══════════════════════════════════════════════════════
// TRIAL MODE - QB-style tossup + spaced repetition (SM-2)
// ═══════════════════════════════════════════════════════

function sm2Update(card, quality) {
  let { ease = 2.5, interval = 1, reps = 0 } = card;
  if (quality < 3) { reps = 0; interval = 1; }
  else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);
  return { ...card, ease: Math.round(ease * 100) / 100, interval, reps, nextDue: nextDue.toISOString(), lastReviewed: new Date().toISOString() };
}

// Generate QB-style tossup questions
app.post('/api/trial/generate', authMiddleware, async (req, res) => {
  try {
    const { topic = 'Science', count = 5, difficulty = 'medium' } = req.body;
    const diffMap = { easy: 'introductory/middle-school', medium: 'high-school varsity', hard: 'college/national championship' };
    const diffLabel = diffMap[difficulty] || diffMap.medium;

    const systemPrompt = `You are a quiz bowl question writer specializing in ${diffLabel}-level tossups. Output ONLY valid JSON, no markdown or fences.`;
    const userPrompt = `Write ${count} tossup questions on the topic "${topic}" at ${diffLabel} difficulty.

Each tossup must:
- Be 4-8 sentences long, starting with obscure clues and ending with the most obvious giveaway
- Use the classic pyramid structure (hard clues → easy giveaway)
- Cover different specific sub-topics within "${topic}"
- Have a clear, concise answer (a specific name, term, work, or event)

Return JSON:
{
  "questions": [
    {
      "question": "Full tossup text as a single continuous paragraph...",
      "answer": "Short canonical answer (1-5 words)",
      "topic": "${topic}",
      "difficulty": "${difficulty}"
    }
  ]
}`;

    const result = await callGemini(systemPrompt, [{ role: 'user', content: userPrompt }], DEFAULT_MODEL, 8192, { jsonMode: true, temperature: 0.8 });
    if (!result.success) return res.status(500).json({ error: 'AI generation failed' });

    const parsed = parseAIJson(result.data.content?.[0]?.text || '');
    if (!parsed?.questions) return res.status(500).json({ error: 'Invalid AI response' });

    const questions = parsed.questions.map(q => ({
      id: crypto.randomUUID(),
      question: q.question,
      answer: q.answer,
      topic: q.topic || topic,
      difficulty: q.difficulty || difficulty,
    }));

    res.json({ questions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get SRS queue for the current user
app.get('/api/trial/queue', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const items = users[email].data?.trialItems || [];
    res.json({ items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Save trial session results - updates SM-2 state per item
app.post('/api/trial/save', authMiddleware, (req, res) => {
  try {
    const { results } = req.body;
    if (!Array.isArray(results)) return res.status(400).json({ error: 'results must be an array' });

    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    users[email].data = migrateUserData(users[email].data);

    if (!Array.isArray(users[email].data.trialItems)) users[email].data.trialItems = [];
    if (!users[email].data.trialStats) users[email].data.trialStats = { totalSessions: 0, totalXP: 0, totalCorrect: 0, totalQuestions: 0 };

    const itemMap = {};
    for (const item of users[email].data.trialItems) itemMap[item.id] = item;

    let sessionXP = 0;
    let sessionCorrect = 0;

    for (const r of results) {
      const { questionId, question, quality, correct, buzzRatio } = r;
      if (!questionId || !question) continue;

      const existing = itemMap[questionId] || {
        id: questionId,
        question: question.question,
        answer: question.answer,
        topic: question.topic,
        difficulty: question.difficulty,
        ease: 2.5, interval: 1, reps: 0, nextDue: new Date().toISOString(),
      };

      const updated = sm2Update(existing, quality ?? (correct ? 4 : 1));
      itemMap[questionId] = updated;

      if (correct) {
        sessionCorrect++;
        sessionXP += Math.round(10 * Math.max(0.5, 2 - (buzzRatio || 1)));
      }
    }

    users[email].data.trialItems = Object.values(itemMap);
    users[email].data.trialStats.totalSessions += 1;
    users[email].data.trialStats.totalXP += sessionXP;
    users[email].data.trialStats.totalCorrect += sessionCorrect;
    users[email].data.trialStats.totalQuestions += results.length;

    saveUsers(users);
    res.json({ success: true, xpEarned: sessionXP });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get trial statistics
app.get('/api/trial/stats', authMiddleware, (req, res) => {
  try {
    const users = loadUsers();
    const email = findEmailById(users, req.userId);
    if (!email) return res.status(404).json({ error: 'User not found' });
    const stats = users[email].data?.trialStats || { totalSessions: 0, totalXP: 0, totalCorrect: 0, totalQuestions: 0 };
    const items = users[email].data?.trialItems || [];
    const now = new Date();
    const dueCount = items.filter(i => !i.nextDue || new Date(i.nextDue) <= now).length;
    res.json({ ...stats, dueCount, totalItems: items.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
