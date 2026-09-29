import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateSync, inflateSync } from "node:zlib";

import {
  checkRemoteImageUrl,
  colorOfSinglePixelPng,
  frameFit,
  imageSizeAdvice,
  isBelowRecommendedSize,
  isOptimizableImageUrl,
  placeholderVariantUrls,
  probeImage,
  sniffImageFormat,
} from "./image-probe";

/* ── Byte builders ───────────────────────────────────────────────────── */

const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array => {
  const arrays = parts.map((part) =>
    typeof part === "string"
      ? new Uint8Array([...part].map((char) => char.charCodeAt(0)))
      : Uint8Array.from(part),
  );
  const out = new Uint8Array(arrays.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of arrays) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const le16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const be32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >> 16) & 0xff,
  (value >> 8) & 0xff,
  value & 0xff,
];
const le24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];

function jpegSegment(marker: number, payload: Uint8Array | number[]): Uint8Array {
  const data = Uint8Array.from(payload);
  return bytes([0xff, marker], be16(data.length + 2), data);
}

function exifPayload(orientation: number, order: "II" | "MM" = "MM"): Uint8Array {
  const little = order === "II";
  const u16 = little ? le16 : be16;
  const u32 = (value: number) => (little ? [...le16(value & 0xffff), ...le16(value >>> 16)] : be32(value));
  return bytes(
    "Exif",
    [0, 0],
    order,
    u16(42),
    u32(8), // first IFD straight after the header
    u16(1), // one entry
    u16(0x0112), // Orientation
    u16(3), // SHORT
    u32(1), // count
    u16(orientation),
    [0, 0], // padding of the 4-byte value field
    u32(0), // no next IFD
  );
}

