import { useSearchParams } from 'react-router-dom';
import StudyModePanel from '../components/study/StudyModePanel';

export default function StudyPage() {
  const [searchParams] = useSearchParams();
  const initialMessage = searchParams.get('q') || null;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col flex-1 min-h-0">
      <StudyModePanel className="flex-1 min-h-0" initialMessage={initialMessage} />
    </div>
  );
}
