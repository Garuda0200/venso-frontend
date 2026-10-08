import React, { useState } from "react";
import { tariffPriceOptions } from "../../../../../utils/servicePricingType";
import { FaCheck, FaUsers, FaUser } from "react-icons/fa";
import InlineTariffPrice from "./InlineTariffPrice";

interface TarifaPriceSummaryProps {
  onPriceSave?: (patch: Record<string, number>) => Promise<void>;
  disabled?: boolean;
  tarifa: {
    moneda?: string;
    precio_compartido?: number | string | null;
    precio_privado?: number | string | null;
  };
}

const TarifaPriceSummary = ({ tarifa, onPriceSave, disabled }: TarifaPriceSummaryProps) => {
  const currency = tarifa.moneda === "soles" ? "S/" : "$";
  const prices = tariffPriceOptions(tarifa);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const activeMode = prices.some(price => price.tipoPrecio === selectedMode) ? selectedMode : prices[0]?.tipoPrecio;
  return <div className="cell-price-summary" role="group" aria-label="Precios de tarifa">
    {prices.length === 0 ? <span className="cell-price-summary__empty">Sin precio</span> : prices.map(price => (
      <div className={`cell-price-summary__entry ${activeMode === price.tipoPrecio ? "is-selected" : ""}`}
        key={price.tipoPrecio}>
      <button type="button" className="cell-price-summary__mode" aria-pressed={activeMode === price.tipoPrecio}
        onClick={event => { event.stopPropagation(); setSelectedMode(price.tipoPrecio); }} title={price.label}>
        {price.tipoPrecio === "compartido" ? <FaUsers aria-hidden="true" /> : <FaUser aria-hidden="true" />}
        <span>{price.tipoPrecio === "compartido" ? "Compartido" : "Privado"}<small>{price.tipoPrecio === "compartido" ? "Total" : "Por persona"}</small></span>
        {activeMode === price.tipoPrecio && <FaCheck aria-hidden="true" />}
      </button>
      <InlineTariffPrice amount={price.amount} currency={currency} mode={price.tipoPrecio}
        onSave={onPriceSave} disabled={disabled} />
      </div>
    ))}
  </div>;
};

export default TarifaPriceSummary;
