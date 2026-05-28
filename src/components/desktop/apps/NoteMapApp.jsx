import NoteMap from '../../notes/NoteMap';
import { useWindowManager } from '../../../context/WindowManagerContext';

// Desktop windowed wrapper for the Note Map. Opening a note pops the
// Notes app in its own window (or focuses an existing one) with the
// target note pre-selected.
export default function NoteMapApp() {
  const { openApp } = useWindowManager();
  function openNote(noteId) {
    openApp('notes', 'Notes', { initialNoteId: noteId });
  }
  return <NoteMap onOpenNote={openNote} />;
}
