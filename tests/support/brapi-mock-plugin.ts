/**
 * Mock BrAPI server for browser-mode tests.
 *
 * Responsibility: a Vite `configureServer` middleware that answers requests
 * under `/__brapi__` from tests/fixtures/brapi/ through the shared resolver
 * (brapi-fixture.ts), so a browser test drives a real BrAPI load through the
 * worker's own `fetch` against the dev server's origin (no CORS involved,
 * nothing on the network). It has no build hook, so `vite build` is
 * unaffected; `npm run dev` also serves it, which is harmless. Requests for
 * variant set `hangset` are held open (up to 30 s) so a test can cancel a load
 * while it is in flight.
 *
 * Interface: HANG_SET; brapiMockPlugin() -> Plugin.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Plugin } from 'vite';

import { BRAPI_FIXTURE_DIR, brapiFixtureFile } from './brapi-fixture.ts';

/** A variant set id whose requests the mock holds open, for the cancel test. */
export const HANG_SET = 'hangset';
const HANG_MS = 30_000;

export function brapiMockPlugin(): Plugin {
  return {
    name: 'isoline-brapi-mock',
    configureServer(server) {
      server.middlewares.use('/__brapi__', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.searchParams.get('variantSetDbId') === HANG_SET) {
          // Never answers in time, so a test can cancel a load in flight; the
          // timer frees the connection if the client never aborts.
          const timer = setTimeout(() => {
            res.statusCode = 504;
            res.end('hang');
          }, HANG_MS);
          req.on('close', () => clearTimeout(timer));
          return;
        }
        const file = brapiFixtureFile(url.pathname, url.searchParams, 'pos');
        if (file === null) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(join(BRAPI_FIXTURE_DIR, file)));
      });
    },
  };
}
