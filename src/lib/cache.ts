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
