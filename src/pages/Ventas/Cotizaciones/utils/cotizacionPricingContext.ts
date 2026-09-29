import cotizacionService from "../hooks/cotizacionService";
import pasajeroService from "../../../../services/pasajeroService";
import { buildCotizacionPeopleDetails } from "./cotizacionPassengerRows";
import { hydrateItinerarioFromDB } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import {
  normalizeHotelDetallePayload,
  normalizeMojibakeValue,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelDetallePayload";
import { deriveSelectedHotelFromDays } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/hotelServiceHelpers";
import {
  buildPdfHotelPreviewRows,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/pdfHotelPreviewData";
import { calculateGeneralTotalsDetailed } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/utils/priceCalculations";
import { calculateExternalItineraryBreakdown } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/cotizacionFinancialSummary";
import {
  parseSummaryPricingArray,
  parseSummaryPricingObject,
} from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryPricingCore";
import { resolveSummaryContentPerRoomPricing } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null);

const parseDays = (value) => hydrateItinerarioFromDB(parseSummaryPricingArray(value));

const createFallbackPeopleDetails = (cotizacion = {}) => {
  const existing =
    cotizacion.peopleDetails ||
    cotizacion.people_details ||
    cotizacion.peopledetails ||
    {};
  const adults = Array.isArray(existing?.adults) ? existing.adults : [];
  const children = Array.isArray(existing?.children) ? existing.children : [];
  if (adults.length || children.length) {
    return { adults, children };
  }

  const adultsCount = Math.max(
    1,
    n(cotizacion.num_adults ?? cotizacion.numAdults) ||
      Math.max(
        1,
        n(cotizacion.cantidadpersonas ?? cotizacion.cantidadPersonas) -
          n(cotizacion.num_children ?? cotizacion.numChildren),
      ),
  );
  const childrenCount = Math.max(
    0,
    n(cotizacion.num_children ?? cotizacion.numChildren),
  );

  return {
    adults: Array.from({ length: adultsCount }, (_, index) => ({
      id: `adult:${index + 1}`,
      passenger_key: `adult:${index + 1}`,
      tipo_pasajero: "adult",
      age: "18",
    })),
    children: Array.from({ length: childrenCount }, (_, index) => ({
      id: `child:${index + 1}`,
      passenger_key: `child:${index + 1}`,
      tipo_pasajero: "child",
      age: "6",
    })),
  };
};

const resolveSelectedPreviewRow = (rows = [], selectedHotel = {}) => {
  const selectedCategory = String(
    selectedHotel?.category || selectedHotel?.key || "",
  ).toLowerCase();
  return (
    rows.find((row) => row?.isSelected) ||
    rows.find(
      (row) => String(row?.category || "").toLowerCase() === selectedCategory,
    ) ||
    null
  );
};

/**
 * Hidrata una cotización con las mismas fuentes vivas que usa SummaryContent.
 * No persiste snapshots ni calcula una tarifa alternativa: únicamente reúne
 * itinerario, pasajeros, hotel, mapas infantiles y perRoomPricing para que
 * buildSummaryContentPricingModel/summaryPricingCore produzcan el resultado.
 */
export const hydrateCotizacionPricingContext = async (
  sourceCotizacion = {},
  options = {},
) => {
  const {
    skipCache = true,
    fetchFresh = true,
    passengers: suppliedPassengers = null,
  } = options || {};

  let cotizacion =
    sourceCotizacion && typeof sourceCotizacion === "object"
      ? sourceCotizacion
      : {};
  const cotizacionId =
    cotizacion.id || cotizacion.cotizacion_id || null;

  if (fetchFresh && cotizacionId) {
    try {
      const fresh = await cotizacionService.getCotizacionById(cotizacionId, {
        skipCache,
      });
      cotizacion = {
        ...cotizacion,
        ...(fresh || {}),
      };
    } catch (error) {
      console.warn(
        "No se pudo obtener la cotización completa para hidratar precios:",
        error,
      );
    }
  }

  let passengerRows = Array.isArray(suppliedPassengers)
    ? suppliedPassengers
    : null;
  if (!passengerRows && cotizacionId) {
    try {
      passengerRows = await pasajeroService.getPassengersByCotizacion(
        cotizacionId,
      );
    } catch (error) {
      console.warn(
        "No se pudieron obtener pasajeros para hidratar precios:",
        error,
      );
    }
  }

  const peopleDetails =
    Array.isArray(passengerRows) && passengerRows.length > 0
      ? buildCotizacionPeopleDetails(passengerRows, cotizacion)
      : createFallbackPeopleDetails(cotizacion);
  const peopleCount = {
    adults: Math.max(1, peopleDetails.adults.length || 0),
    children: Math.max(0, peopleDetails.children.length || 0),
  };

  const itineraryDays = parseDays(
    cotizacion.itinerario || cotizacion.dias || cotizacion.itinerary,
  );
  const externalItineraryDays = parseDays(
    cotizacion.itinerario_externo ||
      cotizacion.itinerarioExterno ||
      cotizacion.externalItinerary ||
      cotizacion.externalDays,
  );
  const hotelDetalle = normalizeHotelDetallePayload(
    cotizacion.hotel_detalle || cotizacion.hotelDetalle || null,
  );
  const detailed = calculateGeneralTotalsDetailed(itineraryDays, peopleDetails);
  const externalBreakdown = calculateExternalItineraryBreakdown(
    externalItineraryDays,
    peopleDetails,
  );

  const rawAdditionalCosts = parseSummaryPricingObject(
    cotizacion.additionalCosts ||
      cotizacion.additionalcosts ||
      cotizacion.additional_costs ||
      {},
  );
  const subtotalIndividual =
    n(cotizacion.precio_it_adulto ?? cotizacion.precioItAdulto) ||
    n(cotizacion.subtotalIndividual ?? cotizacion.subtotal_individual) ||
    n(detailed.totalPerPerson);
  const subtotalNinos =
    n(
      cotizacion.precio_it_ninos ??
        cotizacion.precioItNinos ??
        cotizacion.subtotalNinos ??
        cotizacion.subtotal_ninos ??
        cotizacion.subtotal_nino,
    ) ||
    n(detailed.baseExplicitChildTotal) +
      n(detailed.baseConvertedChildTotal);

  const additionalCosts = {
    ...rawAdditionalCosts,
    subtotalIndividual,
    nonHotelExplicitChildTotal: n(detailed.baseExplicitChildTotal),
    nonHotelConvertedChildTotal: n(detailed.baseConvertedChildTotal),
    nonHotelExplicitChildTotalsById:
      detailed.baseExplicitChildTotalsById ||
      rawAdditionalCosts.nonHotelExplicitChildTotalsById ||
      {},
    nonHotelConvertedChildTotalsById:
      detailed.baseConvertedChildTotalsById ||
      rawAdditionalCosts.nonHotelConvertedChildTotalsById ||
      {},
    hotelExplicitChildTotalsById:
      detailed.hotelExplicitChildTotalsById ||
      rawAdditionalCosts.hotelExplicitChildTotalsById ||
      {},
    hotelConvertedChildTotalsById:
      detailed.hotelConvertedChildTotalsById ||
      rawAdditionalCosts.hotelConvertedChildTotalsById ||
      {},
    baseExplicitChildCount: n(detailed.baseExplicitChildCount),
    baseConvertedChildCount: n(detailed.baseConvertedChildCount),
    hotelExplicitChildCount: n(detailed.hotelExplicitChildCount),
    hotelConvertedChildCount: n(detailed.hotelConvertedChildCount),
  };

  const selectedHotel = deriveSelectedHotelFromDays(
    itineraryDays,
    hotelDetalle,
    cotizacion.selectedHotel || cotizacion.selected_hotel || null,
  );

  const pricingSource = {
    ...cotizacion,
    peopleDetails,
    people_details: peopleDetails,
    peopledetails: peopleDetails,
    peopleCount,
    peoplecount: peopleCount,
    num_adults: peopleCount.adults,
    numAdults: peopleCount.adults,
    num_children: peopleCount.children,
    numChildren: peopleCount.children,
    cantidadpersonas: peopleCount.adults + peopleCount.children,
    cantidadPersonas: peopleCount.adults + peopleCount.children,
    itinerario: itineraryDays,
    dias: itineraryDays,
    itinerario_externo: externalItineraryDays,
    itinerarioExterno: externalItineraryDays,
    externalItinerary: externalItineraryDays,
    externalDays: externalItineraryDays,
    hotel_detalle: hotelDetalle,
    hotelDetalle,
    selectedHotel,
    selected_hotel: selectedHotel,
    additionalCosts,
    additionalcosts: additionalCosts,
    subtotalIndividual,
    subtotal_individual: subtotalIndividual,
    nonHotelsTotal: subtotalIndividual,
    precio_it_adulto: subtotalIndividual,
    precioItAdulto: subtotalIndividual,
    subtotalNinos,
    subtotal_ninos: subtotalNinos,
    subtotal_nino: subtotalNinos,
    precio_it_ninos: firstDefined(
      cotizacion.precio_it_ninos,
      cotizacion.precioItNinos,
      subtotalNinos,
    ),
    precioItNinos: firstDefined(
      cotizacion.precioItNinos,
      cotizacion.precio_it_ninos,
      subtotalNinos,
    ),
    hotelAdultTotal: n(detailed.hotelAdultTotal),
    hotel_adult_total: n(detailed.hotelAdultTotal),
    hotelChildTotal: n(detailed.hotelChildrenTotal),
    hotel_child_total: n(detailed.hotelChildrenTotal),
    hotelConvertedChildTotal: n(detailed.hotelConvertedChildTotal),
    hotel_converted_child_total: n(detailed.hotelConvertedChildTotal),
    hotelsTotal: n(detailed.hotelAdultTotal),
    hotelFullTotal: n(detailed.hotelsTotal),
    nonHotelExplicitChildTotal: n(detailed.baseExplicitChildTotal),
    nonHotelConvertedChildTotal: n(detailed.baseConvertedChildTotal),
    nonHotelExplicitChildTotalsById:
      detailed.baseExplicitChildTotalsById || {},
    nonHotelConvertedChildTotalsById:
      detailed.baseConvertedChildTotalsById || {},
    hotelExplicitChildTotalsById: detailed.hotelExplicitChildTotalsById || {},
    hotelConvertedChildTotalsById:
      detailed.hotelConvertedChildTotalsById || {},
    baseExplicitChildCount: n(detailed.baseExplicitChildCount),
    baseConvertedChildCount: n(detailed.baseConvertedChildCount),
    hotelExplicitChildCount: n(detailed.hotelExplicitChildCount),
    hotelConvertedChildCount: n(detailed.hotelConvertedChildCount),
    precio_it_ext_adulto:
      n(
        cotizacion.precio_it_ext_adulto ??
          cotizacion.precioItExtAdulto ??
          cotizacion.externalAdultTotal,
      ) || n(externalBreakdown.adultTotal),
    precio_it_ext_ninos:
      n(
        cotizacion.precio_it_ext_ninos ??
          cotizacion.precioItExtNinos ??
          cotizacion.externalChildTotal,
      ) ||
      n(externalBreakdown.childTotal) +
        n(externalBreakdown.convertedChildTotal),
    info_pdf: normalizeMojibakeValue(cotizacion.info_pdf || []),
  };

  const previewContext = buildPdfHotelPreviewRows({
    cotizacion: pricingSource,
    resolvedHotel: selectedHotel,
    packageType:
      cotizacion.packagetype || cotizacion.packageType || "compartido",
  });
  const categoryRows = Array.isArray(previewContext?.categoryRows)
    ? previewContext.categoryRows
    : [];
  const selectedPreviewRow = resolveSelectedPreviewRow(
    categoryRows,
    selectedHotel,
  );
  const hasGroupedHotelStay =
    Array.isArray(selectedHotel?.dayGroups) && selectedHotel.dayGroups.length > 1;
  const resolvedGroupedPricing = resolveSummaryContentPerRoomPricing({
    ...pricingSource,
    selectedHotel,
    selected_hotel: selectedHotel,
    perRoomPricing: selectedHotel?.perRoomPricing || [],
  });
  const perRoomPricing =
    resolvedGroupedPricing.length > 0
      ? resolvedGroupedPricing
      : parseSummaryPricingArray(selectedHotel?.perRoomPricing).length > 0
        ? parseSummaryPricingArray(selectedHotel.perRoomPricing)
        : parseSummaryPricingArray(cotizacion.perRoomPricing).length > 0
          ? parseSummaryPricingArray(cotizacion.perRoomPricing)
          : parseSummaryPricingArray(cotizacion.per_room_pricing);

  const selectedHotelForPricing = selectedHotel
    ? {
        ...selectedHotel,
        ...(!hasGroupedHotelStay && selectedPreviewRow
          ? selectedPreviewRow
          : {}),
        breakdown:
          !hasGroupedHotelStay &&
          Array.isArray(selectedPreviewRow?.breakdown) &&
          selectedPreviewRow.breakdown.length > 0
            ? selectedPreviewRow.breakdown
            : selectedHotel?.breakdown || [],
        allCategoryRows: categoryRows,
        categoryRows,
        perRoomPricing,
        dayGroupsAuthoritative:
          hasGroupedHotelStay || selectedHotel?.dayGroupsAuthoritative === true,
        groupedHotelSelection:
          hasGroupedHotelStay || selectedHotel?.groupedHotelSelection === true,
      }
    : null;

  return {
    ...pricingSource,
    selectedHotel: selectedHotelForPricing,
    selected_hotel: selectedHotelForPricing,
    perRoomPricing,
    per_room_pricing: perRoomPricing,
  };
};

export default hydrateCotizacionPricingContext;
