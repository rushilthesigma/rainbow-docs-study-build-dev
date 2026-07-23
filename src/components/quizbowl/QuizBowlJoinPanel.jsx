export default function QuizBowlJoinPanel({
  value,
  onChange,
  onSubmit,
  busy = false,
  error = null,
  mobile = false,
}) {
  const code = String(value || '');
  const canJoin = code.trim().length >= 4 && !busy;
  const errorId = error ? 'quiz-bowl-join-error' : undefined;

  function handleChange(event) {
    onChange?.(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
  }

  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Join room</h3>

      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault();
          if (canJoin) onSubmit?.();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Room code</span>
          <input
            value={code}
            onChange={handleChange}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder="ROOM CODE"
            aria-describedby={errorId}
            className={`${mobile ? 'min-h-11 rounded-xl px-3 text-[15px]' : 'h-9 rounded-lg px-3 text-[13px]'} w-full border border-white/[0.10] bg-black/15 font-mono uppercase tracking-[0.18em] text-white outline-none placeholder:text-white/20 focus:border-blue-400/55 focus:ring-2 focus:ring-blue-400/15`}
          />
        </label>
        <button
          type="submit"
          disabled={!canJoin}
          className={`${mobile ? 'min-h-11 rounded-xl px-4' : 'h-9 rounded-lg px-3.5'} inline-flex shrink-0 items-center justify-center bg-blue-500 text-[12px] font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>

      {error && (
        <p id={errorId} role="alert" className="mt-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-2.5 py-2 text-[11px] text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}
