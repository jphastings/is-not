# Sign-in and `/review` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in with one or more atproto accounts and write an `at.isnot.review` record from the `/review` page.

**Architecture:** `@atproto/oauth-client-node` as a confidential client inside the SvelteKit server, with its state and session stores plus a browser-accounts table in the site's own SQLite file (`node:sqlite`, read-write). A cookie carries a random browser id; the server maps it to the signed-in DIDs and the current one. `/review` resolves subjects in the browser with `@is-not/lenses`, validates on both sides with one shared function, and a form action writes the record through the PDS with `putRecord` (existing review for that subject) or `createRecord` (new). In development the client is an atproto loopback client, so no key is needed.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, `@atproto/oauth-client-node`, `@atproto/jwk-jose`, `@atproto/api` (Agent), `@atproto/common-web` (TID), `@is-not/lenses`, `@is-not/sentence`, Paraglide messages, `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-09-15-review-site-design.md` sections 4, 5 and 6.

## Global Constraints

- Commit straight to `main`; `pnpm check`, `pnpm --filter web test`, `pnpm --filter web check` before every commit. No test summaries in commit messages.
- `web/` runs from `web/build` with no `node_modules`: every dependency is a devDependency and gets bundled (add to `ssr.noExternal` in `web/vite.config.ts` when the bundling check fails).
- The shared reviews database stays read-only; the site writes only to its own file at `SESSIONS_DATABASE_PATH` (default `web-sessions.db`).
- Scope requested from the PDS: `atproto transition:generic`. Client metadata is served at `/oauth/client-metadata.json`, JWKS at `/oauth/jwks.json`, callback at `/oauth/callback`, all under `WEB_ORIGIN`.
- Validation mirrors the lexicon: 1 to 32 tags, adjective 1 to 16 graphemes and at most 160 bytes, direction in {-2,-1,0,1,2}, subject title 1 to 256 graphemes and at most 2560 bytes, locale matches `^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$` when present.
- Copy through Paraglide messages; few words; no em dashes. Direction is never conveyed by colour alone.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Secure` when `WEB_ORIGIN` starts with `https`, path `/`, 90 days.

---

### Task 1: Sessions database and browser accounts

**Files:**
- Create: `web/src/lib/server/sessions.ts`
- Create: `web/src/lib/server/sessions.test.ts`
- Modify: `web/package.json` (devDependencies `@atproto/oauth-client-node`, `@atproto/jwk-jose`, `@atproto/api`, `@atproto/common-web`)
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces:
  ```ts
  export type Browser = { id: string; dids: string[]; current: string | null };
  export function sessionsDB(): DatabaseSync;            // lazy, read-write, creates tables
  export const stateStore: NodeSavedStateStore;          // table oauth_state(key, value, created_at)
  export const sessionStore: NodeSavedSessionStore;      // table oauth_session(sub, value)
  export function getBrowser(id: string | undefined): Browser | null;
  export function newBrowser(): Browser;                 // random 32-byte base64url id
  export function addAccount(id: string, did: string): Browser;    // adds and makes current
  export function switchAccount(id: string, did: string): Browser; // no-op if did unknown
  export function removeAccount(id: string, did: string): Browser; // current falls back to the last remaining or null
  ```

- [ ] **Step 1: Install**

```bash
pnpm --filter web add -D @atproto/oauth-client-node @atproto/jwk-jose @atproto/api @atproto/common-web
```

- [ ] **Step 2: Failing tests**

`web/src/lib/server/sessions.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('$env/dynamic/private', () => ({ env: process.env }));
process.env.SESSIONS_DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'isnot-sessions-')), 's.db');

