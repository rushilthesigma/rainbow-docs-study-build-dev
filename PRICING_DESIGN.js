/**
 * PRICING REDESIGN — PROPOSAL (not yet implemented)
 *
 * Review this file and say "implement it" to apply. Numbers can be adjusted.
 *
 * =============================================================================
 * PLANS (was: free / plus-lite / plus / lifetime / pro → now: free / paid)
 * =============================================================================
 *
 * Migration for existing users:
 *   'plus-lite' → 'paid'
 *   'plus'      → 'paid'
 *   'lifetime'  → 'paid'  (⚠️ downgrade from unlimited — change to keep unlimited?)
 *   'pro'       → 'paid'
 *   'free'      → 'free'
 *
 * NOTE: Lifetime users previously had unlimited. Two options:
 *   Option A: map lifetime → 'paid' (same 1000 credits/day as everyone else paid)
 *   Option B: keep a hidden 'lifetime' plan with unlimited credits, honor forever
 *   --> Mark your preference
 */

// =============================================================================
// CREDIT BUDGETS
// =============================================================================

const DAILY_CREDITS = {
  free: 100,   // resets every 24h rolling window (same as current msgWindow)
  paid: 9500,  // resets every 24h rolling window
  // lifetime: Infinity,  // uncomment if you pick Option B above
};

// =============================================================================
// MODEL CREDIT COSTS
// Based on actual API pricing per ~1400-token turn (800 input + 600 output).
// Gemini models intentionally scaled lower; Claude models scaled to true cost.
//
// Approximate API cost per message turn:
//   Flash Lite:     $0.00024   → baseline 1 credit
//   DeepSeek Flash: ~$0        → 1 credit (floor, free model)
//   DeepSeek Pro:   $0.00020   → 1 credit (cheap reasoning)
//   Flash:          $0.00048   → 2 credits
//   GPT-5.4 mini:   $0.00130   → 5 credits
//   Haiku 4.5:      $0.00304   → 10 credits  (slight discount vs true ~12.7x)
//   Gemini Pro:     $0.00700   → 20 credits  (scaled lower per your preference)
//   Sonnet 4.6:     $0.01140   → 35 credits  (true ~47x; scaled to round number)
//   GPT-5.4:        $0.01200   → 40 credits
// =============================================================================

const MODEL_CREDIT_COST = {
  //  key             credits  provider   notes
  'flash-lite':       1,    // gemini    free baseline ($0.00024/turn)
  'deepseek-flash':   1,    // deepseek  free model, floor at 1
  'flash':            2,    // gemini    2× Flash Lite ($0.00048/turn — verified accurate)
  'gpt-5.4-mini':     5,    // openai    free for everyone currently
  'deepseek-pro':     7,    // deepseek  reasoning model ~7× Flash Lite ($0.00175/turn)
  'haiku':            10,   // claude    ~10× Flash Lite (slight discount)
  'gemini-pro':       20,   // gemini    lower than raw cost ratio (user preference)
  'sonnet':           35,   // claude    ~35× Flash Lite
  'gpt-5.4':          40,   // openai    paid-only; close to Sonnet cost
};

// =============================================================================
// FEATURE CREDIT COSTS (one-time per action, not per message)
// =============================================================================

const FEATURE_CREDIT_COST = {
  // Curriculum generation — multi-step AI generation, expensive
  curriculumGeneration: 50,

  // AI note generation (generating notes from a topic/source via AI)
  // Costs the same as the model-credit for a chat message (uses MODEL_CREDIT_COST[model])
  // i.e. generating notes with Flash Lite = 1 cr, with Sonnet = 35 cr
  aiNoteGeneration: 'MODEL_CREDIT_COST[model]',  // dynamic, same as chat

  // Quiz Bowl — AI-generated tossup (each tossup fetched from AI)
  quizBowlAiTossup: 8,

  // Debate — no longer a per-session flat fee; charged per message sent,
  // same as chat: MODEL_CREDIT_COST[debateModel] per message
  // (e.g. Flash Lite debate = 1 cr/msg, Haiku debate = 10 cr/msg)
  debateMessage: 'MODEL_CREDIT_COST[model]',     // dynamic, same as chat

  // Note Map creation (just storage, count-capped instead — see NOTE_MAP_LIMIT)
  noteMapCreation: 0,
};

