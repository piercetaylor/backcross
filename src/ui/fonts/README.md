# IBM Plex web fonts: not yet in the tree

This directory is empty on purpose. `../fonts.css` declares five `@font-face`
rules that point at the files below, but the files themselves were not
obtained in the commit that added phase 1, so the application does **not**
self-host IBM Plex yet and must not be described as doing so.

Nothing is broken by their absence. No `font-family` in the app names
`IBM Plex Sans` or `IBM Plex Mono`, so no browser attempts the download; the
fallback stacks in `../tokens.css` (`--font-sans`, `--font-mono`) are what
render. `vite build` prints one "didn't resolve at build time" warning per
missing file and succeeds.

## What is missing

Five Latin-1 subsets plus the licence:

| file in this directory       | weight | family        |
| ---------------------------- | ------ | ------------- |
| `IBMPlexSans-Regular.woff2`  | 400    | IBM Plex Sans |
| `IBMPlexSans-Medium.woff2`   | 500    | IBM Plex Sans |
| `IBMPlexSans-SemiBold.woff2` | 600    | IBM Plex Sans |
| `IBMPlexMono-Regular.woff2`  | 400    | IBM Plex Mono |
| `IBMPlexMono-Medium.woff2`   | 500    | IBM Plex Mono |
| `LICENSE.txt`                | -      | SIL OFL 1.1   |

`LICENSE.txt` is the SIL Open Font License 1.1 text shipped with Plex,
including its copyright line. OFL requires the licence to travel with the
files, so it is not optional and its wording is not something to write from
memory: copy the file that comes with the release.

## Where they come from

Upstream is <https://github.com/IBM/plex>. The design brief names the split
Latin-1 subsets under `fonts/split/woff2/` in the release archive, where each
file carries a `-Latin1` suffix (`IBMPlexSans-Regular-Latin1.woff2` and so
on) and is renamed on copy to the names in the table above.

That layout is the `@ibm/plex` 6.x line. As of this writing IBM has split the
repository into per-family packages and the newest release is tagged
`@ibm/plex-sans@1.1.0`, whose archive is arranged differently. Whoever adds
the files should say in the commit message which release and which path they
actually took them from, and then replace the "Plex release: not recorded"
line in the header comment of `../fonts.css` with that version.

## Checking the result

Confirm the five files are non-empty and are real WOFF2 (the first four bytes
are `wOF2`), then run `npm run build`: the five warnings should disappear and
the files should appear hashed under `dist/assets/`.
