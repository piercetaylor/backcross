# Security policy

## Scope

Backcross is a client-only web application and a Node CLI. There is no server, no account and no telemetry; genotype files chosen from disk are parsed and analysed inside the browser tab. The one network path is the optional BrAPI loader, which sends requests to a server the user names, with a bearer token the user supplies, kept only in the page's memory. Vulnerabilities in scope: anything that makes genotype data leave the tab other than through the user's own download or BrAPI request; script injection through the HTML report or an export (the report escapes every value); a dependency advisory that reaches the built site or the CLI bundle.

## Supported versions

The latest release on the Releases page and the `main` branch.

## Reporting

Use GitHub's private vulnerability reporting: Security tab, 'Report a vulnerability', at https://github.com/piercetaylor/backcross/security/advisories/new. Do not open a public issue for a vulnerability. Never attach real genotype data; a synthetic file made with `npm run fixture` is enough. Expect an acknowledgement within 14 days.

## Dependencies

`npm audit` is part of the maintainer's release checklist and Dependabot opens weekly update pull requests (`.github/dependabot.yml`).
