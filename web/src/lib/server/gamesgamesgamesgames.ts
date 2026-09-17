import type { Agent } from '@atproto/api';
import { previewPresenceImport } from './importers.ts';

const COLLECTION = 'games.gamesgamesgamesgames.graph.like';

export function previewGamesGamesGamesGamesImport(did: string, agent: Agent, locale: string) {
  return previewPresenceImport(did, agent, locale, COLLECTION, 'like', (value) =>
    typeof value.subject === 'string' ? value.subject : undefined,
  );
}
