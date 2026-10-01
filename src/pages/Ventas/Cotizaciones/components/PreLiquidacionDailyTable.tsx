import React from "react";
import type { PreLiquidacionQuotationSummary } from "../utils/preliquidacionMoney";

interface Props {
  days: PreLiquidacionQuotationSummary["days"];
  total: number;
  showTotal: boolean;
  empty?: boolean;
}

/** Only the commercial day/title/amount: no supplier or service breakdown. */
export default function PreLiquidacionDailyTable({ days, total, showTotal, empty }: Props) {
  return (
    <table className="preliq-doc__liquidation preliq-doc__liquidation--days">
      <colgroup><col style={{ width: 42 }} /><col /><col style={{ width: 125 }} /></colgroup>
      <thead>
        <tr className="preliq-doc__liquidation-title"><th colSpan={3}>COTIZADO POR DÍA</th></tr>
        <tr><th>DÍA</th><th>ITINERARIO</th><th>TOTAL</th></tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.id} data-preliq-day={day.id}><td>{day.dayNumber}</td><td>{day.title || "Sin título"}</td><td>$ {day.total.toFixed(2)}</td></tr>
        ))}
        {empty && <tr><td colSpan={3}>SIN DÍAS REGISTRADOS</td></tr>}
        {showTotal && <tr className="preliq-doc__total-row"><td colSpan={2}>TOTAL, A PAGAR</td><td>$ {total.toFixed(2)} USD</td></tr>}
      </tbody>
    </table>
  );
}
