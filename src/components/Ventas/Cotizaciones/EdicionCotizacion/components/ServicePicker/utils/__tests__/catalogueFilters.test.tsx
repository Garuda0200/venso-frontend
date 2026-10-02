import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { catalogueFacets, catalogueFacetValue, filterCatalogue, filterCatalogueCapacity, quotationPickerPax } from "../catalogueFilters";
import { trainPickerDetails } from "../trainPickerDetails";
import ServicePickerFilters from "../../components/ServicePickerFilters";
import TrainPickerDetails from "../../components/TrainPickerDetails";

test("endoses: capacidad suficiente y cercana primero, sin ocultar tarifa por persona", () => {
  const tours = [12, 0, 3, 6, null, 5].map((capacity, index) => ({ tour: { id_tipotour: index, capacidad: capacity } }));
  assert.deepEqual(filterCatalogueCapacity(tours, "endoses", 5).map(item => item.tour.capacidad), [5, 6, 12, 0, null]);
  assert.deepEqual(tours.map(item => item.tour.capacidad), [12, 0, 3, 6, null, 5]);
  assert.equal(filterCatalogueCapacity(tours, "endoses", 0), tours);
});
test("movilidades: capacidad suficiente; no inventa cupos cuando falta capacidad", () => {
  const vehicles = [13, 0, 3, 4].map(nro_pasajeros => ({ movilidad: { nro_pasajeros } }));
  assert.deepEqual(filterCatalogueCapacity(vehicles, "transportes", 3).map(v => v.movilidad.nro_pasajeros), [3, 4, 13]);
  assert.equal(filterCatalogueCapacity(vehicles, "trenes", 8), vehicles);
});
test("pax del selector incluye niños y respeta selección explícita vacía o parcial", () => {
  const people = { adults: [{}, {}, {}], children: [{}, {}] };
  assert.equal(quotationPickerPax(people, null, 99), 5);
  assert.equal(quotationPickerPax(people, { selectedIds: ["adult:0", "child:0", "child:0"] }, 99), 2);
  assert.equal(quotationPickerPax(people, { selectedIds: [] }, 99), 0);
  assert.equal(quotationPickerPax({}, null, 7), 7);
  assert.equal(quotationPickerPax({ details: [{}, {}] }, null, 1), 2);
});
test("proveedor con ID numérico/string y destino del padre se combinan con idioma del tour", () => {
  const parents = [{ id_endose: 7, zona: "Cusco" }, { id_endose: 8, zona: "Puno" }];
  const services = [{ tour: { id_endose: "7", idioma: "Español" } }, { tour: { id_endose: 8, idioma: "Español" } }, { tour: { id_endose: 7, idioma: "Inglés" } }];
  assert.equal(filterCatalogue(services, "endoses", parents, ["7"], { zona: "Cusco", idioma: "Español" }).length, 1);
  assert.equal(filterCatalogue(services, "endoses", parents, [], { idioma: "Francés" }).length, 0);
});
test("todos los tipos de servicio exponen filtros con campos reales del backend", () => {
  assert.equal(Object.keys(catalogueFacets).length, 8);
  assert.ok(catalogueFacets.hoteles.some(f => f.field === "tipo_habitacion"));
  assert.ok(catalogueFacets.vuelos.some(f => f.field === "lugar_ida"));
  assert.equal(catalogueFacetValue({ vagon: { es_bimodal: "false" } }, "trenes", "es_bimodal"), "Solo tren");
  assert.equal(catalogueFacetValue({ vagon: { es_bimodal: true } }, "trenes", "es_bimodal"), "Bimodal");
});
test("filtros de tren combinan proveedor, origen, destino y clase de vagón", () => {
  const services = [
    { vagon: { id_tren: 2, lugar_salida: "Ollantaytambo", lugar_destino: "Machu Picchu", tipo_tren: "Vistadome" } },
    { vagon: { id_tren: 2, lugar_salida: "Machu Picchu", lugar_destino: "Ollantaytambo", tipo_tren: "Vistadome" } },
  ];
  assert.equal(filterCatalogue(services, "trenes", [], ["2"], { lugar_salida: "Ollantaytambo", tipo_tren: "Vistadome" }).length, 1);
});
test("entradas mantienen nombre, procedencia y tipo de beneficiario", () => {
  const services = [{ ticket: { id_ticket: 9, entrada: "BTG", procedencia: "Extranjero", tipo_usuario: "estudiante" } }];
  assert.equal(filterCatalogue(services, "tickets", [], ["9"], { procedencia: "Extranjero", tipo_usuario: "estudiante" }).length, 1);
});
test("idiomas JSON del guía se filtran individualmente sin convertirlos en un único idioma", () => {
  const parents = [{ id_guia: 4, idioma: ["Español", "Inglés"] }];
  const services = [{ ruta: { id_guia: 4, tour_nombre: "City Tour" } }];
  assert.equal(filterCatalogue(services, "guias", parents, [], { idioma: "Inglés" }).length, 1);
  assert.equal(filterCatalogue(services, "guias", parents, [], { idioma: "Francés" }).length, 0);
});
test("hoteles distinguen desayuno falso y capacidad; restaurantes usan campos existentes", () => {
  assert.equal(catalogueFacetValue({ habitacion: { id_hotel: 1, capacidad: 2 } }, "hoteles", "desayuno", [{ id_hotel: 1, desayuno: false }]), "Sin desayuno");
  assert.ok(catalogueFacets.restaurantes.some(f => f.field === "direccion"));
});
test("detalle de vagón conserva extras, horarios parciales y bimodal; no inventa valores", () => {
  const details = trainPickerDetails({ vagon: { tipo_tren: "Vistadome 604", hora_salida: "06:40:00", serv_add: "Snack y bebida", es_bimodal: "false" } });
  assert.equal(details.type, "Vistadome 604");
  assert.equal(details.departure, "06:40");
  assert.equal(details.arrival, "");
  assert.equal(details.bimodal, false);
  assert.equal(details.extras, "Snack y bebida");
  assert.equal(trainPickerDetails({}).bimodal, null);
});
test("frecuencia del vagón procede del tren proveedor sin modificar el catálogo", () => {
  const wagon = { vagon: { id_tren: 2, tipo_tren: "Expedition", hora_salida: "07:00:00" } };
  const provider = { id_tren: 2, nombre_empresa: "PeruRail", frecuencia: "  Diaria  " };
  const before = JSON.stringify({ wagon, provider });
  assert.equal(trainPickerDetails(wagon, provider).frequency, "Diaria");
  assert.equal(JSON.stringify({ wagon, provider }), before);
});
test("frecuencia admite tren embebido, parentService y filas planas", () => {
  for (const item of [
    { vagon: { tipo_tren: "Expedition" }, tren: { frecuencia: "Diaria" } },
    { childService: { tipo_tren: "Expedition" }, parentService: { frecuencia: "Diaria" } },
    { vagon: { tipo_tren: "Expedition", tren: { frecuencia: "Diaria" } } },
    { vagon: { tipo_tren: "Expedition", frecuencia: "Diaria" } },
    { tipo_tren: "Expedition", frecuencia: "Diaria" },
  ]) {
    assert.equal(trainPickerDetails(item).frequency, "Diaria");
  }
});
test("frecuencia del proveedor actual prevalece sobre un snapshot antiguo", () => {
  const item = { vagon: { frecuencia: "Antigua" }, tren: { frecuencia: "Otra" } };
  assert.equal(trainPickerDetails(item, { frecuencia: "Lunes y viernes" }).frequency, "Lunes y viernes");
});
test("tarjeta lista frecuencia con ruta y horarios sin interpretar HTML", () => {
  const html = renderToStaticMarkup(<TrainPickerDetails
    wagon={{ vagon: { tipo_tren: "Vistadome", lugar_salida: "Ollantaytambo", lugar_destino: "Machu Picchu", hora_salida: "07:00:00" } }}
    provider={{ frecuencia: "<script>Diaria</script>" }} providerName="PeruRail"
  />);
  assert.match(html, /<strong>Frecuencia:<\/strong>/);
  assert.match(html, /&lt;script&gt;Diaria&lt;\/script&gt;/);
  assert.match(html, /PeruRail/);
  assert.match(html, /Vistadome/);
  assert.match(html, /07:00/);
  assert.doesNotMatch(html, /<script>/);
});
test("sin frecuencia válida no aparece una etiqueta vacía ni un valor inventado", () => {
  for (const frequency of [undefined, null, "", "  ", 0, {}]) {
    const provider = { frecuencia: frequency };
    assert.equal(trainPickerDetails({}, provider).frequency, "");
    const html = renderToStaticMarkup(<TrainPickerDetails wagon={{}} provider={provider} />);
    assert.doesNotMatch(html, /Frecuencia:/);
  }
});
test("panel accesible muestra proveedor y capacidad de la cotización sin ocultar selección", () => {
  const html = renderToStaticMarkup(<ServicePickerFilters category="endoses" parents={[{ id_endose: 7, nombre_agencia: "Agencia Andina" }]} services={[{ tour: { idioma: "Español", id_endose: 7 } }]} providerIds={["7"]} facets={{}} capacity={5} quotationPax={5} onProvidersChange={() => {}} onFacetsChange={() => {}} onCapacityChange={() => {}} onReset={() => {}} />);
  assert.match(html, /aria-label="Filtros de servicios"/);
  assert.match(html, /Capacidad mínima en pasajeros/);
  assert.match(html, /Usar 5 pax/);
  assert.match(html, /Agencia Andina/);
  assert.match(html, /checked=""/);
  assert.match(html, /Español/);
});
test("tarjeta de tren presenta ruta, salida, llegada y extras escapando HTML", () => {
  const html = renderToStaticMarkup(<TrainPickerDetails wagon={{ vagon: { tipo_tren: "Expedition", lugar_salida: "Ollantaytambo", lugar_destino: "Machu Picchu", hora_salida: "07:00:00", hora_llegada: "09:00:00", es_bimodal: true, serv_add: "<script>no</script>" } }} />);
  assert.match(html, /Ollantaytambo/);
  assert.match(html, /Machu Picchu/);
  assert.match(html, /07:00/);
  assert.match(html, /09:00/);
  assert.match(html, /bus \+ tren/);
  assert.doesNotMatch(html, /<script>/);
});
