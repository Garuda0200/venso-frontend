import { useMemo } from "react";
import {
  MdAssignment,
  MdCheckCircle,
  MdDescription,
  MdPayment,
  MdPeople,
  MdReceipt,
  MdWarning,
} from "react-icons/md";
import SummaryContent from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/SummaryContent/SummaryContent";
import {
  calculateCotizacionFinancialSummary,
  calculateExternalItineraryBreakdown,
} from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import { getServicePricingSnapshot } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/servicePricingRuntime";
import { hydrateItinerarioFromDB } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { deriveSelectedHotelFromDays } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelServiceHelpers";
import { normalizeHotelDetallePayload } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelDetallePayload";
import { buildPdfHotelPreviewRows } from "../../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/pdfHotelPreviewData";
import "./VoucherSummary.scss";

const safeArray = (value) => (Array.isArray(value) ? value : []);

const n = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePerRoomPricingForSummary = (
  perRoomPricing = [],
  externalAdultTotal = 0,
) =>
  (Array.isArray(perRoomPricing) ? perRoomPricing : []).map((room) => {
    const baseWithoutExternal = n(room?.base) + n(room?.adicionales);
    const normalizedTotal =
      baseWithoutExternal > 0
        ? baseWithoutExternal
        : Math.max(0, n(room?.totalPerPerson) - externalAdultTotal);
    const convertedBase =
      n(room?.convertedChildBasePerPerson) ||
      n(room?.convertedChildTotalPerPerson) ||
      n(room?.convertedChildHotelPerPerson);

    return {
      ...room,
      totalPerPerson: normalizedTotal,
      displayTotalPerPerson:
        externalAdultTotal > 0
          ? normalizedTotal + externalAdultTotal
          : normalizedTotal,
      convertedChildDisplayTotalPerPerson:
        convertedBase || n(room?.convertedChildDisplayTotalPerPerson),
    };
  });

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(amount));

const parseObjectValue = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
};

const parseItineraryDays = (value) => {
  let days = [];

  if (Array.isArray(value)) {
    days = value;
  } else if (value && typeof value === "object") {
    days = Object.values(value);
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      days = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];
    } catch {
      days = [];
    }
  }

  return hydrateItinerarioFromDB(days);
};

const cleanAdditionalCosts = (rawValue = {}) => {
  let value = parseObjectValue(rawValue, {});

  if (value && typeof value === "object") {
    const hasIndexedKeys = Object.keys(value).some((key) => /^\d+$/.test(key));
    if (hasIndexedKeys) {
      value = Object.fromEntries(
        Object.entries(value).filter(([key]) => !/^\d+$/.test(key)),
      );
    }
  }

  return {
    ...value,
    operationalCosts: String(value?.operationalCosts ?? "0"),
    fee: String(value?.fee ?? "25"),
    extraFee: n(value?.extraFee),
    operationalMode: String(value?.operationalMode || "fixed"),
    feeMode: String(value?.feeMode || "percentage"),
  };
};

const isHotelService = (service = {}) => {
  const pricing = getServicePricingSnapshot(service);
  const type =
    pricing.serviceType ||
    service.typeService ||
    service.parentService?.typeService ||
    "";
  return String(type).toLowerCase() === "hoteles";
};

