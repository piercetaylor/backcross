/**
 * The worker decodes samples.csv and markers.csv strictly (contract 1.11.0,
 * docs/adr/0026) at every load site: a 'load' request and a 'loadBrapi'
 * request, whose samples.csv is read before any network. Each request carries
 * 0xE9 in one file and must reject with the file, line and byte position
 * named, so a revert to a lenient TextDecoder fails here.
 */
import { describe, expect, it } from 'vitest';

import { AnalysisClient } from '../../src/workers/client.ts';

const enc = new TextEncoder();
const GENOTYPES = 'marker_id,chrom,pos_bp,RP,DONOR,L1\ne1,Gm04,1000,A,G,A/G\ne2,Gm04,2000,C,T,C\n';
const SAMPLES =
  'sample_id,line_name,role,generation,family_id,notes\n' +
  'RP,Recurrent,recurrent_parent,,,\nDONOR,Donor,donor_parent,,,\nL1,Line 1,candidate,,,\n';

/** `text` as UTF-8 with its one `{BAD}` replaced by the Latin-1 byte 0xE9. */
function withE9(text: string): ArrayBuffer {
  const [before, after] = text.split('{BAD}') as [string, string];
  const a = enc.encode(before);
  const b = enc.encode(after);
  const out = new Uint8Array(a.length + 1 + b.length);
  out.set(a);
  out[a.length] = 0xe9;
  out.set(b, a.length + 1);
  return out.buffer;
}

const BAD_SAMPLES = withE9(
  SAMPLES.replace('L1,Line 1,candidate,,,', 'L1,Line 1,candidate,,,s{BAD}l'),
);
const BAD_MARKERS = withE9('marker_id,chrom,pos_bp,cm\ne1,Gm04,1000,0.5\ne{BAD}2,Gm04,2000,1.5\n');

async function withClient(run: (client: AnalysisClient) => Promise<void>): Promise<void> {
  const worker = new Worker(new URL('../../src/workers/analysis.worker.ts', import.meta.url), {
    type: 'module',
  });
  const client = new AnalysisClient(worker);
  try {
    await run(client);
  } finally {
    client.terminate();
  }
}

describe('strict UTF-8 in the worker (contract 1.11.0)', () => {
  it('rejects a load whose samples.csv carries 0xE9', async () => {
    await withClient(async (client) => {
      await expect(
        client.request('load', {
          genotypeFileName: 'genotypes.csv',
          genotypes: enc.encode(GENOTYPES).buffer,
          samples: BAD_SAMPLES,
        }),
      ).rejects.toThrow('samples.csv line 4: not valid UTF-8 (byte 0xE9 at position 24)');
    });
  });

  it('rejects a load whose markers.csv carries 0xE9', async () => {
    await withClient(async (client) => {
      await expect(
        client.request('load', {
          genotypeFileName: 'genotypes.csv',
          genotypes: enc.encode(GENOTYPES).buffer,
          samples: enc.encode(SAMPLES).buffer,
          markers: BAD_MARKERS,
        }),
      ).rejects.toThrow('markers.csv line 3: not valid UTF-8 (byte 0xE9 at position 2)');
    });
  });

  it('rejects a BrAPI load whose samples.csv carries 0xE9, before any network', async () => {
    await withClient(async (client) => {
      await expect(
        client.request('loadBrapi', {
          source: { baseUrl: 'http://127.0.0.1:9/brapi/v2', variantSetDbId: 'none' },
          samples: BAD_SAMPLES,
        }),
      ).rejects.toThrow('samples.csv line 4: not valid UTF-8 (byte 0xE9 at position 24)');
    });
  });

  it('rejects a BrAPI load whose markers.csv carries 0xE9, before any network', async () => {
    await withClient(async (client) => {
      await expect(
        client.request('loadBrapi', {
          source: { baseUrl: 'http://127.0.0.1:9/brapi/v2', variantSetDbId: 'none' },
          samples: enc.encode(SAMPLES).buffer,
          markers: BAD_MARKERS,
        }),
      ).rejects.toThrow('markers.csv line 3: not valid UTF-8 (byte 0xE9 at position 2)');
    });
  });
});
