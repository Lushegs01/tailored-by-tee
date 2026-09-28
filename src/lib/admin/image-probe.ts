/*
 * Reading an image's format and pixel size from its first bytes, without decoding
 * it — so "add an image by its address" can check that a link really is a
 * photograph, and record its size, before anything is saved. Pure: no network,
 * no Node-only imports (PNG inflation is passed in), so it runs the same in tests.
 *
 * Also the rules for which web addresses images may come from. They mirror
 * images.remotePatterns in next.config.ts: next/image refuses any other host, so
 * an image from anywhere else would break on the storefront.
 */

export type ProbedFormat = "jpeg" | "png" | "webp" | "avif";

export interface ProbedImage {
  format: ProbedFormat;
  /** As displayed: EXIF / AVIF rotation already applied. */
  width: number;
  height: number;
}

/** Largest width or height accepted (guards against corrupt headers). */
export const MAX_IMAGE_DIMENSION = 30_000;

/**
 * The format and displayed size of a JPEG, PNG, WebP or AVIF image from its
 * leading bytes, or null when the bytes aren't one of those (or are truncated
 * before the size — read more and try again).
 */
export function probeImage(bytes: Uint8Array): ProbedImage | null {
  const result = probeUnchecked(bytes);
  if (!result) return null;
  const { width, height } = result;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) return null;
  return result;
}

/** Which format the bytes claim to be, from the signature alone (null when unknown). */
export function sniffImageFormat(bytes: Uint8Array): ProbedFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp" && isAvifBrand(bytes)) return "avif";
  return null;
}

function probeUnchecked(bytes: Uint8Array): ProbedImage | null {
  switch (sniffImageFormat(bytes)) {
    case "jpeg":
      return probeJpeg(bytes);
    case "png":
      return probePng(bytes);
    case "webp":
      return probeWebp(bytes);
    case "avif":
      return probeAvif(bytes);
    default:
      return null;
  }
}

/* ── Byte helpers ─────────────────────────────────────────────────────── */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index]);
  }
  return text;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function has(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && offset + length <= bytes.length;
}

/* ── JPEG ─────────────────────────────────────────────────────────────── */

/** Start-of-frame markers carry the size (SOF0–SOF15, except DHT, JPG and DAC). */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function probeJpeg(bytes: Uint8Array): ProbedImage | null {
  let offset = 2;
  let orientation = 1;

  while (has(bytes, offset, 4)) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1];
    // Fill bytes: any number of 0xFF before the marker.
    while (marker === 0xff && has(bytes, offset + 2, 1)) {
      offset += 1;
      marker = bytes[offset + 1];
    }
    // Markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    // End of image, or image data before any frame header: no size to be had.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (!has(bytes, offset + 2, 2)) return null;
    const length = u16be(bytes, offset + 2);
    if (length < 2) return null;

    if (marker === 0xe1 && has(bytes, offset + 4, length - 2)) {
      orientation = readExifOrientation(bytes, offset + 4, length - 2) ?? orientation;
    }

    if (isStartOfFrame(marker)) {
      if (!has(bytes, offset + 5, 5)) return null;
      const height = u16be(bytes, offset + 5);
      const width = u16be(bytes, offset + 7);
      // Orientations 5–8 turn the picture a quarter, so browsers swap its sides.
      return orientation >= 5 && orientation <= 8
        ? { format: "jpeg", width: height, height: width }
        : { format: "jpeg", width, height };
    }

    offset += 2 + length;
  }
  return null;
}

