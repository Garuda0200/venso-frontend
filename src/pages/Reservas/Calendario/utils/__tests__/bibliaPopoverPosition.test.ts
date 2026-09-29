import assert from "node:assert/strict";
import { calculateBibliaPopoverPosition } from "../bibliaPopoverPosition";

const anchor = { top: 320, left: 1500, right: 1540, width: 40, height: 32 };

const opensToTheLeft = calculateBibliaPopoverPosition({
  anchor,
  panelWidth: 330,
  panelHeight: 420,
  viewportWidth: 1900,
  viewportHeight: 900,
});
assert.equal(opensToTheLeft.left, 1162, "en escritorio prioriza el espacio libre a la izquierda de acciones");
assert.ok(opensToTheLeft.top >= 12, "el panel no sale por la parte superior");

const flipsToTheRight = calculateBibliaPopoverPosition({
  anchor: { top: 80, left: 20, right: 60, width: 40, height: 32 },
  panelWidth: 280,
  panelHeight: 260,
  viewportWidth: 900,
  viewportHeight: 700,
});
assert.equal(flipsToTheRight.left, 68, "si no hay espacio a la izquierda abre a la derecha");

const clampsOnMobile = calculateBibliaPopoverPosition({
  anchor: { top: 700, left: 340, right: 376, width: 36, height: 36 },
  panelWidth: 500,
  panelHeight: 800,
  viewportWidth: 390,
  viewportHeight: 780,
});
assert.equal(clampsOnMobile.left, 12, "el panel ancho queda dentro del viewport móvil");
assert.equal(clampsOnMobile.top, 12, "el panel alto queda dentro del viewport móvil");
assert.equal(clampsOnMobile.maxWidth, 366);
assert.equal(clampsOnMobile.maxHeight, 756);

console.log("bibliaPopoverPosition.test.ts: OK");
