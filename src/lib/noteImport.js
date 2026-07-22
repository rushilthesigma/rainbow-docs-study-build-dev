import { createNote, updateNote } from '../api/notes';

export const NOTE_IMPORT_ACCEPT = '.md,.markdown,.txt,.json,text/markdown,text/plain,application/json';
export const MAX_NOTE_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_NOTE_IMPORT_FILES = 10;

function titleFromFilename(filename) {
  const withoutExtension = String(filename || '').replace(/\.[^.]+$/, '').trim();
  return withoutExtension || 'Imported note';
}

function asText(value) {
  return value == null ? '' : String(value);
}

function normalizeNote(raw, fallbackTitle) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const mainNotes = source.mainNotes ?? source.content ?? source.body ?? source.text ?? '';
  const cues = Array.isArray(source.cues) ? source.cues.map(asText) : [];

  return {
    title: asText(source.title).trim() || fallbackTitle,
    type: source.type === 'cornell' ? 'cornell' : 'regular',
    cues,
    mainNotes: asText(mainNotes),
    summary: asText(source.summary),
  };
}

export async function parseImportedNoteFile(file) {
  if (!file) throw new Error('Choose a file to import.');
  if (file.size > MAX_NOTE_IMPORT_BYTES) {
    throw new Error(`${file.name} is larger than 2 MB.`);
  }

  const extension = String(file.name || '').split('.').pop()?.toLowerCase();
  const text = await file.text();
  const fallbackTitle = titleFromFilename(file.name);

  if (extension !== 'json') {
    return [normalizeNote({ mainNotes: text }, fallbackTitle)];
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.notes)
      ? parsed.notes
      : parsed?.note && typeof parsed.note === 'object'
        ? [parsed.note]
        : [parsed];

  if (!entries.length) throw new Error(`${file.name} does not contain any notes.`);

  return entries.map((entry, index) => normalizeNote(
    entry,
    entries.length === 1 ? fallbackTitle : `${fallbackTitle} ${index + 1}`,
  ));
}

export async function importNotesFromFiles(files) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) throw new Error('Choose at least one file to import.');
  if (selectedFiles.length > MAX_NOTE_IMPORT_FILES) {
    throw new Error(`You can import up to ${MAX_NOTE_IMPORT_FILES} files at a time.`);
  }

  const imported = [];
  for (const file of selectedFiles) {
    const notes = await parseImportedNoteFile(file);
    for (const importedNote of notes) {
      const created = await createNote(importedNote.title, importedNote.type);
      const saved = await updateNote(created.note.id, {
        title: importedNote.title,
        cues: importedNote.cues,
        mainNotes: importedNote.mainNotes,
        summary: importedNote.summary,
      });
      imported.push(saved.note || created.note);
    }
  }

  return imported;
}