/** The EXIF orientation (1–8) from an APP1 segment's payload, or null. */
function readExifOrientation(bytes: Uint8Array, start: number, length: number): number | null {
  if (length < 14 || ascii(bytes, start, 4) !== "Exif" || bytes[start + 4] !== 0 || bytes[start + 5] !== 0)
    return null;
  const tiff = start + 6;
  const end = start + length;
  const order = ascii(bytes, tiff, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const read16 = (at: number) => (little ? u16le(bytes, at) : u16be(bytes, at));
  const read32 = (at: number) =>
    little ? u16le(bytes, at) + u16le(bytes, at + 2) * 0x10000 : u32be(bytes, at);

  if (read16(tiff + 2) !== 42) return null;
  const ifd = tiff + read32(tiff + 4);
  if (ifd + 2 > end) return null;
  const entries = read16(ifd);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return null;
    if (read16(entry) === 0x0112) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/* ── PNG ──────────────────────────────────────────────────────────────── */

function probePng(bytes: Uint8Array): ProbedImage | null {
  if (!has(bytes, 8, 16) || ascii(bytes, 12, 4) !== "IHDR") return null;
  return { format: "png", width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

/* ── WebP ─────────────────────────────────────────────────────────────── */

function probeWebp(bytes: Uint8Array): ProbedImage | null {
  if (!has(bytes, 12, 8)) return null;
  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: frame tag (3 bytes), start code 9D 01 2A, then 14-bit width and height.
    if (!has(bytes, 20, 10)) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }

  if (chunk === "VP8L") {
    // Lossless: signature 0x2F, then width − 1 and height − 1 in 14 bits each.
    if (!has(bytes, 20, 5) || bytes[20] !== 0x2f) return null;
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }

  if (chunk === "VP8X") {
    // Extended: flags and reserved bytes, then canvas width − 1 and height − 1 in 24 bits each.
    if (!has(bytes, 20, 10)) return null;
    return { format: "webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }

  return null;
}

/* ── AVIF (ISO base media file format) ────────────────────────────────── */

interface Box {
  type: string;
  /** First byte of the box's content (after the header). */
  start: number;
  end: number;
}

function readBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;
  while (offset + 8 <= end && has(bytes, offset, 8)) {
    let size = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (!has(bytes, offset + 8, 8)) break;
      // 64-bit size; anything past 2^32 is far beyond what we read.
      if (u32be(bytes, offset + 8) !== 0) break;
      size = u32be(bytes, offset + 12);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) {
      // Truncated: keep what we have of this box so its children can still be read.
      boxes.push({ type, start: offset + header, end: Math.min(end, bytes.length) });
      break;
    }
    boxes.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function isAvifBrand(bytes: Uint8Array): boolean {
  const size = Math.min(u32be(bytes, 0), bytes.length);
  for (let offset = 8; offset + 4 <= size; offset += 4) {
    // Major brand at 8, minor version at 12 (skipped), compatible brands from 16.
    if (offset === 12) continue;
    const brand = ascii(bytes, offset, 4);
    if (brand === "avif" || brand === "avis") return true;
  }
  return false;
}

function probeAvif(bytes: Uint8Array): ProbedImage | null {
  const meta = readBoxes(bytes, 0, bytes.length).find((box) => box.type === "meta");
  if (!meta) return null;
  // "meta" is a full box: 4 bytes of version and flags before its children.
  const children = readBoxes(bytes, meta.start + 4, meta.end);

  let primaryItem: number | null = null;
  const pitm = children.find((box) => box.type === "pitm");
  if (pitm && has(bytes, pitm.start, 6)) {
    primaryItem =
      bytes[pitm.start] === 0
        ? u16be(bytes, pitm.start + 4)
        : has(bytes, pitm.start, 8)
          ? u32be(bytes, pitm.start + 4)
          : null;
  }

  const iprp = children.find((box) => box.type === "iprp");
  if (!iprp) return null;
  const iprpChildren = readBoxes(bytes, iprp.start, iprp.end);
  const ipco = iprpChildren.find((box) => box.type === "ipco");
  if (!ipco) return null;
  const properties = readBoxes(bytes, ipco.start, ipco.end);

  const sizeOf = (box: Box) =>
    box.type === "ispe" && has(bytes, box.start, 12)
      ? { width: u32be(bytes, box.start + 4), height: u32be(bytes, box.start + 8) }
      : null;
  const quarterTurn = (box: Box) =>
    box.type === "irot" && has(bytes, box.start, 1) && (bytes[box.start] & 0x03) % 2 === 1;

  // The primary item's own properties, when the association table can be read.
  const ipma = iprpChildren.find((box) => box.type === "ipma");
  if (primaryItem !== null && ipma) {
    const indices = associatedProperties(bytes, ipma, primaryItem);
    if (indices) {
      const own = indices.flatMap((index) => properties[index - 1] ?? []);
      const size = own.map(sizeOf).find((value) => value !== null);
      if (size) {
        return own.some(quarterTurn)
          ? { format: "avif", width: size.height, height: size.width }
          : { format: "avif", ...size };
      }
    }
  }

  // Otherwise the largest size box (thumbnails and alpha planes are never larger).
  let best: { width: number; height: number } | null = null;
  for (const box of properties) {
    const size = sizeOf(box);
    if (size && (!best || size.width * size.height > best.width * best.height)) best = size;
  }
  return best ? { format: "avif", ...best } : null;
}

/** 1-based property indices associated with `itemId` in an "ipma" box, or null when unreadable. */
function associatedProperties(bytes: Uint8Array, ipma: Box, itemId: number): number[] | null {
  if (!has(bytes, ipma.start, 8)) return null;
  const version = bytes[ipma.start];
  const wideIndex = (bytes[ipma.start + 3] & 0x01) === 1;
  const count = u32be(bytes, ipma.start + 4);
  let offset = ipma.start + 8;

  for (let entry = 0; entry < count; entry += 1) {
    const idLength = version < 1 ? 2 : 4;
    if (!has(bytes, offset, idLength + 1) || offset >= ipma.end) return null;
    const id = version < 1 ? u16be(bytes, offset) : u32be(bytes, offset);
    const associations = bytes[offset + idLength];
    offset += idLength + 1;
    const indices: number[] = [];
    for (let index = 0; index < associations; index += 1) {
      if (wideIndex) {
        if (!has(bytes, offset, 2)) return null;
        indices.push(u16be(bytes, offset) & 0x7fff);
        offset += 2;
      } else {
        if (!has(bytes, offset, 1)) return null;
        indices.push(bytes[offset] & 0x7f);
        offset += 1;
      }
    }
    if (id === itemId) return indices;
  }
  return null;
}

/* ── One-pixel PNG colour ─────────────────────────────────────────────── */

/** Bit depths the PNG specification allows for each colour type. */
const PNG_BIT_DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16], // greyscale
  2: [8, 16], // RGB
  3: [1, 2, 4, 8], // palette
  4: [8, 16], // greyscale + alpha
  6: [8, 16], // RGBA
};

/**
 * The colour of a 1 × 1 PNG as "#rrggbb" — how a remote image's overall colour is
 * read: ask the image service for the photo scaled to a single pixel. Any bit
 * depth and colour type (image services often send a tiny palette PNG).
 * `inflate` is zlib's inflate (node:zlib inflateSync on the server).
 */
export function colorOfSinglePixelPng(
  bytes: Uint8Array,
  inflate: (data: Uint8Array) => Uint8Array,
): string | null {
  if (sniffImageFormat(bytes) !== "png") return null;

  let offset = 8;
  let header: {
    width: number;
    height: number;
    bitDepth: number;
    colorType: number;
    interlace: number;
  } | null = null;
  let palette: Uint8Array | null = null;
  const data: Uint8Array[] = [];

  while (has(bytes, offset, 12)) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const start = offset + 8;
    if (!has(bytes, start, length)) return null;
    if (type === "IHDR" && length >= 13) {
      header = {
        width: u32be(bytes, start),
        height: u32be(bytes, start + 4),
        bitDepth: bytes[start + 8],
        colorType: bytes[start + 9],
        interlace: bytes[start + 12],
      };
    } else if (type === "PLTE") {
      palette = bytes.subarray(start, start + length);
    } else if (type === "IDAT") {
      data.push(bytes.subarray(start, start + length));
    } else if (type === "IEND") {
      break;
    }
    offset = start + length + 4;
  }

  // Interlacing doesn't matter here: a single pixel is all in Adam7's first pass.
  if (!header || header.width !== 1 || header.height !== 1) return null;
  const { bitDepth, colorType } = header;
  if (!PNG_BIT_DEPTHS[colorType]?.includes(bitDepth)) return null;
  if (data.length === 0) return null;

  let raw: Uint8Array;
  try {
    const joined = new Uint8Array(data.reduce((total, part) => total + part.length, 0));
    let at = 0;
    for (const part of data) {
      joined.set(part, at);
      at += part.length;
    }
    raw = inflate(joined);
  } catch {
    return null;
  }

  // One row: a filter byte, then one pixel. With no neighbours, every PNG filter
  // leaves the pixel's bytes unchanged.
  const pixel = raw.subarray(1);
  if (pixel.length < 1) return null;
  // Samples below 8 bits sit in the first byte's high bits; 16-bit samples are
  // big-endian, so their first byte is the 8-bit value.
  const sample = (index: number): number | null => {
    if (bitDepth < 8) {
      const max = (1 << bitDepth) - 1;
      return Math.round(((pixel[0] >> (8 - bitDepth)) & max) * (255 / max));
    }
    const at = bitDepth === 16 ? index * 2 : index;
    return at < pixel.length ? pixel[at] : null;
  };

  let rgb: (number | null)[] | null = null;
  switch (colorType) {
    case 0: // greyscale
    case 4: {
      // greyscale + alpha
      const grey = sample(0);
      rgb = [grey, grey, grey];
      break;
    }
    case 2: // RGB
    case 6: // RGBA
      rgb = [sample(0), sample(1), sample(2)];
      break;
    case 3: {
      // palette: the pixel is an index into PLTE
      const index = bitDepth < 8 ? (pixel[0] >> (8 - bitDepth)) & ((1 << bitDepth) - 1) : pixel[0];
      if (palette && has(palette, index * 3, 3)) {
        rgb = [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
      }
      break;
    }
  }
  if (!rgb || rgb.some((value) => value === null)) return null;
  return `#${rgb.map((value) => (value as number).toString(16).padStart(2, "0")).join("")}`;
}

/* ── Where images may come from ───────────────────────────────────────── */

/** Hosts in images.remotePatterns (next.config.ts). Keep the two lists in step. */
export const REMOTE_IMAGE_HOSTS = ["images.unsplash.com", "res.cloudinary.com"] as const;

export type RemoteImageHost = (typeof REMOTE_IMAGE_HOSTS)[number];

const MAX_URL_LENGTH = 2048;

export type RemoteImageUrlCheck =
  { ok: true; url: URL; host: RemoteImageHost } | { ok: false; message: string };

const HOSTS_SENTENCE =
  "Images can be added from Unsplash (images.unsplash.com) or Cloudinary (res.cloudinary.com). Upload other photos instead.";

/**
 * Checks an image address typed or pasted by the owner: https only, one of the
 * allowed hosts exactly, no user name or password, no unusual port, and for
 * Cloudinary an ordinary uploaded image (not a fetch or proxy of another site).
 */
export function checkRemoteImageUrl(input: string): RemoteImageUrlCheck {
  const text = input.trim();
  if (text === "") return { ok: false, message: "Enter the image’s web address." };
  if (text.length > MAX_URL_LENGTH)
    return { ok: false, message: "That address is too long. Copy the image address again." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, message: "Enter the full image address, starting with https://." };
  }

  if (url.protocol !== "https:") {
    return url.protocol === "http:"
      ? { ok: false, message: "Use the secure address, starting with https://." }
      : { ok: false, message: "Enter the full image address, starting with https://." };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, message: "That address can’t be used. Copy the image address again." };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "unsplash.com" || hostname === "www.unsplash.com") {
    return {
      ok: false,
      message:
        "That’s the Unsplash page, not the image itself. Open the photo, right-click it and choose “Copy image address” — it starts with https://images.unsplash.com/.",
    };
  }
  const host = REMOTE_IMAGE_HOSTS.find((allowed) => allowed === hostname);
  if (!host) return { ok: false, message: HOSTS_SENTENCE };

  if (host === "res.cloudinary.com" && !parseCloudinaryPath(url.pathname)) {
    return {
      ok: false,
      message:
        "That Cloudinary address isn’t an uploaded image. Copy the image’s address from your Cloudinary media library.",
    };
  }
  if (host === "images.unsplash.com" && (url.pathname === "/" || url.pathname === "")) {
    return { ok: false, message: "That address doesn’t point to a photo. Copy the image address again." };
  }

  url.hash = "";
  return { ok: true, url, host };
}

/** True when next/image may optimise this address (its host is allowed in next.config.ts). */
export function isOptimizableImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && REMOTE_IMAGE_HOSTS.some((host) => host === url.hostname);
  } catch {
    return false;
  }
}