function jpeg(
  width: number,
  height: number,
  options: { orientation?: number; order?: "II" | "MM" } = {},
): Uint8Array {
  const app0 = jpegSegment(0xe0, bytes("JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const app1 = options.orientation
    ? jpegSegment(0xe1, exifPayload(options.orientation, options.order))
    : new Uint8Array();
  const sof0 = jpegSegment(
    0xc0,
    bytes([8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
  );
  const sos = bytes([0xff, 0xda], be16(12), [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);
  return bytes([0xff, 0xd8], app0, app1, sof0, sos, [0x12, 0x34], [0xff, 0xd9]);
}

function pngChunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const payload = Uint8Array.from(data);
  return bytes(be32(payload.length), type, payload, [0, 0, 0, 0]); // CRC isn't checked
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(width: number, height: number): Uint8Array {
  return bytes(PNG_SIGNATURE, pngChunk("IHDR", bytes(be32(width), be32(height), [8, 6, 0, 0, 0])));
}

function onePixelPng(options: {
  bitDepth: number;
  colorType: number;
  pixel: number[];
  palette?: number[];
}): Uint8Array {
  const { bitDepth, colorType, pixel, palette } = options;
  const ihdr = pngChunk("IHDR", bytes(be32(1), be32(1), [bitDepth, colorType, 0, 0, 0]));
  const plte = palette ? pngChunk("PLTE", palette) : new Uint8Array();
  const idat = pngChunk("IDAT", deflateSync(Uint8Array.from([0, ...pixel])));
  return bytes(PNG_SIGNATURE, ihdr, plte, idat, pngChunk("IEND", []));
}

function riff(chunk: Uint8Array): Uint8Array {
  return bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk);
}

function webpLossy(width: number, height: number): Uint8Array {
  return riff(bytes("VP8 ", [0, 0, 0, 0], [0x10, 0x02, 0x00], [0x9d, 0x01, 0x2a], le16(width), le16(height)));
}

function webpLossless(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff(
    bytes(
      "VP8L",
      [0, 0, 0, 0],
      [0x2f],
      [bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff],
    ),
  );
}

function webpExtended(width: number, height: number): Uint8Array {
  return riff(bytes("VP8X", [0, 0, 0, 0], [0x10, 0, 0, 0], le24(width - 1), le24(height - 1)));
}

function box(type: string, ...content: (Uint8Array | number[] | string)[]): Uint8Array {
  const body = bytes(...content);
  return bytes(be32(body.length + 8), type, body);
}

function fullBox(
  type: string,
  version: number,
  flags: number,
  ...content: (Uint8Array | number[] | string)[]
): Uint8Array {
  return box(type, [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff], ...content);
}

function avif(options: {
  width: number;
  height: number;
  thumb?: [number, number];
  rotate?: number;
}): Uint8Array {
  const ftyp = box("ftyp", bytes("avif", [0, 0, 0, 0], "mif1", "miaf"));
  const properties: Uint8Array[] = [fullBox("ispe", 0, 0, be32(options.width), be32(options.height))];
  if (options.thumb) properties.push(fullBox("ispe", 0, 0, be32(options.thumb[0]), be32(options.thumb[1])));
  if (options.rotate !== undefined) properties.push(box("irot", [options.rotate]));
  const ipco = box("ipco", ...properties);
  // Item 1 (primary) uses property 1 (+ irot when present); item 2 (a thumbnail) uses property 2.
  const primaryAssociations = options.rotate !== undefined ? [0x81, options.thumb ? 3 : 2] : [0x81];
  const entries: number[] = [...be16(1), primaryAssociations.length, ...primaryAssociations];
  if (options.thumb) entries.push(...be16(2), 1, 0x82);
  const ipma = fullBox("ipma", 0, 0, be32(options.thumb ? 2 : 1), entries);
  const meta = fullBox(
    "meta",
    0,
    0,
    fullBox("hdlr", 0, 0, [0, 0, 0, 0], "pict", new Uint8Array(13)),
    fullBox("pitm", 0, 0, be16(1)),
    box("iprp", ipco, ipma),
  );
  return bytes(ftyp, meta, box("mdat", [1, 2, 3, 4]));
}

/* ── Probing ─────────────────────────────────────────────────────────── */

describe("probeImage", () => {
  it("reads a JPEG's size from its frame header", () => {
    assert.deepEqual(probeImage(jpeg(1600, 2000)), { format: "jpeg", width: 1600, height: 2000 });
  });

  it("swaps a JPEG's sides when EXIF turns it a quarter", () => {
    assert.deepEqual(probeImage(jpeg(4000, 3000, { orientation: 6 })), {
      format: "jpeg",
      width: 3000,
      height: 4000,
    });
    assert.deepEqual(probeImage(jpeg(4000, 3000, { orientation: 8, order: "II" })), {
      format: "jpeg",
      width: 3000,
      height: 4000,
    });
    assert.deepEqual(probeImage(jpeg(4000, 3000, { orientation: 3 })), {
      format: "jpeg",
      width: 4000,
      height: 3000,
    });
  });

  it("asks for more bytes when a JPEG is cut off before its frame header", () => {
    const full = jpeg(1200, 1500, { orientation: 1 });
    assert.equal(probeImage(full.subarray(0, 30)), null);
    assert.deepEqual(probeImage(full), { format: "jpeg", width: 1200, height: 1500 });
  });

  it("reads PNG sizes", () => {
    assert.deepEqual(probeImage(png(800, 1000)), { format: "png", width: 800, height: 1000 });
  });

  it("reads lossy, lossless and extended WebP sizes", () => {
    assert.deepEqual(probeImage(webpLossy(1024, 1280)), { format: "webp", width: 1024, height: 1280 });
    assert.deepEqual(probeImage(webpLossless(333, 444)), { format: "webp", width: 333, height: 444 });
    assert.deepEqual(probeImage(webpExtended(2400, 3000)), { format: "webp", width: 2400, height: 3000 });
  });

  it("reads the primary AVIF item's size, not a thumbnail's, and applies rotation", () => {
    assert.deepEqual(probeImage(avif({ width: 1920, height: 2400 })), {
      format: "avif",
      width: 1920,
      height: 2400,
    });
    assert.deepEqual(probeImage(avif({ width: 1920, height: 2400, thumb: [160, 200] })), {
      format: "avif",
      width: 1920,
      height: 2400,
    });
    assert.deepEqual(probeImage(avif({ width: 1920, height: 2400, rotate: 1 })), {
      format: "avif",
      width: 2400,
      height: 1920,
    });
  });

  it("rejects other formats, empty input and impossible sizes", () => {
    assert.equal(probeImage(bytes("GIF89a", [1, 0, 1, 0])), null);
    assert.equal(probeImage(bytes("<!doctype html><html>")), null);
    assert.equal(probeImage(new Uint8Array()), null);
    assert.equal(probeImage(png(0, 100)), null);
    assert.equal(probeImage(png(40_000, 100)), null);
  });

  it("sniffs formats from their signatures", () => {
    assert.equal(sniffImageFormat(jpeg(10, 10)), "jpeg");
    assert.equal(sniffImageFormat(png(10, 10)), "png");
    assert.equal(sniffImageFormat(webpLossy(10, 10)), "webp");
    assert.equal(sniffImageFormat(avif({ width: 10, height: 10 })), "avif");
    assert.equal(sniffImageFormat(bytes("RIFF", [0, 0, 0, 0], "WAVE")), null);
  });
});

/* ── One-pixel colour ────────────────────────────────────────────────── */

describe("colorOfSinglePixelPng", () => {
  it("reads 8-bit RGB and RGBA pixels", () => {
    assert.equal(
      colorOfSinglePixelPng(
        onePixelPng({ bitDepth: 8, colorType: 2, pixel: [0xec, 0xe8, 0xdf] }),
        inflateSync,
      ),
      "#ece8df",
    );
    assert.equal(
      colorOfSinglePixelPng(
        onePixelPng({ bitDepth: 8, colorType: 6, pixel: [0x16, 0x15, 0x13, 0xff] }),
        inflateSync,
      ),
      "#161513",
    );
  });

  it("reads 16-bit pixels by their high bytes", () => {
    assert.equal(
      colorOfSinglePixelPng(
        onePixelPng({ bitDepth: 16, colorType: 2, pixel: [0xab, 0x01, 0xcd, 0x02, 0xef, 0x03] }),
        inflateSync,
      ),
      "#abcdef",
    );
  });

  it("reads greyscale at any depth", () => {
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 8, colorType: 0, pixel: [0x80] }), inflateSync),
      "#808080",
    );
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 1, colorType: 0, pixel: [0x80] }), inflateSync),
      "#ffffff",
    );
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 4, colorType: 0, pixel: [0x00] }), inflateSync),
      "#000000",
    );
  });

  it("looks palette pixels up in PLTE, including low bit depths", () => {
    const palette = [0x11, 0x22, 0x33, 0xa0, 0xb0, 0xc0];
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 8, colorType: 3, pixel: [1], palette }), inflateSync),
      "#a0b0c0",
    );
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 1, colorType: 3, pixel: [0x80], palette }), inflateSync),
      "#a0b0c0",
    );
    assert.equal(
      colorOfSinglePixelPng(onePixelPng({ bitDepth: 2, colorType: 3, pixel: [0x00], palette }), inflateSync),
      "#112233",
    );
  });

  it("returns null for larger images, bad data and other formats", () => {
    assert.equal(colorOfSinglePixelPng(png(2, 2), inflateSync), null);
    assert.equal(colorOfSinglePixelPng(jpeg(1, 1), inflateSync), null);
    const broken = onePixelPng({ bitDepth: 8, colorType: 2, pixel: [1, 2, 3] });
    assert.equal(
      colorOfSinglePixelPng(broken, () => {
        throw new Error("bad zlib data");
      }),
      null,
    );
    // A palette index past the end of PLTE.
    assert.equal(
      colorOfSinglePixelPng(
        onePixelPng({ bitDepth: 8, colorType: 3, pixel: [9], palette: [1, 2, 3] }),
        inflateSync,
      ),
      null,
    );
  });
});

