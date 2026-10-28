import { passengerIdMatchesSet } from "./igvUtils";
import { getServiceBeneficiarySnapshot } from "./passengerPricingState";
import {
  buildServiceAdultPricingRows,
  buildServiceChildPricingRows,
  getPassengerPresentation,
  resolveServiceAdultUnitPriceForPresentation,
} from "./passengerPricingPresentation";

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const list = (value) => Array.isArray(value) ? value : [];

const hasQuotedLists = (service = {}) =>
  Array.isArray(service.beneficiariosAdultos) ||
  Array.isArray(service.beneficiarios_adultos) ||
  Array.isArray(service.beneficiariosNinos) ||
  Array.isArray(service.beneficiarios_ninos);

const isActiveService = (service = {}) =>
  service?.is_active !== false &&
  service?.isActive !== false &&
  String(service?.version_status || service?.versionStatus || "").toUpperCase() !== "REMOVED";

const isHotel = (service = {}) =>
  String(
    service?.typeService || service?.tipo_servicio ||
    service?.parentService?.typeService || service?.parentService?.tipo_servicio || "",
  ).toLowerCase().includes("hotel");

const readDays = (value) => list(value);

/**
 * One immutable component for every quoted service and beneficiary. The
 * passenger identity comes from the roster; the tariff identity comes from
 * the persisted beneficiary lists or a new service's explicit runtime
 * selection. Cuatrimoto units and ticket variants share their commercial
 * adult cost across all quotation adults, without changing nominal lists.
 */