/* ── Tiny variants for placeholders ───────────────────────────────────── */

/** "/<cloud>/image/upload/<transformations…>/<v123>/<public id>" split into its parts, or null. */
function parseCloudinaryPath(pathname: string): { cloud: string; segments: string[] } | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;
  const [cloud, resource, type, ...rest] = segments;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cloud) || resource !== "image" || type !== "upload" || rest.length === 0)
    return null;
  return { cloud, segments: rest };
}

const CLOUDINARY_TRANSFORMATION = /^[a-z]{1,3}_[^/]*(,[a-z]{1,3}_[^/]*)*$/;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif|gif)$/i;

/** Inserts a final transformation into a Cloudinary delivery URL and sets the file type. */
function cloudinaryVariant(url: URL, transformation: string, extension: "jpg" | "png"): string | null {
  const parsed = parseCloudinaryPath(url.pathname);
  if (!parsed) return null;
  const { cloud, segments } = parsed;
  // After the existing transformations: before the version, or before the public id.
  let index = segments.findIndex((segment) => /^v\d+$/.test(segment));
  if (index === -1) index = segments.findIndex((segment) => !CLOUDINARY_TRANSFORMATION.test(segment));
  if (index === -1) return null;

  const next = [...segments.slice(0, index), transformation, ...segments.slice(index)];
  const last = next.length - 1;
  next[last] = IMAGE_EXTENSION.test(next[last])
    ? next[last].replace(IMAGE_EXTENSION, `.${extension}`)
    : `${next[last]}.${extension}`;
  return `https://res.cloudinary.com/${cloud}/image/upload/${next.join("/")}`;
}

