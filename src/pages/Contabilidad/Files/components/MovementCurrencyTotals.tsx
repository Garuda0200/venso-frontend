import { CurrencyTotal } from "../domain/movementFiles";
export function formatMovementAmount(value: number, currency: string) {
  return `${currency === "PEN" ? "S/" : currency === "USD" ? "US$" : currency === "SIN MONEDA" ? "" : currency} ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export default function MovementCurrencyTotals({ totals, compact = false }: { totals: CurrencyTotal[]; compact?: boolean }) {
  return <div className={`currency-totals ${compact ? "currency-totals--compact" : ""}`}>
    {totals.map(row => <div className="currency-total" key={row.currency}>
      <span className="currency-total__code">{row.currency}</span>
      {!compact && <><span className="currency-total__income" title="Ingresos">+ {formatMovementAmount(row.ingresos, row.currency)}</span>
        <span className="currency-total__expense" title="Egresos">− {formatMovementAmount(row.egresos, row.currency)}</span></>}
      <strong className={row.balance >= 0 ? "positive" : "negative"} title="Balance">{formatMovementAmount(row.balance, row.currency)}</strong>
    </div>)}
  </div>;
}
