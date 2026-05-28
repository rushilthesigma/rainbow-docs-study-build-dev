import { useMemo } from 'react';
import { X, Download } from 'lucide-react';
import { useLogicLabStore } from '@/store/logicLabStore';
import { truthTable } from '@/lib/logicsim/simulator';

export default function TruthTable({ onClose }: { onClose: () => void }) {
  const components = useLogicLabStore((s) => s.components);
  const connections = useLogicLabStore((s) => s.connections);

  const data = useMemo(
    () => truthTable({ components, connections }),
    [components, connections],
  );

  const exportCsv = () => {
    const headers = [
      ...data.inputs.map((c) => c.id),
      ...data.outputs.map((c) => c.id),
    ];
    const lines = [headers.join(',')];
    for (const row of data.rows) {
      lines.push([...row.inputs, ...row.outputs].map((v) => String(v)).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'truth-table.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/55 flex items-center justify-center">
      <div className="bg-zinc-900 border border-white/15 rounded-xl shadow-window w-[min(560px,92%)] max-h-[80%] overflow-hidden flex flex-col">
        <div className="flex items-center px-3 h-10 border-b border-white/10">
          <div className="font-semibold text-sm">Truth Table</div>
          <div className="ml-2 text-xs text-white/55">
            {data.inputs.length} input{data.inputs.length === 1 ? '' : 's'} · {data.outputs.length} output
            {data.outputs.length === 1 ? '' : 's'} · {data.rows.length} rows
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={exportCsv}
              className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 flex items-center gap-1"
              disabled={!data.rows.length}
            >
              <Download size={12} /> CSV
            </button>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-auto p-3">
          {!data.rows.length ? (
            <div className="text-white/55 text-sm">
              Add at least one INPUT and one LED to generate a truth table.
            </div>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/15">
                  {data.inputs.map((c) => (
                    <th key={c.id} className="px-2 py-1 text-left text-accent">
                      {c.id.split('-')[0]}
                    </th>
                  ))}
                  <th className="px-1 w-1" />
                  {data.outputs.map((c) => (
                    <th key={c.id} className="px-2 py-1 text-left text-emerald-400">
                      {c.id.split('-')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {row.inputs.map((v, j) => (
                      <td key={`i${j}`} className="px-2 py-1">{String(v)}</td>
                    ))}
                    <td className="w-1" />
                    {row.outputs.map((v, j) => (
                      <td key={`o${j}`} className="px-2 py-1">{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
