import { passengerIdMatchesSet } from "./igvUtils";
import { getPassengerPresentation } from "./passengerPricingPresentation";
import { getServiceBeneficiarySnapshot } from "./passengerPricingState";
import { childServiceCapacity } from "./childServiceBeneficiaries";

const entries = (value) => Array.isArray(value) ? value : [];

export const buildAdultServiceRows = (adults = []) =>
  entries(adults).map((person, index) => {
    const presentation = getPassengerPresentation(person, "adult", index);
    return {
      id: `adult:${index}:${person?.id ?? person?.id_pasajero ?? index + 1}`,
      label: presentation.label,
      aliases: presentation.aliases,
      isNational: presentation.isNational,
    };
  });

export const isAdultServiceBeneficiary = (service, row) =>
  getServiceBeneficiarySnapshot(service).adultIds.some((id) =>
    passengerIdMatchesSet(id, row.aliases),
  );

/** Change adult membership only. Child prices and child-as-adult tariff stay intact. */
export const setAdultServiceBeneficiary = (service = {}, row, included) => {
  if (!row?.id) return service;
  const snapshot = getServiceBeneficiarySnapshot(service);
  const matching = (id) => passengerIdMatchesSet(id, row.aliases);
  const selectedIds = snapshot.selectedIds.filter((id) => !matching(id));
  const capacity = childServiceCapacity(service);
  if (included && capacity && selectedIds.length >= capacity) return service;
  if (included) selectedIds.push(row.id);
  const convertedChildToAdultMap = {
    ...(snapshot.pricingState?.convertedChildToAdultMap || {}),
    ...(service.passengerSelection?.convertedChildToAdultMap || {}),
    ...(service.convertedChildToAdultMap || {}),
  };
  snapshot.convertedEntries.forEach(({ childId, revertKey }) => {
    if (String(revertKey).startsWith("adult:")) {
      convertedChildToAdultMap[revertKey] = childId;
    } else {
      convertedChildToAdultMap[childId] = true;
    }
  });

  const existingAdults = service.beneficiariosAdultos ?? service.beneficiarios_adultos;
  const existingChildren = service.beneficiariosNinos ?? service.beneficiarios_ninos;
  const adultEntries = Array.isArray(existingAdults)
    ? existingAdults
    : [
        ...snapshot.adultIds.map((id) => ({ id })),
        ...snapshot.convertedEntries.map(({ childId, revertKey }) => ({
          id: revertKey || childId,
          child_origin: childId,
        })),
      ];
  const beneficiariosAdultos = adultEntries.filter((entry) => {
    const id = typeof entry === "string" ? entry : entry?.id;
    return entry?.child_origin || !matching(String(id || ""));
  });
  if (included) beneficiariosAdultos.push({ id: row.id });
  const beneficiariosNinos = Array.isArray(existingChildren)
    ? existingChildren
    : snapshot.childIds.map((id) => ({
        id,
        precio: Number(snapshot.childPriceMap[id] || 0),
      }));

  return {
    ...service,
    beneficiariosAdultos,
    beneficiariosNinos,
    assignedPassengerIds: selectedIds,
    assignedPassengerCount: selectedIds.length,
    convertedChildToAdultMap,
    passengerSelection: {
      ...(service.passengerSelection || {}),
      selectedIds,
      assignedPassengerCount: selectedIds.length,
      convertedChildToAdultMap,
    },
  };
};
