import test from "node:test";
import assert from "node:assert/strict";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import BibliaTimeFields from "../../components/BibliaTimeFields";
import { formatBibliaTimeRange, parseBibliaTimeRange } from "../bibliaTimeRange";
import { buildBibliaRowChanges, createBibliaRowDraftStore } from "../bibliaRowDrafts";
import { buildBibliaEditRecord } from "../bibliaQuotationLinking";
import { buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";
import { buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";

const row = () => ({ id: "time-native", sourceType: "standalone", standaloneRecordId: "time-native",
  sourceQuotationId: "", dateKey: "2026-09-28", file: "TIME-FILE", reservationName: "Reserva de prueba",
  time: "Sin hora", pax: 2, overrideRecord: { id: "time-native" } }) as any;

test("interpreta rangos, hora única y ventanas históricas sin perder sus extremos", () => {
  assert.deepEqual(parseBibliaTimeRange("8:10-10:00"), { start: "08:10", end: "10:00" });
  assert.deepEqual(parseBibliaTimeRange("8:10"), { start: "08:10", end: "" });
  assert.deepEqual(parseBibliaTimeRange("04:00 04.15"), { start: "04:00", end: "04:15" });
  assert.deepEqual(parseBibliaTimeRange("04:00:00 - 04:15:00"), { start: "04:00", end: "04:15" });
  assert.deepEqual(parseBibliaTimeRange("Recojo 8:10 · salida 10:00 por confirmar"), { start: "08:10", end: "10:00" });
});

test("una o ambas horas producen el contrato HH:mm o HH:mm-HH:mm y permite horarios nocturnos", () => {
  assert.equal(formatBibliaTimeRange("08:10", "10:00"), "08:10-10:00");
  assert.equal(formatBibliaTimeRange("8:10", ""), "08:10");
  assert.equal(formatBibliaTimeRange("", "10:00"), "10:00");
  assert.equal(formatBibliaTimeRange("", ""), "");
  assert.equal(formatBibliaTimeRange("23:45", "00:30"), "23:45-00:30");
});

test("horas vacías o inválidas no inventan valores para los selectores", () => {
  for (const value of ["", "—", "Sin hora", "Recojo por confirmar", "25:00", "04:75", "04:00:99", "08:100"]) {
    assert.deepEqual(parseBibliaTimeRange(value), { start: "", end: "" }, value);
  }
});

test("renderiza dos selectores accesibles sin modificar la hora histórica al abrir", () => {
  let changes = 0;
  const value = "04:00 04.15\nRecojo en hotel por confirmar";
  const markup = renderToStaticMarkup(<BibliaTimeFields value={value} onChange={() => changes++} />);
  assert.equal(changes, 0);
  assert.equal((markup.match(/type="time"/g) || []).length, 2);
  assert.match(markup, /Hora de inicio/);
  assert.match(markup, /Hora de fin/);
  assert.match(markup, /value="04:00"/);
  assert.match(markup, /value="04:15"/);
  assert.ok(markup.includes(value));
  const disabled = renderToStaticMarkup(<BibliaTimeFields value="" onChange={() => changes++} disabled />);
  assert.equal((disabled.match(/disabled=""/g) || []).length, 2);
});

test("un horario histórico sin horas reconocibles permanece visible hasta editarlo", () => {
  const value = "Salida al terminar la excursión, previa coordinación";
  const markup = renderToStaticMarkup(<BibliaTimeFields value={value} onChange={() => assert.fail("No debe reescribir al abrir")} />);
  assert.ok(markup.includes(value));
  assert.equal((markup.match(/value=""/g) || []).length, 2);
});

test("editar solo fin conserva el selector correcto y admite completar, limpiar y recibir un horario externo", async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const keys = ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  let stored = "";
  let setExternal!: (value: string) => void;
  function Editor() {
    const [value, setValue] = useState("");
    setExternal = setValue;
    return <BibliaTimeFields value={value} onChange={next => { stored = next; setValue(next); }} />;
  }
  const root = createRoot(document.getElementById("root"));
  const inputs = () => Array.from(document.querySelectorAll("input"));
  const change = async (index: number, value: string) => {
    const input = inputs()[index];
    const properties = Object.keys(input).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => input[properties].onChange({ target: { value } }));
  };
  try {
    await act(async () => root.render(<Editor />));
    await change(1, "10:00");
    assert.equal(stored, "10:00");
    assert.deepEqual(inputs().map(input => input.value), ["", "10:00"]);
    await change(0, "08:10");
    assert.equal(stored, "08:10-10:00");
    await change(0, "");
    assert.equal(stored, "10:00");
    assert.deepEqual(inputs().map(input => input.value), ["", "10:00"]);
    await change(1, "");
    assert.equal(stored, "");
    await act(async () => setExternal("23:45-00:30"));
    assert.deepEqual(inputs().map(input => input.value), ["23:45", "00:30"]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
  }
});

test("guardar y recargar conserva rangos, horas únicas y anotaciones históricas en la Biblia y su exportación", async () => {
  for (const value of [formatBibliaTimeRange("08:10", "10:00"), formatBibliaTimeRange("08:10", ""),
    formatBibliaTimeRange("", "10:00"), formatBibliaTimeRange("23:45", "00:30"),
    "04:00 04.15 · Recojo en hotel"]) {
    const original = row();
    const store = createBibliaRowDraftStore();
    store.stage(original, "time", value);
    let saved: Record<string, any> | undefined;
    assert.equal(await store.save(original, async (activity, changes) => { saved = buildBibliaEditRecord(activity, changes); }), true);
    const reloaded = buildBibliaActivitiesFromSnapshots([], [{ id: original.id, is_active: true, actividad: saved }])[0];
    assert.equal(reloaded.time, value);
    const exported = buildBibliaDayExportMatrix([reloaded]);
    assert.equal(exported.rows[0][exported.headers.indexOf("HORA")], value);
  }
  assert.deepEqual(buildBibliaRowChanges({ ...row(), time: "08:10-10:00" }, { time: formatBibliaTimeRange("", "") }), { time: "—" });
});
