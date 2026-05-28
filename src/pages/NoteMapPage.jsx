import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import NoteMap from '../components/notes/NoteMap';

export default function NoteMapPage() {
  const navigate = useNavigate();
  return (
    <div className="w-full flex flex-col flex-1 min-h-0">
      <div className="flex items-center mb-3 flex-shrink-0">
        <button onClick={() => navigate('/notes')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <ArrowLeft size={16} /> Notes
        </button>
      </div>
      <NoteMap onOpenNote={(noteId) => navigate(`/notes/${noteId}`)} />
    </div>
  );
}
