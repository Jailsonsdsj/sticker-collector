import type { Size } from "@sticker-collector/shared";

/**
 * Reads a JPEG's dimensions out of its frame header, without decoding it.
 *
 * The Worker has a 10 ms CPU budget, so decoding is out of the question — but
 * the dimensions still have to be verified. A master that is a few pixels off
 * uploads happily and then breaks the print export weeks later, at which point
 * the cause is invisible. Walking the segment table is a few hundred bytes of
 * reading, whatever the image size.
 *
 * Returns `null` for anything that is not a JPEG we can read, which the caller
 * treats as a rejection rather than a pass.
 */
export function jpegSize(bytes: Uint8Array): Size | null {
  // SOI.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    // Segments are 0xFF followed by a marker; a run of 0xFF is legal padding.
    if (bytes[offset] !== 0xff) return null;

    let marker = bytes[offset + 1] as number;
    offset += 2;
    while (marker === 0xff && offset < bytes.length) {
      marker = bytes[offset] as number;
      offset += 1;
    }

    // Standalone markers: no length, no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // Start of scan — the entropy-coded data begins and there is no header left.
    if (marker === 0xda || marker === 0xd9) return null;

    if (offset + 1 >= bytes.length) return null;
    const length = ((bytes[offset] as number) << 8) | (bytes[offset + 1] as number);
    if (length < 2) return null;

    // SOF0/1/2/3, 5/6/7, 9/10/11, 13/14/15 all carry the frame header. The gaps
    // (0xC4 DHT, 0xC8, 0xCC DAC) are not frames and must not be read as one.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader) {
      // length(2) precision(1) height(2) width(2)
      if (offset + 7 >= bytes.length) return null;
      const height = ((bytes[offset + 3] as number) << 8) | (bytes[offset + 4] as number);
      const width = ((bytes[offset + 5] as number) << 8) | (bytes[offset + 6] as number);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    offset += length;
  }

  return null;
}