const deriveTotalsFromItinerary = (days = []) => {
  const totals = {
    subtotalIndividual: 0,
    servicesTotal: 0,
    nonHotelsTotal: 0,
    hotelsTotal: 0,
    hotelAdultTotal: 0,
    hotelChildTotal: 0,
    hotelConvertedChildTotal: 0,
    nonHotelExplicitChildTotal: 0,
    nonHotelConvertedChildTotal: 0,
    subtotalNinos: 0,
    baseExplicitChildCount: 0,
    baseConvertedChildCount: 0,
    hotelExplicitChildCount: 0,
    hotelConvertedChildCount: 0,
  };
  const baseExplicitChildIds = new Set();
  const baseConvertedChildIds = new Set();
  const hotelExplicitChildIds = new Set();
  const hotelConvertedChildIds = new Set();

  safeArray(days).forEach((day) => {
    safeArray(day?.servicios).forEach((service) => {
      const pricing = getServicePricingSnapshot(service);
      const explicitChildTotal = n(pricing.explicitChildTotal);
      const convertedChildTotal = n(pricing.convertedChildTotal);
      const serviceTotal = n(pricing.total);

      Object.entries(pricing.children || {}).forEach(([childId, childData]) => {
        if (!String(childId).startsWith("child:")) return;
        if (childData?.asAdult) {
          if (isHotelService(service)) hotelConvertedChildIds.add(childId);
          else baseConvertedChildIds.add(childId);
        } else if (n(childData?.amount) > 0) {
          if (isHotelService(service)) hotelExplicitChildIds.add(childId);
          else baseExplicitChildIds.add(childId);
        }
      });

      if (isHotelService(service)) {
        totals.hotelsTotal += serviceTotal;
        totals.hotelAdultTotal += n(pricing.amountPerAdult);
        totals.hotelChildTotal += explicitChildTotal;
        totals.hotelConvertedChildTotal += convertedChildTotal;
      } else {
        totals.subtotalIndividual += n(pricing.precioAdult);
        totals.servicesTotal += n(pricing.amountPerAdult || pricing.precioAdult);
        totals.nonHotelsTotal += n(pricing.precioAdult);
        totals.nonHotelExplicitChildTotal += explicitChildTotal;
        totals.nonHotelConvertedChildTotal += convertedChildTotal;
      }

      totals.subtotalNinos += explicitChildTotal + convertedChildTotal;
    });
  });

  return {
    ...totals,
    baseExplicitChildCount: baseExplicitChildIds.size,
    baseConvertedChildCount: baseConvertedChildIds.size,
    hotelExplicitChildCount: hotelExplicitChildIds.size,
    hotelConvertedChildCount: hotelConvertedChildIds.size,
  };
};

