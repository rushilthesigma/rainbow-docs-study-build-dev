import { useState, useRef, useCallback } from 'react';
import { Swords, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../../api/client';
import ChatContainer from '../../chat/ChatContainer';
import { errorChatMessage } from '../../../utils/aiErrors';

function buildSystem(side) {
  return `You are a skilled debate partner. The user is arguing ${side === 'for' ? 'FOR' : 'AGAINST'} the topic. You MUST argue the ${side === 'for' ? 'AGAINST' : 'FOR'} position.

Rules:
1. Always argue the opposite side from the user — you are ${side === 'for' ? 'AGAINST' : 'FOR'} the topic
2. Use logical arguments, evidence, and rhetorical techniques
3. Be respectful but firm — challenge weak points in the user's reasoning
4. After 3-4 exchanges, offer a brief summary of both sides and declare who made stronger points
5. Use markdown for formatting — bold key points, use bullet lists for arguments
6. Keep responses focused and concise (2-3 paragraphs max per turn)

You are debating to help the user think critically and strengthen their argumentation skills.`;
}

export default function DebateApp() {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [topic, setTopic] = useState('');
  const [started, setStarted] = useState(false);
  const [side, setSide] = useState(null); // 'for' | 'against'
  const [streamingContent, setStreamingContent] = useState('');
  const [quotaError, setQuotaError] = useState(null);
  const systemRef = useRef('');

  const doSend = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);

    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ system: systemRef.current, messages: allMessages, max_tokens: 1024 }),
      });
      const reply = result.content?.[0]?.text || 'I need a moment to formulate my argument...';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
    } catch (err) {
      setMessages(prev => [...prev, errorChatMessage(err)]);
    }
    setStreamingContent('');
    setStreaming(false);
  }, [messages]);

  function handleSend(text) {
    if (streaming) return;
    doSend(text);
  }

  function handleReset() {
    setMessages([]); setStarted(false); setTopic(''); setSide(null);
  }

  async function startDebate(t, s) {
    setQuotaError(null);
    // Consume the weekly debate quota BEFORE any LLM call — free plan is 1/week
    try {
      await apiFetch('/api/debate/start', { method: 'POST' });
    } catch (err) {
      if (err.planLimit || err.code === 'debate_limit_reached') {
        setQuotaError(err.message || 'Weekly debate limit reached.');
        return;
      }
      // Non-quota error: still allow the debate (server issue)
      console.error('debate/start failed', err);
    }
    setSide(s);
    setTopic(t);
    setStarted(true);
    systemRef.current = buildSystem(s);
    doSend(`Topic: "${t}". I'm arguing ${s === 'for' ? 'FOR' : 'AGAINST'} this. Let's begin.`);
  }

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622]">
      <Swords size={16} className="text-blue-500" />
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Debate Mode</span>
      {started && (
        <>
          {side && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">{side === 'for' ? 'Arguing FOR' : 'Arguing AGAINST'}</span>}
          <button onClick={handleReset} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <RotateCcw size={12} /> New
          </button>
        </>
      )}
    </div>
  );

  if (!started) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0D0D14] rounded-xl border border-gray-200 dark:border-[#2A2A40] overflow-hidden">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Swords size={36} className="text-blue-400 mb-4" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Challenge Your Thinking</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5 max-w-sm">
            Pick a topic, choose your side, and the AI argues the opposite.
          </p>

          {/* Topic input */}
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Enter a debate topic..."
            className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#2A2A40] bg-white dark:bg-[#161622] text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/40 mb-3"
          />

          {/* Quick topics */}
          <div className="flex flex-wrap gap-1.5 justify-center mb-5 max-w-sm">
            {['Social media is harmful', 'AI will replace most jobs', 'College is worth it', 'Space exploration matters'].map(t => (
              <button key={t} onClick={() => setTopic(t)} className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-[11px] font-medium text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                {t}
              </button>
            ))}
          </div>

          {/* Side selection */}
          {topic.trim() && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400 mb-1">Choose your side:</p>
              <div className="flex gap-3">
                <button onClick={() => startDebate(topic.trim(), 'for')} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                  Argue FOR
                </button>
                <button onClick={() => startDebate(topic.trim(), 'against')} className="px-5 py-2.5 rounded-xl border-2 border-blue-500 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/15 transition-colors">
                  Argue AGAINST
                </button>
              </div>
            </div>
          )}

          {quotaError && (
            <p className="mt-4 max-w-sm text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-center">
              {quotaError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <ChatContainer
      messages={messages}
      streamingContent={streamingContent}
      onSend={handleSend}
      disabled={streaming}
      placeholder={streaming ? 'Formulating argument...' : 'Make your argument...'}
      header={header}
      className="h-full"
    />
  );
}
