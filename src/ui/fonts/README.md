# IBM Plex, Latin-1 subsets

Five faces, self-hosted so that loading the application makes no third-party
request. That is a privacy requirement rather than a performance one: this tool
is handed unreleased line data, and ADR 0009 holds that nothing about a session
should reach a third party, a font CDN included.

| file                         | family        | weight | used for                          |
| ---------------------------- | ------------- | ------ | --------------------------------- |
| `IBMPlexSans-Regular.woff2`  | IBM Plex Sans | 400    | interface text                    |
| `IBMPlexSans-Medium.woff2`   | IBM Plex Sans | 500    | column headers, current rail item |
| `IBMPlexSans-SemiBold.woff2` | IBM Plex Sans | 600    | headings, flagged cells, counts   |
| `IBMPlexMono-Regular.woff2`  | IBM Plex Mono | 400    | sample ids, marker ids, alleles   |
| `IBMPlexMono-Medium.woff2`   | IBM Plex Mono | 500    | emphasised identifiers            |

## Provenance

Taken from the packages IBM publishes on npm, which is why the version numbers
differ between the families: `@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@2.5.0`,
from `fonts/split/woff2/` in each. Neither package is a dependency of this
project; the files were extracted and committed, so `package.json` is unchanged
and nothing is fetched at install or at build time.

The upstream names carry a `-Latin1` suffix, dropped on copy. Latin-1 is the
only subset committed: sample identifiers, marker identifiers and the interface
are ASCII, and the other subsets would multiply the payload for glyphs nothing
renders. If the application ever displays user-supplied text outside Latin-1,
add the matching subset files and a second `@font-face` block with the
appropriate `unicode-range` rather than widening these.

`@font-face` declarations are in `../fonts.css`. Filenames there and here must
agree; Vite hashes these files into `dist/assets/` at build time.

## Licence

SIL Open Font License 1.1. `LICENSE.txt` is the licence text as shipped by IBM
and must travel with the font files: the OFL requires it, and removing it while
keeping the fonts would make the distribution non-compliant.