describe('browser accounts', () => {
  let s: typeof import('./sessions.ts');
  beforeAll(async () => {
    s = await import('./sessions.ts');
  });

  it('adds, switches and removes accounts', () => {
    const b = s.newBrowser();
    expect(s.getBrowser(b.id)).toEqual({ id: b.id, dids: [], current: null });
    s.addAccount(b.id, 'did:plc:a');
    s.addAccount(b.id, 'did:plc:b');
    expect(s.getBrowser(b.id)).toEqual({ id: b.id, dids: ['did:plc:a', 'did:plc:b'], current: 'did:plc:b' });
    s.switchAccount(b.id, 'did:plc:a');
    expect(s.getBrowser(b.id)?.current).toBe('did:plc:a');
    s.switchAccount(b.id, 'did:plc:zzz');
    expect(s.getBrowser(b.id)?.current).toBe('did:plc:a');
    s.removeAccount(b.id, 'did:plc:a');
    expect(s.getBrowser(b.id)).toEqual({ id: b.id, dids: ['did:plc:b'], current: 'did:plc:b' });
    s.removeAccount(b.id, 'did:plc:b');
    expect(s.getBrowser(b.id)?.current).toBeNull();
    expect(s.getBrowser('nope')).toBeNull();
  });

  it('stores oauth state and sessions round-trip', async () => {
    await s.stateStore.set('k1', { dpopKey: 'x' } as never);
    expect(await s.stateStore.get('k1')).toEqual({ dpopKey: 'x' });
    await s.stateStore.del('k1');
    expect(await s.stateStore.get('k1')).toBeUndefined();
    await s.sessionStore.set('did:plc:a', { tokenSet: { sub: 'did:plc:a' } } as never);
    expect(await s.sessionStore.get('did:plc:a')).toEqual({ tokenSet: { sub: 'did:plc:a' } });
    await s.sessionStore.del('did:plc:a');
    expect(await s.sessionStore.get('did:plc:a')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `pnpm --filter web test`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement**

`web/src/lib/server/sessions.ts`:

```ts
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
    CREATE TABLE IF NOT EXISTS oauth_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_session (sub TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS browser (id TEXT PRIMARY KEY, dids TEXT NOT NULL, current TEXT);
  `);
  return db;
}

function jsonStore<T>(table: string, key: string) {
  return {
    async set(k: string, value: T) {
      sessionsDB()
        .prepare(`INSERT OR REPLACE INTO ${table} (${key}, value${table === 'oauth_state' ? ', created_at' : ''}) VALUES (?, ?${table === 'oauth_state' ? ', ?' : ''})`)
        .run(...(table === 'oauth_state' ? [k, JSON.stringify(value), Date.now()] : [k, JSON.stringify(value)]));
    },
    async get(k: string): Promise<T | undefined> {
      const row = sessionsDB().prepare(`SELECT value FROM ${table} WHERE ${key} = ?`).get(k) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    async del(k: string) {
      sessionsDB().prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(k);
    },
  };
}

export const stateStore: NodeSavedStateStore = jsonStore('oauth_state', 'key');
export const sessionStore: NodeSavedSessionStore = jsonStore('oauth_session', 'sub');

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
```

If the `jsonStore` conditional SQL reads badly, split it into two small store objects instead; the tests are the contract.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter web test`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add web pnpm-lock.yaml
git commit -m "feat(web): sessions database with oauth stores and browser accounts"
```

---

### Task 2: OAuth client and routes

**Files:**
- Create: `web/src/lib/server/oauth.ts`
- Create: `web/src/lib/server/accounts.ts`
- Create: `web/src/routes/oauth/client-metadata.json/+server.ts`
- Create: `web/src/routes/oauth/jwks.json/+server.ts`
- Create: `web/src/routes/oauth/login/+server.ts`
- Create: `web/src/routes/oauth/callback/+server.ts`
- Create: `web/src/routes/oauth/logout/+server.ts`
- Create: `web/src/routes/oauth/switch/+server.ts`
- Create: `web/scripts/keygen.mjs`
- Modify: `web/src/hooks.server.ts` (browser cookie → `event.locals.browser`)
- Modify: `web/src/app.d.ts` (`Locals`)
- Modify: `web/package.json` (script `keygen`)
- Modify: `web/messages/en.json` (`sign_in`, `handle_placeholder`, `sign_out`, `switch_account`)
- Modify: `.railway/railway.ts` (two preserved variables)
- Modify: `README.md` (site env table: `WEB_ORIGIN`, `OAUTH_PRIVATE_KEY`, `SESSIONS_DATABASE_PATH`, keygen)

**Interfaces:**
- Produces:
  ```ts
  // oauth.ts
  export function oauthClient(): Promise<NodeOAuthClient>;   // memoised; loopback client when WEB_ORIGIN is http://127.0.0.1:* or http://localhost:*
  // accounts.ts
  export type Account = { did: string; handle: string };
  export function accountsFor(browser: Browser | null): Promise<{ accounts: Account[]; current: Account | null }>;
  export function agentFor(did: string): Promise<Agent>;      // restores the session, throws if none
  export function didHandle(did: string): Promise<string>;   // alsoKnownAs from the DID document, '' if unknown
  // hooks: event.locals.browser: Browser | null, cookie name 'isnot_browser'
  ```

- [ ] **Step 1: OAuth client**

`web/src/lib/server/oauth.ts`:

```ts
import { NodeOAuthClient, atprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { env } from '$env/dynamic/private';
import { sessionStore, stateStore } from './sessions.ts';

const SCOPE = 'atproto transition:generic';
let client: Promise<NodeOAuthClient> | undefined;

export function origin(): string {
  return (env.WEB_ORIGIN ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
}

export function oauthClient(): Promise<NodeOAuthClient> {
  return (client ??= build());
}

async function build(): Promise<NodeOAuthClient> {
  const o = origin();
  const redirect = `${o}/oauth/callback`;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)) {
    const clientId = `http://localhost?${new URLSearchParams({ redirect_uri: redirect, scope: SCOPE })}`;
    return new NodeOAuthClient({ clientMetadata: atprotoLoopbackClientMetadata(clientId), stateStore, sessionStore });
  }
  if (!env.OAUTH_PRIVATE_KEY) throw new Error('OAUTH_PRIVATE_KEY is required when WEB_ORIGIN is not a loopback address');
  return new NodeOAuthClient({
    clientMetadata: {
      client_id: `${o}/oauth/client-metadata.json`,
      client_name: 'is/not',
      client_uri: o,
      redirect_uris: [redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: SCOPE,
      application_type: 'web',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
      dpop_bound_access_tokens: true,
      jwks_uri: `${o}/oauth/jwks.json`,
    },
    keyset: [await JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY, 'key1')],
    stateStore,
    sessionStore,
  });
}
```

If `atprotoLoopbackClientMetadata` is not exported by the installed version, build the loopback metadata by hand per the atproto OAuth spec: `client_id` as above, `redirect_uris: [redirect]`, `scope: SCOPE`, `token_endpoint_auth_method: 'none'`, `dpop_bound_access_tokens: true`, `response_types: ['code']`, `grant_types: ['authorization_code', 'refresh_token']`, `client_name: 'is/not (dev)'`.

`web/scripts/keygen.mjs`:

```js
import { JoseKey } from '@atproto/jwk-jose';
const key = await JoseKey.generate(['ES256'], 'key1');
console.log(JSON.stringify(key.privateJwk));
```

Add `"keygen": "node scripts/keygen.mjs"` to `web/package.json` scripts.

- [ ] **Step 2: Accounts**

`web/src/lib/server/accounts.ts`:

```ts
import { Agent } from '@atproto/api';
import type { Browser } from './sessions.ts';
import { oauthClient } from './oauth.ts';

export type Account = { did: string; handle: string };

export async function didHandle(did: string): Promise<string> {
  const url = did.startsWith('did:web:')
    ? `https://${did.slice(8)}/.well-known/did.json`
    : `https://plc.directory/${did}`;
  try {
    const doc = (await (await fetch(url)).json()) as { alsoKnownAs?: string[] };
    return doc.alsoKnownAs?.find((a) => a.startsWith('at://'))?.slice(5) ?? '';
  } catch {
    return '';
  }
}

export async function accountsFor(browser: Browser | null): Promise<{ accounts: Account[]; current: Account | null }> {
  if (!browser) return { accounts: [], current: null };
  const accounts = await Promise.all(browser.dids.map(async (did) => ({ did, handle: await didHandle(did) })));
  return { accounts, current: accounts.find((a) => a.did === browser.current) ?? null };
}

export async function agentFor(did: string): Promise<Agent> {
  const session = await (await oauthClient()).restore(did);
  return new Agent(session);
}
```

`didHandle` is called per request for each signed-in account; cache it in a module-level `Map<string, string>` with a one-hour expiry if the `/review` load feels slow. Note it in the report either way.

- [ ] **Step 3: Hook and locals**

`web/src/app.d.ts`: inside `namespace App`, `interface Locals { browser: import('$lib/server/sessions').Browser | null }`.

`web/src/hooks.server.ts`: keep the Paraglide middleware and wrap it so that, before resolving, `event.locals.browser = getBrowser(event.cookies.get('isnot_browser'))`. Use `sequence` from `@sveltejs/kit/hooks` with two handles: `accounts` then `paraglideHandle`.

Add `web/src/lib/server/cookie.ts`:

```ts
import type { Cookies } from '@sveltejs/kit';
import { origin } from './oauth.ts';
import { getBrowser, newBrowser, type Browser } from './sessions.ts';

export const COOKIE = 'isnot_browser';

export function ensureBrowser(cookies: Cookies): Browser {
  const existing = getBrowser(cookies.get(COOKIE));
  if (existing) return existing;
  const b = newBrowser();
  cookies.set(COOKIE, b.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: origin().startsWith('https'),
    maxAge: 60 * 60 * 24 * 90,
  });
  return b;
}
```

- [ ] **Step 4: Routes**

`oauth/client-metadata.json/+server.ts`: `GET` → `json((await oauthClient()).clientMetadata)`.
`oauth/jwks.json/+server.ts`: `GET` → `json((await oauthClient()).jwks)`.

`oauth/login/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie.ts';
import { oauthClient } from '$lib/server/oauth.ts';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const handle = String((await request.formData()).get('handle') ?? '').trim().replace(/^@/, '');
  if (!handle) redirect(303, '/review?error=handle');
  const browser = ensureBrowser(cookies);
  const url = await (await oauthClient()).authorize(handle, { state: browser.id });
  redirect(303, url.toString());
};
```

`oauth/callback/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ensureBrowser } from '$lib/server/cookie.ts';
import { oauthClient } from '$lib/server/oauth.ts';
import { addAccount } from '$lib/server/sessions.ts';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const browser = ensureBrowser(cookies);
  const { session, state } = await (await oauthClient()).callback(url.searchParams);
  if (state !== browser.id) redirect(303, '/review?error=state');
  addAccount(browser.id, session.did);
  redirect(303, '/review');
};
```

`oauth/logout/+server.ts` (`POST`, form field `did`): `removeAccount(browser.id, did)`, then `(await oauthClient()).revoke(did)` inside try/catch, redirect 303 to `/review`.
`oauth/switch/+server.ts` (`POST`, form field `did`): `switchAccount(browser.id, did)`, redirect 303 to `/review`.

Both read the browser via `ensureBrowser(cookies)`.

- [ ] **Step 5: Messages, Railway, README**

`web/messages/en.json` add: `"sign_in": "Sign in"`, `"handle_placeholder": "your.handle"`, `"sign_out": "Sign out"`, `"switch_account": "Switch"`.

`.railway/railway.ts` env: add `OAUTH_PRIVATE_KEY: preserve()` and `SESSIONS_DATABASE_PATH: '/data/web-sessions.db'`.

`README.md` "Running the site": a small table for `WEB_ORIGIN`, `OAUTH_PRIVATE_KEY` (generate with `pnpm --filter web keygen`; not needed for loopback development), `SESSIONS_DATABASE_PATH`; note that on `http://127.0.0.1:5173` the loopback client is used.

