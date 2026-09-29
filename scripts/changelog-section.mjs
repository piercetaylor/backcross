// Reads and rewrites CHANGELOG.md's version sections (docs/adr/0030).
// Usage: node scripts/changelog-section.mjs <version>
//            prints that section's body (exit 1 if absent)
//        node scripts/changelog-section.mjs --release <version> <date> [<previous>]
//            renames [Unreleased] in place
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_URL = 'https://github.com/piercetaylor/backcross';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isLinkLine = (line) => /^\[[^\]]+\]: /.test(line);
const isHeading = (line, version) =>
  line === `## [${version}]` || line.startsWith(`## [${version}] - `);

/** Index of the line that ends a section starting at `start`: the next `## [` heading or the first link line. */
function sectionEnd(lines, start) {
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## [') || isLinkLine(lines[i])) return i;
  }
  return lines.length;
}

/** Body between `## [version] - YYYY-MM-DD` and the next `## [` or the link block; throws when the heading is absent or its date is not YYYY-MM-DD. */
export function sectionBody(text, version) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => isHeading(l, version));
  if (at < 0) throw new Error(`CHANGELOG has no section for ${version}`);
  const date = lines[at].slice(`## [${version}] - `.length);
  if (!lines[at].startsWith(`## [${version}] - `) || !DATE.test(date)) {
    throw new Error(`the heading for ${version} must read "## [${version}] - YYYY-MM-DD"`);
  }
  return lines
    .slice(at + 1, sectionEnd(lines, at))
    .join('\n')
    .trim();
}

/** `## [Unreleased]` becomes `## [Unreleased]\n\n## [version] - date`; the link block becomes `[Unreleased]: REPO_URL/compare/v<version>...HEAD` and `[<version>]: REPO_URL/releases/tag/v<version>` (first release) or `REPO_URL/compare/v<previous>...v<version>` when `previous` is given; existing version links are kept. Throws when there is no `## [Unreleased]`, when `## [version]` already exists, or when Unreleased has no entries. */
export function releaseUnreleased(text, version, date, previous) {
  if (!DATE.test(date)) throw new Error(`date must be YYYY-MM-DD, got "${date}"`);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const at = lines.indexOf('## [Unreleased]');
  if (at < 0) throw new Error('CHANGELOG has no "## [Unreleased]" heading');
  if (lines.some((l) => isHeading(l, version))) {
    throw new Error(`CHANGELOG already has a section for ${version}`);
  }
  const body = lines.slice(at + 1, sectionEnd(lines, at));
  if (!body.some((l) => /^\s*[-*] \S/.test(l))) {
    throw new Error('[Unreleased] has no entries to release');
  }
  const out = [
    ...lines.slice(0, at),
    '## [Unreleased]',
    '',
    `## [${version}] - ${date}`,
    ...lines.slice(at + 1),
  ];
  const unreleasedLink = `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`;
  const versionLink =
    previous === undefined
      ? `[${version}]: ${REPO_URL}/releases/tag/v${version}`
      : `[${version}]: ${REPO_URL}/compare/v${previous}...v${version}`;
  const li = out.findIndex((l) => l.startsWith('[Unreleased]: '));
  if (li >= 0) {
    out.splice(li, 1, unreleasedLink, versionLink);
  } else {
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    out.push('', unreleasedLink, versionLink, '');
  }
  return out.join(eol);
}

function main(argv) {
  const path = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url));
  try {
    if (argv[0] === '--release') {
      const [, version, date, previous] = argv;
      if (!version || !date) {
        console.error('usage: changelog-section.mjs --release <version> <date> [<previous>]');
        return 2;
      }
      writeFileSync(path, releaseUnreleased(readFileSync(path, 'utf8'), version, date, previous));
      return 0;
    }
    if (argv.length !== 1) {
      console.error('usage: changelog-section.mjs <version>');
      return 2;
    }
    process.stdout.write(`${sectionBody(readFileSync(path, 'utf8'), argv[0])}\n`);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
