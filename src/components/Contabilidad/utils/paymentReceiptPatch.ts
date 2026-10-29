export const isPaymentReceipt = (movement = {}) => {
  const context = movement.contexto_pago;
  const kind = typeof context === "string" ? context : context?.tipo;
  return String(movement.tipo_movimiento || "ingreso").toLowerCase() === "ingreso" && String(kind || "PagoCotizacion").trim().toLowerCase() === "pagocotizacion" && Boolean(movement.referencia_voucher_venta || movement.payment_voucher_venta_id);
};
export const buildReceiptPatch = (original, values) => {
  const payload = {
    expected: {
      metodo_pago: original.metodo_pago ?? null,
      referencia_pago: original.referencia_pago ?? null
    }
  };
  for (const key of ["metodo_pago", "referencia_pago"]) {
    const previous = original[key] ?? "";
    if (values[key] === previous) continue;
    const value = String(values[key] || "").trim();
    if ([...value].length > 50 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error("Método y referencia admiten hasta 50 caracteres, sin saltos de línea.");
    }
    payload[key] = value || null;
  }
  return Object.keys(payload).length > 1 ? payload : null;
};
export const buildEvidencePatch = (evidences, removedIds, files) => {
  const payload = new FormData();
  payload.append("changes", JSON.stringify({
    expected_ids: evidences.map(file => Number(file.existingId ?? file.id)),
    remove_ids: removedIds
  }));
  for (const file of files) payload.append("files", file.fileObject);
  return payload;
};
