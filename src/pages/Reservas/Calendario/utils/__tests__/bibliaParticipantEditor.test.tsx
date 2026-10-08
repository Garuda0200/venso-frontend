import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getCountryNames } from "../../../../../utils/countries";
import ParticipantPlanEditor, { ParticipantPlanPanel } from "../../components/ParticipantPlanEditor";
import { buildParticipantPlan, changeParticipantCategory, initialParticipantDraft, participantDraftError,
  bibliaParticipantPlanError, quotationParticipantDraft, resizeParticipantDraft, participantCountryLabel,
  participantQuotationError, changeLinkedParticipantCount, availableParticipantCountries } from "../bibliaParticipantEditor";
import { participantNationalityLabel } from "../bibliaNationality";
import { createBibliaDayExcelWorkbook } from "../bibliaDayExcelExport";
import { buildBibliaEditRecord, getBibliaLinkUnavailableReason } from "../bibliaQuotationLinking";
import { buildBibliaActivitiesFromSnapshots } from "../bibliaActivityMapper";
import { buildBibliaDayExportMatrix } from "../bibliaDayJpegExport";

const activity = (extra = {}) => ({ id: "r1", pax: 7, nationality: "—", file: "FILE",
  dateKey: "2026-09-28", sourceType: "standalone", standaloneRecordId: "1", sourceQuotationId: "",
  overrideRecord: { id: "r1" }, ...extra }) as any;
const passenger = (country: string, type = "adult", key = "") => ({ nacionalidad: country, tipo_pasajero: type, passenger_key: key });
const quote = (passengers: any[]) => ({ id: "Q1", fechainicio: "2026-09-01", passengers });

test("PAX crea inicialmente adultos sin inventar nacionalidad ni niños", () => {
  const draft = initialParticipantDraft(activity());
  assert.deepEqual(draft, { adults: Array(7).fill(""), children: [] });
  assert.match(participantDraftError(draft, 7), /Selecciona/);
  assert.deepEqual(initialParticipantDraft(activity({ pax: 0 })), { adults: [], children: [] });
});

test("los controles redistribuyen 7 PAX a 5 adultos y 2 niños manteniendo sus países", () => {
  const original = { adults: ["Perú", "Argentina", "Brasil", "Italia", "Chile", "México", "USA"], children: [] };
  let draft = changeParticipantCategory(original, "children", 1);
  draft = changeParticipantCategory(draft, "adults", -1);
  assert.equal(draft.adults.length, 5); assert.deepEqual(draft.children, ["USA", "México"]);
  assert.equal(original.adults.length, 7);
  assert.equal(draft.adults.length + draft.children.length, 7);
  draft = changeParticipantCategory(draft, "children", -1);
  draft = changeParticipantCategory(draft, "adults", 1);
  assert.deepEqual(draft, original);
});

test("permite todos niños y cero PAX sin negativos ni superar el total", () => {
  let draft = { adults: ["Perú"], children: [] };
  assert.equal(changeParticipantCategory(draft, "adults", 1), draft);
  draft = changeParticipantCategory(draft, "children", 1);
  assert.deepEqual(draft, { adults: [], children: ["Perú"] });
  assert.equal(changeParticipantCategory(draft, "children", 1), draft);
  const empty = { adults: [], children: [] };
  assert.equal(changeParticipantCategory(empty, "adults", -1), empty);
  assert.equal(participantDraftError(empty, 0), "");
});

test("guardar agrupa países por adultos y niños con el contrato original", () => {
  const plan = buildParticipantPlan({ adults: ["Argentina", "Perú", "Argentina"], children: ["Brasil", "Brasil"] });
  assert.deepEqual(plan, { version: 1,
    adults: { count: 3, nationalities: [{ country: "Argentina", count: 2 }, { country: "Perú", count: 1 }] },
    children: { count: 2, nationalities: [{ country: "Brasil", count: 2 }] } });
  assert.deepEqual(initialParticipantDraft(activity({ pax: 5, participantPlan: plan })),
    { adults: ["Argentina", "Argentina", "Perú"], children: ["Brasil", "Brasil"] });
});

test("un cambio de PAX redimensiona el formulario sin mutar ni guardar el plan", () => {
  const saved = { adults: ["Perú", "Brasil"], children: ["Chile"] };
  assert.deepEqual(resizeParticipantDraft(saved, 5), { adults: ["Perú", "Brasil", "", ""], children: ["Chile"] });
  assert.deepEqual(resizeParticipantDraft(saved, 2), { adults: ["Perú", "Brasil"], children: [] });
  assert.deepEqual(saved, { adults: ["Perú", "Brasil"], children: ["Chile"] });
  const row = activity({ pax: 3, participantPlan: buildParticipantPlan(saved) });
  row.pax = 5;
  assert.match(bibliaParticipantPlanError(row), /sumar/);
  assert.equal(initialParticipantDraft(row).adults.length, 4);
});

