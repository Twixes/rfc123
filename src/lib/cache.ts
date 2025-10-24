import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getCachedJsonData<T>(key: string): Promise<T | null> {
  const cachedData = await redis.get(key) as string | null;
  return cachedData ? JSON.parse(cachedData) : null;
}

export async function setCachedJsonData<T>(key: string, data: T, ttl?: number): Promise<void> {
  await redis.set(key, JSON.stringify(data),  ttl ? { ex: ttl } : undefined);
}
