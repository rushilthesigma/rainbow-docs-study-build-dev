export interface AppStateSnapshot {
  summary: string;
  state: Record<string, unknown>;
}

type Publisher = () => AppStateSnapshot;
const publishers = new Map<string, Publisher>();

export function publishAppState(appId: string, publisher: Publisher): () => void {
  publishers.set(appId, publisher);
  return () => {
    if (publishers.get(appId) === publisher) publishers.delete(appId);
  };
}