/* ── Allowed addresses ───────────────────────────────────────────────── */

describe("checkRemoteImageUrl", () => {
  it("accepts Unsplash and Cloudinary image addresses", () => {
    const unsplash = checkRemoteImageUrl(" https://images.unsplash.com/photo-123?w=2400&fm=jpg#top ");
    assert.equal(unsplash.ok, true);
    if (unsplash.ok) {
      assert.equal(unsplash.host, "images.unsplash.com");
      assert.equal(unsplash.url.href, "https://images.unsplash.com/photo-123?w=2400&fm=jpg");
    }
    const cloudinary = checkRemoteImageUrl(
      "https://res.cloudinary.com/demo/image/upload/v1712345678/shirts/linen.jpg",
    );
    assert.equal(cloudinary.ok, true);
  });

  it("refuses other hosts, lookalikes and insecure or odd addresses", () => {
    for (const url of [
      "http://images.unsplash.com/photo-1",
      "https://images.unsplash.com.evil.test/photo-1",
      "https://evil.test/images.unsplash.com/photo-1",
      "https://user:pass@images.unsplash.com/photo-1",
      "https://images.unsplash.com:8443/photo-1",
      "https://images.unsplash.com./photo-1",
      "ftp://images.unsplash.com/photo-1",
      "javascript:alert(1)",
      "images.unsplash.com/photo-1",
      "",
      `https://images.unsplash.com/${"a".repeat(2100)}`,
    ]) {
      assert.equal(checkRemoteImageUrl(url).ok, false, url);
    }
  });

  it("explains an Unsplash page address", () => {
    const result = checkRemoteImageUrl("https://unsplash.com/photos/abc");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Copy image address/);
  });

  it("only accepts ordinary Cloudinary uploads, not fetches of other sites", () => {
    assert.equal(
      checkRemoteImageUrl("https://res.cloudinary.com/demo/image/fetch/https://evil.test/a.jpg").ok,
      false,
    );
    assert.equal(checkRemoteImageUrl("https://res.cloudinary.com/demo/video/upload/v1/a.mp4").ok, false);
    assert.equal(checkRemoteImageUrl("https://res.cloudinary.com/demo").ok, false);
    assert.equal(checkRemoteImageUrl("https://images.unsplash.com/").ok, false);
  });

  it("knows which addresses next/image may optimise", () => {
    assert.equal(isOptimizableImageUrl("https://res.cloudinary.com/demo/image/upload/a.jpg"), true);
    assert.equal(isOptimizableImageUrl("https://example.com/a.jpg"), false);
    assert.equal(isOptimizableImageUrl("not a url"), false);
  });
});

