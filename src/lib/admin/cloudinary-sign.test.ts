import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  CLOUDINARY_UPLOAD_FOLDER,
  buildSignedDestroyFields,
  buildSignedUploadFields,
  checkUploadResult,
  cloudinaryUploadUrl,
  parseCloudinaryUrl,
  predominantColor,
  readCloudinaryCredentials,
  signParams,
  signatureBase,
  verifyResponseSignature,
  type CloudinaryCredentials,
} from "./cloudinary-sign";

const credentials: CloudinaryCredentials = {
  cloudName: "tee-demo",
  apiKey: "123456789012345",
  apiSecret: "s3cr3t_Secret-value",
};

const sha1 = (text: string) => createHash("sha1").update(text).digest("hex");

describe("signing", () => {
  it("matches Cloudinary's documented example", () => {
    // From Cloudinary's "Generating authentication signatures" guide (secret "abcd").
    const params = {
      timestamp: 1315060510,
      public_id: "sample_image",
      eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
      file: "ignored",
      api_key: "ignored",
      resource_type: "image",
      cloud_name: "demo",
    };
    assert.equal(
      signatureBase(params),
      "eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample_image&timestamp=1315060510",
    );
    assert.equal(signParams(params, "abcd"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("drops empty values and joins lists with commas", () => {
    assert.equal(
      signatureBase({
        tags: ["a", "b"],
        folder: "",
        context: null,
        colors: true,
        notes: undefined,
        empty: [],
      }),
      "colors=true&tags=a,b",
    );
  });

  it("signs the upload fields without exposing the secret", () => {
    const fields = buildSignedUploadFields(credentials, 1_790_000_000.7);
    assert.deepEqual(Object.keys(fields).sort(), [
      "allowed_formats",
      "api_key",
      "colors",
      "folder",
      "signature",
      "timestamp",
    ]);
    assert.equal(fields.timestamp, "1790000000");
    assert.equal(fields.folder, CLOUDINARY_UPLOAD_FOLDER);
    assert.equal(fields.api_key, credentials.apiKey);
    assert.equal(
      fields.signature,
      sha1(
        `allowed_formats=jpg,png,webp,avif&colors=true&folder=${CLOUDINARY_UPLOAD_FOLDER}&timestamp=1790000000${credentials.apiSecret}`,
      ),
    );
    assert.ok(!Object.values(fields).some((value) => value.includes(credentials.apiSecret)));
  });

  it("signs destroy requests", () => {
    const fields = buildSignedDestroyFields(credentials, "tailored-by-tee/media/abc", 1_790_000_000);
    assert.equal(
      fields.signature,
      sha1(
        `invalidate=true&public_id=tailored-by-tee/media/abc&timestamp=1790000000${credentials.apiSecret}`,
      ),
    );
  });

  it("builds the upload endpoint", () => {
    assert.equal(cloudinaryUploadUrl("tee-demo"), "https://api.cloudinary.com/v1_1/tee-demo/image/upload");
  });
});

describe("credentials", () => {
  it("reads the three separate variables", () => {
    assert.deepEqual(
      readCloudinaryCredentials({
        CLOUDINARY_CLOUD_NAME: " tee-demo ",
        CLOUDINARY_API_KEY: "123456789012345",
        CLOUDINARY_API_SECRET: "s3cr3t_Secret-value",
      }),
      credentials,
    );
  });

  it("falls back to CLOUDINARY_URL", () => {
    assert.deepEqual(
      readCloudinaryCredentials({
        CLOUDINARY_URL: "cloudinary://123456789012345:s3cr3t_Secret-value@tee-demo",
      }),
      credentials,
    );
    assert.deepEqual(
      parseCloudinaryUrl("cloudinary://123456789012345:s3cr3t_Secret-value@tee-demo/"),
      credentials,
    );
  });

  it("is off when anything is missing or malformed", () => {
    assert.equal(readCloudinaryCredentials({}), null);
    assert.equal(
      readCloudinaryCredentials({ CLOUDINARY_CLOUD_NAME: "tee-demo", CLOUDINARY_API_KEY: "123456789012345" }),
      null,
    );
    assert.equal(
      readCloudinaryCredentials({
        CLOUDINARY_CLOUD_NAME: "tee demo",
        CLOUDINARY_API_KEY: "1234",
        CLOUDINARY_API_SECRET: "s3cr3t_Secret",
      }),
      null,
    );
    assert.equal(parseCloudinaryUrl("https://123:abc@tee-demo"), null);
    assert.equal(parseCloudinaryUrl("cloudinary://tee-demo"), null);
  });
});

/** A response as Cloudinary would send it, signed with the test secret. */
function uploadResponse(
  overrides: Record<string, unknown> = {},
  secret = credentials.apiSecret,
): Record<string, unknown> {
  const publicId = (overrides.public_id as string | undefined) ?? "tailored-by-tee/media/k2x9abc";
  const version = (overrides.version as number | undefined) ?? 1790000123;
  return {
    asset_id: "b5e6d2b39ba3e0869d67141ba7dba6cf",
    public_id: publicId,
    version,
    signature: sha1(`public_id=${publicId}&version=${version}${secret}`),
    width: 2400,
    height: 3000,
    format: "jpg",
    resource_type: "image",
    type: "upload",
    bytes: 845_112,
    secure_url: `https://res.cloudinary.com/tee-demo/image/upload/v${version}/${publicId}.jpg`,
    colors: [
      ["#E9E4DA", 41.2],
      ["#2C2A26", 12.5],
    ],
    ...overrides,
  };
}

describe("verifying uploads", () => {
  it("accepts a genuine response", () => {
    const result = checkUploadResult(uploadResponse(), credentials);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.upload, {
        publicId: "tailored-by-tee/media/k2x9abc",
        version: 1790000123,
        format: "jpg",
        width: 2400,
        height: 3000,
        bytes: 845_112,
        url: "https://res.cloudinary.com/tee-demo/image/upload/v1790000123/tailored-by-tee/media/k2x9abc.jpg",
        color: "#e9e4da",
      });
    }
  });

  it("accepts a version sent as text and a SHA-256 signature", () => {
    const publicId = "k2x9abc";
    const version = 1790000123;
    const signature = createHash("sha256")
      .update(`public_id=${publicId}&version=${version}${credentials.apiSecret}`)
      .digest("hex");
    const response = uploadResponse({
      public_id: publicId,
      version: String(version),
      signature,
      secure_url: `https://res.cloudinary.com/tee-demo/image/upload/v${version}/${publicId}.jpg`,
    });
    assert.equal(checkUploadResult(response, credentials).ok, true);
  });

  it("refuses a response signed with another secret", () => {
    assert.equal(checkUploadResult(uploadResponse({}, "someone-elses-secret"), credentials).ok, false);
  });

  it("refuses a response whose public id or version was changed after signing", () => {
    const genuine = uploadResponse();
    assert.equal(
      checkUploadResult({ ...genuine, public_id: "tailored-by-tee/media/other" }, credentials).ok,
      false,
    );
    assert.equal(checkUploadResult({ ...genuine, version: 1790000124 }, credentials).ok, false);
  });

  it("refuses delivery addresses on another host, cloud, version or public id", () => {
    const genuine = uploadResponse();
    for (const secureUrl of [
      "https://evil.test/tee-demo/image/upload/v1790000123/tailored-by-tee/media/k2x9abc.jpg",
      "https://res.cloudinary.com/other-cloud/image/upload/v1790000123/tailored-by-tee/media/k2x9abc.jpg",
      "https://res.cloudinary.com/tee-demo/image/upload/v1/tailored-by-tee/media/k2x9abc.jpg",
      "https://res.cloudinary.com/tee-demo/image/upload/v1790000123/tailored-by-tee/media/other.jpg",
      "https://res.cloudinary.com/tee-demo/image/upload/v1790000123/tailored-by-tee/media/k2x9abc.jpg/../../x.jpg",
      "http://res.cloudinary.com/tee-demo/image/upload/v1790000123/tailored-by-tee/media/k2x9abc.jpg",
    ]) {
      assert.equal(
        checkUploadResult({ ...genuine, secure_url: secureUrl }, credentials).ok,
        false,
        secureUrl,
      );
    }
  });

  it("refuses other formats, resource types and oversized files", () => {
    assert.equal(checkUploadResult(uploadResponse({ format: "gif" }), credentials).ok, false);
    assert.equal(checkUploadResult(uploadResponse({ resource_type: "video" }), credentials).ok, false);
    assert.equal(checkUploadResult(uploadResponse({ type: "private" }), credentials).ok, false);
    assert.equal(checkUploadResult(uploadResponse({ bytes: 16 * 1024 * 1024 }), credentials).ok, false);
    assert.equal(checkUploadResult(uploadResponse({ width: 0 }), credentials).ok, false);
    assert.equal(checkUploadResult(null, credentials).ok, false);
    assert.equal(checkUploadResult("nonsense", credentials).ok, false);
  });

  it("treats Cloudinary's 'jpeg' as jpg", () => {
    const result = checkUploadResult(uploadResponse({ format: "jpeg" }), credentials);
    assert.equal(result.ok && result.upload.format, "jpg");
  });

  it("verifies response signatures in isolation", () => {
    const signature = sha1(`public_id=abc&version=12${credentials.apiSecret}`);
    assert.equal(
      verifyResponseSignature({ publicId: "abc", version: 12, signature }, credentials.apiSecret),
      true,
    );
    assert.equal(
      verifyResponseSignature(
        { publicId: "abc", version: 12, signature: signature.toUpperCase() },
        credentials.apiSecret,
      ),
      true,
    );
    assert.equal(
      verifyResponseSignature({ publicId: "abc", version: 13, signature }, credentials.apiSecret),
      false,
    );
    assert.equal(
      verifyResponseSignature({ publicId: "abc", version: 12, signature: "zz" }, credentials.apiSecret),
      false,
    );
  });
});

describe("predominantColor", () => {
  it("takes the first valid colour, lower-cased, without alpha", () => {
    assert.equal(
      predominantColor([
        ["#AABBCCDD", 50],
        ["#000000", 10],
      ]),
      "#aabbcc",
    );
    assert.equal(
      predominantColor([
        ["red", 50],
        ["#123456", 10],
      ]),
      "#123456",
    );
    assert.equal(predominantColor(undefined), null);
    assert.equal(predominantColor("nope"), null);
  });
});
