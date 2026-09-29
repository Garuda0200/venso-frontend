import React, { useState, useEffect, useMemo } from "react";
import Modal from "../UI/Modal/Modal";
import DatePicker from "react-datepicker";
import { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale";
import { FaSave, FaTimes } from "react-icons/fa";
import { toast } from "react-toastify";
import contabilidadService from "../../services/contabilidadService";
import vouchersPagosService from "../../services/vouchersPagosService";
import { useFileUpload } from "../../hooks/useFileUpload";
import { useAuth } from "../../context/AuthContext";

import { FundoSelector } from "./shared";
import FileDropZone from "../common/FileDropZone/FileDropZone";

import { formatCurrency } from "../../utils/formatters";
import { paymentRequestService } from "../../services/paymentRequestService";
import { voucherVentaService } from "../../services/voucherVentaService";
import {
  inferPaymentServiceType,
  resolveFacturacionFromServiceData,
} from "../../utils/paymentFacturacion";
import "./LiquidacionForm.scss";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("es", es);

const PagoLoteForm = ({
  isOpen,
  onClose,
  onSuccess,
  selectedPayments = [],
}) => {
  const [loading, setLoading] = useState(false);
  const [validated, setValidated] = useState(false);
  const [saldos, setSaldos] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [montoSecundario, setMontoSecundario] = useState("");
  const { uploadFile, deleteFile, isUploading, uploadProgress, uploadError } =
    useFileUpload();
  const { getCurrentUser } = useAuth();
  const currentUser = getCurrentUser();

  const [formData, setFormData] = useState({
    descripcion: "",
    saldo_id: "",
    monto: 0,
    tipo_cambio: "",
    fecha: new Date(),
    mes: new Date().getMonth() + 1,
    tipo_cuenta: "efectivo",
    moneda: "soles",
    metodo_pago: "",
    referencia_pago: "",
    pagado_por: "",
    recepcionado_por: "",
    observaciones: "",
    contexto_pago: null,
    referencia_voucher_reserva: "",
    referencia_voucher_venta: "",
    voucher_code: "",
  });

  useEffect(() => {
    if (isOpen) {
      resetForm();
      loadSaldos();

      // Calcular monto total y descripción automática
      if (selectedPayments.length > 0) {
        const montoTotal = selectedPayments.reduce((sum, p) => {
          const monto = parseFloat(p.amount) || 0;
          return sum + monto;
        }, 0);

        // Truncar a 2 decimales
        const montoTotalRedondeado = Math.round(montoTotal * 100) / 100;

        // Se conserva el contexto histórico para que reportes y evidencias existentes sigan conciliando.
        const contextoPago = {
          tipo: "LiquidacionServicioProveedor",
          payment_request_ids: selectedPayments.map((p) => p.id),
          cantidad_pagos: selectedPayments.length,
        };

        setFormData((prev) => ({
          ...prev,
          descripcion: `Pago por lote de ${selectedPayments.length} servicio(s)`,
          monto: montoTotalRedondeado,
          contexto_pago: contextoPago,
        }));
      }
    }
  }, [isOpen, selectedPayments]);

  const resetForm = () => {
    setFormData({
      descripcion: "",
      saldo_id: "",
      monto: 0,
      tipo_cambio: "",
      fecha: new Date(),
      mes: new Date().getMonth() + 1,
      tipo_cuenta: "efectivo",
      moneda: "soles",
      metodo_pago: "",
      referencia_pago: "",
      pagado_por: "",
      recepcionado_por: "",
      observaciones: "",
      contexto_pago: null,
      referencia_voucher_reserva: "",
      referencia_voucher_venta: "",
      voucher_code: "",
    });
    setEvidencias([]);
    setMontoSecundario("");
    setValidated(false);
  };

  const loadSaldos = async () => {
    try {
      const result = await contabilidadService.getSaldos();
      if (result.success) {
        const allSaldos = result.data || [];
        setSaldos(allSaldos);

        // Determinar año de la fecha actual del formulario
        const yearMovimiento =
          formData.fecha?.getFullYear() || new Date().getFullYear();

        console.log(
          ` PagoLoteForm: Buscando saldo para año=${yearMovimiento}`,
        );

        // Los pagos a proveedores se registran inicialmente en dólares.
        const saldoPreferido = allSaldos.find(
          (s) =>
            s.tipo === "efectivo" &&
            s.moneda === "dolares" &&
            s.year_saldo === yearMovimiento,
        );

        // Fallback: efectivo del año, cualquier moneda
        const saldoFallback1 = !saldoPreferido
          ? allSaldos.find(
              (s) => s.tipo === "efectivo" && s.year_saldo === yearMovimiento,
            )
          : null;

        // Fallback: cualquier saldo del año
        const saldoFallback2 =
          !saldoPreferido && !saldoFallback1
            ? allSaldos.find((s) => s.year_saldo === yearMovimiento)
            : null;

        // Fallback final: año más cercano si no hay para el año actual
        let saldoDefault = saldoPreferido || saldoFallback1 || saldoFallback2;

        if (!saldoDefault && allSaldos.length > 0) {
          console.warn(
            ` No hay saldos para año ${yearMovimiento}, buscando año más cercano`,
          );
          const añosDisponibles = [
            ...new Set(allSaldos.map((s) => s.year_saldo)),
          ].sort(
            (a, b) =>
              Math.abs(a - yearMovimiento) - Math.abs(b - yearMovimiento),
          );
          const añoMasCercano = añosDisponibles[0];
          saldoDefault =
            allSaldos.find(
              (s) => s.tipo === "efectivo" && s.year_saldo === añoMasCercano,
            ) || allSaldos.find((s) => s.year_saldo === añoMasCercano);
        }

        if (saldoDefault && !formData.saldo_id) {
          console.log(
            ` Saldo seleccionado: id=${saldoDefault.id}, year=${saldoDefault.year_saldo}`,
          );
          setFormData((prev) => ({
            ...prev,
            saldo_id: saldoDefault.id,
            tipo_cuenta: saldoDefault.tipo,
            moneda: saldoDefault.moneda,
          }));
        }
      }
    } catch (error) {
      console.error("Error al cargar saldos:", error);
      toast.error("Error al cargar saldos");
    }
  };

  // ============================================================================
  // CONVERSIÓN DE MONEDAS (USD Soles) - igual que MovimientoForm
  // ============================================================================
  const roundToTwoDecimals = (num) => Math.round(num * 100) / 100;

  // Moneda de los pagos seleccionados (del tariff)
  const monedaPagos = useMemo(() => {
    if (selectedPayments.length === 0) return "soles";
    return (
      selectedPayments[0]?.service_data?.tariff?.moneda ||
      selectedPayments[0]?.service_data?.moneda ||
      (selectedPayments[0]?.moneda === "USD" ? "dolares" : "soles")
    );
  }, [selectedPayments]);

  // Mostrar dual currency cuando el fondo seleccionado es en SOLES (como MovimientoForm)
  const showDualCurrency = useMemo(() => {
    const monedaFondo = formData.moneda?.toLowerCase() || "soles";
    return monedaFondo === "soles";
  }, [formData.moneda]);

  // Cuando cambia el tipo de cambio → recalcular equivalente en soles
  const handleTipoCambioChange = (e) => {
    const nuevoTC = e.target.value;
    setFormData((prev) => ({ ...prev, tipo_cambio: nuevoTC }));

    if (formData.monto && nuevoTC) {
      const tc = parseFloat(nuevoTC);
      if (!isNaN(tc) && tc > 0) {
        const montoSoles = roundToTwoDecimals(parseFloat(formData.monto) * tc);
        setMontoSecundario(montoSoles.toString());
      }
    } else {
      setMontoSecundario("");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Truncar montos a máximo 2 decimales al escribir
    if (name === "monto") {
      const parts = value.toString().split(".");
      if (parts[1] && parts[1].length > 2) {
        setFormData({
          ...formData,
          [name]: parts[0] + "." + parts[1].substring(0, 2),
        });
        return;
      }
    }

    setFormData({ ...formData, [name]: value });

    // Si cambia el saldo_id, actualizamos tipo_cuenta y moneda automáticamente
    if (name === "saldo_id") {
      const selectedSaldo = saldos.find((s) => s.id === parseInt(value));
      if (selectedSaldo) {
        setFormData((prev) => ({
          ...prev,
          [name]: parseInt(value),
          tipo_cuenta: selectedSaldo.tipo,
          moneda: selectedSaldo.moneda,
        }));
      }
    }
  };

  const handleFechaChange = (date) => {
    if (date) {
      const newYear = date.getFullYear();
      const oldYear = formData.fecha?.getFullYear() || new Date().getFullYear();

      setFormData({
        ...formData,
        fecha: date,
        mes: date.getMonth() + 1,
      });

      // Si el año cambió, buscar un saldo del nuevo año con el mismo tipo_cuenta y moneda
      if (newYear !== oldYear && saldos.length > 0) {
        const currentTipo = formData.tipo_cuenta || "efectivo";
        const currentMoneda = formData.moneda || "soles";

        // Buscar saldo del nuevo año con misma configuración
        const saldoNuevoAño = saldos.find(
          (s) =>
            s.year_saldo === newYear &&
            s.tipo === currentTipo &&
            s.moneda === currentMoneda,
        );

        if (saldoNuevoAño) {
          console.log(
            ` PagoLoteForm: Año cambiado de ${oldYear} a ${newYear}. Actualizando saldo_id a ${saldoNuevoAño.id}`,
          );
          setFormData((prev) => ({
            ...prev,
            saldo_id: saldoNuevoAño.id,
          }));
        } else {
          // Buscar cualquier saldo del nuevo año
          const saldoAlternativo = saldos.find((s) => s.year_saldo === newYear);

          if (saldoAlternativo) {
            console.log(
              ` PagoLoteForm: Usando saldo alternativo para año ${newYear}: ${saldoAlternativo.id}`,
            );
            setFormData((prev) => ({
              ...prev,
              saldo_id: saldoAlternativo.id,
              tipo_cuenta: saldoAlternativo.tipo,
              moneda: saldoAlternativo.moneda,
            }));
          } else {
            console.warn(
              ` PagoLoteForm: No se encontró saldo para año ${newYear}`,
            );
          }
        }
      }
    }
  };

  const handleFilesAdded = (newFiles) => {
    setEvidencias((prev) => [...prev, ...newFiles]);
    toast.info(
      `${newFiles.length} archivo(s) seleccionado(s). Se subirán al guardar.`,
    );
  };

  const handleRemoveFile = async (index) => {
    const fileToRemove = evidencias[index];

    if (!window.confirm("¿Está seguro de eliminar esta evidencia?")) {
      return;
    }

    if (fileToRemove?.existingId) {
      try {
        const deleteResponse = await vouchersPagosService.deleteEvidencia(
          fileToRemove.existingId,
        );
        if (deleteResponse.success) {
          toast.success("Evidencia eliminada de la base de datos");
        }
      } catch (error) {
        console.error("Error al eliminar evidencia:", error);
        toast.warning(
          "La evidencia se eliminó de la vista pero puede haber un error en BD",
        );
      }
    } else if (fileToRemove?.isPending) {
      setEvidencias((prev) => prev.filter((_, i) => i !== index));
      toast.info("Archivo eliminado");
      return;
    } else if (fileToRemove?.tigris_url) {
      try {
        await deleteFile(fileToRemove.tigris_url);
      } catch (error) {
        console.warn("Error eliminando archivo de Tigris:", error);
      }
    }

    setEvidencias((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidated(true);

    // Validación básica
    if (
      !formData.descripcion ||
      !formData.saldo_id ||
      !formData.monto ||
      !formData.fecha
    ) {
      toast.error("Por favor complete todos los campos requeridos");
      return;
    }

    if (selectedPayments.length === 0) {
      toast.error("No hay pagos seleccionados para liquidar");
      return;
    }

    // Validar tipo de cambio cuando hay conversión dual (fondo soles, pagos USD)
    if (showDualCurrency) {
      if (!formData.tipo_cambio || parseFloat(formData.tipo_cambio) <= 0) {
        toast.error("Debe ingresar un tipo de cambio válido (mayor a 0)");
        return;
      }
      if (!montoSecundario || parseFloat(montoSecundario) <= 0) {
        toast.error("El equivalente en soles debe ser mayor a 0");
        return;
      }
    }

    // El contexto histórico identifica pagos por lote de proveedores.
    const contextoTipo =
      typeof formData.contexto_pago === "object"
        ? formData.contexto_pago?.tipo
        : formData.contexto_pago;

    if (
      contextoTipo === "LiquidacionServicioProveedor" &&
      evidencias.length === 0
    ) {
      toast.error("Adjunte al menos una evidencia para procesar el lote");
      return;
    }

    setLoading(true);

    try {
      // 1. Subir archivos pendientes a Tigris
      const pendingFiles = evidencias.filter(
        (ev) => ev.isPending && ev.fileObject,
      );
      const uploadedFiles = [];
      const failedFiles = [];

      if (pendingFiles.length > 0) {
        toast.info("Subiendo evidencias...");
        for (const pendingFile of pendingFiles) {
          try {
            const uploadResult = await uploadFile(
              pendingFile.fileObject,
              "evidencias-pagos-lote",
            );
            if (uploadResult && uploadResult.tigrisUrl) {
              uploadedFiles.push({
                filename: pendingFile.filename,
                tigris_url: uploadResult.tigrisUrl,
                tigris_path: uploadResult.tigrisUrl,
                file_type: pendingFile.file_type,
                file_size: pendingFile.file_size,
              });
            }
          } catch (error) {
            console.error("Error al subir archivo:", error);
            failedFiles.push(pendingFile.filename);
          }
        }
      }

      // No procesar el lote ni asociar documentos parcialmente. Los
      // archivos fallidos siguen pendientes en el formulario para reintentarse.
      if (failedFiles.length > 0) {
        toast.error(
          `No se subieron ${failedFiles.length} evidencia(s): ${failedFiles.join(", ")}. Corrige el almacenamiento y vuelve a intentarlo.`,
        );
        setLoading(false);
        return;
      }

      if (uploadedFiles.length === 0) {
        toast.error(
          "No se pudieron subir las evidencias. El lote requiere al menos una evidencia.",
        );
        setLoading(false);
        return;
      }

      // 2. Crear evidencias (vouchers_pagos) PRIMERO, SIN movimiento_id
      toast.info("Registrando evidencias del lote...");

      // Preparar array de vouchers_pagos para crear en batch
      const vouchersPagosData = [];

      for (const payment of selectedPayments) {
        // Fetch voucher_venta by code to get referencia_voucher_venta
        let referencia_voucher_venta = null;
        if (payment.voucher_code) {
          try {
            const voucher = await voucherVentaService.getVoucherByCode(
              payment.voucher_code,
            );
            if (voucher) {
              referencia_voucher_venta = voucher.id;
              console.log(
                ` Voucher venta ID encontrado: ${referencia_voucher_venta} para código: ${payment.voucher_code}`,
              );
            }
          } catch (error) {
            console.error(" Error obteniendo voucher venta por código:", error);
          }
        }

        // Crear un voucher_pago por cada evidencia y payment_request
        for (const evidencia of uploadedFiles) {
          vouchersPagosData.push({
            filename: evidencia.filename,
            tigris_url: evidencia.tigris_url,
            tigris_path: evidencia.tigris_path,
            file_type: evidencia.file_type,
            file_size: evidencia.file_size,
            // Se comparten entre los pagos que forman parte del mismo lote.
            movimiento_id: null,
            payment_request_id: payment.id,
            referencia_voucher_reserva: payment.voucher_reserva_id || null,
            referencia_voucher_venta: referencia_voucher_venta,
            voucher_code: payment.voucher_code || null,
          });
        }
      }

      console.log(
        `Creando ${vouchersPagosData.length} evidencias del lote...`,
      );
      const vouchersResponse =
        await vouchersPagosService.createBatch(vouchersPagosData);
      console.log(
        " vouchersResponse completo:",
        JSON.stringify(vouchersResponse, null, 2),
      );

      if (
        !vouchersResponse.success ||
        !vouchersResponse.data?.data?.ids ||
        vouchersResponse.data.data.ids.length === 0
      ) {
        console.error(" Error en respuesta vouchers_pagos:", vouchersResponse);
        toast.error("Error al registrar las evidencias del lote");
        setLoading(false);
        return;
      }

      const voucherIds = vouchersResponse.data.data.ids;
      const primeraEvidenciaId = voucherIds[0];
      console.log(
        ` ${voucherIds.length} evidencias creadas. Primera evidencia ID: ${primeraEvidenciaId}`,
      );
      console.log(" Detalle vouchersResponse:", vouchersResponse);
      console.log(" voucherIds array:", voucherIds);
      console.log(" primeraEvidenciaId:", primeraEvidenciaId);

      // 3. Crear UN movimiento POR CADA payment seleccionado (uno por uno)
      toast.info("Registrando pagos del lote...");

      const servicioTipo =
        inferPaymentServiceType(selectedPayments[0]?.service_data) ||
        "servicio";

      const fechaString =
        formData.fecha instanceof Date
          ? formData.fecha.toISOString().split("T")[0]
          : typeof formData.fecha === "string"
            ? formData.fecha.split("T")[0]
            : formData.fecha;

      const tipoCambio = parseFloat(formData.tipo_cambio) || 0;
      let movimientosCreados = 0;
      let paymentRequestsActualizados = 0;

      for (const payment of selectedPayments) {
        const paymentAmount = parseFloat(payment.amount) || 0;
        const paymentVoucherCode = payment.voucher_code || null;
        const paymentVoucherReservaId = payment.voucher_reserva_id || null;

        // Calcular monto individual para este payment
        const montoIndividual =
          showDualCurrency && tipoCambio > 0
            ? roundToTwoDecimals(paymentAmount * tipoCambio)
            : roundToTwoDecimals(paymentAmount);

        const descripcionPagoLote = `Pago por lote ${servicioTipo} - ${paymentVoucherCode || `VR-${paymentVoucherReservaId}`}`;

        const movimientoData = {
          tipo_movimiento: "egreso",
          tipo_cuenta: formData.tipo_cuenta,
          mes: formData.mes,
          fecha: fechaString,
          monto: montoIndividual,
          moneda: formData.moneda,
          saldo_id: parseInt(formData.saldo_id),
          metodo_pago: formData.metodo_pago || null,
          descripcion: descripcionPagoLote,
          observaciones: formData.observaciones || null,
          referencia_pago: formData.referencia_pago || null,
          pagado_por: formData.pagado_por || null,
          recepcionado_por: formData.recepcionado_por || null,
          contexto_pago: {
            ...formData.contexto_pago,
            payment_request_ids: [payment.id],
            cantidad_pagos: 1,
            facturacion: resolveFacturacionFromServiceData(
              payment.service_data,
            ),
            ...(showDualCurrency && {
              conversion: {
                tipo_cambio: tipoCambio,
                moneda_base: "dolares",
                moneda_fondo: "soles",
                monto_base_usd: roundToTwoDecimals(paymentAmount),
                monto_convertido_soles: montoIndividual,
                saldo_id: parseInt(formData.saldo_id),
              },
            }),
          },
          voucher_code: paymentVoucherCode,
          referencia_voucher_reserva: paymentVoucherReservaId,
          referencia_voucher_venta: null,
          liq_movimiento_id: primeraEvidenciaId,
          platform: currentUser?.platform || "venso",
          business_type: currentUser?.business_type || "B2C",
        };

        try {
          const movimientoResponse =
            await contabilidadService.createMovimiento(movimientoData);

          if (movimientoResponse.success && movimientoResponse.data?.id) {
            movimientosCreados++;
            const movimientoId = movimientoResponse.data.id;

            // Marcar este payment_request como pagado
            try {
              const updateResult = await paymentRequestService.markAsPaid(
                payment.id,
                movimientoId,
              );
              if (updateResult.success) paymentRequestsActualizados++;
            } catch (err) {
              console.error(
                `Error marcando payment_request ${payment.id} como paid:`,
                err,
              );
            }
          }
        } catch (err) {
          console.error(
            `Error creando movimiento para payment ${payment.id}:`,
            err,
          );
        }
      }

      const paidVoucherReservaIds = selectedPayments
        .map((payment) => payment.voucher_reserva_id)
        .filter(Boolean);
      const paidVoucherCodes = selectedPayments
        .map((payment) => payment.voucher_code)
        .filter(Boolean);

      // 4. Emitir evento para refrescar UI
      window.dispatchEvent(
        new CustomEvent("paymentRequestPaid", {
          detail: {
            payment_request_ids: selectedPayments.map((p) => p.id),
            voucher_reserva_ids: paidVoucherReservaIds,
            voucherReservaIds: paidVoucherReservaIds,
            voucher_codes: paidVoucherCodes,
            voucherCodes: paidVoucherCodes,
            voucher_reserva_id:
              paidVoucherReservaIds.length === 1
                ? paidVoucherReservaIds[0]
                : null,
            voucher_code:
              paidVoucherCodes.length === 1 ? paidVoucherCodes[0] : null,
          },
        }),
      );

      toast.success(
        `Lote procesado: ${movimientosCreados} movimiento(s) creado(s), ${paymentRequestsActualizados} pago(s) marcados como pagados`,
      );
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (error) {
      console.error("Error procesando pago por lote:", error);
      toast.error(`Error inesperado: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const modalActions = [
    {
      label: "Cancelar",
      onClick: onClose,
      variant: "secondary",
      icon: <FaTimes />,
    },
    {
      label: "Procesar lote",
      onClick: () =>
        document
          .getElementById("pago-lote-form")
          .dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true }),
          ),
      variant: "success",
      icon: <FaSave />,
      disabled: loading || isUploading,
    },
  ];

  const preventWheelChange = (e) => {
    e.target.blur();
  };

  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Procesar pagos por lote"
      actions={modalActions}
      size="small"
      className="liquidacion-modal pago-lote-modal egreso"
    >
      <form
        id="pago-lote-form"
        className={`liq-compact ${validated ? "validated" : ""}`}
        noValidate
        onSubmit={handleSubmit}
      >
        {/* ===== TABLA COMPACTA: Pagos del lote ===== */}
        {selectedPayments.length > 0 && (
          <div className="liq-payments-table">
            <div className="liq-table-header">
              <span className="liq-th-count">
                {selectedPayments.length} pago(s) en el lote
              </span>
              <span className="liq-th-billing-note">
                Facturación por fila visible
              </span>
              <span className="liq-th-moneda">
                {formData.moneda === "dolares" ? "USD" : "PEN"}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Voucher</th>
                  <th>Facturación</th>
                  <th className="text-right">Monto</th>
                  {showDualCurrency && <th className="text-right">En Soles</th>}
                </tr>
              </thead>
              <tbody>
                {selectedPayments.map((payment, index) => {
                  const amt = parseFloat(payment.amount) || 0;
                  const tc = parseFloat(formData.tipo_cambio) || 0;
                  const facturacion = resolveFacturacionFromServiceData(
                    payment.service_data,
                  );
                  const convertido =
                    showDualCurrency && tc > 0
                      ? roundToTwoDecimals(amt * tc)
                      : null;
                  return (
                    <tr key={payment.id}>
                      <td className="row-num">{index + 1}</td>
                      <td className="row-voucher">
                        <span className="voucher-code">
                          {payment.voucher_code ||
                            `VR-${payment.voucher_reserva_id}`}
                        </span>
                      </td>
                      <td className="row-billing">
                        <span className={`billing-badge ${facturacion}`}>
                          {facturacion === "exportacion"
                            ? "Exportación"
                            : "Intangible"}
                        </span>
                      </td>
                      <td className="text-right row-amount">
                        {formatCurrency(amt, "dolares")}
                      </td>
                      {showDualCurrency && (
                        <td className="text-right row-converted">
                          {convertido !== null
                            ? formatCurrency(convertido, "soles")
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== DESCRIPCIÓN + FONDO ===== */}
        <div className="liq-fields-grid">
          <div className="liq-field">
            <label>
              Descripción <span className="req">*</span>
            </label>
            <input
              type="text"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              required
              placeholder="Descripción del pago por lote"
              className={validated && !formData.descripcion ? "invalid" : ""}
            />
          </div>

          <div className="liq-field">
            <label>
              Fondo / Tipo de Cuenta <span className="req">*</span>
            </label>
            <FundoSelector
              saldos={saldos}
              selectedId={formData.saldo_id}
              onChange={handleInputChange}
              validated={validated}
            />
          </div>

          {/* Monto cuando fondo está en DÓLARES (misma moneda que pagos) */}
          {!showDualCurrency && (
            <div className="liq-field">
              <label>Monto Total (USD)</label>
              <input
                type="number"
                name="monto"
                value={formData.monto}
                readOnly
                className="readonly-field"
                onWheel={preventWheelChange}
                onKeyDown={preventArrowChange}
              />
            </div>
          )}

          {/* Cuando fondo está en SOLES y pagos en DÓLARES → campos de conversión */}
          {showDualCurrency && (
            <>
              <div className="liq-field">
                <label>
                  Monto USD <span className="calculated-badge">automático</span>
                </label>
                <input
                  type="number"
                  name="monto"
                  value={formData.monto}
                  readOnly
                  className="readonly-field"
                  onWheel={preventWheelChange}
                  onKeyDown={preventArrowChange}
                />
              </div>

              <div className="liq-field">
                <label>
                  Tipo de Cambio <span className="req">*</span>
                </label>
                <input
                  type="number"
                  name="tipo_cambio"
                  value={formData.tipo_cambio}
                  onChange={handleTipoCambioChange}
                  required
                  min="0.01"
                  step="0.0001"
                  placeholder="Ej: 3.75"
                  className={
                    validated && !formData.tipo_cambio ? "invalid" : ""
                  }
                  onWheel={preventWheelChange}
                  onKeyDown={preventArrowChange}
                />
              </div>

              <div className="liq-field">
                <label>
                  Equivalente en Soles{" "}
                  <span className="calculated-badge">calculado</span>
                </label>
                <input
                  type="number"
                  name="monto_soles"
                  value={montoSecundario}
                  readOnly
                  placeholder="Se calcula automáticamente"
                  onWheel={preventWheelChange}
                  onKeyDown={preventArrowChange}
                />
                <small className="liq-hint">
                  {formData.monto && formData.tipo_cambio
                    ? `${formatCurrency(parseFloat(formData.monto), "dolares")} × ${formData.tipo_cambio} = ${montoSecundario ? formatCurrency(parseFloat(montoSecundario), "soles") : "..."}`
                    : "Ingrese el tipo de cambio para calcular"}
                </small>
              </div>
            </>
          )}

          <div className="liq-field-row liq-field-row--single">
            <div className="liq-field">
              <label>
                Fecha <span className="req">*</span>
              </label>
              <DatePicker
                selected={formData.fecha}
                onChange={handleFechaChange}
                dateFormat="dd/MM/yyyy"
                locale={es}
                className={
                  validated && !formData.fecha
                    ? "invalid custom-datepicker"
                    : "custom-datepicker"
                }
                placeholderText="dd/mm/aaaa"
                required
              />
            </div>
          </div>
        </div>

        {/* ===== EVIDENCIAS ===== */}
        <div className="liq-evidencias">
          <div className="liq-ev-header">
            <span>Evidencias</span>
            {(() => {
              const ctx =
                typeof formData.contexto_pago === "object"
                  ? formData.contexto_pago?.tipo
                  : formData.contexto_pago;
              return ctx === "LiquidacionServicioProveedor" ? (
                <span className="ev-required">*Obligatorio</span>
              ) : (
                <span className="ev-optional">Opcional</span>
              );
            })()}
          </div>
          <FileDropZone
            files={evidencias}
            onFilesAdded={handleFilesAdded}
            onFileRemove={handleRemoveFile}
            disabled={isUploading}
            isUploading={isUploading}
            inputId="archivo_evidencia"
          />
        </div>
      </form>
    </Modal>
  );
};

export default PagoLoteForm;
