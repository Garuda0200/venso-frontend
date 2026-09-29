import test from "node:test";
import assert from "node:assert/strict";

import {
  countQuotedIgvServices,
  resolveCotizacionIgvInfo,
  serviceHasQuotedIgv,
} from "../cotizacionIgv";

test("reconoce la señal batch del backend para cotizaciones Venso", () => {
  const info = resolveCotizacionIgvInfo({
    platform: "venso",
    has_igv: true,
    igv_service_count: 2,
    itinerario: [],
  });

  assert.deepEqual(info, { hasIgv: true, serviceCount: 2, source: "backend" });
});

test("reconoce la misma señal batch para cotizaciones MIL", () => {
  const info = resolveCotizacionIgvInfo({
    platform: "mil",
    has_igv: true,
    igv_service_count: 1,
  });

  assert.equal(info.hasIgv, true);
  assert.equal(info.serviceCount, 1);
});

test("con detalle cargado deriva IGV directamente del itinerario persistido", () => {
  const quote = {
    has_igv: false,
    itinerario: [
      { servicios: [{ igv: false }, { igv: true }] },
      { services: [{ tiene_igv: "true" }, { igv: false }] },
    ],
  };

  assert.equal(countQuotedIgvServices(quote), 2);
  assert.deepEqual(resolveCotizacionIgvInfo(quote), {
    hasIgv: true,
    serviceCount: 2,
    source: "itinerary",
  });
});

test("no marca IGV cuando ningún servicio cotizado lo tiene", () => {
  const quote = {
    platform: "mil",
    has_igv: false,
    igv_service_count: 0,
    itinerario: [{ servicios: [{ igv: false }] }],
  };

  assert.equal(resolveCotizacionIgvInfo(quote).hasIgv, false);
});

test("acepta aliases de IGV usados por servicios legacy", () => {
  assert.equal(serviceHasQuotedIgv({ tieneIgv: true }), true);
  assert.equal(serviceHasQuotedIgv({ has_igv: 1 }), true);
  assert.equal(serviceHasQuotedIgv({ igv: false }), false);
});
