import test from "node:test";
import assert from "node:assert/strict";
import { BibliaReadCache, getBibliaCalendarPeriod } from "../bibliaReadCache";
import { isBibliaMutation } from "../../../../../utils/bibliaCacheEvents";

test("month navigation reuses cached data and simultaneous reads share one request", async () => {
  const cache = new BibliaReadCache<number>();
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.get("nov", load), cache.get("nov", load)]), [1, 1]);
  assert.equal(await cache.get("dec", load), 2);
  assert.equal(await cache.get("nov", load), 1);
  assert.equal(calls, 2);
  cache.clear();
  assert.equal(await cache.get("nov", load), 3);
});

test("a read that finishes after a write reloads fresh data for every awaiting caller", async () => {
  const cache = new BibliaReadCache<number>();
  let complete: (value: number) => void;
  let calls = 0;
  const load = () => ++calls === 1 ? new Promise<number>(resolve => { complete = resolve; }) : Promise.resolve(2);
  const first = cache.get("nov", load);
  const second = cache.get("nov", load);
  await Promise.resolve();
  cache.clear();
  complete!(1);
  assert.deepEqual(await Promise.all([first, second]), [2, 2]);
  assert.equal(await cache.get("nov", load), 2);
  assert.equal(calls, 2);
});

test("failed requests are retried, session scopes are isolated, and expiry and LRU bound history", async () => {
  let now = 0;
  const cache = new BibliaReadCache<number>(100, 2, () => now);
  let calls = 0;
  const load = async () => ++calls;
  await assert.rejects(cache.get("failed", async () => { throw new Error("offline"); }));
  assert.equal(await cache.get("failed", load), 1);
  assert.equal(await cache.get("user-a/nov", load), 2);
  assert.equal(await cache.get("user-b/nov", load), 3);
  assert.equal(await cache.get("failed", load), 4);
  now = 101;
  assert.equal(await cache.get("failed", load), 5);
});

test("the requested month period covers year transitions, leap days and every visible grid cell", () => {
  assert.deepEqual(getBibliaCalendarPeriod(new Date(2026, 10, 5)), { startDate: "2026-10-26", endDate: "2026-12-06" });
  assert.deepEqual(getBibliaCalendarPeriod(new Date(2027, 0, 1)), { startDate: "2026-12-28", endDate: "2027-02-07" });
  const leap = getBibliaCalendarPeriod(new Date(2028, 1, 29));
  assert.ok(leap.startDate <= "2028-02-29" && leap.endDate >= "2028-02-29");
});

test("only successful writes affecting Biblia invalidate, including POST PUT PATCH and DELETE", () => {
  for (const method of ["post", "put", "patch", "delete"]) {
    assert.equal(isBibliaMutation({ status: 200, config: { method, url: "/turismo/cotizaciones/file" } }), true);
    assert.equal(isBibliaMutation({ status: 409, config: { method, url: "/turismo/cotizaciones/file" } }), false);
  }
  assert.equal(isBibliaMutation({ status: 200, config: { method: "post", url: "/turismo/cotizaciones/biblia-actividades/excursiones" } }), false);
  assert.equal(isBibliaMutation({ status: 200, config: { method: "get", url: "/turismo/cotizaciones/biblia-actividades" } }), false);
  assert.equal(isBibliaMutation({ status: 201, config: { method: "post", url: "/upload/tigris" } }), true);
});
