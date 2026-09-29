import assert from "node:assert/strict";
import {
  DEFAULT_VENSO_FEE_PERCENT,
  buildImportedPackageFeeState,
  buildVensoFeeSelectOptions,
  normalizeNullablePackageFee,
  resolveImportedPackageFee,
} from "../packageFeeUtils";

assert.equal(normalizeNullablePackageFee(15), 15);
assert.equal(normalizeNullablePackageFee("22.5"), 22.5);
assert.equal(resolveImportedPackageFee(10), 10);
assert.equal(resolveImportedPackageFee(null), DEFAULT_VENSO_FEE_PERCENT);

const fallback = buildImportedPackageFeeState({ operationalCosts: "3" }, null);
assert.equal(fallback.fee, "25");
assert.equal(fallback.childFee, "25");
assert.equal(fallback.feeMode, "percentage");

assert.deepEqual(buildVensoFeeSelectOptions(15), [25, 30, 35, 40, 45, 15]);
assert.deepEqual(buildVensoFeeSelectOptions(30), [25, 30, 35, 40, 45]);
assert.equal(normalizeNullablePackageFee(-1), null);
assert.equal(normalizeNullablePackageFee(101), null);

console.log("package fee utils: PASS");
