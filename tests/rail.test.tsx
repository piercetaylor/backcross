/**
 * The rail's state contract, asserted from server-rendered markup.
 *
 * `react-dom/server`'s renderToString in the existing environment: 'node' --
 * no DOM, no jsdom, as in tests/line-table.test.tsx. What that reaches is
 * what the rail renders for a given (screen, loaded, collapsed): which step
 * is current, which are blocked before a dataset is loaded, which is done
 * afterwards, and that a collapsed rail still names every step for a screen
 * reader while showing only its number.
 *
 * What it does NOT reach is behaviour: the roving tabindex actually moving
 * focus, Up/Down skipping a blocked step, the collapse animating, the click
 * on a blocked step being ignored. Those need a real browser and are M3
 * browser-mode items (docs/m2.5-phases.md, phase 5 "Not verifiable here").
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Rail, SCREENS } from '../src/ui/shell/Rail.tsx';

function render(props: {
  screen: Parameters<typeof Rail>[0]['screen'];
  loaded: boolean;
  collapsed?: boolean;
}): string {
  return renderToString(
    <Rail
      screen={props.screen}
      loaded={props.loaded}
      collapsed={props.collapsed ?? false}
      onNavigate={() => undefined}
      onToggleCollapsed={() => undefined}
    />,
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('rail before a dataset is loaded', () => {
  const html = render({ screen: 'upload', loaded: false });

  it('renders one item per screen', () => {
    expect(count(html, 'class="rail-item"')).toBe(SCREENS.length);
    expect(SCREENS).toHaveLength(6);
  });

  it('marks exactly one item as the current page', () => {
    expect(count(html, 'aria-current="page"')).toBe(1);
    expect(html).toMatch(/data-state="current"[^>]*>1\. Upload/);
  });

  it('blocks the five steps that need a dataset', () => {
    expect(count(html, 'aria-disabled="true"')).toBe(5);
    expect(count(html, 'data-state="blocked"')).toBe(5);
    expect(html).not.toMatch(/data-state="blocked"[^>]*>1\. Upload/);
  });

  it('keeps only the current step in the tab order', () => {
    expect(count(html, 'tabindex="0"')).toBe(1);
    expect(count(html, 'tabindex="-1"')).toBe(SCREENS.length - 1);
  });

  it('is a vertical toolbar', () => {
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="Steps"');
  });

  it('carries the heading and the privacy sentence', () => {
    expect(html).toContain('Backcross');
    expect(html).toContain('Files are processed in this browser tab and never uploaded.');
  });
});

describe('rail once a dataset is loaded', () => {
  const html = render({ screen: 'lines', loaded: true });

  it('blocks nothing', () => {
    expect(count(html, 'aria-disabled="true"')).toBe(0);
    expect(count(html, 'data-state="blocked"')).toBe(0);
  });

  it('marks the Upload step done and the Lines step current', () => {
    expect(html).toMatch(/data-state="done"[^>]*>1\. Upload/);
    expect(html).toMatch(/data-state="current"[^>]*>3\. Lines/);
    expect(count(html, 'aria-current="page"')).toBe(1);
  });
});

describe('collapsed rail', () => {
  const html = render({ screen: 'genotypes', loaded: true, collapsed: true });

  it('names every step for assistive technology', () => {
    for (const entry of SCREENS) {
      expect(html).toContain(`aria-label="${entry.step}. ${entry.label}"`);
      expect(html).toContain(`title="${entry.step}. ${entry.label}"`);
    }
  });

  it('shows the number alone, with no visible label text', () => {
    for (const entry of SCREENS) {
      expect(html).toContain(`>${entry.step}</button>`);
    }
    expect(html).not.toContain('>4. Graphical genotypes</button>');
  });

  it('hides the heading and the privacy sentence from sight but keeps them', () => {
    expect(html).toContain('Backcross');
    expect(count(html, 'visually-hidden')).toBeGreaterThanOrEqual(2);
  });

  it('offers to expand, and says it is collapsed', () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Expand');
  });
});

describe('expanded rail', () => {
  it('says it is expanded and offers to collapse', () => {
    const html = render({ screen: 'upload', loaded: false });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Collapse');
  });
});
