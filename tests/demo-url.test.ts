/**
 * src/ui/demo.ts: reading `?demo=`, building the worker's demo payload under
 * the site's base path, and writing the share link (docs/adr/0017).
 */
import { describe, expect, it } from 'vitest';

import {
  DEMO_NAMES,
  demoLoadPayload,
  demoShareLink,
  parseDemoParam,
  unknownDemoMessage,
} from '../src/ui/demo.ts';

describe('parseDemoParam', () => {
  it('is none when the query has no demo parameter', () => {
    expect(parseDemoParam('')).toEqual({ kind: 'none' });
    expect(parseDemoParam('?')).toEqual({ kind: 'none' });
    expect(parseDemoParam('?foo=bar')).toEqual({ kind: 'none' });
  });

  it('reads synthetic with or without the leading ?, among other parameters', () => {
    expect(parseDemoParam('?demo=synthetic')).toEqual({ kind: 'demo', name: 'synthetic' });
    expect(parseDemoParam('demo=synthetic')).toEqual({ kind: 'demo', name: 'synthetic' });
    expect(parseDemoParam('?a=1&demo=synthetic&b=2')).toEqual({ kind: 'demo', name: 'synthetic' });
  });

  it('reports an unrecognised, empty or differently cased value as unknown', () => {
    expect(parseDemoParam('?demo=real')).toEqual({ kind: 'unknown', value: 'real' });
    expect(parseDemoParam('?demo=')).toEqual({ kind: 'unknown', value: '' });
    expect(parseDemoParam('?demo')).toEqual({ kind: 'unknown', value: '' });
    expect(parseDemoParam('?demo=Synthetic')).toEqual({ kind: 'unknown', value: 'Synthetic' });
  });

  it('does not treat inherited object keys as demo names', () => {
    expect(parseDemoParam('?demo=toString')).toEqual({ kind: 'unknown', value: 'toString' });
    expect(parseDemoParam('?demo=__proto__')).toEqual({ kind: 'unknown', value: '__proto__' });
  });

  it('takes the first demo parameter and decodes it', () => {
    expect(parseDemoParam('?demo=synthetic&demo=other')).toEqual({
      kind: 'demo',
      name: 'synthetic',
    });
    expect(parseDemoParam('?demo=a%20b')).toEqual({ kind: 'unknown', value: 'a b' });
  });
});

describe('demoLoadPayload', () => {
  it('resolves the three fixture files under the Pages base path', () => {
    expect(
      demoLoadPayload('synthetic', '/backcross/', 'https://piercetaylor.github.io/backcross/?x=1'),
    ).toEqual({
      genotypeFileName: 'genotypes.vcf',
      genotypesUrl: 'https://piercetaylor.github.io/backcross/demo/synthetic/genotypes.vcf',
      samplesUrl: 'https://piercetaylor.github.io/backcross/demo/synthetic/samples.csv',
      markersUrl: 'https://piercetaylor.github.io/backcross/demo/synthetic/markers.csv',
    });
  });

  it('resolves under a root base and tolerates a base without a trailing slash', () => {
    expect(demoLoadPayload('synthetic', '/', 'http://localhost:5173/').samplesUrl).toBe(
      'http://localhost:5173/demo/synthetic/samples.csv',
    );
    expect(demoLoadPayload('synthetic', '/site', 'http://host/site/').markersUrl).toBe(
      'http://host/site/demo/synthetic/markers.csv',
    );
  });

  it('resolves a relative base against the page', () => {
    expect(demoLoadPayload('synthetic', './', 'file:///D:/site/index.html').genotypesUrl).toBe(
      'file:///D:/site/demo/synthetic/genotypes.vcf',
    );
  });
});

describe('demoShareLink', () => {
  it('replaces the query with demo=synthetic and drops the fragment', () => {
    expect(
      demoShareLink('https://piercetaylor.github.io/backcross/?demo=x&y=1#main', 'synthetic'),
    ).toBe('https://piercetaylor.github.io/backcross/?demo=synthetic');
  });

  it('round-trips through parseDemoParam', () => {
    const link = demoShareLink('http://localhost:5173/', 'synthetic');
    expect(parseDemoParam(new URL(link).search)).toEqual({ kind: 'demo', name: 'synthetic' });
  });
});

describe('unknownDemoMessage', () => {
  it('names the value and every available demo', () => {
    expect(DEMO_NAMES).toEqual(['synthetic']);
    expect(unknownDemoMessage('real')).toBe(
      'Unknown demo dataset "real" in the page address. Available: synthetic.',
    );
  });
});
