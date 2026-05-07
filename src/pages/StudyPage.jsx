import { useSearchParams } from 'react-router-dom';
import StudyModePanel from '../components/study/StudyModePanel';

export default function StudyPage() {
  const [searchParams] = useSearchParams();
  const initialMessage = searchParams.get('q') || null;

  return (
    // Negative margins counteract the AppShell's p-4/p-6 so the panel is edge-to-edge.
    <div className="-m-4 md:-m-6 flex flex-col flex-1 min-h-0">
      <StudyModePanel className="flex-1 min-h-0" flush initialMessage={initialMessage} />
    </div>
  );
}
