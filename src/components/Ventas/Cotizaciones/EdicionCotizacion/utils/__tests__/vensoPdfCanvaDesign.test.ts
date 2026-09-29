import assert from "node:assert/strict";
import {
  VENSO_CANVA_PAGE_ASPECT,
  buildVensoCanvaPageSequence,
  getVensoCanvaPageCount,
  resolveVensoCanvaCoverImages,
  setVensoCanvaCoverImage,
} from "../vensoPdfCanvaDesign";

const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
};

test("Venso Canva pages use the portrait 4:5 ratio", () => {
  assert.equal(VENSO_CANVA_PAGE_ASPECT, 0.8);
});

test("page sequence mirrors the direct renderer without legacy landscape pages", () => {
  assert.deepEqual(buildVensoCanvaPageSequence(3), [
    "cover",
    "day-0",
    "day-1",
    "day-2",
    "pricing",
    "reservation-conditions",
    "purchase-terms",
  ]);
  assert.equal(getVensoCanvaPageCount(3), 7);
});

test("legacy cover media expands to a three-panel Canva cover", () => {
  const images = resolveVensoCanvaCoverImages({
    cover: "cover.webp",
    days: {
      0: { images: ["day-one.webp"] },
      1: { images: ["day-two.webp"] },
    },
  });
  assert.deepEqual(images, ["cover.webp", "day-one.webp", "day-two.webp"]);
});

test("explicit coverImages remain authoritative and preserve legacy cover", () => {
  const next = setVensoCanvaCoverImage(
    { cover: "legacy.webp", coverImages: ["a.webp", "b.webp", "c.webp"] },
    1,
    "replacement.webp",
  );
  assert.deepEqual(next.coverImages, ["a.webp", "replacement.webp", "c.webp"]);
  assert.equal(next.cover, "a.webp");
});


test("removing a persisted cover panel keeps that slot empty", () => {
  const removed = setVensoCanvaCoverImage(
    { cover: "a.webp", coverImages: ["a.webp", "b.webp", "c.webp"] },
    1,
    null,
  );
  assert.deepEqual(removed.coverImages, ["a.webp", null, "c.webp"]);
  assert.deepEqual(resolveVensoCanvaCoverImages(removed), ["a.webp", null, "c.webp"]);
});

console.log("vensoPdfCanvaDesign: PASS");