- [ ] **Step 6: Verify**

Run: `pnpm --filter web check && pnpm check && pnpm --filter web test && pnpm --filter web build`.

Then a live check with the dev server: `pnpm --filter web dev` (origin `http://127.0.0.1:5173`), `curl -s 127.0.0.1:5173/oauth/client-metadata.json` prints loopback metadata with the `redirect_uris` above; `curl -s -X POST -d handle=bsky.app 127.0.0.1:5173/oauth/login -o /dev/null -w '%{http_code} %{redirect_url}\n'` prints `303` and an `https://` authorization URL on a PDS. Don't complete the login in this task.

- [ ] **Step 7: Commit**

```bash
git add web .railway/railway.ts README.md
git commit -m "feat(web): atproto OAuth sign-in with several accounts per browser"
```

---

### Task 3: Review validation, existing-review lookup and the save action

**Files:**
- Create: `web/src/lib/review.ts` (shared validation, client and server)
- Create: `web/src/lib/review.test.ts`
- Modify: `web/src/lib/server/db.ts` (`findReview`)
- Modify: `web/src/lib/server/db.test.ts`
- Create: `web/src/routes/review/+page.server.ts` (load + `save` action)
- Create: `web/src/routes/review/existing/+server.ts` (GET `?uri=` → existing review or null)
- Modify: `web/messages/en.json`

