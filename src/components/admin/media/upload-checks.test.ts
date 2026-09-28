import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkUploadFile, describeUploadError, pickUploadReply } from "./upload-checks";

describe("checkUploadFile", () => {
  it("accepts the four photo formats up to 15 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      assert.equal(checkUploadFile({ name: "photo", type, size: 2_000_000 }), null, type);
    }
    assert.equal(checkUploadFile({ name: "photo.JPG", type: "", size: 1000 }), null);
  });

  it("explains iPhone HEIC photos", () => {
    assert.match(checkUploadFile({ name: "IMG_0001.HEIC", type: "", size: 1000 }) ?? "", /HEIC/);
    assert.match(checkUploadFile({ name: "x", type: "image/heif", size: 1000 }) ?? "", /HEIC/);
  });

  it("refuses other types, empty files and big files", () => {
    assert.match(
      checkUploadFile({ name: "a.gif", type: "image/gif", size: 1000 }) ?? "",
      /JPEG, PNG, WebP or AVIF/,
    );
    assert.match(checkUploadFile({ name: "a.pdf", type: "application/pdf", size: 1000 }) ?? "", /JPEG/);
    assert.match(checkUploadFile({ name: "a.jpg", type: "image/jpeg", size: 0 }) ?? "", /empty/);
    assert.match(
      checkUploadFile({ name: "a.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 }) ?? "",
      /16 MB; the limit is 15 MB/,
    );
  });
});

describe("describeUploadError", () => {
  it("turns Cloudinary's errors into next steps", () => {
    assert.match(
      describeUploadError(400, "File size too large. Got 12000000. Maximum is 10485760."),
      /free plan/,
    );
    assert.match(describeUploadError(400, "Image format heic not allowed"), /JPEG, PNG, WebP or AVIF/);
    assert.match(describeUploadError(401, "Invalid Signature abc"), /keys don’t match/);
    assert.match(describeUploadError(400, "Stale request - reported time is 2026-01-01"), /too long/);
    assert.match(describeUploadError(0, null), /connection/);
    assert.match(describeUploadError(503, null), /problem receiving/);
    assert.match(describeUploadError(400, "Something unusual"), /Something unusual/);
  });
});

describe("pickUploadReply", () => {
  it("keeps only what the server verifies, and a few colours", () => {
    const picked = pickUploadReply({
      public_id: "a",
      version: 1,
      signature: "s",
      api_key: "123",
      original_filename: "IMG_0001",
      colors: Array.from({ length: 20 }, (_, index) => [`#00000${index % 10}`, 1]),
    });
    assert.deepEqual(Object.keys(picked).sort(), ["colors", "public_id", "signature", "version"]);
    assert.equal((picked.colors as unknown[]).length, 8);
  });
});
