// In-memory SWR-style cache for API responses. Keeps the UI feeling
// instant: any data fetched once is returned synchronously to future
// callers via `peek(key)`, and `fetchOnce(key, fetcher)` dedupes
// concurrent requests for the same key + transparently refreshes the
// cache when the fetch resolves.
//
// Wiring pattern in an app:
//   const cached = peek('notes:list');
//   const [notes, setNotes] = useState(cached?.notes || []);
//   const [loading, setLoading] = useState(!cached);   // skip skeleton if cached
//   useEffect(() => {
//     fetchOnce('notes:list', listNotes)
//       .then(d => { setNotes(d.notes || []); setLoading(false); })
//       .catch(() => setLoading(false));
//   }, []);
//
// After a mutation (create/update/delete) call `bust('notes:list')` so
// the next mount/refresh picks up fresh data.

const cache = new Map();      // key -> latest resolved value
const inflight = new Map();   // key -> Promise (dedupes concurrent fetches)
const listeners = new Map();  // key -> Set<callback>  (sub/notify for cross-mount sync)

// Sync snapshot for instant initial render. Returns undefined if never
// fetched.
export function peek(key) {
  return cache.get(key);
}

// Manually seed the cache (e.g. after an optimistic mutation).
export function set(key, value) {
  cache.set(key, value);
  emit(key, value);
}

// Drop one or more cache entries - typically after a mutation that
// changes the underlying data. Next `fetchOnce` for the key will do a
// full network round trip.
export function bust(...keys) {
  for (const k of keys) cache.delete(k);
}

// Same as `bust` but matches by prefix - useful for hierarchical keys
// like `notes:*` or `admin:users:*`.
export function bustPrefix(prefix) {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

// Trigger a fetch, deduped per key. Returns the promise. The result is
// stored in the cache on success and broadcast to any subscribers.
export function fetchOnce(key, fetcher) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(fetcher)
    .then(data => {
      cache.set(key, data);
      inflight.delete(key);
      emit(key, data);
      return data;
    })
    .catch(err => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, p);
  return p;
}

// Subscribe to cache updates for a key. Returns an unsubscribe fn. Used
// by components mounted in different parts of the tree that share data
// (e.g. two NotesApp instances) so a refresh in one updates the other.
export function subscribe(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => {
    const set = listeners.get(key);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) listeners.delete(key);
  };
}

function emit(key, value) {
  const set = listeners.get(key);
  if (!set) return;
  for (const cb of set) {
    try { cb(value); } catch (e) { /* swallow */ }
  }
}