**Interfaces:**
- Produces:
  ```ts
  // review.ts
  export type ReviewInput = { subject: Subject; tags: Tag[]; locale?: string };  // Subject and Tag from @is-not/lenses
  export function validateReview(input: unknown): { ok: true; value: ReviewInput } | { ok: false; error: string };
  // db.ts
  export type ExistingReview = { rkey: string; createdAt: string; tags: Tag[]; locale?: string };
  export function findReview(did: string, subjectUri: string): ExistingReview | null;
  // action `save` returns { uri: string } on success, fail(400, { error }) on validation, fail(502, { error }) on PDS failure
  ```

- [ ] **Step 1: Failing tests**

`web/src/lib/review.test.ts` (behavioral, concise): valid input passes and is returned normalised (adjectives trimmed, locale lowercased); each of these fails with a distinct `error` key: zero tags, 33 tags, adjective of 17 graphemes (use 17 emoji with skin tones to prove graphemes not code points), adjective over 160 bytes, direction 3, missing subject uri, title of 257 graphemes, locale `'not a tag'`. Error keys: `tags`, `adjective`, `direction`, `subject`, `title`, `locale`.

Extend `web/src/lib/server/db.test.ts`: insert a review with `created_at`, two tags and locale; `findReview(did, uri)` returns `{ rkey, createdAt, tags, locale }`; unknown uri returns `null`.

