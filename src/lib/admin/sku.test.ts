import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSku } from "@/lib/catalog/mappers";
import { CATEGORY_SEEDS } from "@/lib/catalog/seed/categories";
import { COLORS, colorSkuCode, type ColorId } from "@/lib/catalog/seed/colors";
import { PRODUCT_SEEDS } from "@/lib/catalog/seed/products";
import { SIZES, sizeSkuCode, type SizeId } from "@/lib/catalog/seed/sizes";

import {
  COLOR_CODE_PATTERN,
  SIZE_CODE_PATTERN,
  buildVariantSku,
  colorCodeProblem,
  normaliseSkuCode,
  parseVariantSku,
  sizeCodeProblem,
  skuPartProblem,
  suggestColorCode,
  suggestSizeCode,
} from "./sku";

const categoryCodes = new Map<string, string>(CATEGORY_SEEDS.map((seed) => [seed.slug, seed.code]));

describe("buildVariantSku", () => {
  it("reproduces every seeded SKU exactly", () => {
    let checked = 0;
    for (const seed of PRODUCT_SEEDS) {
      const categoryCode = categoryCodes.get(seed.category);
      assert.ok(categoryCode, `category ${seed.category} has a code`);
      for (const colorId of seed.colors) {
        for (const sizeId of seed.sizes) {
          const seeded = buildSku(categoryCode, seed, colorId, sizeId);
          const built = buildVariantSku({
            categoryCode,
            productCode: seed.code,
            colorCode: colorSkuCode(colorId),
            sizeCode: sizeSkuCode(sizeId),
          });
          assert.equal(built, seeded);
          checked++;
        }
      }
    }
    assert.ok(checked > 100, `checked ${checked} seeded SKUs`);
  });

  it("builds the documented example", () => {
    assert.equal(
      buildVariantSku({ categoryCode: "KNT", productCode: "KPL", colorCode: "SND", sizeCode: "M" }),
      "TBT-KNT-KPL-SND-M",
    );
  });

  it("normalises case and spaces around codes", () => {
    assert.equal(
      buildVariantSku({ categoryCode: " knt", productCode: "kpl ", colorCode: "Snd", sizeCode: "os" }),
      "TBT-KNT-KPL-SND-OS",
    );
  });

  it("refuses parts that would break the format", () => {
    for (const bad of ["", "K-T", "K T", "KN£", "ABCDEFGHIJK"]) {
      assert.throws(
        () => buildVariantSku({ categoryCode: bad, productCode: "KPL", colorCode: "SND", sizeCode: "M" }),
        RangeError,
      );
      assert.throws(
        () => buildVariantSku({ categoryCode: "KNT", productCode: "KPL", colorCode: "SND", sizeCode: bad }),
        RangeError,
      );
    }
  });

  it("round-trips through parseVariantSku", () => {
    const parts = { categoryCode: "DNM", productCode: "SLV", colorCode: "IND", sizeCode: "32" };
    assert.deepEqual(parseVariantSku(buildVariantSku(parts)), parts);
  });
});

describe("parseVariantSku", () => {
  it("rejects anything outside the format", () => {
    assert.equal(parseVariantSku("TBT-KNT-KPL-SND"), null);
    assert.equal(parseVariantSku("ABC-KNT-KPL-SND-M"), null);
    assert.equal(parseVariantSku("TBT-KNT-KPL-SND-M-X"), null);
    assert.equal(parseVariantSku("TBT-knt-KPL-SND-M"), null);
    assert.equal(parseVariantSku("TBT--KPL-SND-M"), null);
  });

  it("reads every seeded SKU's first three parts as the product code, like the structured data", () => {
    const seed = PRODUCT_SEEDS[0];
    const categoryCode = categoryCodes.get(seed.category) ?? "";
    const sku = buildSku(categoryCode, seed, seed.colors[0], seed.sizes[0]);
    const parsed = parseVariantSku(sku);
    assert.ok(parsed);
    assert.equal(sku.split("-").slice(0, 3).join("-"), `TBT-${parsed.categoryCode}-${parsed.productCode}`);
  });
});

