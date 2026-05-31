import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '../../api/client';

// Discussion block - AI converses with the student about what they just
// learned. Block shape:
//   { type: 'discussion', title, prompt, talkingPoints: [string,...] }
//
// The block seeds the chat with an AI message based on `prompt`, then
// trades 4+ exchanges with the student. Marks complete once the student
// has answered at least 3 substantive messages OR clicks "Wrap up".
//
// Keeps the entire chat in local state - nothing persists server-side
// (this is a learning interaction, not a chat thread). Uses the shared
// /api/chat endpoint with a tutor-style system prompt.
export default function DiscussionBlock({ block, onComplete }) {
  const seed = block.prompt || 'What stood out to you from this lesson?';
  const points = Array.isArray(block.talkingPoints) ? block.talkingPoints : [];
  const [messages, setMessages] = useState([{ role: 'assistant', content: seed }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Substantive student replies = messages of 10+ chars. We unlock the
  // "Done discussing" button after 2 of those so a single one-liner
  // doesn't graduate the student out of the discussion.
  const studentReplies = messages.filter(m => m.role === 'user' && m.content.trim().length >= 10).length;
  const canFinish = studentReplies >= 2;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSend(e) {
    e?.preventDefault?.();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const system = `You are a Socratic study tutor running a short discussion about a specific lesson topic.${
        block.title ? ` Topic: "${block.title}".` : ''
      }${
        points.length ? ` Hit these talking points across the discussion: ${points.map(p => `"${p}"`).join(', ')}.` : ''
      } Ask probing follow-up questions, validate correct understanding briefly, gently correct misconceptions, and keep replies to 2-4 sentences. Plain prose; no markdown headings or bullet lists. End most replies with a single question that pushes the student's thinking forward.`;
      const result = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          system,
          messages: next.map(m => ({ role: m.role, content: m.content })),
          max_tokens: 400,
        }),
      });
      const reply = result?.content?.[0]?.text || '…';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '(I lost the thread for a second - try resending that?)' }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="cl-anim-in">
      <div className="border-t border-white/[0.07] pt-7 lg:pt-9 mb-6">
        <div className="mx-auto max-w-[68ch]">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-400/30 items-center justify-center">
              <Sparkles size={13} className="text-blue-300" />
            </span>
            <h2 className="text-[22px] font-semibold text-white">{block.title || 'Discussion'}</h2>
          </div>
          <p className="text-[13px] text-white/55 mb-5 leading-relaxed">
            Talk through what you learned. The AI will push back when something's unclear and confirm when you've got it.
          </p>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="space-y-3 max-h-[420px] overflow-y-auto pr-1 -mr-1 mb-4"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-500 text-white rounded-tr-md'
                      : 'bg-white/[0.05] text-white/85 border border-white/[0.07] rounded-tl-md'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-p:text-white/85 prose-strong:text-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white/[0.05] border border-white/[0.07] rounded-2xl rounded-tl-md px-3.5 py-2.5 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-typing-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-typing-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-typing-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
              placeholder="Type your thoughts…"
              rows={1}
              disabled={busy}
              className="flex-1 resize-none rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/90 placeholder:text-white/30 outline-none focus:border-blue-400/40 focus:bg-white/[0.06] transition-colors"
              style={{ maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Send size={12} /> Send
            </button>
          </form>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3 border-t border-white/[0.05] pt-5">
        <span className="text-[11px] text-white/35">
          {canFinish
            ? 'Nice exchange - finish when you feel done.'
            : `Send ${Math.max(0, 2 - studentReplies)} more substantive ${studentReplies === 1 ? 'reply' : 'replies'} to finish.`}
        </span>
        <button
          onClick={onComplete}
          disabled={!canFinish}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Done discussing <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