- [ ] **Step 2: Run to see them fail**

Run: `pnpm --filter web test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`web/src/lib/review.ts`: use `new Intl.Segmenter(undefined, { granularity: 'grapheme' })` for grapheme counts and `new TextEncoder().encode(s).length` for bytes. Validate the shape defensively (input is `unknown`, from a form). Return normalised values.

`web/src/lib/server/db.ts` `findReview`: query `reviews` by `(did, subject_uri)` ordered by `updated_at DESC LIMIT 1`, then its `review_tags`; `locale` undefined when empty.

`web/src/routes/review/existing/+server.ts`: `GET` with `?uri=`; requires `locals.browser?.current`, else `json(null)`; returns `json(findReview(current, uri))`.

`web/src/routes/review/+page.server.ts`:

```ts
import { fail } from '@sveltejs/kit';
import { TID } from '@atproto/common-web';
import type { Actions, PageServerLoad } from './$types';
import { accountsFor, agentFor } from '$lib/server/accounts.ts';
import { findReview } from '$lib/server/db.ts';
import { validateReview } from '$lib/review.ts';

export const load: PageServerLoad = async ({ locals, url }) => ({
  ...(await accountsFor(locals.browser)),
  error: url.searchParams.get('error'),
});

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const did = locals.browser?.current;
    if (!did) return fail(401, { error: 'signin' });
    const form = await request.formData();
    const parsed = validateReview(JSON.parse(String(form.get('review') ?? 'null')));
    if (!parsed.ok) return fail(400, { error: parsed.error });
    const { subject, tags, locale } = parsed.value;
    const existing = findReview(did, subject.uri);
    const now = new Date().toISOString();
    const record = {
      $type: 'at.isnot.review',
      subject,
      tags,
      ...(locale ? { locale } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      const agent = await agentFor(did);
      const rkey = existing?.rkey ?? TID.nextStr();
      const res = existing
        ? await agent.com.atproto.repo.putRecord({ repo: did, collection: 'at.isnot.review', rkey, record })
        : await agent.com.atproto.repo.createRecord({ repo: did, collection: 'at.isnot.review', rkey, record });
      return { uri: res.data.uri };
    } catch (e) {
      console.error('save failed', e);
      return fail(502, { error: 'pds' });
    }
  },
};
```

The client sends the whole review as one JSON form field named `review` (built from the resolved subject and the tag rows), which keeps the action independent of how the form is laid out.

Messages: `"error_signin": "Sign in first."`, `"error_tags": "Add at least one adjective."`, `"error_adjective": "Adjectives are 1 to 16 characters."`, `"error_subject": "Pick something to review."`, `"error_pds": "Couldn't save to your account. Try again."`, `"error_handle": "Enter your handle."`, `"error_state": "Sign-in didn't complete. Try again."`, `"saved": "Saved."`, `"view_record": "See the record"`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter web test && pnpm --filter web check && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web
git commit -m "feat(web): review validation, existing-review lookup and the save action"
```

