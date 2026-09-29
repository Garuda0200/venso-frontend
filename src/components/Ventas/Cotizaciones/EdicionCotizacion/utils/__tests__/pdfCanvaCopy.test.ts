import assert from "node:assert/strict";
import {
  formatPdfCanvaDuration,
  getPdfCanvaCopy,
  normalizePdfCanvaLanguage,
} from "../pdfCanvaCopy";

assert.equal(normalizePdfCanvaLanguage("es"), "es");
assert.equal(normalizePdfCanvaLanguage("EN-us"), "en");
assert.equal(normalizePdfCanvaLanguage("pt-BR"), "pt");
assert.equal(normalizePdfCanvaLanguage("fr"), "es");

assert.deepEqual(formatPdfCanvaDuration(1, "es"), {
  days: "1 DÍA",
  nights: "0 NOCHES",
});
assert.deepEqual(formatPdfCanvaDuration(2, "en"), {
  days: "2 DAYS",
  nights: "1 NIGHT",
});
assert.deepEqual(formatPdfCanvaDuration(4, "pt"), {
  days: "4 DIAS",
  nights: "3 NOITES",
});

assert.equal(getPdfCanvaCopy("en").dayScript, "Day");
assert.match(getPdfCanvaCopy("en").firstDayIntro, /Venso Tours/);
assert.equal(getPdfCanvaCopy("pt").editor.cover, "Capa");

console.log("pdfCanvaCopy.test: PASS");
