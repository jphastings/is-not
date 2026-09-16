import type { ReviewRecord } from '@is-not/lenses';
import { describe, expect, it, vi } from 'vite-plus/test';
import { mergeDuplicates, type DupRecord } from './mergeDuplicates.ts';

const URI = 'at://did:plc:alice/app.bsky.feed.post/1';

function record(rkey: string, overrides: Partial<ReviewRecord> = {}): DupRecord {
  return {
    rkey,
    value: {
      $type: 'at.isnot.review',
      subject: { uri: URI, cid: 'bafy1', title: 'a sandwich', type: 'post' },
      tags: [{ adjective: 'loud', direction: 1 }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

describe('mergeDuplicates', () => {
  it('gives the tag from the record with the latest updatedAt', () => {
    const a = record('aaa', {
      tags: [{ adjective: 'loud', direction: 1 }],
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    const b = record('bbb', {
      tags: [{ adjective: 'loud', direction: -1 }],
      updatedAt: '2024-06-01T00:00:00.000Z',
    });
    const result = mergeDuplicates([a, b], URI);
    expect(result?.record.tags).toEqual([{ adjective: 'loud', direction: -1 }]);
  });

  it('compares datetimes as instants, whatever their format', () => {
    const a = record('aaa', {
      tags: [{ adjective: 'loud', direction: 1 }],
      updatedAt: '2024-01-01T12:00:00+05:00',
    });
    const b = record('bbb', {
      tags: [{ adjective: 'loud', direction: -1 }],
      updatedAt: '2024-01-01T08:00:00Z',
    });
    expect(mergeDuplicates([a, b], URI)?.record.tags).toEqual([
      { adjective: 'loud', direction: -1 },
    ]);
  });

  it('on equal updatedAt, the direction nearer zero wins', () => {
    const a = record('aaa', { tags: [{ adjective: 'loud', direction: 2 }] });
    const b = record('bbb', { tags: [{ adjective: 'loud', direction: -1 }] });
    const result = mergeDuplicates([a, b], URI);
    expect(result?.record.tags).toEqual([{ adjective: 'loud', direction: -1 }]);
  });

  it('gives +1 over -1 when equally close to zero and updatedAt ties', () => {
    const a = record('aaa', { tags: [{ adjective: 'loud', direction: -1 }] });
    const b = record('bbb', { tags: [{ adjective: 'loud', direction: 1 }] });
    const result = mergeDuplicates([a, b], URI);
    expect(result?.record.tags).toEqual([{ adjective: 'loud', direction: 1 }]);
  });

  it('keeps the earliest-created record, dated to the earliest createdAt and latest updatedAt', () => {
    const aaa = record('aaa', {
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-03-01T00:00:00.000Z',
    });
    const bbb = record('bbb', {
      createdAt: '2024-01-05T00:00:00.000Z',
      updatedAt: '2024-01-05T00:00:00.000Z',
    });
    const ccc = record('ccc', {
      // Ties aaa on createdAt; aaa wins the tie on rkey.
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
    });
    const result = mergeDuplicates([bbb, ccc, aaa], URI);
    expect(result?.keeper).toBe('aaa');
    expect(result?.record.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result?.record.updatedAt).toBe('2024-03-01T00:00:00.000Z');
    expect(result?.deletes.sort()).toEqual(['bbb', 'ccc']);
  });

  it('rewrites a lone record whose subject uri needed normalising', () => {
    const handleUri = 'at://alice.example/app.bsky.feed.post/1';
    const solo = record('aaa', {
      subject: { uri: handleUri, cid: 'bafy1', title: 't', type: 'post' },
    });
    const result = mergeDuplicates([solo], URI);
    expect(result).toEqual({
      keeper: 'aaa',
      record: { ...solo.value, subject: { ...solo.value.subject, uri: URI } },
      deletes: [],
    });
  });

  it('gives no write for a lone, already-normalised record', () => {
    const solo = record('aaa');
    expect(mergeDuplicates([solo], URI)).toBeNull();
  });

  it('skips a group whose merged tags exceed 32', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = record('aaa', {
      tags: Array.from({ length: 20 }, (_, i) => ({ adjective: `a${i}`, direction: 1 }) as const),
    });
    const b = record('bbb', {
      tags: Array.from({ length: 20 }, (_, i) => ({ adjective: `b${i}`, direction: 1 }) as const),
    });
    expect(mergeDuplicates([a, b], URI)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
