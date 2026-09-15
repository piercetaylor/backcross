/**
 * Soybean chromosome naming.
 *
 * Responsibility: map the chromosome spellings the contract accepts (prefix
 * Gm, Chr, Chromosome or LG, optional _, space or - separator, 1..20 with
 * leading zeros; contract/data-contract.md 1.1.0, soybean-only in this
 * version) onto Gm01..Gm20, keep other names unchanged, and provide a stable
 * display order (Gm01..Gm20, then the rest in natural order).
 *
 * Interface: normalizeChromosome, isNuclearChromosome, compareChromosomes,
 * buildChromosomeOrder.
 */

export const SOYBEAN_CHROMOSOME_COUNT = 20;

const NUMBERED = /^(?:gm|chr|chromosome|lg)?[_\s-]?0*([1-9]|1[0-9]|20)$/i;

/** Returns "Gm01".."Gm20" for any accepted spelling; other names are returned trimmed but unchanged. */
export function normalizeChromosome(raw: string): string {
  const s = raw.trim();
  const m = NUMBERED.exec(s);
  if (m?.[1] !== undefined) {
    return `Gm${m[1].padStart(2, '0')}`;
  }
  return s;
}

export function isNuclearChromosome(name: string): boolean {
  return /^Gm(0[1-9]|1[0-9]|20)$/.test(name);
}

function naturalKey(s: string): (string | number)[] {
  return s.split(/(\d+)/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

/** Gm01..Gm20 first by number, then everything else in natural (numeric-aware) order. */
export function compareChromosomes(a: string, b: string): number {
  const na = isNuclearChromosome(a);
  const nb = isNuclearChromosome(b);
  if (na && nb) return Number(a.slice(2)) - Number(b.slice(2));
  if (na !== nb) return na ? -1 : 1;
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const x = ka[i] as string | number;
    const y = kb[i] as string | number;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return ka.length - kb.length;
}

/** Distinct chromosome names in display order. */
export function buildChromosomeOrder(chroms: Iterable<string>): string[] {
  return Array.from(new Set(chroms)).sort(compareChromosomes);
}
