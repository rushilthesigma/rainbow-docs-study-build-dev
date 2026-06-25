import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { visibleStudyModels, canUseStudyModel } from '../components/study/studyModels';
import { planFromUser } from '../components/billing/modelAccess';

const STORAGE_KEY = 'covalent-qb-model';

// Selection state for "which AI writes my quiz bowl tossups". Mirrors the
// Study Mode / Debate model pickers: lists only the models this account can
// actually use, persists the pick to localStorage (shared across desktop +
// mobile QB), and re-validates against the plan whenever it changes. The
// server (/api/chat) is the real enforcer and re-gates the key on every call,
// so a locked pick that slips through here is still downgraded server-side.
export function useQbModel() {
  const { user } = useAuth();
  const plan = planFromUser(user);
  const email = user?.email || '';

  const available = useMemo(
    () => visibleStudyModels(email).filter((m) => canUseStudyModel(m.key, plan)),
    [email, plan],
  );

  const [model, setModel] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'flash-lite'; }
    catch { return 'flash-lite'; }
  });

  // Drop a saved/locked pick the current plan can't use back to the floor
  // model (Flash Lite, always first + accessible to everyone).
  useEffect(() => {
    setModel((prev) =>
      available.some((m) => m.key === prev) ? prev : (available[0]?.key || 'flash-lite'),
    );
  }, [available]);

  function pick(key) {
    if (!available.some((m) => m.key === key)) return;
    setModel(key);
    try { localStorage.setItem(STORAGE_KEY, key); } catch {}
  }

  return { model, pick, available, plan };
}
