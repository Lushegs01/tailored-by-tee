import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  changedPositions,
  currentPlaceAfter,
  moveInOrder,
  PLACE_FIRST,
  placeAfter,
  positionOptions,
} from "./ordering";

const LIST = ["a", "b", "c", "d"];

describe("moveInOrder", () => {
  it("swaps an item with its neighbour", () => {
    assert.deepEqual(moveInOrder(LIST, "c", "up"), ["a", "c", "b", "d"]);
    assert.deepEqual(moveInOrder(LIST, "b", "down"), ["a", "c", "b", "d"]);
  });

  it("leaves the original list alone", () => {
    moveInOrder(LIST, "c", "up");
    assert.deepEqual(LIST, ["a", "b", "c", "d"]);
  });

  it("returns null at the ends and for an unknown id", () => {
    assert.equal(moveInOrder(LIST, "a", "up"), null);
    assert.equal(moveInOrder(LIST, "d", "down"), null);
    assert.equal(moveInOrder(LIST, "z", "up"), null);
    assert.equal(moveInOrder([], "a", "down"), null);
    assert.equal(moveInOrder(["only"], "only", "up"), null);
    assert.equal(moveInOrder(["only"], "only", "down"), null);
  });
});

describe("placeAfter", () => {
  it("moves an existing item behind the chosen one", () => {
    assert.deepEqual(placeAfter(LIST, "a", "c"), ["b", "c", "a", "d"]);
    assert.deepEqual(placeAfter(LIST, "d", "a"), ["a", "d", "b", "c"]);
  });

  it("puts an item first", () => {
    assert.deepEqual(placeAfter(LIST, "c", PLACE_FIRST), ["c", "a", "b", "d"]);
  });

  it("adds a new item after the chosen one, or last", () => {
    assert.deepEqual(placeAfter(LIST, "new", "b"), ["a", "b", "new", "c", "d"]);
    assert.deepEqual(placeAfter(LIST, "new", "d"), ["a", "b", "c", "d", "new"]);
    assert.deepEqual(placeAfter([], "new", PLACE_FIRST), ["new"]);
  });

  it("keeps the order when the anchor has gone, and adds a new item last", () => {
    assert.deepEqual(placeAfter(LIST, "b", "gone"), ["a", "b", "c", "d"]);
    assert.deepEqual(placeAfter(LIST, "new", "gone"), ["a", "b", "c", "d", "new"]);
  });

  it("is a no-op when asked to follow itself", () => {
    assert.deepEqual(placeAfter(LIST, "b", "b"), ["a", "b", "c", "d"]);
  });

  it("never drops or duplicates an item", () => {
    for (const id of [...LIST, "new"]) {
      for (const anchor of [PLACE_FIRST, ...LIST, "gone"]) {
        const result = placeAfter(LIST, id, anchor);
        assert.equal(new Set(result).size, result.length, `${id} after ${anchor}`);
        for (const existing of LIST) assert.ok(result.includes(existing), `${existing} kept`);
      }
    }
  });
});

describe("currentPlaceAfter", () => {
  it("names what comes before the item", () => {
    assert.equal(currentPlaceAfter(LIST, "a"), PLACE_FIRST);
    assert.equal(currentPlaceAfter(LIST, "c"), "b");
    assert.equal(currentPlaceAfter(LIST, "unknown"), PLACE_FIRST);
  });

  it("round-trips with placeAfter, leaving the order unchanged", () => {
    for (const id of LIST) {
      assert.deepEqual(placeAfter(LIST, id, currentPlaceAfter(LIST, id)), LIST);
    }
  });
});

describe("changedPositions", () => {
  it("returns only the rows whose stored position is wrong", () => {
    const current = new Map([
      ["a", 0],
      ["b", 5],
      ["c", 2],
    ]);
    assert.deepEqual(changedPositions(["a", "b", "c"], current), [["b", 1]]);
  });

  it("returns nothing when every position already matches", () => {
    const current = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    assert.deepEqual(changedPositions(["a", "b"], current), []);
  });

  it("gives a new item its position", () => {
    assert.deepEqual(changedPositions(["new"], new Map()), [["new", 0]]);
  });

  it("closes gaps left by older data", () => {
    const current = new Map([
      ["a", 3],
      ["b", 9],
    ]);
    assert.deepEqual(changedPositions(["a", "b"], current), [
      ["a", 0],
      ["b", 1],
    ]);
  });
});

describe("positionOptions", () => {
  it("offers First, then each other item, with the last marked Last", () => {
    assert.deepEqual(
      positionOptions([
        { id: "a", name: "Harmattan" },
        { id: "b", name: "Essentials" },
      ]),
      [
        { value: PLACE_FIRST, label: "First (before Harmattan)" },
        { value: "a", label: "After Harmattan" },
        { value: "b", label: "Last (after Essentials)" },
      ],
    );
  });

  it("offers only First when there is nothing else", () => {
    assert.deepEqual(positionOptions([]), [{ value: PLACE_FIRST, label: "First" }]);
  });

  it("marks the only other item as Last", () => {
    assert.deepEqual(positionOptions([{ id: "a", name: "Harmattan" }]), [
      { value: PLACE_FIRST, label: "First (before Harmattan)" },
      { value: "a", label: "Last (after Harmattan)" },
    ]);
  });
});
