import { defineRailway, github, preserve, project, service, volume } from 'railway/iac';

// One container runs the Go API (PORT) and the SvelteKit site (WEB_PORT), both
// on the same SQLite file under the persistent volume. See README.md.
export default defineRailway(() => {
  const data = volume('data', { sizeMB: 1024 });

  const isnot = service('isnot', {
    source: github('jphastings/is-not', { branch: 'main' }),
    healthcheck: '/xrpc/_health',
    env: {
      PORT: '8080',
      WEB_PORT: '3000',
      WEB_ORIGIN: 'https://isnot.at',
      DATABASE_PATH: '/data/isnot.db',
      JETSTREAM_API_KEY: preserve(),
    },
    // Custom domains (isnot.at → 3000, api.isnot.at → 8080) can't be created
    // here: add them in the dashboard, then `railway config pull` to record them.
    volumeMounts: { '/data': data },
  });

  return project('is-not', { resources: [isnot] });
});