test("una nacionalidad histórica aplica a todos, los países contados no se duplican", () => {
  assert.deepEqual(initialParticipantDraft(activity({ pax: 2, nationality: "USA" })).adults, ["USA", "USA"]);
  assert.deepEqual(initialParticipantDraft(activity({ pax: 4, nationality: "Perú x2, Brasil x2" })).adults, ["Perú", "Perú", "Brasil", "Brasil"]);
  assert.equal(participantCountryLabel("USA"), "Estados Unidos");
  assert.equal(participantCountryLabel("PE"), "Perú");
});

test("un file existente usa su composición real cuando no hay plan explícito", () => {
  const quotation = quote([passenger("Perú"), passenger("Italia", "child"), passenger("Brasil", "adult", "child-2")]);
  const roster = quotationParticipantDraft(quotation);
  assert.deepEqual(roster, { adults: ["Perú"], children: ["Italia", "Brasil"] });
  assert.deepEqual(initialParticipantDraft(activity({ pax: 3 }), quotation), roster);
  assert.equal(quotation.passengers.length, 3);
});

test("un plan incompatible no convierte pasajeros del file y solo bloquea la sincronización", () => {
  const saved = { adults: ["Argentina", "Argentina", "Argentina", "Perú", "Brasil", "Brasil", "Brasil"], children: [] };
  const quotation = quote(Array.from({ length: 7 }, () => passenger("Italia")));
  const row = activity({ sourceQuotationId: "Q1", participantPlan: buildParticipantPlan(saved) });
  assert.deepEqual(initialParticipantDraft(row, quotation), { adults: Array(7).fill("Italia"), children: [] });
  assert.equal(participantDraftError(saved, 7), "");
  assert.match(participantQuotationError(saved, 7, quotation), /adultos de Argentina/);
  assert.match(getBibliaLinkUnavailableReason(row, quotation), /Cotizaciones/);
  assert.match(bibliaParticipantPlanError(row, quotation), /Argentina/);
});

test("días con menos beneficiarios son válidos y Perú conserva sus alias", () => {
  const quotation = quote([passenger("Peruana"), passenger("Brasil"), passenger("Italia", "child")]);
  assert.equal(participantQuotationError({ adults: ["Perú"], children: ["Italia"] }, 2, quotation), "");
  assert.match(participantQuotationError({ adults: ["Perú", "Perú"], children: [] }, 2, quotation), /adultos de Perú/);
  assert.match(participantQuotationError({ adults: ["Perú"], children: ["Brasil"] }, 2, quotation), /niños de Brasil/);
  assert.match(participantQuotationError({ adults: ["Perú", "Brasil", "Argentina"], children: ["Italia"] }, 4, quotation), /superar/);
});

test("no acepta PAX fraccionado, países vacíos ni totales inconsistentes", () => {
  for (const pax of [-1, 2.5, 201, NaN]) assert.match(participantDraftError({ adults: [], children: [] }, pax), /PAX/);
  assert.match(participantDraftError({ adults: ["Perú"], children: [] }, 2), /sumar/);
  assert.match(participantDraftError({ adults: ["—"], children: [] }, 1), /Selecciona/);
  assert.equal(bibliaParticipantPlanError(activity()), "");
  const malformed = buildParticipantPlan({ adults: ["Perú"], children: [] });
  malformed.adults.nationalities[0].count = 2;
  assert.match(bibliaParticipantPlanError(activity({ pax: 1, participantPlan: malformed })), /nacionalidades/);
});

test("eventos reales del panel redistribuyen PAX y conservan códigos históricos al seleccionar país", () => {
  let draft = { adults: ["Perú", "USA"], children: [] };
  const roster = null;
  const controls = (type: string) => {
    const tree = ParticipantPlanPanel({ draft, pax: 2, busy: false, error: "", titleId: "test", roster,
      onChange: next => { draft = next; }, onClose: () => {}, onSave: () => {} });
    const found: any[] = [];
    const visit = (node: any) => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node?.props) return;
      if (node.type === type) found.push(node);
      visit(node.props.children);
    };
    visit(tree); return found;
  };
  controls("select")[1].props.onChange({ target: { value: "Estados Unidos" } });
  assert.equal(draft.adults[1], "USA");
  controls("button").find(button => button.props["aria-label"] === "Agregar un niño").props.onClick();
  assert.deepEqual(draft, { adults: ["Perú"], children: ["USA"] });
  controls("select")[1].props.onChange({ target: { value: "Brasil" } });
  assert.deepEqual(draft, { adults: ["Perú"], children: ["Brasil"] });
  assert.equal(draft.adults.length + draft.children.length, 2);
});

