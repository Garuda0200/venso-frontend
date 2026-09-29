import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildBibliaQuotationCreationDraft,
  canCreateQuotationFromBiblia,
} from "../bibliaQuotationCreation";

const standalone = {
  id: "standalone:row-1",
  sourceType: "standalone",
  standaloneRecordId: "row-1",
  file: " DK0553 ",
  reservationName: " CARLOS ZAVALETA ",
  excursion: "MONTAÑA DE COLORES",
} as any;

assert.deepEqual(buildBibliaQuotationCreationDraft(standalone), {
  voucherCode: "DK0553",
  title: "CARLOS ZAVALETA",
});
assert.equal(
  canCreateQuotationFromBiblia({ activity: standalone, voucherCode: "DK0553", submittingActivityId: null }),
  true,
  "una fila libre con código de file debe permitir crear y vincular",
);
assert.equal(
  canCreateQuotationFromBiblia({ activity: standalone, voucherCode: "   ", submittingActivityId: null }),
  false,
  "el backend exige un código de file no vacío",
);
assert.equal(
  canCreateQuotationFromBiblia({ activity: standalone, voucherCode: "DK0553", submittingActivityId: "row-2" }),
  false,
  "no se debe iniciar otra creación mientras existe una solicitud activa",
);
assert.equal(
  canCreateQuotationFromBiblia({
    activity: { ...standalone, sourceType: "quotation", standaloneRecordId: "" },
    voucherCode: "DK0553",
    submittingActivityId: null,
  }),
  false,
  "solo una actividad independiente puede convertirse en cotización",
);

const fallback = buildBibliaQuotationCreationDraft({
  ...standalone,
  file: "—",
  reservationName: "—",
  excursion: "CITY TOUR",
});
assert.deepEqual(fallback, { voucherCode: "", title: "CITY TOUR" });

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.scss"),
  "utf8",
);
assert.match(
  stylesheet,
  /\.biblia-link-popover\.is-floating,[\s\S]*?--biblia-green:\s*#006b4f/,
  "el popover portaleado debe redeclarar la paleta fuera del alcance de .biblia-page",
);
assert.match(
  stylesheet,
  /&__create-submit[\s\S]*?background:\s*var\(--biblia-green,\s*#006b4f\)\s*!important/,
  "el botón principal debe conservar un fondo visible incluso sin herencia CSS",
);

console.log("bibliaQuotationCreation.test.ts: OK");
