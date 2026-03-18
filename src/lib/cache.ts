import { Redis } from "@upstash/redis";
import { captureServerException } from "./posthog-server";

const redis = Redis.fromEnv();

export async function getCachedJsonData<T>(key: string): Promise<T | null> {
  try {
    const t0 = performance.now();
    const cachedData = (await redis.get(key)) as T | null;
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      console.log(`[cache] SLOW redis.get("${key}") took ${elapsed.toFixed(0)}ms`);
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
): Promise<void> {
  try {
    const t0 = performance.now();
    await redis.set(key, JSON.stringify(data), ttl ? { ex: ttl } : undefined);
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      console.log(`[cache] SLOW redis.set("${key}") took ${elapsed.toFixed(0)}ms`);
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

/**
 * Batch get multiple keys in a single MGET. Returns values in same order as keys.
 * Missing keys return null.
 */
export async function getCachedJsonDataBatch<T>(
  keys: string[],
): Promise<(T | null)[]> {
  if (keys.length === 0) return [];
  try {
    const t0 = performance.now();
    const values = (await redis.mget(...keys)) as (string | null)[];
    const elapsed = performance.now() - t0;
    if (elapsed > 50) {
      console.log(
        `[cache] redis.mget(${keys.length} keys) took ${elapsed.toFixed(0)}ms`,
      );
    }
    return values.map((v) =>
      v != null ? (JSON.parse(v) as T) : null,
    );
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
      console.log(
        `[cache] redis.pipeline set(${entries.length} keys) took ${elapsed.toFixed(0)}ms`,
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
