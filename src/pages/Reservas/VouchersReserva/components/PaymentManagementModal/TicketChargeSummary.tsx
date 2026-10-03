import React from "react";

export default function TicketChargeSummary({ summary, formatAmount }: { summary: any; formatAmount: (value: number) => string }) {
  if (!summary.lines.length) return null;
  // El detalle permanece en el flujo normal y cerrado inicialmente: nunca cubre los pagos.
  return <details className="ticket-charge-document">
    <summary className="ticket-charge-document__header" aria-label="Ver detalle de entradas">
      <div><span>Entradas · {summary.lines.length} servicios</span><small>Ver detalle por beneficiarios</small></div>
      <div className="ticket-charge-document__total"><strong>{formatAmount(summary.total)}</strong></div>
    </summary>
    <div className="ticket-charge-document__passenger"><strong>{summary.paxName}</strong><small>{summary.agencyName}</small></div>
    <div className="ticket-charge-document__line ticket-charge-document__columns" aria-hidden="true">
      <b>PAX</b><span>Entrada / tarifa</span><em>Por pasajero</em><strong>Total</strong>
    </div>
    <div className="ticket-charge-document__lines">
      {summary.lines.map((line: any) => <div className="ticket-charge-document__line" key={line.id}>
        <b>{line.quantity == null ? "—" : String(line.quantity).padStart(2, "0")}</b>
        <span>{line.description}</span><em>{formatAmount(line.unit)}</em><strong>{formatAmount(line.total)}</strong>
      </div>)}
    </div>
  </details>;
}
