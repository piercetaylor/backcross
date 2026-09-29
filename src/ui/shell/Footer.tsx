/**
 * The page footer: version, licence and how to cite,
 * at the foot of the content column on every screen (docs/adr/0009, amended
 * 2026-09-29; the citation itself is CITATION.cff, docs/adr/0030). Rendered
 * inside <main>, so it is not a contentinfo landmark and the skip link's
 * target still holds everything a reader might want. Stateless; renders to a
 * string in Node (tests/shell-brand.test.tsx).
 */
import { buildInfo } from '../../build-info.ts';
import { REPOSITORY_URL } from './Masthead.tsx';
import './shell.css';

export function Footer() {
  const b = buildInfo();
  const release = b === null ? 'development build' : `${b.version} (${b.commit})`;
  const cited = b === null ? '' : ` (version ${b.version})`;
  return (
    <footer className="app-foot">
      <p>Backcross {release}. MIT licence.</p>
      <p>
        Cite: Taylor, P. (2026). Backcross: near-isogenic line characterisation from SNP genotypes
        {cited} [software].{' '}
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
          {REPOSITORY_URL}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        . CITATION.cff in the repository carries the metadata for reference managers.
      </p>
    </footer>
  );
}
