import React, { useEffect, useRef, useState } from "react";
import { FaCheck, FaPen, FaSpinner, FaTimes } from "react-icons/fa";
import type { TariffMode } from "../../utils/tariffPriceModes";
import { saveInlineTariffPrice } from "../../utils/tariffInlinePrice";

interface Props {
  amount: number;
  currency: string;
  mode: TariffMode;
  disabled?: boolean;
  onSave?: (patch: Record<string, number>) => Promise<void>;
}

export default function InlineTariffPrice({ amount, currency, mode, disabled, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState(amount);
  useEffect(() => { setConfirmedAmount(amount); }, [amount]);
  const inFlight = useRef(false);
  const label = `precio ${mode}`;
  const cancel = () => { if (!inFlight.current) { setEditing(false); setError(""); } };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!onSave || disabled || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await saveInlineTariffPrice(mode, draft, confirmedAmount, onSave);
      setConfirmedAmount(Number(draft.trim().replace(",", ".")));
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el precio.");
    } finally { inFlight.current = false; setSaving(false); }
  };
  if (!onSave) return <strong>{currency} {amount.toFixed(2)}</strong>;
  if (!editing) return <button type="button" className="cell-price-summary__amount"
    disabled={disabled} aria-label={`Editar ${label}: ${currency} ${confirmedAmount.toFixed(2)}`}
    title={`Editar ${label}`} onClick={event => {
      event.stopPropagation(); setDraft(confirmedAmount.toFixed(2)); setError(""); setEditing(true);
    }}><strong>{currency} {confirmedAmount.toFixed(2)}</strong><FaPen aria-hidden="true" /></button>;
  return <form className="cell-price-summary__editor" onSubmit={submit} onClick={event => event.stopPropagation()}>
    <div className="cell-price-summary__controls">
      <span aria-hidden="true">{currency}</span>
      <input autoFocus inputMode="decimal" aria-label={`Importe ${mode}`} aria-invalid={Boolean(error)}
        value={draft} disabled={disabled || saving} onFocus={event => event.target.select()}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
        }} />
      <button type="submit" disabled={disabled || saving} aria-label={`Guardar ${label}`} title="Guardar precio">
        {saving ? <FaSpinner className="is-spinning" aria-hidden="true" /> : <FaCheck aria-hidden="true" />}
      </button>
      <button type="button" disabled={saving} aria-label={`Cancelar edición de ${label}`} title="Cancelar" onClick={cancel}>
        <FaTimes aria-hidden="true" />
      </button>
    </div>
    {error && <span className="cell-price-summary__error" role="alert">{error}</span>}
  </form>;
}
