import type { Agent } from '@atproto/api';
import { previewPresenceImport } from './importers.ts';

const COLLECTION = 'site.standard.graph.recommend';

export function previewStandardImport(did: string, agent: Agent, locale: string) {
  return previewPresenceImport(did, agent, locale, COLLECTION, 'recommend', (value) =>
    typeof value.document === 'string' ? value.document : undefined,
  );
}
