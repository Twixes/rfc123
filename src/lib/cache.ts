import { Redis } from "@upstash/redis";
import { captureServerException } from "./posthog-server";

const redis = Redis.fromEnv();

export async function getCachedJsonData<T>(key: string): Promise<T | null> {
  try {
    const cachedData = (await redis.get(key)) as T | null;
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

export async function setCachedJsonData<T>(
  key: string,
  data: T,
  ttl: number,
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(data), ttl ? { ex: ttl } : undefined);
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
