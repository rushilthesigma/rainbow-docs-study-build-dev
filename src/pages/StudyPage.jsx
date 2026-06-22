import { useSearchParams, useLocation } from 'react-router-dom';
import StudyModePanel from '../components/study/StudyModePanel';

export default function StudyPage({ initialMessage: propMsg, initialSources: propSources, windowId }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Two paths into this page seed it with data:
  //   • desktop windows pass `meta` spread as component props (propMsg / propSources)
  //   • mobile + classic routes use react-router `location.state`
  // Fallback for both is ?q= (legacy dashboard quick-launch).
  const stateMsg = location.state?.initialMessage;
  const initialMessage = propMsg || stateMsg || searchParams.get('q') || null;
  const initialSources = propSources || location.state?.initialSources || null;

  return (
    // Negative margins counteract the AppShell's p-4/p-6 so the panel is edge-to-edge.
    <div className="-m-4 md:-m-6 flex flex-col flex-1 min-h-0">
      <StudyModePanel
        className="flex-1 min-h-0"
        flush
        windowId={windowId}
        initialMessage={initialMessage}
        initialSources={initialSources}
      />
    </div>
  );
}
