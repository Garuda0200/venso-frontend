import { getTourCapacity, updateServicePricesForPassengerChange } from "./unifiedServiceManager";
import { isOperationallyAssignedService } from "./assignmentProtection";
import { getServiceBeneficiarySnapshot } from './passengerPricingState';
import { passengerIdMatchesSet } from './igvUtils';
import { pruneEmptyMutableTicketCohorts } from "./passengerPricingReconciliation";


import { buildChildServiceRows } from "./childServiceBeneficiaries";
import { setChildServiceBeneficiary } from './childServiceBeneficiaries';
import { buildAdultServiceRows, setAdultServiceBeneficiary } from './adultServiceBeneficiaries';
import { getTicketPassengerTargetGroup, getTicketProcedencia, normalizeTicketProcedencia } from './ticketBeneficiaries';

/**
 * Recalcula la representación runtime de pricing contra los pasajeros actuales
 * sin perder una asignación operacional ya materializada.
 *
 * Esta es la misma frontera que debe usar tanto EdicionCotizacion como los
 * previews read-only. De lo contrario, una cotización cargada desde DB puede
 * conservar beneficiarios/child_origin correctos pero repartir los precios por
 * día con un snapshot anterior al que usa el editor.
 */
export const repriceServicesPreservingOperationalAssignments = (
  services,
  peopleDetails,
  options,
) => {
  const previousAdultsCount = options?.previousAdultsCount;
  const previousChildrenCount = options?.previousChildrenCount;
  const adults = Array.isArray(peopleDetails?.adults) ? peopleDetails.adults : [];
  const children = Array.isArray(peopleDetails?.children) ? peopleDetails.children : [];
  const childRows = buildChildServiceRows(children);
  const childrenRemoved = Number.isInteger(previousChildrenCount) && children.length < previousChildrenCount;
  // Remove exhausted child-only services before ticket rows can split/reorder.
  // Comparing the original membership avoids mistaking child_origin for adults.
  const current = (Array.isArray(services) ? services : []).filter(service => {
    if (!childrenRemoved || !service || isOperationallyAssignedService(service)) return true;
    const type = String(service.parentService?.typeService || service.typeService || '').toLowerCase();
    if (type === 'hoteles' || service.autoHotel || service.autoAddedHotel) return true;
    const prior = getServiceBeneficiarySnapshot(service);
    if (!prior.allChildIds.length || prior.adultIds.length) return true;
    return prior.allChildIds.some(id => childRows.some(row => passengerIdMatchesSet(id, row.aliases)));
  });
  // Ticket cohorts can split into several rows. Protect operational snapshots
  // before that transformation, not by their old index in the resulting array.
  const repriceMutable = (items, repricingOptions) => items.flatMap(service =>
    isOperationallyAssignedService(service) ? [service] :
      updateServicePricesForPassengerChange([service], peopleDetails, { ...repricingOptions, preserveExistingSelection: true }));
  let recalculated = repriceMutable(current, options);

  // Only an actual roster increase in this editing session opts into this.
  // Loading/reopening and nationality-only changes never invent beneficiaries.
  const newAdults = Number.isInteger(previousAdultsCount) && previousAdultsCount >= 0
    ? buildAdultServiceRows(adults).slice(previousAdultsCount) : [];
  const newChildren = Number.isInteger(previousChildrenCount) && previousChildrenCount >= 0
    ? childRows.slice(previousChildrenCount) : [];
  if (newAdults.length || newChildren.length) {
    const included = recalculated.map(service => {
      if (!service?.tariff || isOperationallyAssignedService(service)) return service;
      const type = String(service.parentService?.typeService || service.typeService || '').toLowerCase();
      // HotelPricingModal owns room regeneration and its short passenger IDs.
      if (type === 'hoteles' || service.autoHotel || service.autoAddedHotel) return service;
      // Procedencia tickets already select the matching cohort in the repricer.
      // Never add an adult to a student/child ticket or a different nationality.
      const nativeTicketSelection = type === 'tickets' &&
        normalizeTicketProcedencia(getTicketProcedencia(service.childService || service));
      const adultEligible = type !== 'tickets' ||
        (!nativeTicketSelection && getTicketPassengerTargetGroup(service) !== 'child');
      const capacity = type === 'endoses' ? getTourCapacity(service) : null;
      let updated = service;
      for (const row of adultEligible ? newAdults : []) {
        if (capacity && getServiceBeneficiarySnapshot(updated).selectedIds.length >= capacity) break;
        updated = setAdultServiceBeneficiary(updated, row, true);
      }
      for (const row of newChildren) {
        if (capacity && getServiceBeneficiarySnapshot(updated).selectedIds.length >= capacity) break;
        updated = setChildServiceBeneficiary(updated, row, true);
      }
      return updated;
    });
    recalculated = repriceMutable(included, {
      ...options, preserveExistingSelection: true,
    });
  }

  return pruneEmptyMutableTicketCohorts(recalculated);
};

export const repriceItineraryForPassengerContext = (
  days,
  peopleDetails,
  options = { preserveExistingSelection: true },
) =>
  (Array.isArray(days) ? days : []).map((day) => ({
    ...day,
    servicios: repriceServicesPreservingOperationalAssignments(
      Array.isArray(day?.servicios)
        ? day.servicios
        : Array.isArray(day?.services)
          ? day.services
          : [],
      peopleDetails,
      options,
    ),
  }));

export default repriceServicesPreservingOperationalAssignments;
