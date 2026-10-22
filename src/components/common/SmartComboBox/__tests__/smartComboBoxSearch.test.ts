import assert from "node:assert/strict";
import { visibleSmartComboBoxOptions } from "../smartComboBoxSearch";

const options = ["Cusco", "Lima", "Valle Sagrado"];

{
  // Sin filterOnTyping se mantiene el filtrado por el valor actual.
  assert.deepEqual(visibleSmartComboBoxOptions(options, "cusco"), ["Cusco"]);
}

{
  // Un valor precargado no oculta las demás opciones hasta que se escribe.
  assert.deepEqual(
    visibleSmartComboBoxOptions(options, "Cusco", { filterOnTyping: true, typed: false }),
    options,
  );
  assert.deepEqual(
    visibleSmartComboBoxOptions(options, "val", { filterOnTyping: true, typed: true }),
    ["Valle Sagrado"],
  );
}

console.log("smartComboBoxSearch tests passed");