describe("placeholderVariantUrls", () => {
  it("adds a tiny transformation to Cloudinary addresses, after any existing ones", () => {
    assert.deepEqual(
      placeholderVariantUrls(
        "https://res.cloudinary.com/demo/image/upload/v1712345678/tailored-by-tee/media/abc.png",
      ),
      {
        blur: "https://res.cloudinary.com/demo/image/upload/c_limit,w_16,q_40/v1712345678/tailored-by-tee/media/abc.jpg",
        pixel:
          "https://res.cloudinary.com/demo/image/upload/c_scale,w_1,h_1/v1712345678/tailored-by-tee/media/abc.png",
      },
    );
    assert.deepEqual(
      placeholderVariantUrls("https://res.cloudinary.com/demo/image/upload/c_fill,w_800/v2/abc.webp"),
      {
        blur: "https://res.cloudinary.com/demo/image/upload/c_fill,w_800/c_limit,w_16,q_40/v2/abc.jpg",
        pixel: "https://res.cloudinary.com/demo/image/upload/c_fill,w_800/c_scale,w_1,h_1/v2/abc.png",
      },
    );
  });

  it("resizes Unsplash addresses, keeping the crop for the blur", () => {
    const variants = placeholderVariantUrls(
      "https://images.unsplash.com/photo-1?fit=crop&crop=focalpoint&fp-x=0.4&w=2400&h=3000&fm=jpg&q=85",
    );
    assert.ok(variants);
    const blur = new URL(variants.blur);
    assert.equal(blur.searchParams.get("w"), "16");
    assert.equal(blur.searchParams.get("h"), "20");
    assert.equal(blur.searchParams.get("fit"), "crop");
    assert.equal(blur.searchParams.get("fp-x"), "0.4");
    assert.equal(blur.searchParams.get("fm"), "jpg");
    const pixel = new URL(variants.pixel);
    assert.equal(pixel.searchParams.get("w"), "1");
    assert.equal(pixel.searchParams.get("h"), "1");
    assert.equal(pixel.searchParams.get("fit"), "scale");
    assert.equal(pixel.searchParams.get("fm"), "png");
  });

  it("gives nothing for other addresses", () => {
    assert.equal(placeholderVariantUrls("https://example.com/a.jpg"), null);
    assert.equal(placeholderVariantUrls("http://images.unsplash.com/a"), null);
    assert.equal(placeholderVariantUrls("nonsense"), null);
  });
});

/* ── Size advice ─────────────────────────────────────────────────────── */

describe("size advice", () => {
  it("flags photos under 1,200 px on their longest side", () => {
    assert.equal(isBelowRecommendedSize({ width: 800, height: 1199 }), true);
    assert.equal(isBelowRecommendedSize({ width: 1200, height: 900 }), false);
  });

  it("describes how a photo sits in the 4:5 frame", () => {
    assert.equal(frameFit({ width: 1600, height: 2000 }), "fits");
    assert.equal(frameFit({ width: 1650, height: 2000 }), "fits");
    assert.equal(frameFit({ width: 3000, height: 2000 }), "wider");
    assert.equal(frameFit({ width: 1000, height: 2000 }), "taller");
  });

  it("says nothing about a good product photo", () => {
    assert.equal(imageSizeAdvice({ width: 2400, height: 3000 }), null);
    assert.match(imageSizeAdvice({ width: 600, height: 750 }) ?? "", /600 × 750 px/);
    assert.match(imageSizeAdvice({ width: 3000, height: 2000 }) ?? "", /sides will be cropped/);
  });
});
