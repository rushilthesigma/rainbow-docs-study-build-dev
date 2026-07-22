import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import {
  importNotesFromFiles,
  MAX_NOTE_IMPORT_FILES,
  NOTE_IMPORT_ACCEPT,
} from '../../lib/noteImport';

export default function NoteImportDialog({ open, onClose, onImported }) {
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

  function close(force = false) {
    if (importing && !force) return;
    setFiles([]);
    setError('');
    onClose?.();
  }

  async function handleImport() {
    if (!files.length || importing) return;
    setImporting(true);
    setError('');
    try {
      const imported = await importNotesFromFiles(files);
      await onImported?.(imported);
      close(true);
    } catch (err) {
      setError(err?.message || 'Could not import those notes.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import notes"
      description="Convert Markdown, text, or note-shaped JSON files into RushilAI notes."
      size="md"
    >
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          addFiles(event.dataTransfer.files);
        }}
        className="rounded-xl border border-dashed border-white/[0.14] bg-white/[0.03] px-5 py-6 text-center"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center mx-auto mb-3">
          <Upload size={18} className="text-emerald-300" />
        </div>
        <p className="text-[13px] font-semibold text-white/80">Drop files here</p>
        <p className="text-[11px] text-white/35 mt-1 mb-3">Up to {MAX_NOTE_IMPORT_FILES} files, 2 MB each</p>
        <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          <FileText size={14} /> Choose files
        </Button>
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
        <div className="mt-4 space-y-1.5" aria-live="polite">
          {files.map((file) => (
            <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              <FileText size={14} className="text-white/35 shrink-0" />
              <span className="text-[12px] text-white/65 truncate flex-1">{file.name}</span>
              <span className="text-[10px] text-white/25 shrink-0">{formatBytes(file.size)}</span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                disabled={importing}
                aria-label={`Remove ${file.name}`}
                className="p-1 rounded-md text-white/25 hover:text-white/70 hover:bg-white/[0.07] disabled:opacity-40"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-white/30 mt-3">
        Imports are saved using RushilAI&apos;s <code className="text-white/45">title</code>, <code className="text-white/45">mainNotes</code>, <code className="text-white/45">cues</code>, and <code className="text-white/45">summary</code> fields. JSON may contain one note, an array, or a <code className="text-white/45">notes</code> array.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 mt-5">
        <Button type="button" variant="ghost" size="sm" onClick={close} disabled={importing}>Cancel</Button>
        <Button type="button" size="sm" onClick={handleImport} disabled={!files.length} loading={importing}>
          {importing ? 'Importing…' : `Import ${files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'notes'}`}
        </Button>
      </div>
    </Modal>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
