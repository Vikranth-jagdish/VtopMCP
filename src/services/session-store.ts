/**
 * Optional cross-restart store for encrypted VTOP session blobs.
 *
 * By default the server keeps each user's authenticated VtopClient only in
 * memory (see http.ts client pool), so a redeploy or a free-tier spin-down
 * loses every session and users must log in (captcha) again. When REDIS_URL is
 * set, we additionally persist each session — encrypted with CONNECTOR_SECRET —
 * so a fresh process can rehydrate the cookies and skip the captcha+login as
 * long as VTOP still considers the session valid.
 *
 * The store only ever holds opaque ciphertext; it never sees credentials or
 * cookies in the clear. Entries are namespaced and given a TTL so dead sessions
 * expire on their own.
 */

export interface SessionStore {
  /** Returns the stored ciphertext for a key, or null if absent. */
  get(key: string): Promise<string | null>;
  /** Stores ciphertext under a key with a time-to-live (seconds). */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Removes a key (e.g. on logout). */
  delete(key: string): Promise<void>;
  /** Short label for logs. */
  readonly kind: string;
}

const KEY_PREFIX = "vtopmcp:sess:";

/**
 * Redis-backed store. ioredis is loaded lazily (and is an optional dependency)
 * so the module is only required on deployments that actually set REDIS_URL.
 */
class RedisSessionStore implements SessionStore {
  readonly kind = "redis";
  private clientPromise: Promise<RedisLike> | null = null;

  constructor(private readonly url: string) {}

  private client(): Promise<RedisLike> {
    if (!this.clientPromise) {
      this.clientPromise = import("ioredis")
        .then((mod) => {
          const Redis = (mod.default ?? mod) as unknown as RedisCtor;
          const c = new Redis(this.url, { maxRetriesPerRequest: 2 });
          c.on("error", (e: unknown) =>
            console.error("VtopMCP: redis error:", e instanceof Error ? e.message : e),
          );
          return c;
        })
        .catch((e: unknown) => {
          this.clientPromise = null; // allow a later retry
          throw new Error(
            "REDIS_URL is set but the 'ioredis' package could not be loaded. " +
              "Install it (npm install ioredis) to enable session persistence. " +
              (e instanceof Error ? e.message : String(e)),
          );
        });
    }
    return this.clientPromise;
  }

  async get(key: string): Promise<string | null> {
    const c = await this.client();
    return c.get(KEY_PREFIX + key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const c = await this.client();
    await c.set(KEY_PREFIX + key, value, "EX", Math.max(1, Math.floor(ttlSeconds)));
  }

  async delete(key: string): Promise<void> {
    const c = await this.client();
    await c.del(KEY_PREFIX + key);
  }
}

// Minimal structural types for the bits of ioredis we use (avoids a hard
// type-dependency on the optional package).
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  on(event: "error", listener: (err: unknown) => void): void;
}
interface RedisCtor {
  new (url: string, opts?: { maxRetriesPerRequest?: number }): RedisLike;
}

let resolved: SessionStore | null | undefined;

/**
 * The configured session store, or null when persistence is disabled (no
 * REDIS_URL). Memoized; safe to call repeatedly.
 */
export function getSessionStore(): SessionStore | null {
  if (resolved !== undefined) return resolved;
  const url = process.env.REDIS_URL?.trim();
  resolved = url ? new RedisSessionStore(url) : null;
  if (resolved) {
    console.error("VtopMCP: session persistence ON (redis) — sessions survive restarts.");
  }
  return resolved;
}
