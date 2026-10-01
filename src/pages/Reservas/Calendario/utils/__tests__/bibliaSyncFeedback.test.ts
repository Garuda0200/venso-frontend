import assert from "node:assert/strict";
import { getBibliaSaveError, getBibliaSyncWarnings } from "../bibliaSyncFeedback";

assert.deepEqual(getBibliaSyncWarnings({ data: { warnings: [" Falta ruta ", "Falta ruta", null, ""] } }), ["Falta ruta"]);
assert.deepEqual(getBibliaSyncWarnings({ actividad: { syncWarnings: ["Revisa tarifa"] } }), ["Revisa tarifa"]);
assert.deepEqual(getBibliaSyncWarnings({ service_count: 4 }), []);
assert.equal(getBibliaSaveError({ response: { data: { message: "El transporte no soporta el PAX" } } }, "Error"), "El transporte no soporta el PAX");
assert.equal(getBibliaSaveError({}, "No se guardó"), "No se guardó");
console.log("Biblia sync feedback: PASS");
