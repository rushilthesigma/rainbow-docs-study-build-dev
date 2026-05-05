import { useSearchParams } from 'react-router-dom';
import StudyModePanel from '../components/study/StudyModePanel';

export default function StudyPage() {
  const [searchParams] = useSearchParams();
  const initialMessage = searchParams.get('q') || null;

  return (
    // Full-width — the chat input row stretches across the entire
    // window. The window manager already constrains horizontal size,
    // and the input feels cramped at max-w-5xl on a wide window.
    <div className="w-full flex flex-col flex-1 min-h-0">
      <StudyModePanel className="flex-1 min-h-0" initialMessage={initialMessage} />
    </div>
  );
}
