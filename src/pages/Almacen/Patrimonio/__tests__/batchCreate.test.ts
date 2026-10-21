import assert from "node:assert/strict";
import {
  BASE_COLUMNS,
  buildBatchPayload,
  emptyRow,
  isGridPaste,
  pasteGrid,
  previewCodes,
  resizeRows,
} from "../batchCreate";

{
  const rows = [emptyRow(), { ...emptyRow(), codigo: "pt 8" }, emptyRow(), emptyRow()];
  assert.deepEqual(previewCodes(rows, "PT-07"), ["PT-07", "PT-08", "PT-09", "PT-10"]);
}

{
  const rows = [emptyRow(), emptyRow(), { ...emptyRow(), codigo: "PT-08" }];
  assert.deepEqual(
    previewCodes(rows, "PT-07"),
    ["PT-07", "PT-09", "PT-08"],
    "un código manual posterior no se reutiliza para filas automáticas",
  );
}

{
  assert.equal(resizeRows([], 3).length, 3);
  assert.equal(resizeRows([emptyRow(), emptyRow()], 1).length, 1);
  assert.equal(resizeRows([], 500).length, 100);
  assert.equal(resizeRows([], 0).length, 1);
}

{
  const columns = [...BASE_COLUMNS, { key: "color", label: "Color" }];
  const pasted = pasteGrid(
    resizeRows([], 1),
    columns,
    0,
    "nombre",
    "Monitor sala\tSN-1\tNegro\r\nMonitor caja\tSN-2\tBlanco\r\n",
  );
  assert.equal(pasted.length, 2, "agrega filas para lo pegado");
  assert.equal(pasted[0].nombre, "Monitor sala");
  assert.equal(pasted[0].atributos.serie, "SN-1");
  assert.equal(pasted[1].atributos.color, "Blanco");
  assert.equal(pasted[1].codigo, "");
  assert.equal(isGridPaste("solo texto\n"), false);
  assert.equal(isGridPaste("a\tb"), true);
}

{
  const payload = buildBatchPayload(
    {
      categoria: " Monitor ",
      nombre: "",
      estado: "operativo",
      ubicacion: " Oficina 2 ",
      descripcion: "",
      responsable_nombre: "",
      responsable_dni: "",
      atributos: { marca: "LG", color: "" },
    },
    [
      { codigo: "", nombre: "", atributos: {} },
      { codigo: "pt 9", nombre: "Monitor caja", atributos: { serie: " SN-2 " } },
    ],
  );
  assert.equal(payload.categoria, "Monitor");
  assert.equal(payload.responsable_actual, null);
  assert.equal(payload.info.nombre, "Monitor");
  assert.equal(payload.info.ubicacion, "Oficina 2");
  assert.deepEqual(payload.info.atributos, { marca: "LG" });
  assert.deepEqual(payload.items[0], { codigo: null, info: {} });
  assert.deepEqual(payload.items[1], {
    codigo: "PT-09",
    info: { nombre: "Monitor caja", atributos: { serie: "SN-2" } },
  });
}

console.log("batchCreate tests passed");