export const buildServiceBeneficiaryPricingLedger = ({
  days = [],
  externalDays = [],
  peopleDetails = {},
} = {}) => {
  const passengers = [
    ...list(peopleDetails.adults).map((person, index) => ({
      ...getPassengerPresentation(person, "adult", index),
      id: `adult:${index + 1}`,
      audience: "adult",
    })),
    ...list(peopleDetails.children).map((person, index) => ({
      ...getPassengerPresentation(person, "child", index),
      id: `child:${index + 1}`,
      audience: "child",
    })),
  ];
  const quotationAdults = passengers.filter(person => person.audience === "adult");
  const quotationChildren = passengers.filter(person => person.audience === "child");
  const byPassenger = new Map(passengers.map((passenger) => [passenger.id, []]));
  const unallocated = [];
  const roundingAdjustments = [];
  const services = [];
  let serviceCount = 0;
  let complete = true;

  for (const [scope, itinerary] of [["main", days], ["external", externalDays]]) {
    readDays(itinerary).forEach((day, dayIndex) => {
      if (day?.is_active === false || day?.isActive === false) return;
      list(day?.servicios || day?.services).forEach((service, serviceIndex) => {
        if (!isActiveService(service) || isHotel(service)) return;
        serviceCount += 1;
        const hasPersistedBeneficiaries = hasQuotedLists(service);
        const hasRuntimeSelection = Array.isArray(service?.assignedPassengerIds) ||
          Array.isArray(service?.passengerSelection?.selectedIds);
        if (!hasPersistedBeneficiaries && !hasRuntimeSelection) {
          complete = false;
          return;
        }

        // Persisted quoted lists stay independent of operational assignments.
        // ServicePicker has explicit quoted IDs before its first DB save.
        const beneficiaries = getServiceBeneficiarySnapshot(hasPersistedBeneficiaries
          ? { ...service, assignedPassengerIds: undefined, passengerSelection: undefined }
          : service,
        );
        const quotedIds = beneficiaries.selectedIds;
        const quotedChildPrices = beneficiaries.childPriceMap;
        const quotedConversions = Object.fromEntries(beneficiaries.convertedEntries.map(({ childId }) => [childId, true]));
        const pricedService = {
          ...service,
          assignedPassengerIds: quotedIds,
          assignedChildExplicitPriceMap: quotedChildPrices,
          convertedChildToAdultMap: quotedConversions,
          children: undefined,
          passengerSelection: {
            ...(service.passengerSelection || {}),
            selectedIds: quotedIds,
            assignedChildExplicitPriceMap: quotedChildPrices,
            convertedChildToAdultMap: quotedConversions,
          },
        };

        const serviceId = String(
          service?.version_uid || service?.versionUid ||
          service?.id || `${scope}:${dayIndex}:${serviceIndex}`,
        );
        const key = `${scope}:${dayIndex}:${serviceIndex}:${serviceId}`;
        const amountAdult = resolveServiceAdultUnitPriceForPresentation(pricedService);
        const sharedAdultCost = false, sharedChildCost = false;
        const adultRows = buildServiceAdultPricingRows({ service: pricedService, peopleDetails, adultUnitFallback: amountAdult });
        const childRows = buildServiceChildPricingRows({ service: pricedService, peopleDetails, adultUnitFallback: amountAdult });
        const rows = [
          ...adultRows
            .map((row) => ({ ...row, audience: "adult", tariffType: "adult" })),
          ...childRows
            .map((row) => ({
              ...row,
              audience: "child",
              tariffType: row.asAdult ? "child_as_adult" : "child",
            })),
        ];
        const seen = new Set();
        const allocatedComponents = [];
        rows.forEach((row) => {
          const passenger = passengers.find((candidate) =>
            candidate.audience === row.audience &&
            passengerIdMatchesSet(row.adultId || row.childId, candidate.aliases),
          );
          if (!passenger) {
            complete = false;
            return;
          }
          if (seen.has(passenger.id)) return;
          seen.add(passenger.id);
          const component = {
            serviceKey: key,
            serviceId,
            scope,
            dayIndex,
            dayNumber: Number(day?.numero ?? day?.number ?? dayIndex + 1),
            passengerId: passenger.id,
            tariffType: row.tariffType,
            amount: (sharedAdultCost && row.audience === "adult") || (sharedChildCost && row.audience === "child")
              ? row.amount : round2(row.amount),
            currency: service?.moneda || service?.currency || "USD",
            exchangeRate: Number(service?.tasaCambio ?? service?.tasa_cambio ?? 0),
            igv: Boolean(service?.igv),
          };
          byPassenger.get(passenger.id).push(component);
          allocatedComponents.push(component);
        });
        if (allocatedComponents.length > 0) {
          services.push({
            key,
            name: String(
              service?.nombre || service?.title ||
              service?.parentService?.nombre ||
              service?.parentService?.nombre_transporte ||
              service?.parentService?.nombre_empresa ||
              service?.parentService?.nombre_agencia ||
              service?.childService?.nombre ||
              service?.childService?.ticket?.entrada ||
              service?.typeService || "Servicio",
            ).trim(),
            audiences: [...new Set(allocatedComponents.map((item) =>
              item.passengerId.startsWith("child:") ? "child" : "adult",
            ))],
          });
        }

        const isGrouped = (service?.tipoPrecio ?? service?.tipo_precio) === "compartido"
          || service?.precioAdultoDividido === true || service?.precio_adulto_dividido === true;
        // precioServicio is the adult-tariff base, while precioTotal includes
        // explicit child fares. A hydrated row may omit precioTotal; include
        // those fares when reconstructing its commercial total for the ledger.
        const flatBasePrice = service?.precioServicio ?? service?.precio_servicio;
        const explicitChildAmount = childRows.filter(row => !row.asAdult).reduce(
          (sum, row) => sum + Number(row.amount || 0), 0,
        );
        const quotedTotal = round2(
          service?.precioTotal ?? service?.precio_total ??
          (isGrouped ? flatBasePrice != null
            ? Number(flatBasePrice) + explicitChildAmount
            : service?.tariff?.precio_original_with_child_extras ??
              Number(service?.tariff?.precio_original || 0) + explicitChildAmount : 0),
        );
        const allocatedTotal = round2(allocatedComponents.reduce(
          (sum, component) => sum + component.amount, 0,
        ));
        if (seen.size === 0 && quotedTotal > 0 && !isGrouped) {
          // A per-person charge without a recipient has no valid allocation.
          // Keep the quote on the legacy/diagnostic path until it is corrected.
          complete = false;
        }
        if (isGrouped) {
          const remainder = round2(quotedTotal - allocatedTotal);
          const adultRatedCount = allocatedComponents.filter((component) =>
            component.tariffType === "adult" || component.tariffType === "child_as_adult",
          ).length;
          const divisionCapacity = adultRatedCount;
          // Equal recipients share the same rounded unit price. Reconcile up
          // to half a cent per divided tariff at service level, never on the
          // first passenger. Unused fixed-capacity places remain real charges.
          const isDivisionRounding = adultRatedCount > 0 &&
            adultRatedCount === divisionCapacity &&
            Math.abs(remainder) <= adultRatedCount * 0.005 + 1e-9;
          if (isDivisionRounding) {
            if (remainder !== 0) {
              roundingAdjustments.push({
                serviceKey: key,
                scope,
                dayIndex,
                dayNumber: Number(day?.numero ?? day?.number ?? dayIndex + 1),
                amount: remainder,
                quotedTotal,
              });
            }
          } else if (remainder < -0.01) {
            complete = false;
          } else if (remainder > 0) {
            unallocated.push({
              serviceKey: key,
              scope,
              dayIndex,
              dayNumber: Number(day?.numero ?? day?.number ?? dayIndex + 1),
              amount: remainder,
            });
          }
        }
      });
    });
  }

  // Mixed legacy services cannot be interpreted as a complete individual
  // ledger. Keep their existing aggregate presentation until corrected.
  return {
    passengers,
    byPassenger,
    unallocated,
    roundingAdjustments,
    services,
    complete: complete && serviceCount > 0,
  };
};

