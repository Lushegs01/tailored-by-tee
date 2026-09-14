import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatNigerianPhone, normalizeNigerianPhone } from "./phone";

describe("normalizeNigerianPhone", () => {
  it("accepts the ways people write Nigerian mobile numbers", () => {
    for (const input of ["08031234567", "0803 123 4567", "+2348031234567", "234 803 123 4567", "803-123-4567", "(0803) 123-4567"]) {
      assert.equal(normalizeNigerianPhone(input), "+2348031234567", input);
    }
  });

  it("covers the 70x, 81x, 90x and 91x ranges", () => {
    assert.equal(normalizeNigerianPhone("07011112222"), "+2347011112222");
    assert.equal(normalizeNigerianPhone("08111112222"), "+2348111112222");
    assert.equal(normalizeNigerianPhone("09051112222"), "+2349051112222");
    assert.equal(normalizeNigerianPhone("09151112222"), "+2349151112222");
  });

  it("forgives a zero kept after the country code", () => {
    assert.equal(normalizeNigerianPhone("+234 0803 123 4567"), "+2348031234567");
  });

  it("rejects anything that is not a Nigerian mobile number", () => {
    for (const input of ["", "12345", "0803123456", "080312345678", "+447911123456", "06031234567", "0823 123 4567", "0803abc4567"]) {
      assert.equal(normalizeNigerianPhone(input), null, input);
    }
  });
});

describe("formatNigerianPhone", () => {
  it("groups an E.164 number for display", () => {
    assert.equal(formatNigerianPhone("+2348031234567"), "+234 803 123 4567");
  });

  it("returns anything unexpected unchanged", () => {
    assert.equal(formatNigerianPhone("not a number"), "not a number");
  });
});
