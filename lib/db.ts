// Neon PostgreSQL database client — replaces Google Sheets entirely.
// Uses @neondatabase/serverless which works in Next.js Edge & Node runtimes.

import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

export function getDb() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL environment variable.");
  _sql = neon(url);
  return _sql;
}

// Tagged-template SQL executor — primary interface for all queries.
// Usage: await sql`SELECT * FROM items WHERE id = ${id}`
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const db = getDb();
  const result = await db(strings, ...values);
  return result as T[];
}

// Simple in-memory cache (same TTL pattern as the old sheets.ts cache).
const cache = new Map<string, { data: unknown; expires: number }>();

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await fn();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

export function clearCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
