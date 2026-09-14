/** Public surface of the I/O layer (parsers and the dataset boundary). */
export { parseVcf, parseVcfLines, VcfLineParser } from './vcf.ts';
export { parseHapMap } from './hapmap.ts';
export { parseWideCsv, detectWideCsvMode } from './wide-csv.ts';
export type { WideCsvMode } from './wide-csv.ts';
export { parseSampleManifest } from './manifest.ts';
export { parseMarkerMap, applyMarkerMap } from './markers.ts';
export type { MarkerMap, MarkerMapEntry } from './markers.ts';
export { bytesToText, gunzipAll, inflateIfGzip, isGzip } from './decompress.ts';
export { blobBytes, bytesOf, countBytes, lines } from './stream.ts';
export type { ByteSource } from './stream.ts';
export { parseDelimited, sniffDelimiter, forEachRow } from './csv.ts';
export {
  assembleDataset,
  detectGenotypeFormat,
  parseGenotypesBytes,
  parseGenotypesSource,
  parseGenotypesText,
} from './loaders.ts';
export type { GenotypeFormat, StreamedGenotypes } from './loaders.ts';
export type { ParsedGenotypes } from './builder.ts';
