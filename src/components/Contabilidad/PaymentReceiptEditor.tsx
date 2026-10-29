import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Modal from "../UI/Modal/Modal";
import FileDropZone from "../common/FileDropZone/FileDropZone";
import PaymentReceiptFields from "./PaymentReceiptFields";
import contabilidadService from "../../services/contabilidadService";
import vouchersPagosService from "../../services/vouchersPagosService";
import { buildEvidencePatch, buildReceiptPatch } from "./utils/paymentReceiptPatch";
import { buildMovementDatePatch, movementDateValue } from "../../utils/movementDate";
import { canRemoveMovementEvidence } from "./utils/movementMediaPermissions";
import MovementCurrencyCorrection from "./MovementCurrencyCorrection";
export default function PaymentReceiptEditor({
  isOpen,
  onClose,
  onSuccess,
  movement,
  role,
  actorId,
  servicePayment = false,
  mediaOnly = false,
  initialFiles = []
}) {
  const [original, setOriginal] = useState(movement);
  const [values, setValues] = useState({
    metodo_pago: movement.metodo_pago || "",
    referencia_pago: movement.referencia_pago || "",
    fecha: movementDateValue(movement.fecha),
  });
  const [evidences, setEvidences] = useState([]);
  const [pending, setPending] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setReady(false);
    setPending(initialFiles);
    setRemoved([]);
    setConfirmId(null);
    setConfirmClose(false);
    setError("");
    setOriginal(movement);
    setValues({
      metodo_pago: movement.metodo_pago || "",
      referencia_pago: movement.referencia_pago || "",
      fecha: movementDateValue(movement.fecha),
    });
    vouchersPagosService.getByMovimientoId(movement.id).then(result => {
      if (!active) return;
      if (!result.success) {
        setError("No se pudieron cargar las evidencias. Cierra y vuelve a abrir para reintentar.");
        return;
      }
      setEvidences(result.data);
      setReady(true);
    }).catch(() => { if (active) setError("No se pudieron cargar las evidencias. Cierra y vuelve a abrir para reintentar."); });
    return () => {
      active = false;
    };
  }, [movement.id, isOpen]);
  const changed = servicePayment ? values.fecha !== movementDateValue(original.fecha)
    : values.metodo_pago !== (original.metodo_pago || "") || values.referencia_pago !== (original.referencia_pago || "");
  const mediaChanged = pending.length > 0 || removed.length > 0;
  const notify = async data => {
    window.dispatchEvent(new CustomEvent("movimientoUpdated", {
      detail: {
        movimiento_id: movement.id,
        referencia_voucher_venta: movement.referencia_voucher_venta,
        referencia_voucher_reserva: movement.referencia_voucher_reserva,
        voucher_code: movement.voucher_code,
      }
    }));
    try {
      await onSuccess?.(data);
    } catch {
      // El PATCH ya quedó confirmado; un fallo de recarga no debe invitar a
      // repetirlo ni descartar el borrador de archivos que sigue abierto.
      toast.warning?.("El cambio se guardó, pero no se pudo refrescar el resumen. Vuelve a abrirlo para actualizarlo.");
    }
  };
  const saveMetadata = async () => {
    setBusy(true);
    setError("");
    try {
      const patch = servicePayment ? buildMovementDatePatch(original.fecha, values.fecha) : buildReceiptPatch(original, values);
      if (!patch) return;
      const result = servicePayment ? await contabilidadService.patchServicePaymentDate(movement.id, patch)
        : await contabilidadService.patchPaymentReceipt(movement.id, patch);
      if (!result.success || !result.data?.id) throw new Error("Respuesta de recepción inválida; recarga el pago antes de reintentar.");
      setOriginal(result.data);
      setValues({
        metodo_pago: result.data.metodo_pago || "",
        referencia_pago: result.data.referencia_pago || "",
        fecha: movementDateValue(result.data.fecha),
      });
      await notify(result.data);
      toast.success(servicePayment ? "Fecha guardada. El importe y la cuenta no cambiaron." : "Método y referencia guardados. El importe no cambió.");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudo actualizar la recepción");
    } finally {
      setBusy(false);
    }
  };
  const saveMedia = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await vouchersPagosService.patchMovementEvidence(movement.id, buildEvidencePatch(evidences, removed, pending));
      if (!result.success || !Array.isArray(result.data)) throw new Error("Respuesta de evidencias inválida; recarga antes de reintentar.");
      setEvidences(result.data);
      setPending([]);
      setRemoved([]);
      setConfirmId(null);
      await notify({
        ...original,
        media_updated: true
      });
      toast.success("Evidencias guardadas. Los archivos anteriores se conservan.");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "No se pudieron guardar las evidencias. Recarga antes de reintentar si la conexión se interrumpió.");
    } finally {
      setBusy(false);
    }
  };
  const [confirmClose, setConfirmClose] = useState(false);
  const close = () => {
    if (busy) return;
    if (changed || mediaChanged) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };
  const files = [...evidences.filter(v => !removed.includes(v.id)).map(v => ({
    ...v,
    existingId: v.id
  })), ...pending];
  return <Modal isOpen={isOpen} onClose={close} title={`${servicePayment ? "Editar pago" : "Recepción de pago"} #${movement.id}`} size="medium" className="movimiento-modal payment-receipt-editor" actions={[{
    label: "Cerrar",
    onClick: close,
    variant: "secondary",
    disabled: busy
  }]}>
    {!mediaOnly && <MovementCurrencyCorrection movement={original} role={role} disabled={busy || changed || mediaChanged}
      onSuccess={async data => { await notify(data.movement); onClose(); }} />}
    <p className="movement-media-policy">{servicePayment ? "Puedes corregir la fecha y actualizar comprobantes. La corrección de moneda y fondo se confirma por separado." : "Puedes corregir los datos de recepción y los comprobantes. La corrección de moneda y fondo se confirma por separado."}</p>
    {error && <p role="alert" className="receipt-error">{error}</p>}
    {!mediaOnly && <form onSubmit={event => {
      event.preventDefault();
      saveMetadata();
    }}>
      {servicePayment ? <div className="form-group"><label htmlFor="payment-movement-date">Fecha de movimiento</label><input id="payment-movement-date" name="fecha" type="date" value={values.fecha} required disabled={busy}
        min={`${movementDateValue(original.fecha).slice(0,4)}-01-01`} max={`${movementDateValue(original.fecha).slice(0,4)}-12-31`}
        onChange={event => setValues({...values,fecha:event.target.value})} /></div> : <PaymentReceiptFields values={values} disabled={busy} onChange={event => setValues({
        ...values,
        [event.target.name]: event.target.value
      })} />}
      <button type="submit" disabled={busy || !changed}>{servicePayment ? "Guardar fecha" : "Guardar método y referencia"}</button>
    </form>}
    <section aria-label="Comprobantes del pago">
      <h3>Evidencias de pago</h3>
      <p>Hasta 10 archivos nuevos, 10 MB por archivo y 30 MB por lote. Sólo puedes retirar archivos subidos por ti; los originales se conservan.</p>
      {!ready && !error && <p role="status">Cargando evidencias…</p>}
      <FileDropZone files={files} disabled={busy || !ready} accept="image/jpeg,image/png,image/webp,application/pdf" onFilesAdded={next => setPending([...pending, ...next])} canRemoveFile={file => canRemoveMovementEvidence(file, role, actorId)} onFileRemove={index => {
        const file = files[index];
        if (!canRemoveMovementEvidence(file, role, actorId) || busy) return;
        if (file.existingId) {
          setConfirmId(file.existingId);
        } else {
          setPending(pending.filter(v => v.id !== file.id));
        }
      }} />
      {confirmId !== null && <div role="alertdialog" aria-label="Confirmar retiro de evidencia" className="receipt-confirm">
        <p>¿Retirar este comprobante? El original se conservará en el historial.</p>
        <button type="button" onClick={() => {
          setRemoved([...removed, confirmId]);
          setConfirmId(null);
        }}>Confirmar retiro</button>
        <button type="button" onClick={() => setConfirmId(null)}>Cancelar</button>
      </div>}
      {removed.length > 0 && <button type="button" disabled={busy} onClick={() => setRemoved([])}>Deshacer retiros ({removed.length})</button>}
      <button type="button" disabled={busy || !ready || !mediaChanged} onClick={saveMedia}>Guardar evidencias</button>
    </section>
    {confirmClose && <div role="alertdialog" aria-label="Cambios sin guardar" className="receipt-confirm">
      <p>Hay cambios sin guardar. ¿Quieres descartarlos y cerrar?</p>
      <button type="button" disabled={busy} onClick={() => {
        if (!busy) onClose();
      }}>Descartar y cerrar</button>
      <button type="button" onClick={() => setConfirmClose(false)}>Seguir editando</button>
    </div>}
  </Modal>;
}
