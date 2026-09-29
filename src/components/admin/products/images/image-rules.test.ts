import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultRoleForNewImage,
  imageNotices,
  imagesToDemote,
  inPhotoOrder,
  moveInOrder,
  storefrontImage,
  storefrontPreview,
  type ImageRole,
  type RuleImage,
} from "./image-rules";

const image = (
  id: string,
  role: ImageRole,
  colorId: string | null,
  position: number,
  alt = `Photo ${id}`,
) => ({
  id,
  role,
  colorId,
  position,
  alt,
});

const colors = [
  { id: "sand", name: "Sand" },
  { id: "clay", name: "Clay" },
];
const colorIds = colors.map((color) => color.id);

describe("storefrontImage (mirrors findImage in lib/catalog/mappers.ts)", () => {
  const images: RuleImage[] = [
    image("a", "GALLERY", null, 0),
    image("b", "PRIMARY", "clay", 1),
    image("c", "PRIMARY", "sand", 2),
    image("d", "ALTERNATE", null, 3),
  ];

  it("prefers the colour's own photo", () => {
    assert.equal(storefrontImage(images, "PRIMARY", colorIds, "clay")?.id, "b");
    assert.equal(storefrontImage(images, "PRIMARY", colorIds, "sand")?.id, "c");
  });

  it("falls back to an all-colours photo or the first colour's", () => {
    assert.equal(storefrontImage(images, "PRIMARY", colorIds)?.id, "c");
    assert.equal(storefrontImage(images, "ALTERNATE", colorIds, "clay")?.id, "d");
  });

  it("falls back to the first photo of that role, then nothing", () => {
    assert.equal(storefrontImage([image("x", "PRIMARY", "clay", 0)], "PRIMARY", colorIds)?.id, "x");
    assert.equal(storefrontImage(images, "DETAIL", colorIds), null);
  });

  it("follows photo order, not array order", () => {
    const shuffled = [image("late", "PRIMARY", null, 5), image("early", "PRIMARY", "sand", 1)];
    assert.equal(storefrontImage(shuffled, "PRIMARY", colorIds)?.id, "early");
    assert.deepEqual(
      inPhotoOrder(shuffled).map((item) => item.id),
      ["early", "late"],
    );
  });
});

describe("rules for changes", () => {
  it("starts new photos as main, then hover, then gallery", () => {
    assert.equal(defaultRoleForNewImage([]), "PRIMARY");
    assert.equal(defaultRoleForNewImage([image("a", "PRIMARY", null, 0)]), "ALTERNATE");
    assert.equal(
      defaultRoleForNewImage([image("a", "PRIMARY", null, 0), image("b", "ALTERNATE", null, 1)]),
      "GALLERY",
    );
  });

  it("demotes only the same exclusive role for the same colour", () => {
    const images = [
      image("a", "PRIMARY", "sand", 0),
      image("b", "PRIMARY", null, 1),
      image("c", "ALTERNATE", "sand", 2),
      image("d", "PRIMARY", "sand", 3),
    ];
    assert.deepEqual(
      imagesToDemote(images, { id: "d", role: "PRIMARY", colorId: "sand" }).map((item) => item.id),
      ["a"],
    );
    assert.deepEqual(
      imagesToDemote(images, { id: null, role: "PRIMARY", colorId: null }).map((item) => item.id),
      ["b"],
    );
    assert.deepEqual(imagesToDemote(images, { id: "a", role: "GALLERY", colorId: "sand" }), []);
  });

  it("moves photos one place at a time", () => {
    assert.deepEqual(moveInOrder(["a", "b", "c"], "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveInOrder(["a", "b", "c"], "b", "down"), ["a", "c", "b"]);
    assert.equal(moveInOrder(["a", "b", "c"], "a", "up"), null);
    assert.equal(moveInOrder(["a", "b", "c"], "c", "down"), null);
    assert.equal(moveInOrder(["a", "b", "c"], "z", "down"), null);
  });
});

describe("storefrontPreview", () => {
  it("describes cards, the product page and bag lines", () => {
    const preview = storefrontPreview(
      [image("m", "PRIMARY", "sand", 0), image("h", "ALTERNATE", "sand", 1), image("g", "GALLERY", null, 2)],
      colorIds,
    );
    assert.deepEqual(preview, {
      cardImageId: "m",
      hoverImageId: "h",
      galleryIds: ["m", "h", "g"],
      opensOnColorId: "sand",
      bag: [
        { colorId: "sand", imageId: "m", own: true },
        { colorId: "clay", imageId: "m", own: false },
      ],
    });
  });

  it("counts an all-colours main image as every colour's own", () => {
    const preview = storefrontPreview([image("m", "PRIMARY", null, 0)], colorIds);
    assert.equal(preview.opensOnColorId, null);
    assert.ok(preview.bag.every((line) => line.own && line.imageId === "m"));
  });
});

describe("imageNotices", () => {
  it("is critical when a live product has no photos or no main image", () => {
    assert.equal(imageNotices({ images: [], colors, status: "ACTIVE" })[0].tone, "critical");
    const noMain = imageNotices({ images: [image("g", "GALLERY", null, 0)], colors, status: "ACTIVE" });
    assert.equal(noMain[0].tone, "critical");
    assert.match(noMain[0].text, /no main image/);
  });

  it("only asks for attention on drafts", () => {
    assert.equal(imageNotices({ images: [], colors, status: "DRAFT" })[0].tone, "attention");
    assert.equal(
      imageNotices({ images: [image("g", "GALLERY", null, 0)], colors, status: "DRAFT" })[0].tone,
      "attention",
    );
  });

  it("is quiet for a complete set", () => {
    const images = [
      image("m1", "PRIMARY", "sand", 0),
      image("h", "ALTERNATE", null, 1),
      image("m2", "PRIMARY", "clay", 2),
    ];
    assert.deepEqual(imageNotices({ images, colors, status: "ACTIVE" }), []);
  });

  it("points out gaps and oddities", () => {
    const images = [
      image("g", "GALLERY", null, 0, ""),
      image("m", "PRIMARY", "sand", 1),
      image("x", "DETAIL", "stone", 2),
    ];
    const texts = imageNotices({ images, colors, status: "ACTIVE" }).map((notice) => notice.text);
    assert.ok(texts.some((text) => text.startsWith("Photo 3 is marked for a colour")));
    assert.ok(texts.some((text) => text.startsWith("Photo 1 has no description")));
    assert.ok(texts.some((text) => text.includes("no hover image")));
    assert.ok(texts.some((text) => text.startsWith("Clay has no main image of its own")));
    assert.ok(texts.some((text) => text.includes("shop cards show photo 2")));
  });
});
