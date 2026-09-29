/**
 * The masthead and footer render to a string in Node: the brand block, the
 * four project links and the citation line (docs/adr/0009, amended 2026-09-29).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Footer } from '../src/ui/shell/Footer.tsx';
import { MASTHEAD_LINKS, Masthead, versionLabel } from '../src/ui/shell/Masthead.tsx';

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('masthead', () => {
  const html = renderToStaticMarkup(<Masthead />);

  it('owns the h1 and shows the version', () => {
    expect(html).toContain('<h1 class="masthead-title">Backcross</h1>');
    expect(html).toContain('class="masthead-version"');
    expect(versionLabel()).toMatch(
      /^(v\d+\.\d+\.\d+ (g[0-9a-f]{7}(-dirty)?|NA)|development build)$/,
    );
  });

  it('links to every project page, each opening safely in a new tab', () => {
    for (const link of MASTHEAD_LINKS) {
      expect(html).toContain(`href="${link.href}"`);
    }
    const anchors = count(html, '<a');
    expect(anchors).toBe(MASTHEAD_LINKS.length);
    expect(count(html, 'target="_blank"')).toBe(anchors);
    expect(count(html, 'rel="noreferrer"')).toBe(anchors);
    expect(html).toContain('aria-label="Project"');
  });

  it('carries one decorative mark', () => {
    expect(count(html, '<svg')).toBe(1);
    expect(html).toContain('<svg class="masthead-mark" viewBox="0 0 24 24" aria-hidden="true"');
  });
});

describe('footer', () => {
  const html = renderToStaticMarkup(<Footer />);

  it('carries the citation, the licence and the repository link', () => {
    expect(html).toContain(
      'Cite: Taylor, P. (2026). Backcross: near-isogenic line characterisation from SNP genotypes',
    );
    expect(html).toContain('MIT licence');
    expect(html).toContain('href="https://github.com/piercetaylor/backcross"');
  });
});
