import React, { useEffect, useState } from "react";
import { MdClose, MdLockOpen } from "react-icons/md";
import "./styles/PostSaleEditRequestModal.scss";

export default function PostSaleEditRequestModal({ open, cotizacion, onClose, onSubmit, loading = false }) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, cotizacion?.id]);

  if (!open) return null;
  const valid = reason.trim().length >= 5;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || loading) return;
    await onSubmit(reason.trim());
  };

  return (
    <div className="post-sale-request-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose?.();
    }}>
      <form className="post-sale-request-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="post-sale-request-title">
        <header>
          <div>
            <span className="post-sale-request-kicker">Venta cerrada</span>
            <h3 id="post-sale-request-title"><MdLockOpen /> Solicitar edición</h3>
            <p>{cotizacion?.id} · {cotizacion?.titulo || "Cotización"}</p>
          </div>
          <button type="button" className="icon-close" onClick={onClose} disabled={loading} aria-label="Cerrar"><MdClose /></button>
        </header>
        <label htmlFor="post-sale-edit-reason">Motivo</label>
        <textarea
          id="post-sale-edit-reason"
          autoFocus
          rows={4}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Indica brevemente qué deseas corregir."
        />
        <footer>
          <button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="primary" disabled={!valid || loading}>
            {loading ? "Enviando…" : "Enviar solicitud"}
          </button>
        </footer>
      </form>
    </div>
  );
}
