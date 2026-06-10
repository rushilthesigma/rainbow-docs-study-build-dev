import { useState } from 'react';
import GroupListView from '../../group/GroupListView';
import GroupLibraryView from '../../group/GroupLibraryView';
import SessionView from '../../group/SessionView';
import { useGroupNotifications } from '../../../context/GroupNotificationContext';

// GroupStudyApp - desktop app wrapper for the Group Study feature stack.
//
// Owns top-level navigation between the four screens:
//   groups  → GroupListView (list + detail managed internally)
//   library → GroupLibraryView (group's shared material library)
//   session → SessionView (live SSE-synchronized study session)
//
// GroupNotificationProvider is mounted in main.jsx above the full app tree,
// so GroupStudyApp reads from that shared context rather than creating its own.

export default function GroupStudyApp() {
  const { unreadCountByGroup, refresh } = useGroupNotifications();
  const [screen, setScreen] = useState('groups');
  const [libraryGroupId, setLibraryGroupId] = useState(null);
  const [sessionGroupId, setSessionGroupId] = useState(null);
  const [sessionData, setSessionData] = useState(null);

  function openLibrary(groupId) {
    setLibraryGroupId(groupId);
    setScreen('library');
  }

  function openSession(groupId, session) {
    setSessionGroupId(groupId);
    setSessionData(session);
    setScreen('session');
  }

  function exitToGroups() {
    setScreen('groups');
    setLibraryGroupId(null);
    setSessionGroupId(null);
    setSessionData(null);
    refresh();
  }

  if (screen === 'session' && sessionGroupId && sessionData) {
    return (
      <SessionView
        groupId={sessionGroupId}
        session={sessionData}
        onExit={exitToGroups}
      />
    );
  }

  if (screen === 'library' && libraryGroupId) {
    return (
      <GroupLibraryView
        groupId={libraryGroupId}
        onBack={() => setScreen('groups')}
        onChanged={refresh}
        onOpenSession={openSession}
      />
    );
  }

  return (
    <GroupListView
      onOpenLibrary={openLibrary}
      onOpenSession={openSession}
      unreadByGroup={unreadCountByGroup}
    />
  );
}
