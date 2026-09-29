import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/pages/Reservas/Calendario/Calendario.tsx"),
  "utf8",
);
const start = source.indexOf("const EditableValue =");
const end = source.indexOf("const SortableBibliaRow =", start);

assert.ok(start >= 0 && end > start, "debe existir el componente EditableValue");
const editableValueSource = source.slice(start, end);

assert.doesNotMatch(
  editableValueSource,
  /list=\{listId\}/,
  "EditableValue no debe referenciar un listId inexistente",
);
assert.match(
  editableValueSource,
  /if \(isBibliaCatalogField\(field\)\)[\s\S]*?<SmartComboBox/,
  "los campos con catálogo deben conservar SmartComboBox como selector",
);
assert.match(
  editableValueSource,
  /className="biblia-edit-input"[\s\S]*?type=\{inputType\}/,
  "los campos simples deben conservar su editor nativo",
);

console.log("bibliaEditableValueSource.test.ts: OK");
