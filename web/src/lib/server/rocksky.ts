import type { Agent } from '@atproto/api';
import { previewPresenceImport } from './importers.ts';

const COLLECTION = 'app.rocksky.like';

export function previewRockskyImport(did: string, agent: Agent, locale: string) {
  return previewPresenceImport(did, agent, locale, COLLECTION, 'like', (value) => {
    const subject = value.subject;
    return typeof subject === 'object' &&
      subject !== null &&
      typeof (subject as { uri?: unknown }).uri === 'string'
      ? (subject as { uri: string }).uri
      : undefined;
  });
}
