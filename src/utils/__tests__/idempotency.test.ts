import test from "node:test";
import assert from "node:assert/strict";
import {
  createClientResourceId,
  createIdempotencyKey,
  getIdempotencyHeaders,
} from "../idempotency.js";

test("idempotency key keeps scope/resource and stays within backend limit", () => {
  const key = createIdempotencyKey("voucher venta", "COT 001/2026");
  assert.match(key, /^voucher-venta:COT-001-2026:/);
  assert.ok(key.length <= 128);
});

test("separate attempts receive separate idempotency keys", () => {
  const first = createIdempotencyKey("voucher-reserva", "COT-001");
  const second = createIdempotencyKey("voucher-reserva", "COT-001");
  assert.notEqual(first, second);
});

test("client resource ids are sanitized and bounded", () => {
  const id = createClientResourceId("VR", " COT/001 prueba ", 50);
  assert.match(id, /^VR-COT-001-prueba-/);
  assert.ok(id.length <= 50);
});

test("headers are emitted only when a key exists", () => {
  assert.deepEqual(getIdempotencyHeaders("scope:resource:key"), {
    "Idempotency-Key": "scope:resource:key",
  });
  assert.equal(getIdempotencyHeaders(""), undefined);
  assert.equal(getIdempotencyHeaders(null), undefined);
});
