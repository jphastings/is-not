import { describe, expect, it, vi } from 'vite-plus/test';
import { reviewRkey } from './rkey.ts';

const DID = 'did:plc:reviewer';
const SUBJECT_URI = 'at://did:plc:subject/app.bsky.feed.post/1';
const RKEY = reviewRkey(SUBJECT_URI);

let existing: {
  rkey: string;
  createdAt: string;
  tags: { adjective: string; direction: number }[];
} | null = null;
const calls: { fn: string; args: unknown }[] = [];

vi.mock('./db.ts', () => ({ findReview: () => existing }));
vi.mock('./accounts.ts', () => ({
  handleDid: async () => null,
  agentFor: async () => ({
    com: {
      atproto: {
        repo: {
          putRecord: async (args: unknown) => {
            calls.push({ fn: 'putRecord', args });
            return { data: { uri: `at://${DID}/at.isnot.review/${RKEY}` } };
          },
          applyWrites: async (args: unknown) => {
            calls.push({ fn: 'applyWrites', args });
            return { data: {} };
          },
        },
      },
    },
  }),
}));

const { saveReview } = await import('./reviews.ts');

describe('saveReview', () => {
  it('creates a new review at the subject-derived rkey', async () => {
    existing = null;
    calls.length = 0;
    const result = await saveReview(DID, {
      subject: { uri: SUBJECT_URI, cid: 'bafy', title: 'a post', type: 'post' },
      tags: [{ adjective: 'fun', direction: 1 }],
    });
    expect(result).toEqual({ ok: true, uri: `at://${DID}/at.isnot.review/${RKEY}` });
    expect(calls).toEqual([{ fn: 'putRecord', args: expect.objectContaining({ rkey: RKEY }) }]);
  });

  it('updates in place when the existing review already has the deterministic rkey', async () => {
    existing = { rkey: RKEY, createdAt: '2020-01-01T00:00:00.000Z', tags: [] };
    calls.length = 0;
    const result = await saveReview(DID, {
      subject: { uri: SUBJECT_URI, cid: 'bafy', title: 'a post', type: 'post' },
      tags: [{ adjective: 'fun', direction: 1 }],
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ fn: 'putRecord', args: expect.objectContaining({ rkey: RKEY }) }]);
  });

  it('moves a legacy TID-keyed review to the deterministic rkey via applyWrites', async () => {
    existing = { rkey: '3legacytid', createdAt: '2020-01-01T00:00:00.000Z', tags: [] };
    calls.length = 0;
    const result = await saveReview(DID, {
      subject: { uri: SUBJECT_URI, cid: 'bafy', title: 'a post', type: 'post' },
      tags: [{ adjective: 'fun', direction: 1 }],
    });
    expect(result).toEqual({ ok: true, uri: `at://${DID}/at.isnot.review/${RKEY}` });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('applyWrites');
    const writes = (calls[0].args as { writes: { $type: string; rkey: string }[] }).writes;
    expect(writes).toEqual([
      expect.objectContaining({ $type: 'com.atproto.repo.applyWrites#create', rkey: RKEY }),
      expect.objectContaining({ $type: 'com.atproto.repo.applyWrites#delete', rkey: '3legacytid' }),
    ]);
  });

  it("rejects a subject whose handle authority can't be resolved", async () => {
    existing = null;
    const result = await saveReview(DID, {
      subject: {
        uri: 'at://dead.example/app.bsky.feed.post/1',
        cid: 'bafy',
        title: 'a post',
        type: 'post',
      },
      tags: [{ adjective: 'fun', direction: 1 }],
    });
    expect(result).toEqual({ ok: false, status: 400, error: 'subject' });
  });
});
