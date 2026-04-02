import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pdfParse = _require('pdf-parse');
import {
  buildCurriculumPrompt, buildLessonPrompt, buildLessonChatPrompt,
  buildStudyModePrompt, buildGoalMilestonesPrompt, buildAssessmentPrompt,
  buildFlashcardPrompt, buildCueGenerationPrompt, buildSummaryPrompt,
} from './prompts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env'), override: true });

const app = express();
const PORT = process.env.PORT || 3002;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// Data storage — always use /data on Render (persistent disk), local dev uses project dir
const IS_RENDER = !!process.env.RENDER;
const DATA_DIR = process.env.DATA_DIR || (IS_RENDER ? '/data' : __dirname);
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error('Failed to create DATA_DIR:', e.message); }
console.log(`=== COVALENT STARTUP ===`);
console.log(`Data directory: ${DATA_DIR}`);
console.log(`Render: ${IS_RENDER}`);
console.log(`DATA_DIR exists: ${existsSync(DATA_DIR)}`);
console.log(`DATA_DIR writable: ${(() => { try { writeFileSync(join(DATA_DIR, '.write-test'), 'ok'); return true; } catch { return false; } })()}`);
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

// ===== MIDDLEWARE =====
app.use(cors());
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
    saveUsers(users);
    res.json({
      id: user.id,
      email: user.email || email,
      name: user.name,
      data: user.data,
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
async function callAnthropic(systemPrompt, messages, model, maxTokens = 4096) {
  let currentModel = model || DEFAULT_MODEL;
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: currentModel, max_tokens: maxTokens, system: systemPrompt, messages }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        return { success: true, data, model: currentModel };
      }

      const errorData = await response.json().catch(() => ({}));
      lastError = errorData.error?.message || `API error: ${response.status}`;

      if (response.status === 429 || response.status === 529 || response.status >= 500) {
        if (attempt === 1 && currentModel !== FALLBACK_MODEL) currentModel = FALLBACK_MODEL;
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      return { success: false, error: lastError, status: response.status };
    } catch (fetchErr) {
      lastError = fetchErr.name === 'AbortError' ? 'Request timed out' : fetchErr.message;
      if (attempt === 1 && currentModel !== FALLBACK_MODEL) currentModel = FALLBACK_MODEL;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { success: false, error: lastError || 'All attempts failed' };
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, system, model, max_tokens } = req.body;
    const systemPrompt = system || 'You are a helpful AI assistant.';
    const result = await callAnthropic(systemPrompt, messages, model, max_tokens || 4096);
    if (result.success) return res.json(result.data);
    return res.status(result.status || 500).json({ error: result.error });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== CURRICULUM ROUTES =====

// Generate a new curriculum
app.post('/api/curriculum/generate', authMiddleware, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings?.topic) return res.status(400).json({ error: 'Topic is required' });

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

      return { ...unit, id: `${curriculumId}-u${ui}`, locked: ui > 0, lessons };
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Stream from Anthropic
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 8192,
        system,
        messages: [{ role: 'user', content: user }],
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end();
      return;
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              res.write(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`);
            }
          } catch {}
        }
      }
    }

    // Save the full lesson content
    const usersAfter = loadUsers();
    const curr = (usersAfter[email].data?.curricula || []).find(c => c.id === req.params.id);
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

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
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

// Helper: stream AI response as SSE
async function streamAIResponse(res, systemPrompt, messages, onComplete) {
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: DEFAULT_MODEL, max_tokens: 8192, system: systemPrompt, messages, stream: true }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end();
      return;
    }

    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullContent += parsed.delta.text;
              res.write(`data: ${JSON.stringify({ content: parsed.delta.text })}\n\n`);
            }
          } catch {}
        }
      }
    }

    if (onComplete) await onComplete(fullContent);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    clearTimeout(timeout);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  }
}

// Lesson chat (conversational 5-phase)
app.post('/api/curriculum/:id/lesson/:lessonId/chat', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

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
      users[email].data.profile, users[email].data.preferences, lesson.chatHistory
    );

    // Build messages from chat history
    const aiMessages = lesson.chatHistory.map(m => ({ role: m.role, content: m.content }));

    await streamAIResponse(res, systemPrompt, aiMessages, async (fullContent) => {
      // Save AI response to chat history
      lesson.chatHistory.push({ role: 'assistant', content: fullContent, timestamp: new Date().toISOString() });

      // Check for phase transition
      if (fullContent.includes('[PHASE_COMPLETE]')) {
        const currentIdx = LESSON_PHASES.indexOf(lesson.phase);
        if (currentIdx < LESSON_PHASES.length - 1) {
          lesson.phase = LESSON_PHASES[currentIdx + 1];
        }
      }

      // Check for lesson completion
      if (fullContent.includes('[LESSON_COMPLETE]')) {
        lesson.isCompleted = true;
        // Parse completion data
        const match = fullContent.match(/\[LESSON_COMPLETE\]\s*(\{[^}]+\})/);
        if (match) {
          try {
            const completionData = JSON.parse(match[1]);
            lesson.phaseData = { ...lesson.phaseData, ...completionData };
            lesson.score = completionData.questionsCorrect;
            // Update XP
            const xp = completionData.xpEarned || 25;
            users[email].data.profile.xp += xp;
            if (users[email].data.profile.xp >= users[email].data.profile.xpToNextLevel) {
              users[email].data.profile.level++;
              users[email].data.profile.xp -= users[email].data.profile.xpToNextLevel;
              users[email].data.profile.xpToNextLevel = Math.floor(users[email].data.profile.xpToNextLevel * 1.5);
            }
          } catch {}
        }
        // Update streak
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
      }

      // Auto-complete goal milestones
      checkGoalMilestones(users[email].data);

      saveUsers(users);
    });
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

app.post('/api/study/chat', authMiddleware, async (req, res) => {
  try {
    const { message, sessionId, context } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

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
      users[email].data.curricula, users[email].data.preferences
    );

    const aiMessages = session.messages.map(m => ({ role: m.role, content: m.content }));

    // Send sessionId in the first event
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ sessionId: session.id })}\n\n`);

    await streamAIResponse(res, systemPrompt, aiMessages, async (fullContent) => {
      session.messages.push({ role: 'assistant', content: fullContent, timestamp: new Date().toISOString() });

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
    });
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
  const results = Object.values(social.profiles).filter(p => p.userId !== req.userId && (p.handle.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))).slice(0, 20);
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
  const friends = myProfile.friends.map(fid => social.profiles[fid]).filter(Boolean);
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
      locked: ui > 0,
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'covalent-ai' });
});

// SPA fallback (Express 5 syntax)
app.get('/{*path}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Covalent server running on port ${PORT}`);
});