export const getServiceComponentSignature = (components = []) =>
  [...components]
    .sort((left, right) => String(left.serviceKey).localeCompare(String(right.serviceKey)))
    .map((component) => [
      component.serviceKey,
      component.dayNumber,
      component.tariffType,
      component.amount.toFixed(2),
      component.currency,
      Number(component.exchangeRate || 0).toFixed(4),
      component.igv ? 1 : 0,
    ].join(":"))
    .join("|");

export const getPassengerServiceComponents = (ledger, passengerId, scope = "main") =>
  list(ledger?.byPassenger?.get(passengerId)).filter((component) =>
    component.scope === scope,
  );

/** Service prices per exact passenger cohort for a day or the full itinerary. */
export const buildServicePricingGroups = (ledger, dayIndex = null) => {
  if (!ledger?.complete) return [];
  const matching = (component) => component.scope === "main" &&
    (dayIndex === null || component.dayIndex === dayIndex);
  const relevantServices = list(ledger.services).filter((service) =>
    service.key.startsWith(dayIndex === null ? "main:" : `main:${dayIndex}:`),
  );
  const groups = new Map();
  list(ledger.passengers).forEach((passenger) => {
    if (!relevantServices.some((service) => service.audiences.includes(passenger.audience))) return;
    const components = list(ledger.byPassenger?.get(passenger.id)).filter(matching);
    const amount = round2(components.reduce((sum, component) => sum + component.amount, 0));
    const signature = `${passenger.audience}|${getServiceComponentSignature(components)}`;
    const existing = groups.get(signature);
    if (existing) {
      existing.beneficiaries += 1;
      existing.passengerIds.push(passenger.id);
      return;
    }
    const received = new Set(components.map((component) => component.serviceKey));
    groups.set(signature, {
      key: signature,
      audience: passenger.audience,
      beneficiaries: 1,
      passengerIds: [passenger.id],
      value: amount,
      excludedServices: relevantServices.filter((service) =>
        service.audiences.includes(passenger.audience) && !received.has(service.key),
      ),
    });
  });
  return [...groups.values()];
};

export const findLedgerPassenger = (ledger, rawId) =>
  ledger?.passengers?.find((passenger) =>
    passengerIdMatchesSet(rawId, passenger.aliases),
  ) || null;

export const buildUnallocatedServiceChargeParts = (ledger) =>
  ledger?.complete
    ? list(ledger.unallocated).map((charge, index) => ({
        key: `service-charge-${charge.serviceKey}-${index}`,
        label: `Cargo del servicio · día ${charge.dayNumber}`,
        roomLabel: "Cargo del servicio",
        roomKey: "service-charge",
        audience: "charge",
        beneficiaries: 0,
        passengerIds: [],
        isServiceCharge: true,
        serviceKey: charge.serviceKey,
        dayNumber: charge.dayNumber,
        value: charge.amount,
        displayValue: Math.ceil(charge.amount),
        roundedValue: Math.ceil(charge.amount),
        lineTotal: Math.ceil(charge.amount),
        commissionableValue: charge.amount,
      }))
    : [];

/**
 * Split existing room rows by the exact service vector received by each
 * person. If a legacy room cannot be mapped unambiguously, keep its previous
 * aggregate row instead of inventing an allocation.
 */
