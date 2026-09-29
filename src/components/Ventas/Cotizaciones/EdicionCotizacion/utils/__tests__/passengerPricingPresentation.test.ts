import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateServiceAdultPricingRows,
  buildServiceAdultPricingRows,
  getPassengerPresentation,
} from "../passengerPricingPresentation.js";

const peopleDetails = {
  adults: [
    { nombres: "Ana", apellidos: "Lopez", passenger_key: "adult-0" },
    { nombres: "Bruno", apellidos: "Rios", passenger_key: "adult-1" },
  ],
  children: [
    { nombres: "Carla", apellidos: "Rios", passenger_key: "child-0" },
  ],
};

test("adult pricing rows preserve distinct legacy long passenger identities", () => {
  const rows = buildServiceAdultPricingRows({
    service: {
      beneficiariosAdultos: [{ id: "adult:0:row-a" }, { id: "adult:1:row-b" }],
    },
    peopleDetails,
    adultUnitFallback: 35,
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.label), ["Ana Lopez", "Bruno Rios"]);
  assert.deepEqual(rows.map((row) => row.amount), [35, 35]);
  assert.deepEqual(rows.map((row) => row.slot), ["adult:1", "adult:2"]);
});

test("adult pricing does not duplicate a passenger repeated in the beneficiary payload", () => {
  const rows = buildServiceAdultPricingRows({
    service: {
      beneficiariosAdultos: [{ id: "adult:1" }, { id: "adult:1" }],
    },
    peopleDetails,
    adultUnitFallback: 20,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, "Ana Lopez");
  assert.equal(rows[0].amount, 20);
});

test("aggregated adult rows sum only services assigned to each beneficiary", () => {
  const rows = aggregateServiceAdultPricingRows({
    services: [
      { beneficiariosAdultos: [{ id: "adult:0:row-a" }, { id: "adult:1:row-b" }], precioServicio: 10 },
      { beneficiariosAdultos: [{ id: "adult:0:row-a" }], precioServicio: 25 },
    ],
    peopleDetails,
    getAdultUnitPrice: (service) => Number(service.precioServicio || 0),
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => ({ label: row.label, amount: row.amount, serviceCount: row.serviceCount })),
    [
      { label: "Ana Lopez", amount: 35, serviceCount: 2 },
      { label: "Bruno Rios", amount: 10, serviceCount: 1 },
    ],
  );
});

test("presentation keeps the exact hyphen key without aliasing it onto another slot", () => {
  const first = getPassengerPresentation(peopleDetails.adults[0], "adult", 0);
  const second = getPassengerPresentation(peopleDetails.adults[1], "adult", 1);

  assert.equal(first.aliases.has("adult-0"), true);
  assert.equal(first.aliases.has("adult-1"), false);
  assert.equal(second.aliases.has("adult-1"), true);
});
