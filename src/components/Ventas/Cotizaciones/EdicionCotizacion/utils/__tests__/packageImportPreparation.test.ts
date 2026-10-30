import test from "node:test";
import assert from "node:assert/strict";
import { prepareImportedPackageItinerary } from "../packageImportPreparation";

test("import preparation preserves prices and day modes while replacing old passenger membership", () => {
  const input = [{ numero: 1, titulo: "Dos tours", tipoServicio: "mixto", servicios: [
    { typeService: "transportes", parentService: {typeService:"transportes"}, precioServicio: 0,
      tipoPrecio:"privado", moneda:"dolares", beneficiariosAdultos:[{id:"adult:0:old"}],
      beneficiariosNinos:[{id:"child:0:old",precio:7.31}] },
    { typeService: "hoteles", parentService: {typeService:"hoteles"}, precioServicio:99 },
  ] }];
  const before=JSON.stringify(input);
  const output=prepareImportedPackageItinerary(input);
  assert.equal(output[0].tipoServicio,"mixto");
  assert.equal(output[0].titulo,"Dos tours");
  assert.equal(output[0].servicios.length,1);
  assert.equal(output[0].servicios[0].precioServicio,0);
  assert.deepEqual(output[0].servicios[0].assignedPassengerIds,[]);
  assert.deepEqual(output[0].servicios[0].passengerSelection.selectedIds,[]);
  assert.equal(output[0].servicios[0].beneficiariosAdultos,undefined);
  assert.equal(output[0].servicios[0].beneficiariosNinos,undefined);
  assert.equal(JSON.stringify(input),before);
});
