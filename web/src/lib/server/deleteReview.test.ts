import { isActionFailure } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vite-plus/test';

const deleteRecord = vi.fn(async () => ({}));
vi.mock('./accounts.ts', () => ({
  agentFor: async (did: string) =>
    did === 'did:plc:signed-in' ? { com: { atproto: { repo: { deleteRecord } } } } : null,
}));

function event(did: string | null, rkey?: string): RequestEvent {
  const body = new URLSearchParams(rkey === undefined ? {} : { rkey });
  return {
    request: new Request('http://isnot.at/review', { method: 'POST', body }),
    locals: { browser: did ? { current: did } : null },
  } as unknown as RequestEvent;
}

describe('deleteReviewAction', () => {
  it('fails with 401 when nobody is signed in', async () => {
    const { deleteReviewAction } = await import('./deleteReview.ts');
    const result = await deleteReviewAction(event(null, 'abc'));
    expect(isActionFailure(result) && result.status).toBe(401);
  });

  it('fails with 400 when no rkey is given', async () => {
    const { deleteReviewAction } = await import('./deleteReview.ts');
    const result = await deleteReviewAction(event('did:plc:signed-in'));
    expect(isActionFailure(result) && result.status).toBe(400);
  });

  it('deletes the record and reports the rkey on success', async () => {
    const { deleteReviewAction } = await import('./deleteReview.ts');
    const result = await deleteReviewAction(event('did:plc:signed-in', 'abc123'));
    expect(result).toEqual({ deleted: 'abc123' });
    expect(deleteRecord).toHaveBeenCalledWith({
      repo: 'did:plc:signed-in',
      collection: 'at.isnot.review',
      rkey: 'abc123',
    });
  });
});
