/** Public surface of the I/O layer (parsers and the dataset boundary). */
export { parseVcf } from './vcf.ts';
export { parseHapMap } from './hapmap.ts';
export { parseWideCsv, detectWideCsvMode } from './wide-csv.ts';
export type { WideCsvMode } from './wide-csv.ts';
export { parseSampleManifest } from './manifest.ts';
export { parseMarkerMap, applyMarkerMap } from './markers.ts';
export type { MarkerMap, MarkerMapEntry } from './markers.ts';
export { bytesToText, gunzipAll, isGzip } from './decompress.ts';
export { parseDelimited, sniffDelimiter, forEachRow } from './csv.ts';
export {
  assembleDataset,
  detectGenotypeFormat,
  parseGenotypesBytes,
  parseGenotypesText,
} from './loaders.ts';
export type { GenotypeFormat } from './loaders.ts';
export type { ParsedGenotypes } from './builder.ts';
