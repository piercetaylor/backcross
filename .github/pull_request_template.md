## What and why

One paragraph.

## Gates

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `CI=true npm run test:browser`
- [ ] `npm run build`
- [ ] `npm run build:cli`
- [ ] `npm run fixture && npm run contract && git diff --exit-code -- tests/fixtures contract`

## Checklist

- [ ] CHANGELOG entry under `[Unreleased]` for a user-visible change
- [ ] No real genotype data
- [ ] If `contract/` changed, `contract/VERSION` bumped and `node scripts/check-contract-mirror.mjs ../progeny-selector` passes with the sibling commit named
- [ ] If a documented output changed, docs/data-formats.md and scripts/read_exports.R updated
- [ ] A MADR record for a non-obvious decision
- [ ] No AI attribution line in any commit
