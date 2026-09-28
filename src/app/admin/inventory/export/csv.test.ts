import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("quotes text and doubles its quotes", () => {
    assert.equal(csvCell("Knitted Polo"), '"Knitted Polo"');
    assert.equal(csvCell('The "Lagos" shirt, linen'), '"The ""Lagos"" shirt, linen"');
    assert.equal(csvCell("two\nlines"), '"two\nlines"');
  });

  it("writes numbers as numbers and empties as nothing", () => {
    assert.equal(csvCell(12), "12");
    assert.equal(csvCell(-3), "-3");
    assert.equal(csvCell(0), "0");
    assert.equal(csvCell(Number.NaN), "");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(true), '"Yes"');
    assert.equal(csvCell(false), '"No"');
  });

  it("defuses anything a spreadsheet would run as a formula", () => {
    for (const text of [
      "=1+1",
      "+234 800",
      "-5",
      "@SUM(A1)",
      "\t=cmd",
      "\r=cmd",
      '  =HYPERLINK("x")',
      "\uFF1D1+1",
    ]) {
      const cell = csvCell(text);
      assert.ok(cell.startsWith(`"'`), `${JSON.stringify(text)} → ${cell}`);
    }
  });

  it("leaves ordinary text alone", () => {
    for (const text of ["TBT-KNT-KPL-SND-M", "Sand", "M", "1 + 1", "a=b", "email@example.com"]) {
      assert.equal(csvCell(text), `"${text}"`);
    }
  });
});

describe("toCsv", () => {
  it("builds a UTF-8 document with a BOM and CRLF line endings", () => {
    const csv = toCsv(
      ["Product", "On hand"],
      [
        ["Knitted Polo", 12],
        ["=evil()", 0],
      ],
    );
    assert.equal(csv, '\uFEFF"Product","On hand"\r\n"Knitted Polo",12\r\n"\'=evil()",0\r\n');
  });

  it("handles an empty export", () => {
    assert.equal(toCsv(["Product"], []), '\uFEFF"Product"\r\n');
  });
});
