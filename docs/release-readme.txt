Backcross (https://github.com/piercetaylor/backcross)

SITE. This folder is the built web application. Chrome and Edge refuse to run it from a file:// address (Firefox may), so serve the folder over HTTP from any static server, run from inside this folder: `py -3 -m http.server 8000` (Windows), `python3 -m http.server 8000` (macOS, Linux) or `npx serve .` (Node); then open http://localhost:8000/ . Genotype files never leave the browser. Add ?demo=synthetic to the address to load the bundled synthetic demo.

CLI. cli/backcross-cli.mjs needs Node 22.19 or newer and nothing else: `node cli/backcross-cli.mjs summarize --genotypes FILE --samples samples.csv [--markers markers.csv]`. Subcommands: summarize, segments, targets, compare, discordant, qc; run it without arguments for the options.

Inputs: contract/data-contract.md in the repository. Outputs and their columns: docs/data-formats.md. User guide: docs/user-guide.md. Licence: MIT (LICENSE). Cite: CITATION.cff.
