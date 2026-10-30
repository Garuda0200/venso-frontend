import { useEffect, useState } from "react";
import { assignedPaymentCurrency, assignedPaymentExchangeRate, positiveAssignedRate } from "../../../../../../utils/paymentCurrency";
import "./ReservationCurrencyControl.scss";

export default function ReservationCurrencyControl({service, disabled = false, onChange}: {
  service: any; disabled?: boolean; onChange?: (currency: string, options: {rate: number}) => Promise<void> | void;
}) {
  const currency = assignedPaymentCurrency(service);
  const persistedRate = assignedPaymentExchangeRate(service);
  const [rate, setRate] = useState(() => String(currency === "PEN" ? persistedRate ?? "" : service.assignedCurrencyRate ?? ""));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    setRate(String(currency === "PEN" ? persistedRate ?? "" : service.assignedCurrencyRate ?? ""));
    setError("");
  }, [service.servicioId, service.id, currency, persistedRate, service.assignedCurrencyRate]);
  const save = async (target: string) => {
    const value = positiveAssignedRate(rate);
    if (!value) { setError("Confirma un TC válido de PEN por USD."); return; }
    setBusy(true); setError("");
    try { await onChange?.(target, {rate: value}); }
    catch (cause: any) { setError(cause?.response?.data?.message || cause?.message || "No se pudo guardar la moneda."); }
    finally { setBusy(false); }
  };
  return <details className="reservation-currency-control">
    <summary>Moneda · {currency}</summary>
    <fieldset disabled={disabled || busy || !onChange}>
      <legend>Moneda del costo</legend>
      <div className="reservation-currency-control__choices">
        {["USD", "PEN"].map(target => <button key={target} type="button" aria-pressed={target === currency}
          disabled={target === currency} onClick={() => void save(target)}>{target}</button>)}
      </div>
      <label>TC · PEN por USD<input type="number" min="0.0001" max="999999.9999" step="0.0001"
        value={rate} onChange={event => { setRate(event.target.value); setError(""); }} /></label>
      {currency === "PEN" && <button type="button" onClick={() => void save(currency)}
        disabled={positiveAssignedRate(rate) === persistedRate}>Guardar TC</button>}
      <small>Al cambiar moneda se convierten juntos los precios de adultos y niños.</small>
    </fieldset>
    {error && <small role="alert">{error}</small>}
  </details>;
}