---

### Task 4: The `/review` page

**Files:**
- Create: `web/src/routes/review/+page.svelte`
- Create: `web/src/lib/ReviewForm.svelte`
- Create: `web/src/lib/lenses.ts` (browser-side lens loading)
- Modify: `web/messages/en.json`
- Modify: `web/vite.config.ts` (only if the wasm asset or a package needs `ssr.noExternal` / `optimizeDeps.exclude`)

**Interfaces:**
- Consumes: `data.accounts`, `data.current`, `data.error`; form action `?/save`; `GET /review/existing?uri=`; `loadLenses`, `fetchRecord`, `Subject`, `Direction` from `@is-not/lenses`; `reviewSentence`, `Part` from `@is-not/sentence`; `validateReview` from `$lib/review.ts`; `Sentence.svelte`.

- [ ] **Step 1: Browser lens loading**

`web/src/lib/lenses.ts`:

```ts
import wasmUrl from '@is-not/lenses/isnot_lenses.wasm?url';
import { loadLenses, type Lenses } from '@is-not/lenses';

let lenses: Promise<Lenses> | undefined;
export function browserLenses(): Promise<Lenses> {
  return (lenses ??= loadLenses(wasmUrl));
}
```

If Vite refuses the `?url` import on a package subpath, copy the wasm into `web/static/isnot_lenses.wasm` at build time via a `prebuild` script and load `/isnot_lenses.wasm`; say which in the report.

- [ ] **Step 2: The form**

`web/src/lib/ReviewForm.svelte` renders the sentence-shaped form. Structure (semantic, not a mock to trace):

