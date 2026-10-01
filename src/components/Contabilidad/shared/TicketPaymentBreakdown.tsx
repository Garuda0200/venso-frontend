import { ticketPaymentTariffs } from "../../../pages/Contabilidad/Reportes/utils/ticketPaymentPresentation";
import type { QuoteServiceRow } from "../../../pages/Contabilidad/Reportes/utils/paymentReportUtils";

const TicketPaymentBreakdown = ({ row }: { row: QuoteServiceRow }) => {
  const tariffs = ticketPaymentTariffs(row);
  if (!tariffs.length) return null;
  const currency = row.currency === "soles" ? "S/" : "US$";
  return (
    <div className="ticket-payment-breakdown" aria-label={`Tarifas de ${row.serviceName}`}>
      <small>Tarifas de entrada · base</small>
      {tariffs.map((tariff, index) => (
        <div className="ticket-payment-breakdown__tariff" key={`${tariff.label}-${index}`}>
          <span>{tariff.label}</span>
          <span>{tariff.pax} pax × {currency} {tariff.unit.toFixed(2)}</span>
          <strong>{currency} {tariff.total.toFixed(2)}</strong>
        </div>
      ))}
    </div>
  );
};

export default TicketPaymentBreakdown;
