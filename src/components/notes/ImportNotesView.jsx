import { useRef, useState } from 'react';
import Button from '../shared/Button';
import {
  importNotesFromFiles,
  MAX_NOTE_IMPORT_FILES,
  NOTE_IMPORT_ACCEPT,
} from '../../lib/noteImport';

export default function ImportNotesView({ onBack, onImported }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  function addFiles(nextFiles) {
    const incoming = Array.from(nextFiles || []);
    setError('');
    setFiles((current) => {
      const merged = [...current, ...incoming.filter((file) => !current.some(
        (existing) => existing.name === file.name && existing.size === file.size,
      ))];
      return merged.slice(0, MAX_NOTE_IMPORT_FILES);
    });
  }

  async function handleImport() {
    if (!files.length || importing) return;
    setImporting(true);
    setError('');
    try {
      const imported = await importNotesFromFiles(files);
      await onImported?.(imported);
      onBack?.();
    } catch (err) {
      setError(err?.message || 'Could not import those notes.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 pb-4 mb-6 border-b border-white/[0.06] flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/40 hover:text-white/90 transition-colors"
        >
          Back
        </button>
        <h2 className="text-lg font-bold text-white/90">Import notes</h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="w-full max-w-4xl mx-auto pb-10">
          <p className="text-[15px] font-semibold text-white/85">Bring your notes into RushilAI</p>

          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
            className="mt-6"
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-blue-400/[0.25] bg-blue-500/[0.10] px-3 py-1.5 text-sm font-medium text-blue-100 hover:bg-blue-500/[0.16] transition-colors"
            >
              Choose files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={NOTE_IMPORT_ACCEPT}
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="mt-5 border-t border-white/[0.07]" aria-live="polite">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 border-b border-white/[0.07] py-3">
                  <span className="text-[13px] text-white/70 truncate flex-1">{file.name}</span>
                  <span className="text-[11px] text-white/30">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                    disabled={importing}
                    className="text-[11px] text-white/35 hover:text-white/75 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p role="alert" className="mt-4 text-[12px] text-rose-300">{error}</p>}

          <div className="flex items-center gap-3 mt-6">
            <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={importing}>Cancel</Button>
            <Button type="button" size="sm" onClick={handleImport} disabled={!files.length} loading={importing}>
              {importing ? 'Importing…' : 'Import notes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
