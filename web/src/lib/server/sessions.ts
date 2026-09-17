import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { NodeSavedSessionStore, NodeSavedStateStore } from '@atproto/oauth-client-node';
import { env } from '$env/dynamic/private';

export type Browser = { id: string; dids: string[]; current: string | null };

let db: DatabaseSync | undefined;

export function sessionsDB(): DatabaseSync {
  if (db) return db;
  db = new DatabaseSync(env.SESSIONS_DATABASE_PATH ?? 'web-sessions.db');
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS oauth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_session (sub TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS browser (id TEXT PRIMARY KEY, dids TEXT NOT NULL, current TEXT);
    CREATE TABLE IF NOT EXISTS oauth_link (state TEXT PRIMARY KEY, browser_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  return db;
}

function jsonStore<T>(table: string, key: string) {
  return {
    async set(k: string, value: T) {
      sessionsDB()
        .prepare(
          `INSERT OR REPLACE INTO ${table} (${key}, value${table === 'oauth_state' ? ', created_at' : ''}) VALUES (?, ?${table === 'oauth_state' ? ', ?' : ''})`,
        )
        .run(
          ...(table === 'oauth_state'
            ? [k, JSON.stringify(value), Date.now()]
            : [k, JSON.stringify(value)]),
        );
    },
    async get(k: string): Promise<T | undefined> {
      const row = sessionsDB().prepare(`SELECT value FROM ${table} WHERE ${key} = ?`).get(k) as
        | { value: string }
        | undefined;
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    async del(k: string) {
      sessionsDB().prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(k);
    },
  };
}

export const stateStore: NodeSavedStateStore = jsonStore('oauth_state', 'key');
export const sessionStore: NodeSavedSessionStore = jsonStore('oauth_session', 'sub');

/** Every DID the server holds an oauth session row for, regardless of which
    browser (if any) still references it. `sessionFor`/`agentFor` still decide
    whether that session actually restores. */
export function allSessionDids(): string[] {
  const rows = sessionsDB().prepare('SELECT sub FROM oauth_session').all() as { sub: string }[];
  return rows.map((r) => r.sub);
}

function row(id: string): Browser | null {
  const r = sessionsDB().prepare(`SELECT id, dids, current FROM browser WHERE id = ?`).get(id) as
    | { id: string; dids: string; current: string | null }
    | undefined;
  return r ? { id: r.id, dids: JSON.parse(r.dids), current: r.current } : null;
}

function save(b: Browser): Browser {
  sessionsDB()
    .prepare(`INSERT OR REPLACE INTO browser (id, dids, current) VALUES (?, ?, ?)`)
    .run(b.id, JSON.stringify(b.dids), b.current);
  return b;
}

export function getBrowser(id: string | undefined): Browser | null {
  return id ? row(id) : null;
}

export function newBrowser(): Browser {
  return save({ id: randomBytes(32).toString('base64url'), dids: [], current: null });
}

export function addAccount(id: string, did: string): Browser {
  const b = row(id) ?? save({ id, dids: [], current: null });
  if (!b.dids.includes(did)) b.dids.push(did);
  b.current = did;
  return save(b);
}

export function switchAccount(id: string, did: string): Browser {
  const b = row(id) ?? save({ id, dids: [], current: null });
  if (b.dids.includes(did)) b.current = did;
  return save(b);
}

export function removeAccount(id: string, did: string): Browser {
  const b = row(id) ?? save({ id, dids: [], current: null });
  b.dids = b.dids.filter((d) => d !== did);
  if (b.current === did) b.current = b.dids.at(-1) ?? null;
  return save(b);
}

// The OAuth `state` travels through the authorization server, so it is a throwaway
// token linked to the browser here rather than the browser's own id.
export function linkState(browserId: string): string {
  const state = randomBytes(24).toString('base64url');
  sessionsDB()
    .prepare(`INSERT INTO oauth_link (state, browser_id, created_at) VALUES (?, ?, ?)`)
    .run(state, browserId, Date.now());
  return state;
}

/** Returns the browser the state was issued to, once. Expired or unknown states give null. */
export function takeState(state: string): string | null {
  const db = sessionsDB();
  const row = db
    .prepare(`SELECT browser_id, created_at FROM oauth_link WHERE state = ?`)
    .get(state) as { browser_id: string; created_at: number } | undefined;
  db.prepare(`DELETE FROM oauth_link WHERE state = ? OR created_at < ?`).run(
    state,
    Date.now() - 3_600_000,
  );
  if (!row || row.created_at < Date.now() - 3_600_000) return null;
  return row.browser_id;
}
