import { PALETTE, SPECS } from '@/lib/logicsim/gates';
import type { GateType } from '@/lib/logicsim/types';
import { useLogicLabStore } from '@/store/logicLabStore';

export default function Palette() {
  const addComponent = useLogicLabStore((s) => s.addComponent);
  const viewport = useLogicLabStore((s) => s.viewport);

  return (
    <div className="w-32 shrink-0 border-r border-white/10 bg-black/20 p-2 flex flex-col gap-1 overflow-y-auto chrome">
      <div className="text-[10px] uppercase tracking-wide text-white/45 px-1 pb-1">Palette</div>
      {PALETTE.map((t) => (
        <PaletteItem
          key={t}
          type={t}
          onAdd={() => addComponent(t, viewport.x + 120, viewport.y + 120)}
        />
      ))}
      <div className="text-[10px] text-white/45 mt-2 px-1 leading-snug">
        Drag to canvas or click to spawn near top-left.
      </div>
    </div>
  );
}

function PaletteItem({ type, onAdd }: { type: GateType; onAdd: () => void }) {
  const spec = SPECS[type];
  return (
    <button
      onDoubleClick={onAdd}
      onClick={onAdd}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-engos-gate', type);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-left text-xs"
    >
      <span className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-[10px] font-mono">
        {spec.symbol ?? spec.label[0]}
      </span>
      <span className="truncate">{spec.label}</span>
    </button>
  );
}
