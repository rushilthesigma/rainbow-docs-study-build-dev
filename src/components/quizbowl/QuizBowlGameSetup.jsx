import { InlineProgress } from '../shared/ProgressBar';
import QuizBowlJoinPanel from './QuizBowlJoinPanel';

export const QUIZ_BOWL_CATEGORIES = [
  'Science', 'History', 'Literature', 'Geography', 'Math',
  'Art', 'Music', 'Philosophy', 'Pop Culture', 'Mixed',
];
export const QUIZ_BOWL_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Tournament'];
export const QUIZ_BOWL_BOT_LEVELS = [
  { id: 'casual', label: 'Casual' },
  { id: 'club', label: 'Club' },
  { id: 'varsity', label: 'Varsity' },
  { id: 'elite', label: 'Elite' },
];
export const QUIZ_BOWL_SCORING = [
  { id: 'standard', label: 'Standard' },
  { id: 'iac-prelim', label: 'IAC Prelim' },
  { id: 'iac-playoff', label: 'IAC Playoff' },
  { id: 'jv', label: 'JV' },
];

function ChoiceCard({ active, title, onClick, disabled = false, mobile = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`${mobile ? 'min-h-11 rounded-xl px-3' : 'h-9 rounded-lg px-3'} min-w-0 border text-center text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 ${
        disabled
          ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.015] opacity-40'
          : active
            ? 'border-blue-500 bg-blue-500 text-white hover:border-blue-400 hover:bg-blue-400'
            : 'border-white/[0.09] bg-white/[0.025] text-white/70 hover:border-white/[0.17] hover:bg-white/[0.055]'
      }`}
    >
      {title}
    </button>
  );
}

function OptionButton({ active, onClick, children, mobile = false }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${mobile ? 'min-h-11 rounded-xl px-3' : 'h-9 rounded-lg px-3'} border text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 ${
        active
          ? 'border-blue-500 bg-blue-500 text-white hover:border-blue-400 hover:bg-blue-400'
          : 'border-white/[0.08] bg-white/[0.025] text-white/50 hover:border-white/[0.16] hover:bg-white/[0.055] hover:text-white/75'
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }) {
  return <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{children}</p>;
}

