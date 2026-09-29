import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import {
  fieldError,
  formDataToObject,
  parseInput,
  zCheckbox,
  zId,
  zInt,
  zList,
  zNaira,
  zOneOf,
  zOptionalInt,
  zOptionalNaira,
  zOptionalText,
  zText,
} from "./validation";

const schema = z.object({
  id: zId(),
  name: zText({ max: 10, required: "Enter a name.", label: "Name" }),
  note: zOptionalText({ max: 5 }),
  featured: zCheckbox(),
  stock: zInt({ min: 0, max: 100, label: "Stock" }),
  rank: zOptionalInt({ min: 1 }),
  price: zNaira({ min: 100 }),
  compare: zOptionalNaira(),
  details: zList({ maxItems: 2, maxLength: 5 }),
  status: zOneOf(["DRAFT", "ACTIVE"]),
});

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("formDataToObject", () => {
  it("keeps single values, groups repeated keys and drops Next's action fields", () => {
    const result = formDataToObject(
      form([
        ["$ACTION_ID_abc", "x"],
        ["name", "Polo"],
        ["details", "a"],
        ["details", "b"],
      ]),
    );
    assert.deepEqual(result, { name: "Polo", details: ["a", "b"] });
  });
});

describe("parseInput", () => {
  it("parses a valid form into typed values", () => {
    const result = parseInput(
      schema,
      form([
        ["id", "prod_knitted-polo"],
        ["name", "  Polo "],
        ["featured", "on"],
        ["stock", "1,0"],
        ["rank", ""],
        ["price", "₦12,500.50"],
        ["compare", ""],
        ["details", "a"],
        ["details", " "],
        ["details", "bb"],
        ["status", "ACTIVE"],
      ]),
    );
    assert.deepEqual(result, {
      ok: true,
      data: {
        id: "prod_knitted-polo",
        name: "Polo",
        note: null,
        featured: true,
        stock: 10,
        rank: null,
        price: 1_250_050,
        compare: null,
        details: ["a", "bb"],
        status: "ACTIVE",
      },
    });
  });

  it("maps every problem to its field with a plain message", () => {
    const result = parseInput(
      schema,
      form([
        ["name", ""],
        ["note", "123456"],
        ["stock", "abc"],
        ["rank", "0"],
        ["price", "12,50"],
        ["compare", "-5"],
        ["details", "toolong"],
        ["status", "X"],
      ]),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.message, "Please check the highlighted fields.");
    assert.equal(result.fieldErrors.name, "Enter a name.");
    assert.equal(result.fieldErrors.note, "This must be 5 characters or fewer.");
    assert.equal(result.fieldErrors.stock, "Enter a whole number.");
    assert.equal(result.fieldErrors.rank, "This must be 1 or more.");
    assert.equal(result.fieldErrors.price, "Enter an amount in naira, e.g. 12,500 or 12,500.50.");
    assert.equal(result.fieldErrors.compare, "Enter an amount in naira, e.g. 12,500 or 12,500.50.");
    assert.equal(result.fieldErrors.status, "Choose one of the options.");
    assert.ok(result.fieldErrors.id);
    assert.equal(fieldError(result.fieldErrors, "details"), "Each line must be 5 characters or fewer.");
    assert.equal(featuredIsNeverAnError(result.fieldErrors), true);
  });

  it("uses the required message when a field is missing entirely", () => {
    const result = parseInput(schema, {});
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.fieldErrors.name, "Enter a name.");
    assert.equal(result.fieldErrors.stock, "Enter a whole number.");
    assert.equal(result.fieldErrors.price, "Enter an amount.");
  });

  it("enforces minimum amounts in naira", () => {
    const result = parseInput(z.object({ price: zNaira({ min: 100_00, label: "Price" }) }), { price: "50" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.fieldErrors.price, "Price must be at least ₦100.");
  });

  it("reports whole-form problems as the message", () => {
    const result = parseInput(
      z.object({ price: zNaira() }).refine(() => false, "The sale price must be lower than the original price."),
      { price: "5" },
    );
    assert.deepEqual(result, {
      ok: false,
      message: "The sale price must be lower than the original price.",
      fieldErrors: {},
    });
  });

  it("rejects ids that could be anything but an id", () => {
    for (const id of ["", "a b", "x'; DROP TABLE", "../etc", "a".repeat(200)]) {
      assert.equal(parseInput(zId(), id).ok, false, id);
    }
    for (const id of ["clx2abc123", "prod_knitted-polo", "var_tbt-knt-kpl-snd-m"]) {
      assert.equal(parseInput(zId(), id).ok, true, id);
    }
  });

  it("caps list length", () => {
    const result = parseInput(zList({ maxItems: 2 }), ["a", "b", "c"]);
    assert.equal(result.ok, false);
  });
});

function featuredIsNeverAnError(errors: Record<string, string>): boolean {
  return !("featured" in errors);
}
