/**
 * In-memory Redis mock for development without a Redis server.
 * Activated when REDIS_MOCK=true or when DB_DIALECT=sqlite (dev mode).
 *
 * Implements the subset of ioredis API used by the server:
 * - get, setex, del, sadd, sismember, exists
 * - Event emitters: connect, error, reconnecting
 */

import { EventEmitter } from 'events';

const useMock =
  process.env.REDIS_MOCK === 'true' || process.env.DB_DIALECT === 'sqlite';

class MemoryRedis extends EventEmitter {
  private store = new Map<string, { value: string; expiresAt: number | null }>();
  private sets = new Map<string, Set<string>>();

  constructor() {
    super();
    // Emit connect on next tick so listeners are registered first
    process.nextTick(() => this.emit('connect'));
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<'OK'> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return 'OK';
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: null });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
      this.sets.delete(key);
    }
    return count;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const set = this.sets.get(key)!;
    const before = set.size;
    for (const m of members) set.add(m);
    return set.size - before;
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.sets.get(key)?.has(member) ? 1 : 0;
  }

  async exists(...keys: string[]): Promise<number> {
    for (const key of keys) {
      if (this.store.has(key)) return 1;
    }
    return 0;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + ttlSeconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async keys(pattern: string): Promise<string[]> {
    if (pattern === '*') return Array.from(this.store.keys());
    // Simple glob support
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  disconnect(): void {
    // noop
  }
}

export type RedisLike = MemoryRedis;

let redisInstance: MemoryRedis | import('ioredis').Redis | null = null;

export function getRedis(): MemoryRedis | import('ioredis').Redis {
  if (redisInstance) return redisInstance;

  if (useMock) {
    console.log('[DEV] Using in-memory Redis mock');
    redisInstance = new MemoryRedis();
    return redisInstance;
  }

  // Dynamic import to avoid requiring ioredis when mocking
  const { Redis } = require('ioredis');
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

  const instance = new Redis({
    host: redisHost,
    port: redisPort,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
  });

  instance.on('connect', () => {
    console.log('Redis connected successfully.');
  });
  instance.on('error', (err: Error) => {
    console.error('Redis connection error:', err.message);
  });
  instance.on('reconnecting', () => {
    console.warn('Redis reconnecting...');
  });

  redisInstance = instance;
  return instance;
}

// Export redis as a getter so it's lazily initialized
export const redis = new Proxy({} as MemoryRedis, {
  get(_target, prop) {
    const instance = getRedis();
    const value = (instance as any)[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export async function setWithExpiry(
  key: string,
  value: string,
  ttlSeconds: number
): Promise<void> {
  await redis.setex(key, ttlSeconds, value);
}

export async function get(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function deleteKey(key: string): Promise<void> {
  await redis.del(key);
}

export async function addToSet(
  key: string,
  ...members: string[]
): Promise<void> {
  await redis.sadd(key, ...members);
}

export async function isMemberOfSet(
  key: string,
  member: string
): Promise<boolean> {
  const result = await redis.sismember(key, member);
  return result === 1;
}
