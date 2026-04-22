// Translate raw AI/stream errors into user-facing messages.
// Keep messages short, specific, and actionable. Never expose stack traces
// or full upstream JSON payloads to end users.
export function friendlyAIError(raw) {
  // Server plan-limit responses carry a structured code. Handle those first
  // so they never fall through to generic "AI error" messaging.
  const code = raw?._code || raw?.code || raw?.error;
  const serverMsg = typeof raw?.message === 'string' ? raw.message : '';
  if (code === 'message_limit_reached') {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || "You've hit today's free-plan message limit. Upgrade to Pro for unlimited, or come back tomorrow when your credits reset.",
      planLimit: true,
    };
  }
  if (code === 'curriculum_limit_reached') {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || "Free plans include 1 curriculum per week. Upgrade to Pro for unlimited curricula.",
      planLimit: true,
    };
  }
  if (code === 'debate_limit_reached') {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || "Free plans include 1 debate per week. Upgrade to Pro for unlimited debates.",
      planLimit: true,
    };
  }
  if (code === 'quizbowl_limit_reached') {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || "Free plans include a few Quiz Bowl games per day. Upgrade to Pro for unlimited.",
      planLimit: true,
    };
  }
  // HTTP 402 always means "plan limit" in this app, regardless of code.
  if (raw?.status === 402) {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || "You've hit your plan's limit. Upgrade to Pro for unlimited.",
      planLimit: true,
    };
  }

  const msg = String(serverMsg || raw?.error || raw || '').toLowerCase();

  if (!msg || msg === 'undefined' || msg === 'null') {
    return { title: 'Something went wrong', body: 'The AI didn\'t respond. Try sending again in a moment.' };
  }

  // Client-side abort (usually user navigated away)
  if (msg.includes('aborterror') || msg.includes('abort')) {
    return { title: 'Request cancelled', body: 'The previous request was cancelled. Try again.' };
  }

  // Gemini rate limit / quota
  if (msg.includes('resource_exhausted') || msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
    return { title: 'AI is busy', body: 'Too many requests right now. Try again in a few seconds.' };
  }

  // Server overload / upstream 5xx
  if (msg.includes('503') || msg.includes('502') || msg.includes('overloaded') || msg.includes('unavailable')) {
    return { title: 'AI is temporarily down', body: 'The model provider is having trouble. Try again in a minute.' };
  }

  // Timeout
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('etimedout')) {
    return { title: 'Request timed out', body: 'The AI took too long to respond. Try a shorter message or try again.' };
  }

  // Auth / token
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid token') || msg.includes('authentication')) {
    return { title: 'Session expired', body: 'Please sign in again to continue.' };
  }

  // Quota exceeded (fallback string-match for pre-structured errors)
  if (msg.includes('daily message limit') || msg.includes('weekly limit') || msg.includes('free plan') || msg.includes('free-plan') || msg.includes('hit the free') || msg.includes('upgrade to pro')) {
    return {
      title: 'Free plan credits used up',
      body: serverMsg || 'You\'ve hit your plan\'s limit. Upgrade to Pro for unlimited, or come back tomorrow.',
      planLimit: true,
    };
  }

  // Safety / content filter
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('harm_category')) {
    return { title: 'Can\'t answer that', body: 'The AI\'s safety filter blocked this response. Try rephrasing.' };
  }

  // Network
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('connection')) {
    return { title: 'Connection problem', body: 'Check your internet and try again.' };
  }

  // API key / config issue (shouldn't reach users, but just in case)
  if (msg.includes('api key') || msg.includes('gemini_api_key')) {
    return { title: 'AI not configured', body: 'The server is missing its AI credentials. Contact support.' };
  }

  // Fall-through: show a generic message, keep the raw for detail-minded users.
  return {
    title: 'Something went wrong',
    body: 'The AI ran into an error. Try again, and if it keeps happening, let us know.',
  };
}

// Shape of the placeholder we insert into a chat `messages` array on error.
export function errorChatMessage(raw) {
  const { title, body, planLimit } = friendlyAIError(raw);
  const bodyWithCta = planLimit
    ? `${body}\n\n[Upgrade to Pro →](/settings)`
    : body;
  return {
    role: 'assistant',
    content: `**${title}.** ${bodyWithCta}`,
    _error: true,
    _planLimit: !!planLimit,
    timestamp: new Date().toISOString(),
  };
}
