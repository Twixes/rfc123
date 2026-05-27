import { Redis } from "@upstash/redis";
import { captureServerException } from "./posthog-server";

const redis = Redis.fromEnv();

/** Optional label for slow-operation logs (e.g. `listRFCs:inline_counts`). */
export type CachedJsonOpOpts = {
  name?: string;
};

function cacheLogPrefix(opts?: CachedJsonOpOpts): string {
  return opts?.name ? `[${opts.name}] ` : "";
}

export async function getCachedJsonData<T>(key: string): Promise<T | null> {
  try {
    const t0 = performance.now();
    const cachedData = (await redis.get(key)) as T | null;
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      console.log(
        `[cache] SLOW redis.get("${key}") took ${elapsed.toFixed(0)}ms`,
      );
    }
    return cachedData;
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "getCachedJsonData",
      key,
      context: "cache_read_error",
    });
    // Return null on cache errors to fall through to actual data fetch
    return null;
  }
}

export async function deleteCachedData(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "deleteCachedData",
      key,
      context: "cache_delete_error",
    });
    console.error("Cache delete error:", error);
  }
}

export async function setCachedJsonData<T>(
  key: string,
  data: T,
  ttl: number,
  opts?: CachedJsonOpOpts,
): Promise<void> {
  try {
    const t0 = performance.now();
    await redis.set(key, JSON.stringify(data), ttl ? { ex: ttl } : undefined);
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      const label = cacheLogPrefix(opts);
      console.log(
        `[cache] SLOW ${label}redis.set("${key}") took ${elapsed.toFixed(0)}ms`,
      );
    }
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "setCachedJsonData",
      key,
      context: "cache_write_error",
    });
    // Don't throw on cache write errors, just log them
    console.error("Cache write error:", error);
  }
}

const LOCK_TTL_MS = 30_000;

async function acquireLock(lockKey: string): Promise<boolean> {
  try {
    return (
      (await redis.set(lockKey, "1", { nx: true, px: LOCK_TTL_MS })) === "OK"
    );
  } catch {
    return false;
  }
}

async function releaseLock(lockKey: string): Promise<void> {
  try {
    await redis.del(lockKey);
  } catch {
    // Lock self-expires via LOCK_TTL_MS
  }
}

/**
 * Cache-aside with stampede prevention. Only one concurrent caller runs
 * `compute` for a given key at a time; others poll for the result instead of
 * each firing their own expensive operation.
 *
 * Protocol:
 * 1. Read cache — return immediately on hit.
 * 2. Try to acquire a Redis NX lock (30 s TTL so crashes self-heal).
 * 3. Lock winner: compute, write cache, release lock.
 * 4. Lock loser: poll cache every 200 ms for up to 25 s, then degrade to
 *    computing independently so a crashed winner doesn't block forever.
 */
export async function withCachedJsonData<T>(
  key: string,
  ttl: number,
  compute: () => Promise<T>,
  opts?: CachedJsonOpOpts,
): Promise<T> {
  const hit = await getCachedJsonData<T>(key);
  if (hit !== null) return hit;

  const lockKey = `lock:${key}`;
  const acquired = await acquireLock(lockKey);

  if (acquired) {
    try {
      const value = await compute();
      await setCachedJsonData(key, value, ttl, opts);
      return value;
    } finally {
      await releaseLock(lockKey);
    }
  }

  // Another worker holds the lock — wait for them to populate the cache.
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, 200));
    const result = await getCachedJsonData<T>(key);
    if (result !== null) return result;
  }

  // Lock holder likely crashed — degrade and compute independently.
  const value = await compute();
  await setCachedJsonData(key, value, ttl, opts);
  return value;
}

/**
 * Batch get multiple keys in a single MGET. Returns values in same order as keys.
 * Missing keys return null.
 */
export async function getCachedJsonDataBatch<T>(
  keys: string[],
  opts?: CachedJsonOpOpts,
): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  try {
    const t0 = performance.now();
    const values = (await redis.mget(...keys)) as (string | null)[];
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      const label = cacheLogPrefix(opts);
      console.log(
        `[cache] SLOW ${label}redis.mget(${keys.length} keys) took ${elapsed.toFixed(0)}ms`,
      );
    }
    return values.map((v) => (v != null ? (JSON.parse(v) as T) : null));
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "getCachedJsonDataBatch",
      keyCount: keys.length,
      context: "cache_read_error",
    });
    return keys.map(() => null);
  }
}

/**
 * Batch set multiple key-value pairs in a single pipeline (one round-trip).
 * All entries use the same TTL.
 */
export async function setCachedJsonDataBatch<T>(
  entries: Array<{ key: string; value: T }>,
  ttl: number,
  opts?: CachedJsonOpOpts,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const t0 = performance.now();
    const p = redis.pipeline();
    for (const { key, value } of entries) {
      p.set(key, JSON.stringify(value), ttl ? { ex: ttl } : undefined);
    }
    await p.exec();
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      const label = cacheLogPrefix(opts);
      console.log(
        `[cache] SLOW ${label}redis.pipeline set(${entries.length} keys) took ${elapsed.toFixed(0)}ms`,
      );
    }
  } catch (error) {
    captureServerException(error as Error, undefined, {
      function: "setCachedJsonDataBatch",
      keyCount: entries.length,
      context: "cache_write_error",
    });
    console.error("Cache batch write error:", error);
  }
}