const UNSPLASH_SIZE_PARAMS = [
  "w",
  "h",
  "dpr",
  "q",
  "fm",
  "auto",
  "fit",
  "crop",
  "fp-x",
  "fp-y",
  "fp-z",
  "fp-debug",
  "ar",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
];

/** An Unsplash (imgix) URL resized with `params`, keeping the source crop (rect). */
function unsplashVariant(url: URL, params: Record<string, string>, keepFraming: boolean): string {
  const next = new URL(url.href);
  const width = Number(url.searchParams.get("w"));
  const height = Number(url.searchParams.get("h"));
  for (const key of UNSPLASH_SIZE_PARAMS) {
    if (keepFraming && ["fit", "crop", "fp-x", "fp-y", "fp-z"].includes(key)) continue;
    next.searchParams.delete(key);
  }
  if (keepFraming && width > 0 && height > 0 && params.w) {
    next.searchParams.set("h", String(Math.max(1, Math.round((Number(params.w) * height) / width))));
  }
  for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
  return next.href;
}

/**
 * Addresses of two tiny renditions of a remote image, for the loading placeholder:
 * `blur`, a 16px-wide JPEG for next/image's blurDataURL, and `pixel`, the whole
 * photo averaged into one PNG pixel, for the frame's background colour.
 */
