import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categoryCodeProblem, exampleSku, normaliseCategoryCode, suggestCategoryCode } from "./category-code";

describe("normaliseCategoryCode", () => {
  it("trims and upper-cases what the owner typed", () => {
    assert.equal(normaliseCategoryCode(" shr "), "SHR");
    assert.equal(normaliseCategoryCode("Knt"), "KNT");
    assert.equal(normaliseCategoryCode(""), "");
  });
});

describe("categoryCodeProblem", () => {
  it("accepts exactly three letters", () => {
    assert.equal(categoryCodeProblem("SHR"), null);
    assert.equal(categoryCodeProblem("TSH"), null);
  });

  it("asks for a code when empty", () => {
    assert.match(categoryCodeProblem("") ?? "", /Enter a three-letter code/);
  });

  it("refuses the wrong length, digits and lower case", () => {
    for (const code of ["SH", "SHRT", "SH1", "shr", "S R", "SH-"]) {
      assert.match(categoryCodeProblem(code) ?? "", /exactly three letters/, code);
    }
  });
});

describe("suggestCategoryCode", () => {
  it("takes the first letter, then consonants", () => {
    assert.equal(suggestCategoryCode("Shirts"), "SHR");
    assert.equal(suggestCategoryCode("Knitwear"), "KNT");
    assert.equal(suggestCategoryCode("Trousers"), "TRS");
  });

  it("falls back to vowels, then padding, for short names", () => {
    assert.equal(suggestCategoryCode("Tie"), "TIE");
    assert.equal(suggestCategoryCode("Ai"), "AIX");
    assert.equal(suggestCategoryCode("A"), "AXX");
  });

  it("ignores punctuation and accents", () => {
    assert.equal(suggestCategoryCode("T-Shirts"), "TSH");
    assert.equal(suggestCategoryCode("Écharpes"), "ECH");
  });

  it("returns nothing when the name has no letters", () => {
    assert.equal(suggestCategoryCode(""), "");
    assert.equal(suggestCategoryCode("123 —"), "");
  });

  it("always suggests three letters for a name that has any", () => {
    for (const name of ["Shirts", "Tie", "A", "T-Shirts", "Outerwear", "Éé"]) {
      assert.equal(suggestCategoryCode(name).length, 3, name);
    }
  });

  it("steps around codes already in use", () => {
    assert.equal(suggestCategoryCode("Shirts", ["SHR"]), "SHT");
    assert.notEqual(suggestCategoryCode("Knitwear", ["KNT"]), "KNT");
  });

  it("gives up gracefully when every combination is taken", () => {
    const every = ["SHR", "SHT", "SHI", "SRT", "SRI", "STI", "SHX", "SRX", "STX", "SIX"];
    assert.equal(suggestCategoryCode("Shirts", every).length, 3);
  });
});

describe("exampleSku", () => {
  it("shows the code in its place in a real SKU", () => {
    assert.equal(exampleSku("SHR"), "TBT-SHR-KPL-SND-M");
  });

  it("masks a code that isn't ready yet", () => {
    assert.equal(exampleSku(""), "TBT-???-KPL-SND-M");
    assert.equal(exampleSku("SH"), "TBT-???-KPL-SND-M");
    assert.equal(exampleSku("shr"), "TBT-???-KPL-SND-M");
  });
});
