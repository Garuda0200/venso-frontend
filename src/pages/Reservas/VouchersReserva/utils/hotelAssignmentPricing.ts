import { createUnifiedService } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/unifiedServiceManager";
import { roomTariffPrice } from "../../../../utils/roomTariff";
import { assignedPaymentExchangeRate, DEFAULT_ASSIGNED_PEN_RATE, storedPaymentCurrency, roundPaymentMoney } from "../../../../utils/paymentCurrency";

/** Operational hotel amounts always remain in the selected supplier currency. */
export function buildHotelAssignmentService(hotel, room, tariff, peopleDetails, selection, fallbackMode = "compartido") {
  const mode = tariff.tipoPrecio || tariff.tipo_precio || tariff.selectedType || fallbackMode;
  const count = selection.selectedIds?.length || 0;
  if (!count) throw new Error("Asigna pasajeros a la habitación antes de guardar");
  const raw = roundPaymentMoney(roomTariffPrice(tariff, mode));
  const currency = storedPaymentCurrency(tariff.moneda || "dolares");
  const rate = assignedPaymentExchangeRate({assignedMoneda:currency,assignedTariff:tariff}) ?? DEFAULT_ASSIGNED_PEN_RATE;
  const total = roundPaymentMoney(mode === "compartido" ? raw : raw * count);
  const unit = roundPaymentMoney(mode === "compartido" ? raw / count : raw);
  const service = createUnifiedService(hotel, room, {...tariff,tipoPrecio:mode},peopleDetails,mode,selection);
  const operationalTariff = {...tariff,tipoPrecio:mode,selectedType:mode,moneda:currency,tasa_cambio:rate,tasaCambio:rate,
    precio:unit,precio_original:total,precio_original_with_child_extras:total};
  return {...service,tipoPrecio:mode,precioServicio:mode === "compartido" ? raw : unit,precioTotal:total,
    tariff:operationalTariff,assignedMoneda:currency,assignedTasaCambio:rate,assignedPassengerSelection:selection};
}
