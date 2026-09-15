import { defineRailway, github, preserve, project, service, volume } from 'railway/iac';

// One container runs the Go API (PORT) and the SvelteKit site (WEB_PORT), both
// on the same SQLite file under the persistent volume. See README.md.
export default defineRailway(() => {
  const data = volume('data', { sizeMB: 1024, region: 'europe-west4-drams3a' });

  const isnot = service('isnot', {
    source: github('jphastings/is-not', { branch: 'main' }),
    healthcheck: '/xrpc/_health',
    env: {
      PORT: '8080',
      WEB_PORT: '3000',
      WEB_ORIGIN: 'https://isnot.at',
      DATABASE_PATH: '/data/isnot.db',
      API_ORIGIN: 'http://127.0.0.1:8080',
      JETSTREAM_API_KEY: preserve(),
      OAUTH_PRIVATE_KEY: preserve(),
      SESSIONS_DATABASE_PATH: '/data/web-sessions.db',
    },
    // Railway can't register custom domains from here; these were added in the
    // dashboard and are declared so plans don't propose removing them.
    domains: [
      { domain: 'isnot.at', port: 3000 },
      { domain: 'api.isnot.at', port: 8080 },
    ],
    volumeMounts: { '/data': data },
  });

  return project('is-not', { resources: [isnot] });
});
