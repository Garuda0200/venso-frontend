import test from "node:test";
import assert from "node:assert/strict";
import { buildVoucherPdfVersionDiff } from "../voucherPdfVersionDiff";

const snapshot = (days, flights = []) => ({
  datos_pdf: {
    itinerary: {
      title: "ITINERARIO",
      days,
      day_refs: days.map((_, index) => String(index + 100)),
    },
  },
  vuelos_externos: flights,
});

test("detecta una línea añadida sin marcar como cambio el resto del día", () => {
  const diff = buildVoucherPdfVersionDiff(
    snapshot([{ title: "Día 1", content: "Traslado al hotel" }]),
    snapshot([{ title: "Día 1", content: "Traslado al hotel\nCena incluida" }]),
  );

  assert.equal(diff.summary.changedDays, 1);
  assert.equal(diff.summary.addedLines, 1);
  assert.deepEqual(diff.days[0].contentLines, [
    { type: "unchanged", value: "Traslado al hotel" },
    { type: "added", value: "Cena incluida" },
  ]);
});

test("mantiene la eliminación visible al volver a guardar el contenido anterior", () => {
  const diff = buildVoucherPdfVersionDiff(
    snapshot([{ title: "Día 1", content: "Traslado al hotel\nCena incluida" }]),
    snapshot([{ title: "Día 1", content: "Traslado al hotel" }]),
  );

  assert.equal(diff.summary.removedLines, 1);
  assert.deepEqual(diff.days[0].contentLines, [
    { type: "unchanged", value: "Traslado al hotel" },
    { type: "removed", value: "Cena incluida" },
  ]);
});

test("resume cambios de vuelos y días agregados", () => {
  const diff = buildVoucherPdfVersionDiff(
    snapshot([{ title: "Día 1", content: "Lima" }], [
      { flight_number: "LA 100", origin: "LIM", destination: "CUZ" },
    ]),
    snapshot(
      [
        { title: "Día 1", content: "Lima" },
        { title: "Día 2", content: "Cusco" },
      ],
      [{ flight_number: "LA 100", origin: "LIM", destination: "CUZ", date: "2026-10-01" }],
    ),
  );

  assert.equal(diff.days[1].state, "added");
  assert.equal(diff.summary.changedFlights, 1);
  assert.equal(diff.flights[0].state, "modified");
});