function renderPanel(draft: any, extra = {}) {
  return <ParticipantPlanPanel draft={draft} pax={draft.adults.length + draft.children.length} busy={false}
    error="" titleId="participants-title" roster={null} onChange={() => {}} onClose={() => {}} onSave={() => {}} {...extra} />;
}

test("interfaz real lista los mismos países de PeopleSelection y un selector por pasajero", () => {
  const html = renderToStaticMarkup(renderPanel({ adults: ["Perú", "USA"], children: ["Brasil"] }));
  assert.equal((html.match(/<select /g) || []).length, 3);
  for (const country of getCountryNames()) assert.ok(html.includes(`value="${country.replace(/&/g, "&amp;")}"`));
  assert.match(html, /Nacionalidad de adulto 1/); assert.match(html, /Nacionalidad de niño 1/);
  assert.match(html, /value="USA" selected=""/);
  assert.doesNotMatch(html, /<input|\+ País/);
  assert.match(html, /Guardar participantes/);
});

test("controles quedan deshabilitados en límites y al guardar, con errores accesibles", () => {
  const html = renderToStaticMarkup(renderPanel({ adults: ["Perú"], children: [] }, { busy: true, error: "Error recuperable" }));
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /aria-label="Agregar un adulto"/);
  assert.match(html, /disabled="" aria-label="Agregar un adulto"/);
  assert.match(html, /Guardando/); assert.match(html, /role="alert"/);
});

test("el flujo de guardado persiste grupos y no sincroniza ni exporta cantidades de nacionalidad", () => {
  const row = activity({ pax: 3, sourceQuotationId: "Q1" });
  const plan = buildParticipantPlan({ adults: ["Perú", "Brasil"], children: ["Brasil"] });
  const record = buildBibliaEditRecord(row, { participantPlan: plan, nationality: "—" });
  assert.equal(record.syncQuotation, false); assert.equal(record.quotationSyncPending, true);
  const [loaded] = buildBibliaActivitiesFromSnapshots([quote([])], [{ id: "1", cotizacion_id: "Q1", actividad: record }]);
  assert.deepEqual(loaded.participantPlan, plan);
  assert.equal(loaded.nationality, "Perú, Brasil");
  assert.equal(buildBibliaDayExportMatrix([loaded]).rows[0][4], "Perú, Brasil");
  assert.doesNotMatch(JSON.stringify(buildBibliaDayExportMatrix([loaded])), /nationalities|participantPlan|Argentina x/);
});

test("el caso de la captura se configura desde el padrón sin forzar niños ni países nuevos", () => {
  const quotation = quote(Array.from({ length: 7 }, () => passenger("Argentina")));
  const invalidPlan = buildParticipantPlan({ adults: Array(5).fill("Estados Unidos"), children: ["México", "México"] });
  const draft = initialParticipantDraft(activity({ participantPlan: invalidPlan }), quotation);
  assert.deepEqual(draft, { adults: Array(7).fill("Argentina"), children: [] });
  assert.equal(participantDraftError(draft, 7), "");
  const html = renderToStaticMarkup(renderPanel(draft, { roster: quotationParticipantDraft(quotation) }));
  assert.match(html, /disabled="" aria-label="Agregar un niño"/);
  assert.doesNotMatch(html, /value="Estados Unidos"|value="México"/);
  assert.deepEqual(quotation.passengers, Array.from({ length: 7 }, () => passenger("Argentina")));
});

test("files vinculados ajustan adultos y niños independientemente hasta su máximo real", () => {
  const roster = { adults: ["Perú", "USA", "Brasil", "USA", "Italia"], children: ["México", "México"] };
  let draft = initialParticipantDraft(activity(), quote([
    ...roster.adults.map(country => passenger(country)), ...roster.children.map(country => passenger(country, "child")),
  ]));
  assert.deepEqual(draft, roster);
  draft = changeLinkedParticipantCount(draft, "adults", -1, roster);
  draft = changeLinkedParticipantCount(draft, "children", -1, roster);
  assert.equal(draft.adults.length + draft.children.length, 5);
  assert.deepEqual(draft.children, ["México"]);
  assert.equal(participantDraftError(draft, 5), "");
  draft = changeLinkedParticipantCount(draft, "children", 1, roster);
  draft = changeLinkedParticipantCount(draft, "adults", 1, roster);
  assert.deepEqual(draft, roster);
  assert.equal(changeLinkedParticipantCount(draft, "adults", 1, roster), draft);
  assert.equal(changeLinkedParticipantCount(draft, "children", 1, roster), draft);
});

