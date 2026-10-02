import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSync } from "esbuild";
import TicketBeneficiarySummary from "../TicketBeneficiarySummary";
import { getServicePricingSnapshot } from "../../../../../utils/servicePricingRuntime";

// Render the real row without styles or a browser. Keep React/dnd dependencies
// external so the component and renderer use the same React instance.
const compiled = buildSync({
  entryPoints: [path.resolve("src/components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/SortableService.tsx")],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  loader: { ".scss": "empty" },
  define: { "import.meta.env.VITE_EXCHANGE_RATE": "undefined" },
});
const componentModule = { exports: {} as any };
new Function("module", "exports", "require", compiled.outputFiles[0].text)(
  componentModule,
  componentModule.exports,
  createRequire(path.resolve("package.json")),
);
const SortableService = componentModule.exports.default;

const adultIds = Array.from({ length: 10 }, (_, index) => `adult:${index}:persona${index}`);
const childIds = Array.from({ length: 5 }, (_, index) => `child:${index}:menor${index}`);
const ticket = (ids: string[], group = "adult", procedencia = "nacional", unitPrice = 23.33) => ({
  id: `ticket-${group}-${procedencia}`,
  parentService: { typeService: "tickets" },
  childService: { entrada: "BTG GENERAL", procedencia, tipo_usuario: group === "child" ? "estudiante" : "adulto" },
  assignedPassengerIds: ids,
  ticketProcedenciaFilter: procedencia,
  ticketPassengerTargetGroup: group,
  ticketChildrenUseStudentTariffAsAdult: group === "child",
  treatChildrenAsAdults: group === "child",
  convertedChildToAdultMap: group === "child" ? Object.fromEntries(ids.map(id => [id, true])) : {},
  pricingMode: "fixed",
  passengerSelection: { selectedIds: ids, ticketProcedenciaFilter: procedencia, ticketPassengerTargetGroup: group, pricingMode: "fixed", treatChildrenAsAdults: group === "child" },
  tariff: { precio: unitPrice, precio_original: unitPrice * ids.length },
});
const row = (service: any, extraProps = {}) => renderToStaticMarkup(
  <SortableService
    service={service} serviceIndex={0} dayIndex={0} totalPassengers={15}
    editingPrice={{ dayIndex: null, serviceIndex: null, value: "" }}
    removeService={() => {}} togglePriceAdjustment={() => {}}
    handleAdjustmentValueChange={() => {}} applyAdjustment={() => {}}
    {...extraProps}
  />,
);
const badges = (html: string) => (html.match(/class="sr__pax-tag sr__pax-tag--/g) || []).length;

test("la entrada nacional muestra un contador para sus cuatro adultos, sin chips nominales", () => {
  const html = row(ticket(adultIds.slice(0, 4)));
  assert.match(html, /Adultos beneficiarios: 4/);
  assert.match(html, /BTG GENERAL/);
  assert.match(html, /Nacional/);
  assert.equal(badges(html), 1);
  assert.doesNotMatch(html, /Adulto [1-9]|persona[0-9]|sr-ticket__beneficiary-group/);
});

test("la entrada extranjera resume sólo sus seis beneficiarios", () => {
  const html = row(ticket(adultIds.slice(4), "adult", "extranjero", 43.33));
  assert.match(html, /Adultos beneficiarios: 6/);
  assert.match(html, /Extranjero/);
  assert.equal(badges(html), 1);
  assert.doesNotMatch(html, /Adulto [1-9]|persona[0-9]/);
});

test("estudiantes se presentan como cinco niños, no como adultos", () => {
  const html = row(ticket(childIds, "child", "extranjero"));
  assert.match(html, /Niños beneficiarios: 5/);
  assert.match(html, /\/estudiante/);
  assert.equal(badges(html), 1);
  assert.doesNotMatch(html, /Adultos beneficiarios|Niño [1-9]|menor[0-9]/);
});

test("muchos pasajeros no multiplican las etiquetas de la fila", () => {
  const ids = Array.from({ length: 100 }, (_, index) => `adult:${index}:persona${index}`);
  const html = row(ticket(ids));
  assert.match(html, /Adultos beneficiarios: 100/);
  assert.equal(badges(html), 1);
});

test("una selección explícita vacía no muestra todos los pax de la cotización", () => {
  const html = row(ticket([]));
  assert.match(html, /Sin beneficiarios/);
  assert.equal(badges(html), 0);
  assert.doesNotMatch(html, /Adultos beneficiarios: 15/);
});

test("el resumen deduplica identificadores y distingue niños con tarifa adulto", () => {
  const html = renderToStaticMarkup(<TicketBeneficiarySummary
    adultIds={[adultIds[0], adultIds[0]]} studentChildIds={[]}
    convertedChildIds={[childIds[0], childIds[0]]} isStudentRow={false}
  />);
  assert.match(html, /Adultos beneficiarios: 1\. Niños con tarifa adulto: 1/);
  assert.match(html, /\+1n/);
  assert.equal(badges(html), 1);
});

test("la fila mixta conserva el botón de gestión de niños plegado", () => {
  const html = row(ticket([adultIds[0], childIds[0]]));
  assert.match(html, /Adultos beneficiarios: 1/);
  assert.match(html, /Niños de la entrada: 1\. Gestionar tarifas/);
  assert.match(html, /aria-expanded="false"/);
  assert.equal(badges(html), 2);
  assert.doesNotMatch(html, /class="sr__children/);
});

test("los servicios asignados conservan el bloqueo de gestión de niños", () => {
  const html = row({ ...ticket([adultIds[0], childIds[0]]), assigned_parent_id: 7 });
  assert.match(html, /disabled="" aria-expanded="false" aria-label="Niños de la entrada: 1\. Sólo lectura"/);
  assert.doesNotMatch(html, /class="sr__children/);
});

test("el resumen conserva el control y su callback, sin sustituir su gestión", () => {
  let calls = 0;
  const control = <button onClick={() => { calls += 1; }}>Gestionar niños</button>;
  const element = TicketBeneficiarySummary({ adultIds: [], studentChildIds: [], convertedChildIds: [], isStudentRow: false, childControl: control });
  const forwarded = React.Children.toArray(element.props.children).find(child => React.isValidElement(child) && child.type === "button") as React.ReactElement;
  assert.ok(forwarded);
  assert.equal(forwarded.props.onClick, control.props.onClick);
  forwarded.props.onClick();
  assert.equal(calls, 1);
  assert.doesNotMatch(renderToStaticMarkup(element), /Sin beneficiarios/);
});

test("compactar entradas importadas no altera pax, tarifas ni totales", () => {
  const services = [ticket(adultIds.slice(0, 4)), ticket(adultIds.slice(4), "adult", "extranjero", 43.33), ticket(childIds, "child", "extranjero")];
  for (const service of services) {
    const dataBefore = JSON.stringify(service);
    const pricingBefore = getServicePricingSnapshot(service);
    row(service);
    assert.equal(JSON.stringify(service), dataBefore);
    assert.deepEqual(getServicePricingSnapshot(service), pricingBefore);
  }
  assert.deepEqual(services.map(service => getServicePricingSnapshot(service).total), [93.32, 259.98, 116.65]);
});

test("ocultar el total de la fila mantiene el resumen compacto", () => {
  const html = row(ticket(adultIds), { hideServiceTotal: true });
  assert.match(html, /sr--no-total/);
  assert.match(html, /Adultos beneficiarios: 10/);
  assert.equal(badges(html), 1);
  assert.doesNotMatch(html, /class="sr-ticket__total"/);
});
