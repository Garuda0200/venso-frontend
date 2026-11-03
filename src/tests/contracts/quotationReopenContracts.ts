/** Real edit/serialize boundary, driven by persisted PostgreSQL itineraries. */
import { updateCotizacion } from "../../pages/Ventas/Cotizaciones/hooks/cotizacionService";
import { hydrateItinerarioFromDB, cleanItinerarioForDB } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/itinerarioCleanupUtils";
import { resolveQuotationSavePricing } from "../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/quotationSavePricing";
import { executeTicketPriceEditor } from "./ticketPriceEditorHarness";

export async function quotationReopenContract({ quote, operation = "none", transport, price = 25.33, scope = "main" }) {
  const field = scope === "external" ? "itinerario_externo" : "itinerario";
  const days = hydrateItinerarioFromDB(quote[field]);
  if (operation === "edit-ticket") {
    days[0].servicios[0] = executeTicketPriceEditor(days[0].servicios[0], price, scope, quote.peopleDetails);
  }
  if (operation === "add-service") {
    const service = { typeService: "transportes", parentService: { typeService: "transportes", id_transporte: transport.provider },
      childService: { id_movilidad: transport.service, nro_pasajeros: 4 }, tipoPrecio: "privado", moneda: "dolares",
      precioServicio: 4.17, precioTotal: 12.51,
      beneficiariosAdultos: [1, 2, 3].map(index => ({ id: `adult:${index}` })), beneficiariosNinos: [] };
    days[0].servicios.push(...hydrateItinerarioFromDB([{ numero: 1, servicios: [service] }])[0].servicios);
  }
  const input = { ...quote, [field]: days };
  const pricing = resolveQuotationSavePricing(input);
  const body = {
    titulo: quote.titulo, voucher_code: quote.voucher_code, cantidadpersonas: quote.cantidadpersonas,
    packagetype: quote.packagetype, agency_id: quote.agency_id, tariff_type: quote.tariff_type,
    additionalcosts: quote.additionalcosts ?? {}, ...pricing,
    itinerario: cleanItinerarioForDB(scope === "main" ? days : hydrateItinerarioFromDB(quote.itinerario)),
    itinerario_externo: cleanItinerarioForDB(scope === "external" ? days : hydrateItinerarioFromDB(quote.itinerario_externo)),
    expected_version: quote.current_version,
  };
  const result = await updateCotizacion(quote.id, body);
  return { payload: result, pricing };
}
