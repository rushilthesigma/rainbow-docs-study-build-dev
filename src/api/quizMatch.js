import { apiFetch, apiUrl, getToken } from './client';

export const createMatch = (opts) => apiFetch('/api/quizbowl/match', {
  method: 'POST',
  body: JSON.stringify(opts || {}),
});
export const joinMatch = (code, opts = {}) => apiFetch(`/api/quizbowl/match/${code}/join`, {
  method: 'POST', body: JSON.stringify(opts || {}),
});
export const setMatchTeam = (code, team, userId, teamNames) => apiFetch(`/api/quizbowl/match/${code}/team`, {
  method: 'POST', body: JSON.stringify({ team, userId, teamNames }),
});
export const startMatch = (code, settings) => apiFetch(`/api/quizbowl/match/${code}/start`, {
  method: 'POST',
  body: JSON.stringify(settings || {}),
});
export const buzzMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/buzz`, { method: 'POST' });
export const answerMatch = (code, answer) => apiFetch(`/api/quizbowl/match/${code}/answer`, {
  method: 'POST',
  body: JSON.stringify({ answer }),
});
export const answerMatchBonus = (code, answer = '', pass = false) => apiFetch(`/api/quizbowl/match/${code}/bonus-answer`, {
  method: 'POST', body: JSON.stringify({ answer, pass }),
});
export const requestAnswerReview = (code) => apiFetch(`/api/quizbowl/match/${code}/review`, { method: 'POST' });
export const resolveAnswerReview = (code, reviewId, accepted) => apiFetch(`/api/quizbowl/match/${code}/review/${reviewId}`, {
  method: 'POST',
  body: JSON.stringify({ accepted }),
});
export const nextMatchQuestion = (code) => apiFetch(`/api/quizbowl/match/${code}/next`, { method: 'POST' });
export const endMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/end`, { method: 'POST' });
export const leaveMatch = (code) => apiFetch(`/api/quizbowl/match/${code}/leave`, { method: 'POST' });

// Solo "Past QB questions" mode - pulls real tossups from QBReader by
// category + difficulty. Returns { tossups, source: 'qbreader' }.
export const fetchQBReaderTossups = ({ count = 10, category = 'Mixed', difficulty = 'Medium' } = {}) => {
  const params = new URLSearchParams({ count: String(count), category, difficulty });
  return apiFetch(`/api/quizbowl/tossups?${params.toString()}`);
};

// Clue Lab - clue analysis over a set of tossups. Either pass
// { categories, difficulties, answerQuery } to pull from QBReader, or
// { questions: [...] } with pasted question text. Returns n-gram lists
// plus the deduped question set.
export const runClueAnalysis = (payload) => apiFetch('/api/quizbowl/clue-analysis', {
  method: 'POST',
  body: JSON.stringify(payload || {}),
});

// ===== Solo set history + recommendations =====
// Saves a completed solo set so the QuizBowl hub can show past sets +
// category accuracy, and so the AI can target the player's weak spots.
export const saveQuizBowlSet = (payload) => apiFetch('/api/quizbowl/sets', {
  method: 'POST',
  body: JSON.stringify(payload),
});

// Returns { sets, stats: { sets, totalQuestions, totalCorrect, accuracy,
// studyMs, categoryStats, lastPlayedAt } }
export const fetchQuizBowlHistory = () => apiFetch('/api/quizbowl/sets');
export const renamePlayedQuizBowlSet = (id, title) => apiFetch(`/api/quizbowl/sets/${id}`, {
  method: 'PATCH', body: JSON.stringify({ title }),
});
export const deletePlayedQuizBowlSet = (id) => apiFetch(`/api/quizbowl/sets/${id}`, { method: 'DELETE' });

