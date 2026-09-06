# Static hosting on GitHub Pages with a configurable base path, or any university static server

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

The application must be reachable by the program's staff at no recurring cost and must not transmit genotype data. Where is it hosted?

## Considered Options

1. GitHub Pages project site built by CI.
2. A static directory on a university web server or shared drive.
3. A hosted Shiny/Node server.

## Decision Outcome

Options 1 and 2 together: the same `dist/` serves both. `VITE_BASE_PATH` (default `/isoline-browser/` in production builds) sets the asset path for a Pages project site; `/` for a custom host, following the Vite static-deployment guide [web] https://vite.dev/guide/static-deploy. CI deploys to Pages on pushes to main when Pages is enabled with the GitHub Actions source, using actions/upload-pages-artifact v5 and actions/deploy-pages v5 [web] https://github.com/actions/upload-pages-artifact/releases, https://github.com/actions/deploy-pages/releases. Because all processing is in the tab, the hosting origin never sees data; Pages being public is acceptable for the code, and the app can also be run from a local copy (`npm run preview`) with no network.

### Consequences

Good: zero cost; deployment is a git push; offline use possible. Bad: GitHub Pages sites are public, so a private program build must use option 2; no server-side features (sharing, accounts) can be added without changing this decision. Neutral: the Content Security Policy and cache headers of Pages are fixed; the app needs neither.