// =============================================================================
// NON-CREDIT HARD LIMITS
// (things that make more sense as a count cap than credit drain)
// =============================================================================

const NOTE_MAP_LIMIT = {
  free: 3,
  paid: Infinity,
};

// =============================================================================
// MODEL ACCESS
// Free users can access all models — they're just gated by credit cost.
// "paidOnly" flag is removed entirely; cost is the gate.
// Exception: GPT-5.4 might stay paid-only since it's expensive.
// =============================================================================

const MODEL_PAID_ONLY = {
  'gpt-5.4': true,   // $40 credits/msg — require paid plan regardless of credits
  // Everything else: open to free users, credit cost is the natural gate
};

// =============================================================================
// EXAMPLE: what free (100 credits/day) looks like in practice
// =============================================================================

const FREE_PLAN_EXAMPLES = `
  100 credits/day with model choices:
  ─────────────────────────────────────────────────────
  Flash Lite (1 cr/msg)      → 100 messages
  DeepSeek Flash (1 cr/msg)  → 100 messages
  Flash (2 cr/msg)           → 50 messages
  GPT-5.4 mini (5 cr/msg)    → 20 messages
  Haiku (10 cr/msg)          → 10 messages
  Gemini Pro (20 cr/msg)     → 5 messages
  Sonnet (35 cr/msg)         → ~3 messages
  GPT-5.4 (40 cr/msg)        → 2 messages (paid plan required anyway)

  Feature costs:
  ─────────────────────────────────────────────────────
  Curriculum gen (50 cr)     → 2/day at Flash Lite efficiency (or 1 + 50 msgs)
  Quiz Bowl game (5 cr)      → 20 games (or mix with chat)
  Debate session (10 cr)     → 10 sessions
`;

const PAID_PLAN_EXAMPLES = `
  1000 credits/day with model choices:
  ─────────────────────────────────────────────────────
  Flash Lite (1 cr/msg)      → 1000 messages
  Haiku (10 cr/msg)          → 100 messages
  Sonnet (35 cr/msg)         → ~28 messages
  GPT-5.4 (40 cr/msg)        → 25 messages

  Curriculum gen (50 cr)     → 20/day
`;

// =============================================================================
// USER DATA CHANGES (schema diff)
// =============================================================================

const USER_SCHEMA_DIFF = `
  REMOVE:
    user.plan: 'plus-lite' | 'plus' | 'lifetime' | 'pro'  →  just 'free' | 'paid'
    user.data.usage.msgWindow                              →  replaced by creditWindow
    user.data.usage.haikuWindow / haikuLockedUntil         →  removed (credits handle this)
    user.data.usage.deepseekWindow / deepseekLockedUntil   →  removed
    user.data.usage.gptWindow                              →  removed
    user.data.usage.curricula (weekly counter)             →  removed (credit cost instead)
    user.data.usage.debates   (weekly counter)             →  removed (credit cost instead)

  ADD:
    user.data.usage.creditWindow: [{ ts, cost }, ...]      →  same shape as msgWindow
    user.plan: 'free' | 'paid'                             →  simplified

  KEEP:
    user.proUntil, user.stripeCustomerId, user.stripeSubscriptionId  →  unchanged
    user.data.noteMaps                                     →  count capped by NOTE_MAP_LIMIT
    user.data.curricula                                    →  storage array unchanged
`;

// =============================================================================
// OPEN QUESTIONS — mark your choices
// =============================================================================

const OPEN_QUESTIONS = `
  1. LIFETIME USERS: Option A (→ paid, 1000 cr/day) or Option B (stay unlimited)?
     -->

  2. DAILY CREDITS: Free=100, Paid=1000 — adjust?
     -->

  3. CURRICULUM COST: 50 credits feels right, or too high / low?
     -->

  4. GPT-5.4: keep paid-only gate (on top of 40 cr cost), or credit-only gate?
     -->

  5. REFERRAL SYSTEM: keep referral → plus-lite upgrade, or remove entirely?
     -->

  6. CREDIT ROLLOVER: unused credits expire daily (current behavior), or roll over up to 2× cap?
     -->
`;

module.exports = {
  DAILY_CREDITS,
  MODEL_CREDIT_COST,
  FEATURE_CREDIT_COST,
  NOTE_MAP_LIMIT,
  MODEL_PAID_ONLY,
};
