import {
  hasAssignedService,
  mergeItineraryDaysByNumber,
} from "./serviceAssignment";

export const mapReservationVoucherRelation = (rv: any) => {
  const assignedItinerary = mergeItineraryDaysByNumber(
    Array.isArray(rv?.assigned_itinerary)
      ? rv.assigned_itinerary
      : Array.isArray(rv?.assignedItinerary)
        ? rv.assignedItinerary
        : [],
  );

  const hasAssignedServices = assignedItinerary.some((day: any) =>
    (day?.servicios || []).some((service: any) => hasAssignedService(service)),
  );

  return {
    id: rv?.id,
    voucherId: rv?.voucher_id ?? rv?.voucherId,
    voucherCode: rv?.voucher_code ?? rv?.voucherCode,
    cotizacionId: rv?.cotizacion_id ?? rv?.cotizacionId,
    cotizacionData: rv?.cotizacion_data || rv?.cotizacionData || null,
    assignedItinerary,
    hasAssignedServices,
    canDelete: rv?.can_delete === true || rv?.canDelete === true,
    status: rv?.status,
    createdAt: rv?.created_at ?? rv?.createdAt,
    voucherMedia: rv?.voucher_media ?? rv?.voucherMedia ?? null,
    resolvedVoucherMedia:
      rv?.resolved_voucher_media ?? rv?.resolvedVoucherMedia ?? null,
  };
};

export const buildReservationVoucherMap = (
  reservationData: any[] = [],
  deletedIds: Set<string> = new Set(),
) =>
  Object.fromEntries(
    reservationData
      .filter((rv) => rv?.id && !deletedIds.has(String(rv.id)))
      .map((rv) => [String(rv.voucher_id ?? rv.voucherId), mapReservationVoucherRelation(rv)]),
  );
