import assert from "node:assert/strict";
import {
  hotelRoomCacheIdentity,
  shouldEnableHotelDictionary,
} from "../editorRenderOptimization";

const passengerStep = "pasajeros";
assert.equal(
  shouldEnableHotelDictionary({ currentStep: passengerStep, passengerStep }),
  false,
  "una cotización nueva en Pasajeros no debe cargar el catálogo hotelero",
);
assert.equal(
  shouldEnableHotelDictionary({ currentStep: "itinerario", passengerStep }),
  true,
  "entrar a Itinerario habilita el catálogo hotelero",
);
assert.equal(
  shouldEnableHotelDictionary({ currentStep: passengerStep, passengerStep, showHotelModal: true }),
  true,
  "abrir el tarifario habilita el catálogo aunque siga en Pasajeros",
);
assert.equal(
  shouldEnableHotelDictionary({ currentStep: passengerStep, passengerStep, hasExistingHotel: true }),
  true,
  "editar una cotización que ya tiene hotel hidrata el catálogo para preservar su configuración",
);
assert.equal(hotelRoomCacheIdentity(17), hotelRoomCacheIdentity("17"));
assert.notEqual(hotelRoomCacheIdentity(17), hotelRoomCacheIdentity(18));
console.log("editorRenderOptimization.test.ts: PASS");