test("la selección por nacionalidad usa solo plazas disponibles del mismo tipo", () => {
  const roster = { adults: ["Perú", "USA", "USA"], children: ["Brasil"] };
  const draft = { adults: ["Perú", "USA"], children: ["Brasil"] };
  assert.deepEqual(availableParticipantCountries(draft, "adults", 1, roster), ["USA"]);
  assert.deepEqual(availableParticipantCountries(draft, "children", 0, roster), ["Brasil"]);
  assert.deepEqual(initialParticipantDraft(activity({ pax: 20 }), quote([
    ...roster.adults.map(country => passenger(country)), passenger("Brasil", "child"),
  ])), roster);
  const plan = buildParticipantPlan(draft);
  const quotation = quote([...roster.adults.map(country => passenger(country)), passenger("Brasil", "child")]);
  assert.deepEqual(initialParticipantDraft(activity({ pax: 3, participantPlan: plan }), quotation), draft);
  assert.match(bibliaParticipantPlanError(activity({ pax: 5 }), quotation), /superar/);
});

test("PERU USA legado permite configurar países individuales del día sin reemplazar el padrón", () => {
  const quotation = quote(Array.from({ length: 7 }, () => passenger("PERU USA")));
  const roster = quotationParticipantDraft(quotation)!;
  const draft = initialParticipantDraft(activity(), quotation);
  assert.deepEqual(draft, { adults: Array(7).fill(""), children: [] });
  assert.deepEqual(availableParticipantCountries(draft, "adults", 0, roster), getCountryNames());
  const selected = { adults: ["Perú", "Perú", "Estados Unidos", "Estados Unidos", "Estados Unidos"], children: [] };
  assert.equal(participantDraftError(selected, 5), "");
  assert.equal(participantQuotationError(selected, 5, quotation), "");
  assert.match(participantDraftError({ adults: ["PERU USA"], children: [] }, 1), /Selecciona/);
  assert.match(participantQuotationError({ ...selected, children: ["México"] }, 6, quotation), /niños/);
  assert.equal(participantNationalityLabel(null, "PERU USA"), "Perú, Estados Unidos");
  assert.deepEqual(quotation.passengers, Array.from({ length: 7 }, () => passenger("PERU USA")));
});

test("un alias seleccionado sigue visible junto a plazas de nacionalidad no definida", () => {
  const draft = { adults: ["USA", ""], children: [] };
  const html = renderToStaticMarkup(renderPanel(draft, { roster: { adults: ["PERU USA", ""], children: [] } }));
  assert.match(html, /value="USA" selected="">Estados Unidos/);
  assert.match(html, /value="Estados Unidos"/);
});

test("tabla, JPG y Excel muestran países únicos sin cantidades ni texto importado obsoleto", async () => {
  const plan = buildParticipantPlan({ adults: ["USA", "Estados Unidos", "Perú"], children: ["México", "México"] });
  const row = activity({ pax: 5, participantPlan: plan, nationality: "Argentina x5",
    date: new Date(2026, 8, 28), color: "#E7B8AE",
    sourceExcel: { richText: { nationality: [{ text: "Argentina x5" }] } } });
  assert.equal(participantNationalityLabel(plan), "Estados Unidos, Perú, México");
  assert.equal(participantNationalityLabel(null, "USA x2, Estados Unidos x3, Perú x1"), "Estados Unidos, Perú");
  assert.equal(participantNationalityLabel({ adults: { nationalities: {} }, children: null } as any), "—");
  const html = renderToStaticMarkup(<ParticipantPlanEditor activity={row} onSave={async () => {}} />);
  assert.match(html, />Estados Unidos, Perú, México<\/button>/);
  assert.doesNotMatch(html, /Editar distribución|Argentina|x5/);
  assert.equal(buildBibliaDayExportMatrix([row]).rows[0][4], "Estados Unidos, Perú, México");
  const { workbook, worksheet } = createBibliaDayExcelWorkbook({ date: row.date, activities: [row] });
  assert.equal(worksheet.getRow(4).getCell(5).value, "Estados Unidos, Perú, México");
  assert.equal((worksheet.getRow(4).getCell(5).fill as any).fgColor.argb, "FFE7B8AE");
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
});

test("modal espera al servidor, conserva error y borrador, mantiene foco y no auto-guarda", () => {
  const source = readFileSync(resolve("src/pages/Reservas/Calendario/components/ParticipantPlanEditor.tsx"), "utf8");
  assert.match(source, /if \(saving.current \|\| disabled\) return/);
  assert.match(source, /await onSave\(buildParticipantPlan\(draft\)\)/);
  assert.match(source, /catch \(saveError\) \{ setError/);
  assert.match(source, /aria-modal="true"/); assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /event.key === "Tab"/); assert.match(source, /trigger.current\?\.focus/);
  assert.doesNotMatch(source, /onBlur=/);
  const css = readFileSync(resolve("src/pages/Reservas/Calendario/components/ParticipantPlanEditor.scss"), "utf8");
  assert.match(css, /max-width: 640px/); assert.match(css, /100dvh/); assert.match(css, /overflow: auto/);
});