- A `<form method="POST" action="?/save" use:enhance>` whose visible content is one large `.display` sentence in a `<p>`:
  1. **who**: if `current`, a `<button type="button">` showing `@handle` that toggles an inline list of the other accounts (each a tiny form posting to `/oauth/switch`) plus "Sign in another" (inline handle input posting to `/oauth/login`) and "Sign out" (posting to `/oauth/logout`). If nobody is signed in, the slot is the inline sign-in form: a text input with `handle_placeholder` and a `Sign in` pill. Then the word `thinks` (message `thinks`).
  2. **subject**: a text `<input>` (message `subject_placeholder`: "paste an at:// link") styled as a word with a moss underline. On change (debounced 300 ms), if it parses as `at://did/collection/rkey`, call `fetchRecord` then `lenses.resolveSubject`; while resolving show the uri dimmed; on success replace the input's visual with the title (the input stays focusable to edit the uri; the title renders as a `<span>` beside it and the input shrinks to a "change" affordance); if `supported` is false show the guessed title in an editable `<input>` and the one-line note `unsupported_note`. Also `GET /review/existing?uri=` and, when non-null, prefill the tag rows and locale and remember `existing = true` so the save button says `update` instead of `save`.
  3. **tags**: a `<ul>` of rows. Each row: a `<select>` with the four direction phrases (values 2, 1, -1, -2; message keys `dir_2`, `dir_1`, `dir_m1`, `dir_m2`) and an `<input>` for the adjective (`adjective_placeholder`: "adjective", `maxlength` not set; validation handles graphemes). Rows joined with the list format visually by `reviewSentence` is not required; render rows as "…, is not boring" fragments separated by commas. A `remove` button per row (hidden when only one), and an `add_another` link-styled button after the last row.
  4. **locale**: a small `<input>` prefilled from `navigator.language` (in `$effect`, so SSR stays deterministic), rendered after the sentence in `--step--1` with the message `in_locale` ("in {locale}").
  5. **save**: a `.pill` submit button (`save` / `update`), disabled while saving. Below it, the last `validateReview` error or the action error, one line.
- Client-side: before submit, build `{ subject, tags, locale }`, run `validateReview`, and put `JSON.stringify(value)` into a hidden input named `review`. On success (`form.uri`) show `saved` and a link `view_record` to `https://pdsls.dev/${form.uri}` (external record viewer) and reset `existing = true`.
- Styling: inputs and selects inherit the display font and size, have no border, a 0.08em moss underline, `field-sizing: content` with a `min-width: 4ch` fallback, transparent background; focus uses the global ring. The sentence wraps naturally at 400px. Reduced motion respected for any transition.

`web/src/routes/review/+page.svelte`: `<svelte:head><title>`; renders `<main>` with the same padding/max-width as the homepage and `<ReviewForm {data} {form} />`.

Messages to add: `thinks`, `subject_placeholder`, `unsupported_note` ("We don't know this kind of thing yet; check the title."), `adjective_placeholder`, `dir_2` ("is really"), `dir_1` ("is"), `dir_m1` ("is not"), `dir_m2` ("really isn't"), `add_another` ("and…"), `remove` ("remove"), `in_locale` ("in {locale}"), `save` ("Save"), `update` ("Update"), `sign_in_another` ("Sign in another"), `resolving` ("looking…").

- [ ] **Step 3: Bundling check**

`pnpm --filter web build`, copy `web/build` to a temp dir outside the repo, run it there with `WEB_PORT=3999 DATABASE_PATH=/nonexistent.db SESSIONS_DATABASE_PATH=/tmp/isnot-sessions.db`, `curl -s localhost:3999/review` returns 200 with the sign-in form, and `curl -sI localhost:3999/oauth/client-metadata.json` is 200. Fix `ssr.noExternal` or asset handling as needed; kill and clean up.

- [ ] **Step 4: Browser evidence and a real save**

With `pnpm --filter web dev`, open `http://127.0.0.1:5173/review`, sign in with a real handle (the loopback client), paste a real at-uri from a supported collection (a popfeed review or a bookhive book), add two adjectives, save, and confirm the record appears at `https://pdsls.dev/<uri>`. Then reload, paste the same uri: the form prefills and the button says Update; change an adjective and save: the record updates with the same rkey and the original `createdAt`. Screenshot 400px and 1280px in each state (signed out, resolving, resolved, unsupported, saved). Record what you saw in the report, including anything that felt wrong.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check && pnpm --filter web test && pnpm --filter web check`

```bash
git add web
git commit -m "feat(web): /review, the sentence you fill in and save to your repo"
```