describe("codes", () => {
  it("accepts every seeded colour, size and category code", () => {
    for (const color of COLORS) {
      const code = colorSkuCode(color.id as ColorId);
      assert.match(code, COLOR_CODE_PATTERN);
      assert.equal(colorCodeProblem(code), null);
    }
    for (const size of SIZES) {
      const code = sizeSkuCode(size.id as SizeId);
      assert.match(code, SIZE_CODE_PATTERN);
      assert.equal(sizeCodeProblem(code), null);
    }
    for (const category of CATEGORY_SEEDS) assert.equal(skuPartProblem("category", category.code), null);
    for (const product of PRODUCT_SEEDS) assert.equal(skuPartProblem("product", product.code), null);
  });

  it("explains codes that can't be used", () => {
    assert.match(colorCodeProblem("") ?? "", /three-letter/);
    assert.match(colorCodeProblem("SN") ?? "", /exactly three letters/);
    assert.match(colorCodeProblem("SN1") ?? "", /exactly three letters/);
    assert.equal(colorCodeProblem(" snd "), null);
    assert.match(sizeCodeProblem("") ?? "", /short code/);
    assert.match(sizeCodeProblem("X L") ?? "", /no spaces/);
    assert.match(sizeCodeProblem("XXXXXL") ?? "", /up to 5/);
    assert.equal(sizeCodeProblem("3xl"), null);
    assert.match(skuPartProblem("product", "K-P") ?? "", /product code “K-P”/);
    assert.match(skuPartProblem("category", " ") ?? "", /category code is missing/);
  });

  it("normalises codes", () => {
    assert.equal(normaliseSkuCode("  snd "), "SND");
  });
});

describe("suggestColorCode", () => {
  const none: string[] = [];

  it("follows the seeded style for most colours", () => {
    const expected: Record<string, string> = {
      Sand: "SND",
      Stone: "STN",
      Camel: "CML",
      Clay: "CLY",
      Navy: "NVY",
      Slate: "SLT",
      Olive: "OLV",
      Sage: "SGE",
      Ink: "INK",
      Ecru: "ECR",
      Charcoal: "CHR",
      Chocolate: "CHC",
      "Pale Blue": "PBL",
    };
    for (const [name, code] of Object.entries(expected)) assert.equal(suggestColorCode(name, none), code, name);
  });

  it("never suggests a code already in use", () => {
    const taken = COLORS.map((color) => colorSkuCode(color.id as ColorId));
    for (const name of ["Sand", "Stone", "Sandstone", "Ink", "Navy Blue", "Oat", "Ox"]) {
      const code = suggestColorCode(name, taken);
      assert.ok(code, name);
      assert.match(code, COLOR_CODE_PATTERN);
      assert.ok(!taken.includes(code), `${name} → ${code} is free`);
    }
  });

  it("ignores accents and punctuation, and gives up without letters", () => {
    assert.equal(suggestColorCode("Écru", none), "ECR");
    assert.equal(suggestColorCode("  mid-wash ", none), "MWS");
    assert.equal(suggestColorCode("123", none), null);
    assert.equal(suggestColorCode("", none), null);
  });

  it("is case-insensitive about taken codes", () => {
    assert.notEqual(suggestColorCode("Sand", ["snd"]), "SND");
  });
});

describe("suggestSizeCode", () => {
  it("uses a short label as it is, and initials for longer ones", () => {
    assert.equal(suggestSizeCode("XXXL", []), "XXXL");
    assert.equal(suggestSizeCode("40", []), "40");
    assert.equal(suggestSizeCode("3xl", []), "3XL");
    assert.equal(suggestSizeCode("One Size", []), "OS");
  });

  it("gives up when the code is taken or can't be made", () => {
    assert.equal(suggestSizeCode("M", ["M"]), null);
    assert.equal(suggestSizeCode("Extra Extra Extra Extra Extra Large", []), null);
    assert.equal(suggestSizeCode("—", []), null);
  });
});
