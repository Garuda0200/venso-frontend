import { getPassengerPresentation } from "./passengerPricingPresentation";
import { getServiceBeneficiarySnapshot } from './passengerPricingState';
import { passengerIdMatchesSet } from './igvUtils';
import { isOperationallyAssignedService } from './assignmentProtection';

export function childServiceCapacity(service = {}) {
  const type = String(service.parentService?.typeService || service.typeService || '').toLowerCase();
  if (type !== 'endoses') return null;
  const capacity = Number(service.capacidad ?? service.childService?.capacidad ?? service.childService?.tour?.capacidad);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : null;
}

// A newly included child starts free. No removed price or conversion is revived.
// Tickets have their own nationality/tariff selection and are deliberately excluded.
export function setChildServiceBeneficiary(service = {}, row, included) {
  const type = String(service.parentService?.typeService || service.typeService || '').toLowerCase();
  if (!row?.id || !row.id.startsWith('child:') || type === 'tickets' || type === 'hoteles' || service.autoHotel || service.autoAddedHotel || isOperationallyAssignedService(service)) return service;
  const snapshot = getServiceBeneficiarySnapshot(service);
  const matching = id => passengerIdMatchesSet(String(id || ''), row.aliases);
  const already = snapshot.allChildIds.some(matching);
  if (included === already) return service;
  const selectedIds = snapshot.selectedIds.filter(id => !matching(id));
  const capacity = childServiceCapacity(service);
  if (included && capacity && selectedIds.length >= capacity) return service;
  if (included) selectedIds.push(row.id);
  const converted = snapshot.convertedEntries.filter(entry => !matching(entry.childId));
  const beneficiariosAdultos = [
    ...snapshot.adultIds.map(id => ({ id })),
    ...converted.map(({ childId, revertKey }) => ({ id: revertKey || childId, child_origin: childId })),
  ];
  const beneficiariosNinos = snapshot.childIds.filter(id => !matching(id)).map(id => ({ id, precio: Number(snapshot.childPriceMap[id]) || 0 }));
  if (included) beneficiariosNinos.push({ id: row.id, precio: 0 });
  const convertedChildToAdultMap = Object.fromEntries(converted.map(({ childId, revertKey }) => String(revertKey).startsWith('adult:') ? [revertKey, childId] : [childId, true]));
  const priceMap = Object.fromEntries(beneficiariosNinos.map(({ id, precio }) => [id, precio]));
  const mirrors = {
    assignedPassengerCount: selectedIds.length, convertedChildToAdultMap, ninosComoAdulto: convertedChildToAdultMap,
    assignedChildExplicitPriceMap: priceMap, childPriceMap: priceMap, preciosNinos: priceMap,
    assignedChildExplicitPriceSum: beneficiariosNinos.reduce((sum, entry) => sum + entry.precio, 0),
    assignedChildExplicitCount: beneficiariosNinos.length, hasChildExplicitPrices: beneficiariosNinos.length > 0,
    pricingMode: 'fixed', treatChildrenAsAdults: false, uniformPercentage: '', childPercentageMap: {},
  };
  return { ...service, ...mirrors, beneficiariosAdultos, beneficiariosNinos, assignedPassengerIds: selectedIds,
    children: undefined, precio_adult: undefined, amount_per_adult: undefined, amount_per_child: undefined,
    passengerSelection: { ...service.passengerSelection, ...mirrors, selectedIds, ids: selectedIds } };
}

export const buildChildServiceRows = (children = []) => children.map((person,index) => ({ ...getPassengerPresentation(person,"child",index), id: `child:${index}:${person?.id ?? person?.id_pasajero ?? index + 1}` }));
