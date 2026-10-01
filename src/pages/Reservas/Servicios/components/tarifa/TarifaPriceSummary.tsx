import React from "react";

interface TarifaPriceSummaryProps {
  tarifa: {
    moneda?: string;
    precio_unico?: boolean;
    precio_compartido?: number | string | null;
    precio_privado?: number | string | null;
  };
}

const TarifaPriceSummary = ({ tarifa }: TarifaPriceSummaryProps) => {
  const currency = tarifa.moneda === "soles" ? "S/" : "$";
  const format = (value: number | string | null | undefined) => {
    const amount = value === null || value === undefined || value === "" ? NaN : Number(value);
    return Number.isFinite(amount) ? `${currency} ${amount.toFixed(2)}` : "Sin precio";
  };
  const prices = tarifa.precio_unico
    ? [{ label: "Precio único", value: tarifa.precio_compartido }]
    : [{ label: "Compartido", value: tarifa.precio_compartido }, { label: "Privado", value: tarifa.precio_privado }];
  return <div className="cell-price-summary">{prices.map((price) => (
    <div className="cell-price-summary__entry" key={price.label}>
      <span>{price.label}</span><strong>{format(price.value)}</strong>
    </div>
  ))}</div>;
};

export default TarifaPriceSummary;
