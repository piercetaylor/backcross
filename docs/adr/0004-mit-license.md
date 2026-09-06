# MIT licence

Status: accepted. Date: 2026-09-04.

## Context and Problem Statement

The repository will be public on the maintainer's GitHub. Which licence, given the licences of the projects whose ideas were reused?

## Considered Options

MIT; BSD-2-Clause; GPL-3; Apache-2.0.

## Decision Outcome

MIT. No code was copied from any reference repository (docs/reference-repos.md). Definitions taken from Flapjack (BSD-2-Clause) and SNPRelate (GPL-3) are formulas, not code, and impose no licence obligation. Runtime dependencies are MIT (react, react-dom, fflate). If GPL code were ever copied, the derivative would have to become GPL; that would be recorded as a superseding decision.

### Consequences

Good: maximal reuse by other breeding programs and by the sibling project (also MIT); compatible with BrAPI (MIT) and Breeding Insight (Apache-2.0) ecosystems. Bad: no patent grant (Apache-2.0 would provide one); not a concern for this tool.
