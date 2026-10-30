import { assignedPaymentCurrency, requestPaymentCurrency, roundPaymentMoney } from "../../../../utils/paymentCurrency";
import { getAssignedPaymentAmount, getPaymentServiceId, normalizePaymentItinerary } from "./reservationPaymentManagement";
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

/** Supplier obligations and paid snapshots keep their own units. The frozen
 * assigned total already includes beneficiaries; cantidad must not multiply it.
 */
export const buildReservationVoucherPaymentSummary = (itinerary: any = []) => {
  const totals: Record<string, {currency:string;total:number;paid:number}> = {};
  const seenServices = new Set<number>(), seenRequests = new Set<string>();
  let pendingPaymentsCount=0, unknownCosts=0;
  const group=(currency:string)=>totals[currency] ||= {currency,total:0,paid:0};
  for(const day of normalizePaymentItinerary(itinerary)) for(const service of day.servicios || []) {
    if(!hasAssignedService(service) || service.is_active===false) continue;
    const id=getPaymentServiceId(service);
    if(id!=null && seenServices.has(id)) continue;
    if(id!=null) seenServices.add(id);
    const wrapper=service.assignedService || {}, tariff=service.assignedTariff || wrapper.tariff || {};
    const known=[service.assignedPrecioTotal,service.assignedPrecioServicio,
      wrapper.assigned_precio_total,wrapper.precioTotal,
      tariff.precio_original_with_child_extras,tariff.precio_original]
      .some(value=>value!=null&&value!==""&&Number.isFinite(Number(value)));
    if(known) {
      const cost=group(assignedPaymentCurrency(service));
      cost.total=roundPaymentMoney(cost.total+getAssignedPaymentAmount(service));
    } else unknownCosts++;
    const request=service.paymentRequest || service.payment_request;
    const paid=["paid","approved","completed","pagado","aprobado"].includes(String(request?.status||"").toLowerCase())
      || Boolean(request?.paid_at || request?.paidAt);
    if(!paid) pendingPaymentsCount++;
    if(paid && request) {
      const requestId=request.id==null ? null : String(request.id);
      if(requestId!=null && seenRequests.has(requestId)) continue;
      if(requestId!=null) seenRequests.add(requestId);
      const amount=Number(request.amount ?? request.monto);
      if(!Number.isFinite(amount)||amount<0) continue;
      const currency=request.currency!=null || request.moneda!=null || request.contexto_pago?.obligation_currency!=null
        ? requestPaymentCurrency(request) : assignedPaymentCurrency(service);
      const cost=group(currency);
      cost.paid=roundPaymentMoney(cost.paid+amount);
    }
  }
  const rows=Object.values(totals).map(row=>({...row,
    percentage:row.total>0?Math.min(100,row.paid/row.total*100):row.paid===0?100:0,
  }));
  return {rows,pendingPaymentsCount,unknownCosts,
    paymentCompleted:unknownCosts===0&&rows.length>0&&rows.every(row=>row.total===0?row.paid===0:row.paid>=row.total)};
};