export default function QuizBowlGameSetup({
  mobile = false,
  onBack,
  playMode = 'multiplayer',
  onPlayModeChange,
  matchMode = 'individual',
  onMatchModeChange,
  questionSource = 'qbreader',
  onQuestionSourceChange,
  categories = ['Mixed'],
  onToggleCategory,
  difficulty = 'Medium',
  onDifficultyChange,
  questionCount = 10,
  onQuestionCountChange,
  revealSpeedMs = 140,
  onRevealSpeedChange,
  customInstructions = '',
  onCustomInstructionsChange,
  aiModelControl = null,
  fillWithBots = false,
  onFillWithBotsChange,
  botLevel = 'varsity',
  onBotLevelChange,
  scoringFormat = 'iac-prelim',
  onScoringFormatChange,
  joinCode = '',
  onJoinCodeChange,
  onJoin,
  joinBusy = false,
  joinError = null,
  onBrowseCollection,
  onBrowseCustomSets,
  initialSet = null,
  busy = false,
  error = null,
  onSubmit,
}) {
  const isMultiplayer = playMode === 'multiplayer';
  const selectedCategories = Array.isArray(categories) && categories.length ? categories : ['Mixed'];
  const submitLabel = isMultiplayer ? 'Create room' : 'Start';

  return (
    <div className={`${mobile ? 'px-4 pb-8 pt-3' : 'mx-auto max-w-3xl p-5 pb-8'} space-y-3.5`}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={`${mobile ? 'min-h-11' : ''} inline-flex items-center gap-1.5 text-[13px] text-white/35 transition-colors hover:text-white/65`}
        >
          Hub
        </button>
      )}

      <header>
        <h1 className={`${mobile ? 'text-[21px]' : 'text-lg'} font-bold text-white/90`}>Set up a game</h1>
      </header>

      <section>
        <SectionLabel>Play mode</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceCard
            mobile={mobile}
            active={!isMultiplayer}
            title="Solo"
            onClick={() => onPlayModeChange?.('solo')}
          />
          <ChoiceCard
            mobile={mobile}
            active={isMultiplayer}
            title="Multiplayer"
            onClick={() => onPlayModeChange?.('multiplayer')}
          />
        </div>
      </section>

      {isMultiplayer && (
        <section className="space-y-3">
          <div>
            <SectionLabel>Room</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard
                mobile={mobile}
                active={matchMode === 'individual'}
                title="Open match"
                onClick={() => onMatchModeChange?.('individual')}
              />
              <ChoiceCard
                mobile={mobile}
                active={matchMode === 'team'}
                disabled={!!initialSet}
                title="Team scrimmage"
                onClick={() => onMatchModeChange?.('team')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="text-[12px] font-semibold text-white/75">Fill empty seats with bots</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={fillWithBots}
                aria-label="Fill empty seats with bots"
                onClick={() => onFillWithBotsChange?.(!fillWithBots)}
                className={`${fillWithBots ? 'bg-blue-500' : 'bg-white/[0.10]'} relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/[0.12] transition-colors`}
              >
                <span className={`${fillWithBots ? 'translate-x-6' : 'translate-x-1'} h-4 w-4 rounded-full bg-white transition-transform`} />
              </button>
            </div>
            {fillWithBots && (
              <div className="grid grid-cols-4 gap-1.5">
                {QUIZ_BOWL_BOT_LEVELS.map(level => (
                  <OptionButton key={level.id} mobile={mobile} active={botLevel === level.id} onClick={() => onBotLevelChange?.(level.id)}>
                    {level.label}
                  </OptionButton>
                ))}
              </div>
            )}
          </div>

          {onJoin && (
            <QuizBowlJoinPanel
              mobile={mobile}
              value={joinCode}
              onChange={onJoinCodeChange}
              onSubmit={onJoin}
              busy={joinBusy}
              error={joinError}
            />
          )}
        </section>
      )}

      {initialSet ? (
        <section className="border-l-2 border-amber-400/50 px-3 py-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300/75">Selected set</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-amber-50">{initialSet.title || 'Custom set'}</p>
          <p className="mt-0.5 text-[10px] text-amber-100/55">{initialSet.questions?.length || questionCount} tossups · no regeneration</p>
        </section>
      ) : (
        <>
          <section>
            <SectionLabel>Questions</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard
                mobile={mobile}
                active={questionSource === 'qbreader'}
                title="Past QB"
                onClick={() => onQuestionSourceChange?.('qbreader')}
              />
              <ChoiceCard
                mobile={mobile}
                active={questionSource === 'ai'}
                title="AI custom"
                onClick={() => onQuestionSourceChange?.('ai')}
              />
            </div>
            {(onBrowseCollection || onBrowseCustomSets) && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {onBrowseCollection && (
                  <button type="button" onClick={onBrowseCollection} className={`${mobile ? 'min-h-11 rounded-xl' : 'h-9 rounded-lg'} inline-flex items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.055] hover:text-white/75`}>
                    Preset & community sets
                  </button>
                )}
                {onBrowseCustomSets && (
                  <button type="button" onClick={onBrowseCustomSets} className={`${mobile ? 'min-h-11 rounded-xl' : 'h-9 rounded-lg'} inline-flex items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.025] px-3 text-[11px] font-semibold text-white/50 transition-colors hover:bg-white/[0.055] hover:text-white/75`}>
                    My custom sets
                  </button>
                )}
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Category</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {QUIZ_BOWL_CATEGORIES.map(category => (
                <OptionButton
                  key={category}
                  mobile={mobile}
                  active={selectedCategories.includes(category)}
                  onClick={() => onToggleCategory?.(category)}
                >
                  {category}
                </OptionButton>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel>Difficulty</SectionLabel>
            <div className="grid grid-cols-4 gap-1.5">
              {QUIZ_BOWL_DIFFICULTIES.map(level => (
                <OptionButton key={level} mobile={mobile} active={difficulty === level} onClick={() => onDifficultyChange?.(level)}>
                  {level}
                </OptionButton>
              ))}
            </div>
          </section>

          {questionSource === 'ai' && (
            <section className="space-y-3">
              {aiModelControl}
              <textarea
                value={customInstructions}
                onChange={event => onCustomInstructionsChange?.(event.target.value)}
                rows={2}
                placeholder="Custom focus or instructions…"
                aria-label="Custom question instructions"
                className={`${mobile ? 'rounded-2xl' : 'rounded-lg'} w-full resize-none border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-[12px] text-white/80 outline-none placeholder:text-white/20 focus:border-blue-400/50 focus:ring-2 focus:ring-blue-400/15`}
              />
            </section>
          )}
        </>
      )}

      {isMultiplayer && (
        <section>
          <SectionLabel>Scoring</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {QUIZ_BOWL_SCORING.map(format => (
              <OptionButton key={format.id} mobile={mobile} active={scoringFormat === format.id} onClick={() => onScoringFormatChange?.(format.id)}>
                {format.label}
              </OptionButton>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3">
        {(isMultiplayer || questionSource === 'ai' || initialSet) && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Questions</span>
              <span className="font-mono text-[11px] text-blue-300">{initialSet ? initialSet.questions?.length : questionCount}</span>
            </div>
            {initialSet
              ? <p className="text-[10px] text-white/30">Fixed by the set</p>
              : <input className="w-full accent-blue-500" type="range" min="5" max={isMultiplayer ? 20 : 30} step="5" value={questionCount} onChange={event => onQuestionCountChange?.(Number(event.target.value))} />}
          </div>
        )}
        <div className={!isMultiplayer && questionSource === 'qbreader' && !initialSet ? 'col-span-2' : ''}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Speed</span>
            <span className="font-mono text-[11px] text-blue-300">{revealSpeedMs}ms</span>
          </div>
          <input className="w-full accent-blue-500" type="range" min="60" max="400" step="10" value={revealSpeedMs} onChange={event => onRevealSpeedChange?.(Number(event.target.value))} />
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className={`${mobile ? 'min-h-14 rounded-2xl text-[15px]' : 'h-12 rounded-lg text-[14px]'} inline-flex w-full items-center justify-center gap-2 border border-blue-400/35 bg-blue-500 font-bold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-45`}
      >
        {busy ? <><InlineProgress active /> Working…</> : submitLabel}
      </button>
    </div>
  );
}
