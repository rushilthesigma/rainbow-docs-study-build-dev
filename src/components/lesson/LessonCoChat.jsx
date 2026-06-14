import { useState, useEffect, useRef } from 'react';
import { Users, Send, Wifi, WifiOff } from 'lucide-react';
import { openCoChatStream, sendCoChatMessage } from '../../api/curriculum';
import { useAuth } from '../../context/AuthContext';

// LessonCoChat - the right-rail human chat for a shared curriculum's lesson.
// Both sides of a curriculum share (owner + recipients) connect to the same
// per-lesson SSE room: messages persist on the lesson, presence shows who
// has the lesson open right now. The owner connects without a shareId;
// recipients pass theirs.
//
// Props:
//   curriculumId / lessonId - the lesson being studied
//   shareId                 - recipient's share id, null for the owner
//   partnerNames            - fallback label for who you're studying with
//                             (shown before presence reports anyone)
export default function LessonCoChat({ curriculumId, lessonId, shareId = null, partnerNames = [], className = '' }) {
  const { user } = useAuth();
  const selfId = user?.id;
  const [messages, setMessages] = useState([]);
  const [present, setPresent] = useState([]);
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setPresent([]);
    setConnected(false);
    const stream = openCoChatStream(curriculumId, lessonId, shareId, {
      onEvent: (event) => {
        if (event.type === 'state') {
          setConnected(true);
          setMessages(event.messages || []);
        } else if (event.type === 'message' && event.message) {
          setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]));
        } else if (event.type === 'presence') {
          setPresent(event.present || []);
        }
      },
      onError: () => setConnected(false),
      onClose: () => setConnected(false),
    });
    return () => stream.close();
  }, [curriculumId, lessonId, shareId]);

  // Keep the latest message in view.
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  async function handleSend(e) {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const { message } = await sendCoChatMessage(curriculumId, lessonId, text, shareId);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setInput('');
    } catch {
      // keep the draft in the input so the user can retry
    } finally {
      setSending(false);
    }
  }

  const others = present.filter((p) => p.id !== selfId);
  const partnerLabel = others.length > 0
    ? others.map((p) => p.name).join(', ')
    : (partnerNames.length ? partnerNames.join(', ') : null);
  const partnerHere = others.length > 0;

  return (
    <aside className={`flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header: who you're studying with + live presence */}
      <div className="px-3.5 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/40 flex items-center gap-1.5">
          <Users size={12} /> Study together
        </p>
        <p className="mt-1 text-[12px] flex items-center gap-1.5 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${partnerHere ? 'bg-emerald-400' : 'bg-white/20'}`} />
          <span className={`truncate ${partnerHere ? 'text-emerald-200/90' : 'text-white/40'}`}>
            {partnerHere
              ? `${partnerLabel} is in this lesson`
              : partnerLabel
                ? `Waiting for ${partnerLabel}`
                : 'No one else here yet'}
          </span>
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <p className="text-[12px] text-white/30 text-center pt-8 px-3 leading-relaxed">
            Chat while you both work through this lesson. Messages stay with the lesson.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.from === selfId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {!mine && <span className="text-[10px] text-white/35 mb-0.5 px-1">{m.fromName}</span>}
              <div
                className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-[12.5px] leading-snug break-words ${
                  mine
                    ? 'bg-blue-500/85 text-white rounded-br-md'
                    : 'bg-white/[0.07] text-white/85 rounded-bl-md'
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <form onSubmit={handleSend} className="p-2.5 border-t border-white/[0.06] shrink-0">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connected ? 'Message…' : 'Connecting…'}
            disabled={!connected}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-[12.5px] text-white placeholder-white/25 outline-none focus:border-blue-400/50 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || !connected}
            aria-label="Send"
            className="w-9 h-9 rounded-lg grid place-items-center bg-blue-500/80 hover:bg-blue-500 text-white disabled:opacity-35 disabled:hover:bg-blue-500/80 transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-white/25 flex items-center gap-1 px-0.5">
          {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
          {connected ? 'Live' : 'Reconnecting…'}
        </p>
      </form>
    </aside>
  );
}
