/**
 * Growable genotype matrix builder shared by the VCF, HapMap and wide-CSV parsers.
 *
 * Responsibility: accept one marker at a time (id, chromosome, position,
 * allele symbols, per-sample allele pairs) and produce a MarkerTable plus a
 * GenotypeMatrix with unordered allele pairs (allele1 <= allele2, 255 = missing).
 * Enforces unique marker ids and a fixed sample count.
 *
 * Interface: new GenotypeBuilder(sampleIds); push(...); finish() -> ParsedGenotypes.
 */
import { normalizeChromosome } from '../core/chromosomes.ts';
import { MISSING_ALLELE } from '../core/types.ts';
import type { GenotypeMatrix, MarkerTable } from '../core/types.ts';

export interface ParsedGenotypes {
  markers: MarkerTable;
  genotypes: GenotypeMatrix;
  /** True for coded A/B/H input (allele 0 = RP, allele 1 = donor by definition). */
  coded: boolean;
  warnings: string[];
}

export class GenotypeBuilder {
  private readonly ids: string[] = [];
  private readonly chrom: string[] = [];
  private readonly pos: number[] = [];
  private readonly alleles: string[][] = [];
  private readonly seen = new Set<string>();
  private a1 = new Uint8Array(0);
  private a2 = new Uint8Array(0);
  private nMarkers = 0;
  readonly warnings: string[] = [];
  readonly sampleIds: string[];
  private readonly coded: boolean;

  constructor(sampleIds: string[], coded = false) {
    this.sampleIds = sampleIds;
    this.coded = coded;
    const dup = sampleIds.find((s, i) => sampleIds.indexOf(s) !== i);
    if (dup !== undefined) throw new Error(`duplicate sample id in genotype file: ${dup}`);
  }

  /** Returns the row offset to write allele pairs into via setCall. */
  push(markerId: string, chromRaw: string, posBp: number, alleleSymbols: string[]): number {
    if (this.seen.has(markerId)) throw new Error(`duplicate marker id: ${markerId}`);
    if (!Number.isFinite(posBp) || posBp < 0)
      throw new Error(`invalid position for ${markerId}: ${posBp}`);
    this.seen.add(markerId);
    this.ids.push(markerId);
    this.chrom.push(normalizeChromosome(chromRaw));
    this.pos.push(posBp);
    this.alleles.push(alleleSymbols);
    const n = this.sampleIds.length;
    const need = (this.nMarkers + 1) * n;
    if (need > this.a1.length) {
      const cap = Math.max(need, this.a1.length * 2, 1024 * n);
      const na1 = new Uint8Array(cap).fill(MISSING_ALLELE);
      const na2 = new Uint8Array(cap).fill(MISSING_ALLELE);
      na1.set(this.a1);
      na2.set(this.a2);
      this.a1 = na1;
      this.a2 = na2;
    }
    const offset = this.nMarkers * n;
    this.a1.fill(MISSING_ALLELE, offset, offset + n);
    this.a2.fill(MISSING_ALLELE, offset, offset + n);
    this.nMarkers++;
    return offset;
  }

  setCall(offset: number, sampleIndex: number, x: number, y: number): void {
    if (x === MISSING_ALLELE || y === MISSING_ALLELE) return;
    if (x > 254 || y > 254)
      throw new Error('more than 254 alleles at one marker are not supported');
    if (x <= y) {
      this.a1[offset + sampleIndex] = x;
      this.a2[offset + sampleIndex] = y;
    } else {
      this.a1[offset + sampleIndex] = y;
      this.a2[offset + sampleIndex] = x;
    }
  }

  finish(): ParsedGenotypes {
    const n = this.sampleIds.length;
    const size = this.nMarkers * n;
    if (this.nMarkers === 0) throw new Error('genotype file contains no markers');
    return {
      markers: {
        ids: this.ids,
        chrom: this.chrom,
        posBp: Float64Array.from(this.pos),
        alleles: this.alleles,
      },
      genotypes: {
        nMarkers: this.nMarkers,
        nSamples: n,
        sampleIds: this.sampleIds,
        allele1: this.a1.slice(0, size),
        allele2: this.a2.slice(0, size),
      },
      coded: this.coded,
      warnings: this.warnings,
    };
  }
}
