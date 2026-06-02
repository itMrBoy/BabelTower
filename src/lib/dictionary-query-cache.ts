type CacheEntry<T> = { items: T[]; ts: number };

const queryCache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_SIZE = 50;

export function dictionaryQueryCacheKey(q: string, field: string, limit: number): string {
  return `${q}|${field}|${limit}`;
}

export function getDictionaryQueryCache<T>(key: string): T[] | null {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  queryCache.delete(key);
  queryCache.set(key, entry);
  return entry.items as T[];
}

export function setDictionaryQueryCache<T>(key: string, items: T[]) {
  if (queryCache.size >= CACHE_MAX_SIZE) {
    const firstKey = queryCache.keys().next().value as string;
    queryCache.delete(firstKey);
  }
  queryCache.set(key, { items, ts: Date.now() });
}

export function clearDictionaryQueryCache() {
  const size = queryCache.size;
  queryCache.clear();
  return size;
}