const getPassengerName = (passenger = {}, fallback) => {
  const names = [
    passenger.nombres,
    passenger.apellidos,
    passenger.nombre,
    passenger.apellido,
    passenger.fullName,
    passenger.nombreCompleto,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return names || fallback;
};

const getPassengerDocument = (passenger = {}) => {
  const type =
    passenger.tipoDocumento ||
    passenger.tipo_documento ||
    passenger.documentType ||
    "Doc.";
  const number =
    passenger.numeroDocumento ||
    passenger.numero_documento ||
    passenger.documentNumber ||
    passenger.num_documento ||
    "";

  return number ? `${type} ${number}` : "Documento no registrado";
};

const getPaymentStatus = (paymentData = {}, totalFinal = 0) => {
  const totalPaid = n(paymentData.totalPaid);
  const payments = safeArray(paymentData.payments);
  const remaining = Math.max(0, n(totalFinal) - totalPaid);

  if (paymentData.paymentStatus === "completed" || remaining <= 0) {
    return { key: "completed", label: "Completado", remaining };
  }

  if (paymentData.paymentStatus === "partial" || totalPaid > 0 || payments.length > 0) {
    return { key: "partial", label: "Pago parcial", remaining };
  }

  return { key: "pending", label: "Pendiente", remaining };
};

const resolveVoucherPeople = (voucherData = {}, cotizacionData = {}) => {
  const passengerData = voucherData.passengerData || {};
  const adults = safeArray(passengerData.adults);
  const children = safeArray(passengerData.children);
  const hasVoucherPassengers = adults.length + children.length > 0;

  if (hasVoucherPassengers) {
    return {
      details: { adults, children },
      count: { adults: adults.length, children: children.length },
    };
  }

  const cotizacionPeople =
    cotizacionData.peopleDetails || cotizacionData.peopledetails || {};
  const cotizacionAdults = safeArray(cotizacionPeople.adults);
  const cotizacionChildren = safeArray(cotizacionPeople.children);
  const peopleCount = cotizacionData.peopleCount || cotizacionData.peoplecount || {};
  const adultsCount =
    n(peopleCount.adults) ||
    n(cotizacionData.num_adults) ||
    n(cotizacionData.numAdults) ||
    cotizacionAdults.length ||
    n(cotizacionData.cantidadpersonas) ||
    n(cotizacionData.cantidadPersonas) ||
    1;
  const childrenCount =
    n(peopleCount.children) ||
    n(cotizacionData.num_children) ||
    n(cotizacionData.numChildren) ||
    cotizacionChildren.length ||
    0;

  return {
    details: {
      adults: cotizacionAdults,
      children: cotizacionChildren,
    },
    count: {
      adults: adultsCount,
      children: childrenCount,
    },
  };
};

const buildSummaryCotizacion = (voucherData = {}, cotizacionData = {}) => {
  const effectiveCotizacion = {
    ...(voucherData.cotizacionData || {}),
    ...(cotizacionData || {}),
  };
  const people = resolveVoucherPeople(voucherData, effectiveCotizacion);
  const additionalCosts = cleanAdditionalCosts(
    effectiveCotizacion.additionalCosts ||
      effectiveCotizacion.additionalcosts ||
      effectiveCotizacion.additional_costs ||
      {},
  );
  const itineraryDays = parseItineraryDays(
    effectiveCotizacion.itinerario ||
      effectiveCotizacion.dias ||
      effectiveCotizacion.itinerario_dia ||
      [],
  );
  const externalDays = parseItineraryDays(
    effectiveCotizacion.itinerario_externo ||
      effectiveCotizacion.itinerarioExterno ||
      effectiveCotizacion.externalItinerary ||
      [],
  );
  const parsedHotelDetalle = normalizeHotelDetallePayload(
    effectiveCotizacion.hotel_detalle || effectiveCotizacion.hotelDetalle || null,
  );
  const selectedHotel = deriveSelectedHotelFromDays(
    itineraryDays,
    parsedHotelDetalle,
    effectiveCotizacion.selectedHotel ||
      effectiveCotizacion.selected_hotel ||
      null,
  );
  const derivedTotals = deriveTotalsFromItinerary(itineraryDays);
  const externalBreakdown = calculateExternalItineraryBreakdown(
    externalDays,
    people.details,
  );
  const adultsCount = Math.max(1, n(people.count.adults) || 1);
  const hotelsTotal =
    n(effectiveCotizacion.hotel_adult_total) +
      n(effectiveCotizacion.hotel_child_total) +
      n(effectiveCotizacion.hotel_converted_child_total) ||
    n(effectiveCotizacion.totalHoteles) ||
    n(effectiveCotizacion.hotelsTotal) ||
    n(additionalCosts.hotelsTotal) ||
    derivedTotals.hotelsTotal;
  const hotelConvertedChildTotal =
    n(effectiveCotizacion.hotel_converted_child_total) ||
    n(effectiveCotizacion.hotelConvertedChildTotal) ||
    n(additionalCosts.hotelConvertedChildTotal) ||
    derivedTotals.hotelConvertedChildTotal;
  const hotelAdultTotal =
    n(effectiveCotizacion.hotel_adult_total) ||
    n(effectiveCotizacion.hotelAdultTotal) ||
    n(additionalCosts.hotelAdultTotal) ||
    derivedTotals.hotelAdultTotal ||
    Math.max(0, hotelsTotal - hotelConvertedChildTotal);
  const hotelChildTotal =
    n(effectiveCotizacion.hotel_child_total) ||
    n(effectiveCotizacion.hotelChildTotal) ||
    n(additionalCosts.hotelChildTotal) ||
    derivedTotals.hotelChildTotal;
  const subtotalIndividual =
    n(effectiveCotizacion.precio_it_adulto) ||
    n(effectiveCotizacion.precioItAdulto) ||
    n(effectiveCotizacion.subtotal_individual) ||
    n(effectiveCotizacion.subtotalIndividual) ||
    n(additionalCosts.subtotalIndividual) ||
    derivedTotals.subtotalIndividual;
  const subtotalNinos =
    n(effectiveCotizacion.precio_it_ninos) ||
    n(effectiveCotizacion.precioItNinos) ||
    n(effectiveCotizacion.subtotal_ninos) ||
    n(effectiveCotizacion.subtotal_nino) ||
    n(effectiveCotizacion.subtotalNinos) ||
    n(additionalCosts.subtotalNinos) ||
    derivedTotals.subtotalNinos;
  const hotelPreviewRows =
    buildPdfHotelPreviewRows({
      cotizacion: {
        ...effectiveCotizacion,
        peopleDetails: people.details,
        peopleCount: people.count,
        peoplecount: people.count,
        additionalCosts,
        additionalcosts: additionalCosts,
        itinerario: itineraryDays,
        dias: itineraryDays,
        itinerario_externo: externalDays,
        itinerarioExterno: externalDays,
        externalItinerary: externalDays,
        selectedHotel,
        hotel_detalle: parsedHotelDetalle,
        subtotalIndividual,
        subtotal_individual: subtotalIndividual,
        subtotalNinos,
        subtotal_ninos: subtotalNinos,
        hotelAdultTotal,
        hotel_adult_total: hotelAdultTotal,
        hotelChildTotal,
        hotel_child_total: hotelChildTotal,
        hotelConvertedChildTotal,
        hotel_converted_child_total: hotelConvertedChildTotal,
        nonHotelExplicitChildTotal: derivedTotals.nonHotelExplicitChildTotal,
        nonHotelConvertedChildTotal:
          derivedTotals.nonHotelConvertedChildTotal,
      },
    }).categoryRows || [];
  const selectedCategory = String(
    selectedHotel?.category || selectedHotel?.key || "",
  ).toLowerCase();
  const selectedPreviewRow =
    hotelPreviewRows.find((row) => row?.isSelected) ||
    hotelPreviewRows.find(
      (row) => String(row?.category || "").toLowerCase() === selectedCategory,
    ) ||
    null;
  const previewPerRoomPricing = normalizePerRoomPricingForSummary(
    safeArray(selectedPreviewRow?.perRoomPricing),
    externalBreakdown.adultTotal || 0,
  );
  const perRoomPricing =
    previewPerRoomPricing.length > 0
      ? previewPerRoomPricing
      : normalizePerRoomPricingForSummary(
          safeArray(effectiveCotizacion.perRoomPricing).length > 0
            ? effectiveCotizacion.perRoomPricing
            : safeArray(selectedHotel?.perRoomPricing),
          externalBreakdown.adultTotal || 0,
        );
  const selectedHotelForSummary = selectedPreviewRow
    ? {
        ...selectedHotel,
        ...selectedPreviewRow,
        breakdown:
          Array.isArray(selectedPreviewRow.breakdown) &&
          selectedPreviewRow.breakdown.length > 0
            ? selectedPreviewRow.breakdown
            : selectedHotel?.breakdown || [],
        allCategoryRows: hotelPreviewRows,
        perRoomPricing,
      }
    : selectedHotel;
  const resolvedHotelsTotal = n(selectedPreviewRow?.hotelTotal) || hotelsTotal;
  const resolvedHotelChildTotal =
    n(selectedPreviewRow?.hotelChildTotal) || hotelChildTotal;
  const resolvedHotelConvertedChildTotal =
    n(selectedPreviewRow?.hotelConvertedChildTotal) ||
    hotelConvertedChildTotal;
  const resolvedHotelAdultTotal =
    selectedPreviewRow && resolvedHotelsTotal > 0
      ? Math.max(
          0,
          resolvedHotelsTotal -
            resolvedHotelChildTotal -
            resolvedHotelConvertedChildTotal,
        )
      : hotelAdultTotal;
  const summaryTotals = calculateCotizacionFinancialSummary({
    subtotalIndividual,
    adultsCount,
    childrenCount: n(people.count.children),
    hotelsTotal: resolvedHotelsTotal,
    hotelAdultTotal: resolvedHotelAdultTotal,
    hotelChildTotal: resolvedHotelChildTotal,
    hotelConvertedChildTotal: resolvedHotelConvertedChildTotal,
    subtotalNinos,
    externalAdultTotal: externalBreakdown.adultTotal,
    externalChildTotal: externalBreakdown.childTotal,
    externalConvertedChildTotal: externalBreakdown.convertedChildTotal,
    externalExplicitChildCount: externalBreakdown.explicitChildCount,
    externalConvertedChildCount: externalBreakdown.convertedChildCount,
    baseExplicitChildCount: derivedTotals.baseExplicitChildCount,
    baseConvertedChildCount: derivedTotals.baseConvertedChildCount,
    hotelExplicitChildCount: derivedTotals.hotelExplicitChildCount,
    hotelConvertedChildCount: derivedTotals.hotelConvertedChildCount,
    nonHotelExplicitChildTotal: derivedTotals.nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal: derivedTotals.nonHotelConvertedChildTotal,
    additionalCosts,
  });
  const enrichedAdditionalCosts = {
    ...additionalCosts,
    calculatedOperational:
      additionalCosts.calculatedOperational != null
        ? n(additionalCosts.calculatedOperational)
        : summaryTotals.operationalAmount,
    calculatedFee:
      additionalCosts.calculatedFee != null
        ? n(additionalCosts.calculatedFee)
        : summaryTotals.feeAmount,
    totalAdditional:
      additionalCosts.totalAdditional != null
        ? n(additionalCosts.totalAdditional)
        : summaryTotals.totalAdditionalPerAdult,
    totalAdditionalPerChild: summaryTotals.totalAdditionalPerChild,
    additionalChildTotal: summaryTotals.additionalChildTotal,
    subtotalIndividual,
    subtotalNinos,
    hotelsTotal: resolvedHotelsTotal,
    hotelAdultTotal: resolvedHotelAdultTotal,
    hotelChildTotal: resolvedHotelChildTotal,
    hotelConvertedChildTotal: resolvedHotelConvertedChildTotal,
  };
  const storedTotalFinal =
    n(effectiveCotizacion.total_final) ||
    n(effectiveCotizacion.totalFinal) ||
    n(effectiveCotizacion.grandTotal);
  const storedServicesTotal =
    n(effectiveCotizacion.precio_it_adulto) ||
    n(effectiveCotizacion.precioItAdulto) ||
    n(effectiveCotizacion.totalServicios) ||
    derivedTotals.servicesTotal;
  return {
    ...effectiveCotizacion,
    peopleDetails: people.details,
    peopleCount: people.count,
    peopledetails: people.details,
    peoplecount: people.count,
    additionalCosts: enrichedAdditionalCosts,
    additionalcosts: enrichedAdditionalCosts,
    itinerario: itineraryDays,
    dias: itineraryDays,
    externalItinerary: externalDays,
    itinerarioExterno: externalDays,
    itinerario_externo: externalDays,
    selectedHotel: selectedHotelForSummary,
    hotel_detalle: parsedHotelDetalle,
    hotelsTotal: resolvedHotelsTotal,
    hotelFullTotal: resolvedHotelsTotal,
    subtotalIndividual,
    subtotal_individual: subtotalIndividual,
    subtotalNinos,
    subtotal_ninos: subtotalNinos,
    totalServicios: storedServicesTotal,
    precioItAdulto: storedServicesTotal,
    precio_it_adulto: storedServicesTotal,
    precioItNinos: subtotalNinos,
    precio_it_ninos: subtotalNinos,
    precioItExtAdulto: externalBreakdown.adultTotal,
    precio_it_ext_adulto: externalBreakdown.adultTotal,
    precioItExtNinos:
      externalBreakdown.childTotal + externalBreakdown.convertedChildTotal,
    precio_it_ext_ninos:
      externalBreakdown.childTotal + externalBreakdown.convertedChildTotal,
    grandTotal: storedTotalFinal || summaryTotals.grandTotal,
    totalFinal: storedTotalFinal || summaryTotals.grandTotal,
    total_final: storedTotalFinal || summaryTotals.grandTotal,
    hotelAdultTotal: summaryTotals.hotelAdultTotal,
    hotel_adult_total: summaryTotals.hotelAdultTotal,
    hotelChildTotal: summaryTotals.hotelChildTotal,
    hotel_child_total: summaryTotals.hotelChildTotal,
    hotelConvertedChildTotal: summaryTotals.hotelConvertedChildTotal,
    hotel_converted_child_total: summaryTotals.hotelConvertedChildTotal,
    nonHotelExplicitChildTotal: derivedTotals.nonHotelExplicitChildTotal,
    nonHotelConvertedChildTotal: derivedTotals.nonHotelConvertedChildTotal,
    baseExplicitChildCount: derivedTotals.baseExplicitChildCount,
    baseConvertedChildCount: derivedTotals.baseConvertedChildCount,
    hotelExplicitChildCount: derivedTotals.hotelExplicitChildCount,
    hotelConvertedChildCount: derivedTotals.hotelConvertedChildCount,
    perRoomPricing,
  };
};

const VoucherSummary = ({
  voucherData = {},
  cotizacionData = {},
  isEditMode = false,
}) => {
  const summaryCotizacion = useMemo(
    () => buildSummaryCotizacion(voucherData, cotizacionData),
    [voucherData, cotizacionData],
  );

  const passengerData = summaryCotizacion.peopleDetails || {
    adults: [],
    children: [],
  };
  const documentData = voucherData.documentData || {};
  const paymentData = voucherData.paymentData || { payments: [] };
  const payments = safeArray(paymentData.payments);
  const documentsCount =
    safeArray(documentData.passports).length +
    safeArray(documentData.idCards).length +
    safeArray(documentData.otherDocuments).length;
  const totalFinal =
    summaryCotizacion.total_final ||
    summaryCotizacion.totalFinal ||
    summaryCotizacion.grandTotal ||
    0;
  const paymentStatus = getPaymentStatus(paymentData, totalFinal);
  const adults = safeArray(passengerData.adults);
  const children = safeArray(passengerData.children);

  return (
    <div className="voucher-summary">
      <div className="voucher-summary-hero">
        <div>
          <span className="voucher-summary-kicker">
            {isEditMode ? "Actualización" : "Emisión"} de voucher
          </span>
          <h3>{summaryCotizacion.titulo || "Resumen de cotización"}</h3>
          <p>
            Cotización{" "}
            <strong>{summaryCotizacion.id || "-"}</strong>
            {" · "}
            Voucher{" "}
            <strong>{voucherData.voucher_code || voucherData.voucherCode || "-"}</strong>
          </p>
        </div>
        <div className={`voucher-payment-badge ${paymentStatus.key}`}>
          <MdPayment />
          <span>{paymentStatus.label}</span>
        </div>
      </div>

      <div className="voucher-summary-metrics">
        <div className="voucher-summary-metric">
          <MdPeople />
          <span>Pasajeros</span>
          <strong>
            {adults.length} adulto{adults.length === 1 ? "" : "s"}
            {children.length > 0
              ? ` + ${children.length} niño${children.length === 1 ? "" : "s"}`
              : ""}
          </strong>
        </div>
        <div className="voucher-summary-metric">
          <MdDescription />
          <span>Documentos</span>
          <strong>{documentsCount || "Sin archivos"}</strong>
        </div>
        <div className="voucher-summary-metric">
          <MdPayment />
          <span>Pagos registrados</span>
          <strong>{payments.length}</strong>
        </div>
        <div className="voucher-summary-metric">
          <MdReceipt />
          <span>Total cotizado</span>
          <strong>{formatCurrency(totalFinal)}</strong>
        </div>
      </div>

      <div className="voucher-summary-notice">
        {payments.length > 0 ? <MdCheckCircle /> : <MdWarning />}
        <span>
          {payments.length > 0
            ? `Saldo pendiente: ${formatCurrency(paymentStatus.remaining)}.`
            : "El voucher puede emitirse sin pagos registrados; los pagos se gestionan después desde el módulo correspondiente."}
        </span>
      </div>

      <div className="voucher-passenger-panel">
        <div className="voucher-passenger-group">
          <h4>Adultos</h4>
          <div className="voucher-passenger-grid">
            {adults.length > 0 ? (
              adults.map((adult, index) => (
                <div className="voucher-passenger-card" key={adult.id || index}>
                  <strong>{getPassengerName(adult, `Adulto ${index + 1}`)}</strong>
                  <span>{getPassengerDocument(adult)}</span>
                  <small>{adult.nacionalidad || adult.pais || "Nacionalidad no registrada"}</small>
                </div>
              ))
            ) : (
              <p className="voucher-empty">No hay adultos registrados.</p>
            )}
          </div>
        </div>

        {children.length > 0 && (
          <div className="voucher-passenger-group">
            <h4>Niños</h4>
            <div className="voucher-passenger-grid">
              {children.map((child, index) => (
                <div className="voucher-passenger-card child" key={child.id || index}>
                  <strong>{getPassengerName(child, `Niño ${index + 1}`)}</strong>
                  <span>{getPassengerDocument(child)}</span>
                  <small>
                    {child.edad || child.age ? `${child.edad || child.age} años` : "Edad no registrada"}
                    {" · "}
                    {child.nacionalidad || child.pais || "Nacionalidad no registrada"}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="voucher-summary-content">
        <div className="voucher-summary-content-header">
          <MdAssignment />
          <div>
            <h4>Itinerario y costos</h4>
            <p>
              Los precios usan la misma lógica de adultos, niños y costos adicionales
              de Edición de Cotización.
            </p>
          </div>
        </div>
        <SummaryContent cotizacion={summaryCotizacion} readonly />
      </div>
    </div>
  );
};

export default VoucherSummary;
