/**
 * The Upload screen's markup from renderToString (environment: 'node', as
 * tests/rail.test.tsx): the input-coding link opens a new tab, says so for
 * assistive technology, and keeps rel="noreferrer". Behaviour (focus, the
 * BrAPI form) is in tests/browser/.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { config } from '../src/config.ts';
import { UploadScreen } from '../src/ui/screens/UploadScreen.tsx';

const html = renderToString(
  <UploadScreen
    params={{ rpp: config.rpp, segments: config.segments, qc: config.qc }}
    onParamsChange={() => undefined}
    busy={false}
    onLoad={() => undefined}
    loaded={null}
    onFetchCallSets={() => Promise.resolve({ callSets: [], warnings: [] })}
    onCancelBrapi={() => undefined}
    brapiLoading={false}
  />,
);

describe('input coding reference link', () => {
  const anchor = /<a class="input-coding-link"[^>]*>[\s\S]*?<\/a>/.exec(html)?.[0];

  it('exists once and points at docs/input-coding.md on the repository', () => {
    expect(anchor).toBeDefined();
    expect(html.split('class="input-coding-link"')).toHaveLength(2);
    expect(anchor).toContain(
      'href="https://github.com/piercetaylor/backcross/blob/main/docs/input-coding.md"',
    );
  });

  it('opens a new tab without a referrer and says so', () => {
    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain('rel="noreferrer"');
    expect(anchor).toMatch(
      /input coding reference<span class="visually-hidden"> \(opens in a new tab\)<\/span>/,
    );
  });
});
