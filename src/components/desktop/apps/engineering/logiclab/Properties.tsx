import { useLogicLabStore } from '@/store/logicLabStore';
import { SPECS } from '@/lib/logicsim/gates';

export default function Properties() {
  const selectedId = useLogicLabStore((s) => s.selectedId);
  const components = useLogicLabStore((s) => s.components);
  const updateState = useLogicLabStore((s) => s.updateState);
  const removeComponent = useLogicLabStore((s) => s.removeComponent);
  const running = useLogicLabStore((s) => s.running);
  const setRunning = useLogicLabStore((s) => s.setRunning);
  const speed = useLogicLabStore((s) => s.speed);
  const setSpeed = useLogicLabStore((s) => s.setSpeed);
  const resettle = useLogicLabStore((s) => s.resettle);

  const sel = selectedId ? components.find((c) => c.id === selectedId) : null;

  return (
    <div className="w-56 shrink-0 border-l border-white/10 bg-black/20 flex flex-col chrome">
      {/* Simulation controls */}
      <div className="p-3 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Simulation</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRunning(!running)}
            className={`px-2 py-1 rounded-md text-xs font-medium ${
              running ? 'bg-accent text-white' : 'bg-white/10 hover:bg-white/15'
            }`}
          >
            {running ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={() => resettle()}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15"
          >
            Step
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/65">
          Speed
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="font-mono w-7 text-right">{speed.toFixed(1)}×</span>
        </div>
      </div>

      {/* Component properties */}
      <div className="p-3 flex-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wide text-white/45 mb-2">Properties</div>
        {!sel && <div className="text-xs text-white/45">Select a component</div>}
        {sel && (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="text-white/75">{SPECS[sel.type].label}</div>
              <div className="font-mono text-[10px] text-white/40">{sel.id}</div>
            </div>
            <Row label="x" value={String(sel.x)} readOnly />
            <Row label="y" value={String(sel.y)} readOnly />
            {sel.type === 'input' && (
              <Row
                label="value"
                value={String(sel.state.value ?? 0)}
                onChange={(v) => updateState(sel.id, { value: v === '1' ? 1 : 0 })}
              />
            )}
            {sel.type === 'clock' && (
              <Row
                label="hz"
                value={String(sel.state.hz ?? 1)}
                onChange={(v) => {
                  const n = parseFloat(v);
                  if (Number.isFinite(n) && n > 0) updateState(sel.id, { hz: n });
                }}
              />
            )}
            <button
              onClick={() => removeComponent(sel.id)}
              className="mt-3 w-full px-2 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red text-xs"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 text-white/55">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        className={`flex-1 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 outline-none font-mono ${
          readOnly ? 'text-white/55' : 'text-white'
        }`}
      />
    </div>
  );
}