export function placeholderVariantUrls(value: string): { blur: string; pixel: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  if (url.hostname === "images.unsplash.com") {
    return {
      blur: unsplashVariant(url, { w: "16", fm: "jpg", q: "40" }, true),
      pixel: unsplashVariant(url, { w: "1", h: "1", fit: "scale", fm: "png" }, false),
    };
  }
  if (url.hostname === "res.cloudinary.com") {
    const blur = cloudinaryVariant(url, "c_limit,w_16,q_40", "jpg");
    const pixel = cloudinaryVariant(url, "c_scale,w_1,h_1", "png");
    return blur && pixel ? { blur, pixel } : null;
  }
  return null;
}

/* ── Limits for new images ────────────────────────────────────────────── */
/*
 * Shared by the upload form (instant feedback) and the server (which re-checks
 * everything), so both say the same thing.
 */

/** File types the uploader accepts, as browsers report them. */
export const ACCEPTED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

/** For <input type="file" accept>: the types plus their extensions (some phones only match on those). */
export const UPLOAD_ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_UPLOAD_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
].join(",");

/** Largest upload accepted: 15 MB. (Cloudinary's free plan stops at 10 MB and says so.) */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Below this on the longest side, a photo can look soft on large screens. */
export const RECOMMENDED_LONG_EDGE = 1200;

/** Alt text: required, one or two plain sentences. */
export const ALT_TEXT_MAX = 250;

/** The frame product photos are shown in on the storefront (width ÷ height). */
export const PRODUCT_FRAME_RATIO = 4 / 5;

/** True when a photo is below the recommended size on its longest side. */
export function isBelowRecommendedSize(size: { width: number; height: number }): boolean {
  return Math.max(size.width, size.height) < RECOMMENDED_LONG_EDGE;
}

/**
 * How a photo sits in the storefront's 4:5 product frame: "fits" (within about
 * 6%), or "wider" / "taller", meaning its sides or its top and bottom are cropped.
 */
export function frameFit(
  size: { width: number; height: number },
  ratio = PRODUCT_FRAME_RATIO,
): "fits" | "wider" | "taller" {
  if (size.width < 1 || size.height < 1) return "fits";
  const difference = size.width / size.height / ratio;
  if (difference > 1.06) return "wider";
  if (difference < 1 / 1.06) return "taller";
  return "fits";
}

/** Plain-English advice about a photo's size and shape, or null when it's fine. */
export function imageSizeAdvice(size: { width: number; height: number }): string | null {
  const notes: string[] = [];
  if (isBelowRecommendedSize(size)) {
    notes.push(
      `This photo is ${size.width} × ${size.height} px. Photos under ${RECOMMENDED_LONG_EDGE.toLocaleString("en-GB")} px on their longest side can look soft on large screens.`,
    );
  }
  const fit = frameFit(size);
  if (fit === "wider")
    notes.push(
      "It’s wider than the shop’s 4:5 product frame, so its sides will be cropped on product cards.",
    );
  if (fit === "taller")
    notes.push(
      "It’s taller than the shop’s 4:5 product frame, so its top and bottom will be cropped on product cards.",
    );
  return notes.length > 0 ? notes.join(" ") : null;
}
