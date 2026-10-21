import assert from "node:assert/strict";
import {
  canonicalCategory,
  isNewCategory,
  mergeCategoryOptions,
} from "../categoryOptions";

{
  const merged = mergeCategoryOptions(
    ["Monitor", "CPU", "Cámara web"],
    ["monitor ", "  Laptop", "camara  web", "", null],
  );
  assert.deepEqual(merged, ["Cámara web", "CPU", "Laptop", "Monitor"]);
}

{
  const options = ["Cámara web", "Monitor"];
  assert.equal(canonicalCategory("  monitor ", options), "Monitor");
  assert.equal(canonicalCategory("camara web", options), "Cámara web");
  assert.equal(canonicalCategory("  Silla   ergonómica ", options), "Silla ergonómica");
}

{
  const options = ["Monitor"];
  assert.equal(isNewCategory("MONITOR", options), false);
  assert.equal(isNewCategory("Silla", options), true);
  assert.equal(isNewCategory("   ", options), false);
}

console.log("categoryOptions tests passed");
