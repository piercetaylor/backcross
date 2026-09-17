/**
 * The contract's language-neutral form of a loaded dataset.
 *
 * Responsibility: turn a `Dataset` into the shape of
 * `contract/cases/<case>/expected.json` (contract/README.md), so a case can be
 * compared with what the loaders produced, and so phase 4 can compare a
 * BrAPI-loaded dataset with a VCF-loaded one. Alleles are written as symbols,
 * not indices: this repository stores 255 for missing and progeny-selector
 * -1, and a pair is sorted by symbol, since `GenotypeBuilder` orders it by
 * index. Markers follow `sortedMarkerOrder`; samples follow the genotype
 * matrix's columns, which `assembleDataset` puts in manifest order.
 *
 * Interface: ContractExpect, ContractErrorExpect, ErrorKind,
 * normaliseDataset(dataset, contractVersion) -> ContractExpect.
 */
import { MISSING_ALLELE } from '../../src/core/types.ts';
import type { Dataset } from '../../src/core/types.ts';

export interface ContractExpect {
  contractVersion: string;
  coded: boolean;
  chromosomeOrder: string[];
  /** In (chromosome order, position) order; cm null when absent. */
  markers: { id: string; chrom: string; posBp: number; cm: number | null }[];
  /** Manifest order, only samples with a genotype column. */
  sampleIds: string[];
  /** Per sample, per marker in `markers` order: sorted allele symbols, or null for missing. */
  calls: Record<string, ([string, string] | null)[]>;
}

export type ErrorKind =
  | 'manifest.roles'
  | 'genotypes.column_count'
  | 'delimited.unterminated_quote'
  | 'genotypes.repeated_header'
  | 'manifest.unknown_role'
  | 'manifest.duplicate_sample'
  | 'dataset.sample_missing'
  | 'genotypes.duplicate_marker'
  | 'genotypes.no_gt'
  | 'genotypes.no_header'
  | 'genotypes.unknown_cell'
  | 'genotypes.invalid_position'
  | 'genotypes.ambiguous_heterozygote'
  | 'genotypes.profile_format';

/** contract/cases/<case>/expected-error.json */
export interface ContractErrorExpect {
  contractVersion: string;
  kind: ErrorKind;
}

export function normaliseDataset(dataset: Dataset, contractVersion: string): ContractExpect {
  const { markers, genotypes } = dataset;
  const order = Array.from(dataset.sortedMarkerOrder);
  const symbol = (m: number, index: number): string => {
    const s = markers.alleles[m]?.[index];
    if (s === undefined) throw new Error(`marker ${markers.ids[m]}: no allele symbol ${index}`);
    return s;
  };
  const calls: ContractExpect['calls'] = {};
  genotypes.sampleIds.forEach((sampleId, col) => {
    calls[sampleId] = order.map((m) => {
      const i = m * genotypes.nSamples + col;
      const a = genotypes.allele1[i] as number;
      const b = genotypes.allele2[i] as number;
      if (a === MISSING_ALLELE || b === MISSING_ALLELE) return null;
      const pair = [symbol(m, a), symbol(m, b)].sort();
      return [pair[0], pair[1]] as [string, string];
    });
  });
  return {
    contractVersion,
    coded: dataset.coded,
    chromosomeOrder: [...dataset.chromosomeOrder],
    markers: order.map((m) => {
      const cm = markers.cm?.[m];
      return {
        id: markers.ids[m] as string,
        chrom: markers.chrom[m] as string,
        posBp: Number(markers.posBp[m]),
        cm: cm === undefined || Number.isNaN(cm) ? null : cm,
      };
    }),
    sampleIds: [...genotypes.sampleIds],
    calls,
  };
}
