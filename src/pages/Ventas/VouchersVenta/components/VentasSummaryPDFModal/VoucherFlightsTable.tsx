import type { ReactNode } from "react";

export const VOUCHER_FLIGHT_FIELDS = ["route", "airline", "flightClass", "flightNumber", "date", "depTime", "arrTime", "baggage"] as const;
export type VoucherFlightField = typeof VOUCHER_FLIGHT_FIELDS[number];

/** Headers belong to the table, never to each flight's editable cells. */
export default function VoucherFlightsTable({ type, title, flights, headers, renderCell, renderAction,
  getRowKey, showHeader = true }: {
  type: string; title: string; flights: any[]; headers: Record<VoucherFlightField, string>;
  renderCell: (flight: any, field: VoucherFlightField) => ReactNode;
  renderAction?: (flight: any) => ReactNode;
  getRowKey?: (flight: any, index: number) => string;
  showHeader?: boolean;
}) {
  if (!flights.length) return null;
  return <div className={`flight-box voucher-flights-table-box flight-box--${type === "internacional" ? "intl" : "national"}`}
    data-flight-type={type}>
    {showHeader && <div className="flight-title">{title}</div>}
    <table className="voucher-flights-table" aria-label={title}>
      <colgroup>{VOUCHER_FLIGHT_FIELDS.map(field => <col key={field} className={`voucher-flights-table__col--${field}`} />)}</colgroup>
      {showHeader && <thead><tr>{VOUCHER_FLIGHT_FIELDS.map(field => <th key={field} scope="col">{headers[field].replace(/:$/, "")}</th>)}</tr></thead>}
      <tbody>{flights.map((flight,index) => <tr key={`${getRowKey?.(flight,index) || type}-${index}`} data-voucher-flight-row="true">
        {VOUCHER_FLIGHT_FIELDS.map(field => <td key={field} className={`voucher-flights-table__cell--${field}`}>
          {renderCell(flight,field)}{field === "baggage" && renderAction?.(flight)}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}
