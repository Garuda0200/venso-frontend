import React, { useEffect, useRef } from "react";

export default function QuotationPriceChangeDialog({ previous, next, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    cancelRef.current?.focus();
    const key = e => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Tab") {
        e.preventDefault();
        const controls = cancelRef.current?.parentElement?.querySelectorAll("button");
        if (controls?.length) (document.activeElement === controls[0] ? controls[1] : controls[0]).focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prior?.focus?.(); };
  }, [onCancel]);
  const money = n => `USD ${Number(n).toFixed(2)}`;
  return <div className="ec-price-confirm-overlay">
    <section className="ec-price-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ec-price-confirm-title" aria-describedby="ec-price-confirm-description">
      <h2 id="ec-price-confirm-title">Revisar el precio de la venta cerrada</h2>
      <p id="ec-price-confirm-description">El cálculo actual de servicios, beneficiarios y adicionales difiere del precio guardado. Confirma el nuevo total sólo después de revisar esa diferencia.</p>
      <dl><div><dt>Precio guardado</dt><dd>{money(previous)}</dd></div><div><dt>Nuevo total calculado</dt><dd>{money(next)}</dd></div></dl>
      <p>Al continuar se actualizará la cotización y su historial. No se registrará ningún pago.</p>
      <footer><button type="button" ref={cancelRef} onClick={onCancel}>Volver a revisar</button><button type="button" onClick={onConfirm}>Confirmar nuevo total</button></footer>
    </section>
  </div>;
}