// Country practice catalog and editable personal packet library. These are
// intentionally separate from completed-set history above.
export const fetchQuizBowlCountryPresets = () => apiFetch('/api/quizbowl/presets');
export const fetchQuizBowlCountryPreset = (slug) => apiFetch(`/api/quizbowl/presets/${encodeURIComponent(slug)}`);
export const fetchQuizBowlPresetSet = (slug) => apiFetch(`/api/quizbowl/presets/${encodeURIComponent(slug)}/set`, { method: 'POST' });
export const fetchSavedQuizBowlSets = () => apiFetch('/api/quizbowl/saved-sets');
export const getSavedQuizBowlSet = (id) => apiFetch(`/api/quizbowl/saved-sets/${id}`);
export const createSavedQuizBowlSet = (payload) => apiFetch('/api/quizbowl/saved-sets', {
  method: 'POST', body: JSON.stringify(payload),
});
export async function importSavedQuizBowlPacket(file) {
  const body = new FormData();
  body.append('file', file);
  const token = getToken();
  const response = await fetch(apiUrl('/api/quizbowl/saved-sets/import'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Import failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
export const updateSavedQuizBowlSet = (id, payload) => apiFetch(`/api/quizbowl/saved-sets/${id}`, {
  method: 'PUT', body: JSON.stringify(payload),
});
export const deleteSavedQuizBowlSet = (id) => apiFetch(`/api/quizbowl/saved-sets/${id}`, { method: 'DELETE' });

// Public, already-written packet collection. Publishing a personal packet
// makes it visible here; playing a listing never copies or regenerates it.
export const fetchQuizBowlCollection = () => apiFetch('/api/quizbowl/collection');
export const getQuizBowlCollectionSet = (listingId) => apiFetch(`/api/quizbowl/collection/${encodeURIComponent(listingId)}`);

// Returns { recommendations: [{ kind, category, difficulty, reason }] }
export const fetchQuizBowlRecommendations = () => apiFetch('/api/quizbowl/recommendations');

// Returns { patterns: { totalBuzzes, avgBuzzPosition, early, mid, late,
// categoryPatterns, trend, optimalZone, recentBuzzes } }
export const fetchQuizBowlPatterns = () => apiFetch('/api/quizbowl/patterns');

// Returns { dueCategories: [{ category, interval, reps, ease, lastReviewed, nextDue }] }
// SM-2-based categories the algorithm says are due for re-drilling today.
export const fetchQuizBowlSm2Due = () => apiFetch('/api/quizbowl/sm2-due');

// Returns { matches: [{ id, code, category, difficulty, finishedAt, players, questions, myUserId, ... }] }
export const fetchQuizBowlMatches = () => apiFetch('/api/quizbowl/matches');

// Persist a finished AI/bot game (TrialSession runs those entirely
// client-side) so it shows up in the Replays tab alongside multiplayer
// matches. The server stamps player identity from the auth token.
export const saveAiMatchReplay = (payload) => apiFetch('/api/quizbowl/matches', {
  method: 'POST',
  body: JSON.stringify(payload),
});

// Returns { niches: [{ topic, reason }] } - Gemini-suggested niche sub-topics
// within a category for targeted AI drilling.
export const fetchQuizBowlNiches = ({ category, difficulty = 'Medium' } = {}) => {
  const params = new URLSearchParams({ category, difficulty });
  return apiFetch(`/api/quizbowl/niche-recommendations?${params.toString()}`);
};

// Host-only: buzz and answer on behalf of a bot player.
export const botBuzz = (code, botUserId) => apiFetch(`/api/quizbowl/match/${code}/bot-buzz`, {
  method: 'POST',
  body: JSON.stringify({ botId: botUserId }),
});
export const botAnswer = (code, botUserId, correct) => apiFetch(`/api/quizbowl/match/${code}/bot-answer`, {
  method: 'POST',
  body: JSON.stringify({ botId: botUserId, correct }),
});

// Subscribe to an SSE stream of match events.
// handlers: { onSnapshot, onPlayerJoined, onQuestionStart, onBuzz, onAnswerResult, onAnswerReview, onMatchEnd, onPlayerLeft, onError }
export function streamMatch(code, handlers) {
  const token = getToken();
  const controller = new AbortController();

  fetch(`/api/quizbowl/match/${code}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        handlers.onError?.(err.error || `stream ${response.status}`);
        return;
      }
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
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            const t = data.type;
            if (t === 'snapshot') handlers.onSnapshot?.(data.match);
            else if (t === 'player_joined') handlers.onPlayerJoined?.(data.match);
            else if (t === 'team_updated') handlers.onTeamUpdated?.(data.match);
            else if (t === 'generating') handlers.onGenerating?.(data.match);
            else if (t === 'start_failed') handlers.onStartFailed?.(data);
            else if (t === 'question_start') handlers.onQuestionStart?.(data);
            else if (t === 'buzz') handlers.onBuzz?.(data);
            else if (t === 'wrong_answer') handlers.onWrongAnswer?.(data);
            else if (t === 'answer_result') handlers.onAnswerResult?.(data);
            else if (t === 'bonus_start') handlers.onBonusStart?.(data);
            else if (t === 'bonus_result') handlers.onBonusResult?.(data);
            else if (t === 'answer_review') handlers.onAnswerReview?.(data);
            else if (t === 'match_end') handlers.onMatchEnd?.(data);
            else if (t === 'player_left') handlers.onPlayerLeft?.(data);
          } catch {}
        }
      }
    })
    .catch(err => {
      if (err.name !== 'AbortError') handlers.onError?.(err.message);
    });

  return () => controller.abort();
}
