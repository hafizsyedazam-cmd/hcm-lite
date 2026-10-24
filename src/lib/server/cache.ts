import "server-only";

// Tiny in-process cache for rarely changing lookups (settings, departments,
// leave types, holidays). Writes in this process clear it straight away;
// other server instances pick changes up within the TTL.
const store = new Map<string, { at: number; value: Promise<unknown> }>();
const TTL_MS = 30_000;

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: Date.now(), value });
  return value;
}

export function invalidate(key: string) {
  store.delete(key);
}
