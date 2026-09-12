/**
 * BGZF framing for test inputs.
 *
 * Responsibility: turn bytes into the block-gzip container htslib's `bgzip`
 * writes, so a loader can be exercised on a real multi-member file without a
 * binary or a file on disk. Each block of at most `blockBytes` uncompressed
 * bytes is compressed by fflate's gzipSync with a zero mtime; FLG.FEXTRA is
 * then set and the 8-byte BC extra field spliced in after the 10-byte header
 * (XLEN = 6, SI1 'B', SI2 'C', SLEN = 2, BSIZE = total member length - 1).
 * The gzip CRC32 and ISIZE cover only the uncompressed data, so the splice
 * needs no recomputation (fflate exports no CRC). The 28-byte empty EOF
 * block closes the stream. The definition, the 64 KiB per-block bound and
 * the EOF bytes are from the SAM specification source (hts-specs,
 * SAMv1.tex).
 *
 * Interface: BGZF_EOF, bgzfBlocks(bytes, blockBytes?) -> Uint8Array[].
 */
import { gzipSync } from 'fflate';

export const BGZF_EOF = new Uint8Array([
  0x1f, 0x8b, 0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02, 0x00,
  0x1b, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const GZIP_HEADER_BYTES = 10;
const EXTRA_FIELD_BYTES = 8;
const FLG_OFFSET = 3;
const FEXTRA = 4;
const MAX_MEMBER_BYTES = 65_536;

/** BGZF members for `bytes`, in order, followed by the EOF block. */
export function bgzfBlocks(bytes: Uint8Array, blockBytes = 0xff00): Uint8Array[] {
  if (!Number.isInteger(blockBytes) || blockBytes <= 0 || blockBytes > MAX_MEMBER_BYTES) {
    throw new RangeError(`blockBytes must be an integer in 1..${MAX_MEMBER_BYTES}`);
  }
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += blockBytes) {
    const gz = gzipSync(bytes.subarray(offset, offset + blockBytes), { mtime: 0 });
    const total = gz.length + EXTRA_FIELD_BYTES;
    if (total > MAX_MEMBER_BYTES) {
      throw new RangeError(`a BGZF member of ${total} bytes exceeds 64 KiB`);
    }
    const bsize = total - 1;
    const member = new Uint8Array(total);
    member.set(gz.subarray(0, GZIP_HEADER_BYTES), 0);
    member[FLG_OFFSET] = (member[FLG_OFFSET] as number) | FEXTRA;
    member.set(
      [0x06, 0x00, 0x42, 0x43, 0x02, 0x00, bsize & 0xff, (bsize >>> 8) & 0xff],
      GZIP_HEADER_BYTES,
    );
    member.set(gz.subarray(GZIP_HEADER_BYTES), GZIP_HEADER_BYTES + EXTRA_FIELD_BYTES);
    blocks.push(member);
  }
  blocks.push(BGZF_EOF.slice());
  return blocks;
}
