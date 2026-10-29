import "./styles/QuotationFocusBanner.scss";

export default function QuotationFocusBanner({ quotation, loading, error, onClear, onRetry }: {
  quotation: any; loading: boolean; error: string; onClear: () => void; onRetry: () => void;
}) {
  return <section className="quotation-focus-banner" aria-label="Cotización vinculada desde Biblia" aria-busy={loading}>
    <div role={error ? "alert" : "status"}>
      <strong>{loading ? "Cargando cotización…" : error ? "Cotización no disponible" : "Cotización vinculada"}</strong>
      <span>{error || (quotation && [quotation.voucher_code || quotation.voucherCode || quotation.id, quotation.titulo].filter(Boolean).join(" · "))}</span>
    </div>
    {error && <button type="button" onClick={onRetry}>Reintentar</button>}
    <button type="button" onClick={onClear}>Ver todas</button>
  </section>;
}