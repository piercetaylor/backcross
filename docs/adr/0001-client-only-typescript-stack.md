# Client-only TypeScript (Vite, React, Web Worker, canvas) for the application stack

Status: accepted. Date: 2026-09-04. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

The Isoline Browser must display graphical genotypes for tens of lines by up to 50K markers, compute RPP and segments interactively, run on a laptop in a field office, cost nothing to host at a public university, and never send unreleased genotype data to a third party. The maintainer is fluent in R and Python, builds Shiny dashboards downstream, and has a computer-engineering background. Which stack satisfies these constraints?

## Decision Drivers

Data sensitivity (processing must happen on the user's machine or on a self-hosted university server); zero hosting cost; interactive rendering of 50K markers × many lines; maintainability by an R/Python-fluent maintainer; testability in CI without a browser; interoperability with downstream R/Shiny through files.

## Considered Options

1. R Shiny structured with golem or rhino.
2. Python FastAPI back end with a TypeScript front end.
3. Client-only TypeScript with Vite, in-browser parsing, Web Worker compute, canvas rendering.
4. Shiny for Python exported with Shinylive (Pyodide in the browser).

## Decision Outcome

Option 3. The whole application is static files; genotype data is read with the File API and processed in a Web Worker; nothing leaves the tab. Hosting is GitHub Pages or any static server. The rendering requirement (50K markers per line, dozens of lines, zoom and hover) is a canvas problem that is native to the browser and awkward from Shiny. The compute core is pure TypeScript with typed arrays, tested under vitest in Node, so CI needs no browser. Downstream R dashboards consume the exported CSVs.

### Consequences

Good: no server, no cost, no data egress, immediate start-up, one language for core and UI, the same core runs in Node for the CLI. Bad: the maintainer's strongest languages are not used; large VCFs are limited by browser memory until streaming parse (M3); Shiny cannot call the core directly and relies on CSV hand-off. Neutral: React is used only for the shell; screens are thin.

## Pros and Cons of the Options

R Shiny (golem/rhino): the maintainer's home stack and a direct fit with the downstream dashboards; golem is MIT and enforces an R-package layout [web] https://github.com/ThinkR-open/golem, rhino is LGPL-3 with app/logic and app/view separation [web] https://github.com/Appsilon/rhino. Against: running Shiny needs R on every laptop or a self-hosted Shiny Server; shinyapps.io would receive unreleased data; drawing 50K-marker graphical genotypes interactively in Shiny means either server round-trips or embedding a JavaScript canvas anyway; the scaffold container has no R, so nothing could be verified.

Python FastAPI + TypeScript front end: strong for a multi-user database-backed system (the Breeding Insight pattern [web] https://github.com/Breeding-Insight), but it requires a server to host and to receive data, two languages, and deployment effort disproportionate to a single-program QC tool.

Client-only TypeScript (chosen): see Decision Outcome. The maintainer's computer-engineering background and stated interest in web development reduce the language risk.

Shiny for Python via Shinylive: runs in the browser with no server [web] https://shiny.posit.co/py/docs/shinylive.html, keeps Python, and is the right fit for a table-centric tool (it is the sibling progeny-selector's choice). Against, for this project: the 13 MB Pyodide payload plus NumPy, canvas rendering would still be custom JavaScript, and Pyodide compute is slower for the pixel-binning loops that dominate the genotype view.