export const applyServiceBeneficiaryLedgerToParts = ({
  parts = [],
  ledger,
  additionalCosts = {},
  calculateAdditional,
  allowNoRoomFallback = false,
} = {}) => {
  if (!ledger?.complete || typeof calculateAdditional !== "function") {
    return { parts, applied: false };
  }
  const sourceParts = list(parts);
  const assignments = new Map();

  for (const audience of ["adult", "child"]) {
    const people = ledger.passengers.filter((person) => person.audience === audience);
    let roomParts = sourceParts.filter((part) =>
      (part.audience || (/child|niñ|nino|menor/i.test(`${part.key || ""} ${part.label || ""}`)
        ? "child" : "adult")) === audience,
    );
    if (people.length === 0) continue;
    if (roomParts.length === 0 && allowNoRoomFallback) {
      roomParts = [{
        key: `no-room-${audience}`,
        roomKey: "sin-hotel",
        roomLabel: "Sin hotel",
        audience,
        beneficiaries: people.length,
        hotel: 0,
      }];
    }
    if (roomParts.length === 0) return { parts, applied: false };

    for (const part of roomParts) {
      const ids = list(part.passengerIds);
      let matched = ids
        .map((id) => findLedgerPassenger(ledger, id))
        .filter((person) => person?.audience === audience);
      matched = [...new Map(matched.map((person) => [person.id, person])).values()];
      if (matched.length === 0 && roomParts.length === 1) matched = people;
      if (matched.length === 0) return { parts, applied: false };
      const statedCount = Number(part.beneficiaries ?? part.count ?? part.pax ??
        String(part.label || "").match(/\((\d+)\)/)?.[1] ?? 1);
      if (matched.length !== statedCount) {
        return { parts, applied: false };
      }
      for (const person of matched) {
        if (assignments.has(person.id)) return { parts, applied: false };
        assignments.set(person.id, part);
      }
    }
    if (people.some((person) => !assignments.has(person.id))) {
      return { parts, applied: false };
    }
  }

  const grouped = new Map();
  ledger.passengers.forEach((passenger) => {
    const roomPart = assignments.get(passenger.id);
    if (!roomPart) return;
    const main = getPassengerServiceComponents(ledger, passenger.id, "main");
    const externalComponents = getPassengerServiceComponents(ledger, passenger.id, "external");
    const services = round2(main.reduce((sum, component) => sum + component.amount, 0));
    const external = round2(externalComponents.reduce((sum, component) => sum + component.amount, 0));
    const hotel = round2(roomPart.hotel);
    const base = round2(services + hotel);
    const additional = calculateAdditional(base, additionalCosts, passenger.audience);
    const total = round2(base + Number(additional?.total || 0) + external);
    const cohortSignature = [
      passenger.audience,
      roomPart.roomKey || roomPart.roomLabel || roomPart.label,
      roomPart.roomInstanceKey || roomPart.sourceRoomKey || "",
      roomPart.stayGroup || roomPart.category || "",
      roomPart.hasIgv || roomPart.tieneIgv ? "igv" : "sin-igv",
      round2(roomPart.igvPerPerson).toFixed(2),
      getServiceComponentSignature([...main, ...externalComponents]),
      hotel.toFixed(2),
      round2(additional?.total).toFixed(2),
      total.toFixed(2),
    ].join("||");
    const existing = grouped.get(cohortSignature);
    if (existing) {
      existing.beneficiaries += 1;
      existing.passengerIds.push(passenger.id);
      existing.lineTotal = existing.displayValue * existing.beneficiaries;
      return;
    }
    const displayValue = Math.ceil(total);
    const receivedServices = new Set([...main, ...externalComponents].map(
      (component) => component.serviceKey,
    ));
    const excludedServices = list(ledger.services).filter((service) =>
      service.audiences.includes(passenger.audience) &&
      !receivedServices.has(service.key),
    );
    grouped.set(cohortSignature, {
      ...roomPart,
      key: `${roomPart.key || "room"}-cohort-${grouped.size + 1}`,
      label: roomPart.roomLabel || roomPart.label,
      audience: passenger.audience,
      cohortSignature,
      serviceComponents: [...main, ...externalComponents],
      excludedServices,
      passengerIds: [passenger.id],
      beneficiaries: 1,
      services,
      hotel,
      additional: round2(additional?.total),
      operational: round2(additional?.operational),
      fee: round2(additional?.fee),
      contingency: round2(additional?.extra),
      external,
      externalPerPerson: external,
      commissionableValue: round2(total - external),
      value: total,
      displayValue,
      roundedValue: displayValue,
      lineTotal: displayValue,
      isFree: total <= 0,
    });
  });

  return {
    parts: [...grouped.values()].map((part) => {
      const baseLabel = String(part.label || "Beneficiarios")
        .replace(/\s*\(\d+\)\s*$/, "")
        .trim();
      return {
        ...part,
        label: `${baseLabel} (${part.beneficiaries})`,
      };
    }),
    applied: true,
  };
};

/** Shared adapter for editor, cost panel, saved quotes and read-only summaries. */
export const reconcileBeneficiaryParts = ({ parts, days, externalDays, peopleDetails, additionalCosts, calculateAdditional, allowNoRoomFallback = false }) => {
  const ledger = buildServiceBeneficiaryPricingLedger({ days, externalDays, peopleDetails });
  const result = applyServiceBeneficiaryLedgerToParts({ parts, ledger, additionalCosts, calculateAdditional, allowNoRoomFallback });
  return [...result.parts, ...(result.applied ? buildUnallocatedServiceChargeParts(ledger) : [])];
};
