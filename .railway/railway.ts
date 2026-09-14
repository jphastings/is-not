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
    domains: [
      { domain: 'isnot.at', port: 3000 },
      { domain: 'api.isnot.at', port: 8080 },
    ],
    volumeMounts: { '/data': data },
  });

  return project('isnot', { resources: [isnot] });
});
