import test from "node:test";
import assert from "node:assert/strict";
import { createLatestRequest } from "../latestRequest";

test("older responses and closed modal sessions cannot replace current data", () => {
  const request = createLatestRequest();
  const old = request.begin(), current = request.begin();
  assert.equal(request.isCurrent(old), false);
  assert.equal(request.isCurrent(current), true);
  request.cancel();
  assert.equal(request.isCurrent(current), false);
  assert.equal(request.isCurrent(request.begin()), true);
});
