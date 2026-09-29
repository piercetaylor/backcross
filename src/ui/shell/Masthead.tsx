/**
 * The masthead: the tool's name, version and project links, above the rail
 * and the content column (docs/adr/0009, amended 2026-09-29). Static, never
 * sticky, so it can obscure nothing a reader has focused (WCAG 2.4.11).
 *
 * Responsibility: render the brand block and four external links. It holds
 * no state and reads only the build stamp (src/build-info.ts), so it renders
 * to a string in Node (tests/shell-brand.test.tsx).
 *
 * Interface: <Masthead />; REPOSITORY_URL; MASTHEAD_LINKS; versionLabel().
 */
import { buildInfo } from '../../build-info.ts';
import { BrandMark } from './BrandMark.tsx';
import './shell.css';

export const REPOSITORY_URL = 'https://github.com/piercetaylor/backcross';

export const MASTHEAD_LINKS = [
  { label: 'User guide', href: `${REPOSITORY_URL}/blob/main/docs/user-guide.md` },
  { label: 'Data formats', href: `${REPOSITORY_URL}/blob/main/docs/data-formats.md` },
  { label: 'Cite', href: `${REPOSITORY_URL}/blob/main/CITATION.cff` },
  { label: 'Source', href: REPOSITORY_URL },
] as const;

/** "v0.1.0 g1a2b3c4" from the build stamp, or "development build" where vite's define did not run. */
export function versionLabel(): string {
  const b = buildInfo();
  return b === null ? 'development build' : `v${b.version} ${b.commit}`;
}

export function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-brand">
        <BrandMark className="masthead-mark" />
        <h1 className="masthead-title">Backcross</h1>
        <span className="masthead-version">{versionLabel()}</span>
      </div>
      <nav className="masthead-links" aria-label="Project">
        {MASTHEAD_LINKS.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        ))}
      </nav>
    </header>
  );
}
