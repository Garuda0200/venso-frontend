/** Execute the actual editor callbacks for unit and HTTP/PostgreSQL contracts. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import * as passengerState from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingState";
import * as pricingRuntime from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/servicePricingRuntime";
import * as serviceManager from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { getDivisionCountsForService } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import { detectServiceType } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/serviceTypeMapper";
import { isOperationallyAssignedService, preserveOperationallyAssignedServices } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/assignmentProtection";
import { pruneEmptyMutableTicketCohorts } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/passengerPricingReconciliation";

const relativeRoot = "src/components/Ventas/Cotizaciones/EdicionCotizacion";
const root = existsSync(path.resolve(relativeRoot)) ? path.resolve(relativeRoot)
  : path.resolve("../venso-tours-frontend", relativeRoot);
const readComponent = (file: string) => transformSync(readFileSync(path.join(root, file), "utf8"), { loader: "tsx", jsx: "preserve" }).code;
const main = readComponent("components/DaysEditor/DaysEditor.tsx");
const external = readComponent("components/ExternalItineraryEditor/ExternalItineraryEditor.tsx");
const declaration = (source: string, name: string) => {
  const start = new RegExp("^([ \\t]*)const " + name + " =", "m").exec(source);
  assert.ok(start, "Missing callback " + name);
  const tail = source.slice(start.index + start[0].length);
  const end = new RegExp("^" + start[1] + "(?:const |return |\\};)", "m").exec(tail);
  assert.ok(end, "Missing callback end " + name);
  return source.slice(start.index, start.index + start[0].length + end.index + (end[0].endsWith("};") ? end[0].length : 0));
};

export function executeTicketPriceEditor(service: any, price: number, scope: string, people: any) {
  let days = [{ numero: 1, servicios: [structuredClone(service)] }];
  const before = JSON.stringify(service);
  const { allPassengerIds } = serviceManager.getPassengerIdsByType(people);
  const context = { ...passengerState, ...pricingRuntime, ...serviceManager,
    days, totalPassengers: allPassengerIds.length, getDivisionCountsForService, detectServiceType,
    editingPrice: { dayIndex: 0, serviceIndex: 0, value: String(price), isDirectEdit: true },
    exchangeRate: 3, baseTcRef: { current: 3 }, fxBaseRef: { current: new Map() }, buildBaseForService: (s: any) => s,
    setDays: (update: any) => { days = update(days); }, setEditingPrice: () => {}, useCallback: (fn: any) => fn,
    normalizedPeopleDetails: people, allPassengerIds, isOperationallyAssignedService,
    preserveOperationallyAssignedServices, pruneEmptyMutableTicketCohorts, INITIAL_EDITING_PRICE: {},
  };
  delete context.default;
  const code = scope === "main" ? declaration(main, "applyAdjustment")
    : ["parseMoney", "normalizeServicesForPeople", "syncServicePassengerState", "normalizeServiceForDisplay", "updateServiceByIndex", "getServiceCapacityForEdit", "applyAdjustment"]
      .map(name => declaration(external, name)).join("\n");
  new Function(...Object.keys(context), code + "\napplyAdjustment();")(...Object.values(context));
  assert.equal(JSON.stringify(service), before, "React's previous state must remain unchanged");
  return days[0].servicios[0];
}
