import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.tsx"),
  "utf8",
);

assert.doesNotMatch(
  source,
  /dayPresentation|renderDayAgenda|MdViewAgenda|>\s*Agenda\s*</,
  "la vista diaria no debe conservar estado, render ni controles del modo Agenda",
);
assert.match(
  source,
  /dayActivities\.length === 0[\s\S]*?: renderDaySheet\(\)/,
  "la vista diaria debe renderizar directamente la tabla Biblia cuando existen registros",
);

console.log("bibliaSingleDayViewSource.test.ts: OK");
