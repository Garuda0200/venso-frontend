import test from "node:test";
import assert from "node:assert/strict";
import { formatReservationSummaryDate } from "../reservationSummaryDate";

test("la fecha de viaje conserva el día en Lima y otras zonas horarias", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["America/Lima", "UTC", "Pacific/Honolulu", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(formatReservationSummaryDate("2026-10-28"), "28/10/2026");
      assert.equal(formatReservationSummaryDate("2028-02-29"), "29/02/2028");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("los timestamps conservan su zona horaria y los objetos Date su día local", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Lima";
    assert.equal(formatReservationSummaryDate("2026-10-28T02:00:00Z"), "27/10/2026");
    assert.equal(formatReservationSummaryDate(new Date(2026, 9, 28)), "28/10/2026");
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("una fecha inválida no se convierte silenciosamente en otro día", () => {
  assert.equal(formatReservationSummaryDate("2026-02-29"), "2026-02-29");
  assert.equal(formatReservationSummaryDate("2026-13-01"), "2026-13-01");
  assert.equal(formatReservationSummaryDate("Pendiente"), "Pendiente");
  assert.equal(formatReservationSummaryDate(null), "Sin fecha");
});
