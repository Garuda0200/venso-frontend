import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  MdClose,
  MdAttachFile,
  MdPictureAsPdf,
  MdImage,
  MdCategory,
  MdCloudUpload,
  MdInfo,
  MdAccountBalance,
  MdAttachMoney,
  MdCalendarToday,
  MdSwapHoriz,
} from "react-icons/md";
import contabilidadService from "../../services/contabilidadService";
import vouchersPagosService from "../../services/vouchersPagosService";
import Modal from "../UI/Modal/Modal";
import { FaSave, FaTimes } from "react-icons/fa";
import ServiceDetailedInfo from "../Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/ServiceDetailedInfo/ServiceDetailedInfo";
import { useFileUpload } from "../../hooks/useFileUpload";
import { useAuth } from "../../context/AuthContext";
import { paymentRequestService } from "../../services/paymentRequestService";
import SmartPaymentContextSelect from "../common/SmartPaymentContextSelect/SmartPaymentContextSelect";
import exchangeRateService from "../../services/exchangeRateService";
import {
  getGroupedPaymentContexts,
  getExistingPaymentContexts,
} from "../../utils/paymentContexts";
import { DEFAULT_USD_TO_PEN_RATE } from "../../utils/constants";
import { getProxyUrl } from "../../services/presignedUrlService";
import { invalidateVoucherReservaById } from "../../utils/cacheInvalidation";
import {
  inferPaymentServiceType,
  normalizeFacturacionValue,
  normalizePaymentServiceData,
  resolveFacturacionFromServiceData,
} from "../../utils/paymentFacturacion";
// Importar componentes compartidos refactorizados
import {
  FormSection,
  FormField,
  AccountSelector,
  FundoSelector,
  PaymentServiceComparison,
} from "./shared";
import FileDropZone from "../common/FileDropZone/FileDropZone";
import {
  canRemoveMovementEvidence,
  getPendingMovementEvidences,
  getPersistedMovementEvidenceId,
} from "./utils/movementMediaPermissions";
import "./MovimientoForm.scss";
const MovimientoForm = ({
  tipo,
  onSuccess,
  isOpen,
  onClose,
  initialData = null, // ← Datos iniciales para pre-cargar el formulario
  mode = "create", // ← 'create' o 'edit'
  mediaOnly = false, // Edición restringida a evidencias ya asociadas al movimiento
  monedaBase = null, // ← 'dolares' o 'soles' - moneda del documento asociado (para calcular tipo de cambio)
}) => {
  const tipoMovimiento = tipo.toLowerCase(); // 'ingreso' o 'egreso'
  const [saldos, setSaldos] = useState([]);
  const [movimientos, setMovimientos] = useState([]); // Para métodos de pago existentes
  const [loading, setLoading] = useState(false);
  const {
    uploadFile,
    uploadMultipleFiles,
    deleteFile,
    isUploading,
    uploadProgress,
    uploadError,
  } = useFileUpload();
  const { getCurrentUser } = useAuth();
  const currentUser = getCurrentUser();
  const dniuser = currentUser?.dniuser;
  const currentUserRole = Number(currentUser?.role);
  const isSuperAdmin = currentUserRole === 0;
  const [validated, setValidated] = useState(false);
  const isEditMode = mode === "edit";
  const isMediaOnlyEdit = isEditMode && mediaOnly;
  const [evidencias, setEvidencias] = useState([]); // Array temporal de evidencias subidas
  // Estado para monto secundario (usado cuando hay conversión de monedas)
  const [montoSecundario, setMontoSecundario] = useState("");
  const [autoExchangeRate, setAutoExchangeRate] = useState(
    DEFAULT_USD_TO_PEN_RATE,
  );
  const [paymentRequestPreview, setPaymentRequestPreview] = useState({
    serviceData: null,
    itinerarioServicioId: null,
  });
  const [formData, setFormData] = useState({
    descripcion: "",
    tipo_cuenta: "efectivo",
    tipo_movimiento: tipoMovimiento,
    mes: new Date().getMonth() + 1,
    fecha: new Date(),
    monto: "", // ← Siempre en DÓLARES (moneda base del sistema)
    moneda: "soles",
    saldo_id: "",
    contexto_pago: null,
    referencia_voucher: "",
    referencia_voucher_venta: "",
    referencia_voucher_reserva: "",
    voucher_code: "",
    metodo_pago: "",
    referencia_pago: "",
    pagado_por: "",
    recepcionado_por: "",
    tipo_cambio: "", // ← Tipo de cambio (Soles por 1 USD)
    platform: "",
    business_type: "",
    datos_extra: {},
  });

  // Calcular si tiene referencias a vouchers para validaciones
  const hasVoucherReferences = useMemo(() => {
    return (
      formData.voucher_code ||
      formData.referencia_voucher_venta ||
      formData.referencia_voucher_reserva
    );
  }, [
    formData.voucher_code,
    formData.referencia_voucher_venta,
    formData.referencia_voucher_reserva,
  ]);

  // Helper para redondear a 2 decimales (evitar problemas de precisión de punto flotante)
  const roundToTwoDecimals = (num) => {
    return Math.round(parseFloat(num) * 100) / 100;
  };

  const parsePositiveNumber = (value) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const resolveUsdToPenRate = (payload) => {
    const candidates = [
      payload?.rates?.USD,
      payload?.USD,
      payload?.usd,
      payload?.usd_to_pen,
      payload?.usd_to_pen_rate,
      DEFAULT_USD_TO_PEN_RATE,
    ];

    const found = candidates
      .map((value) => parseFloat(value))
      .find((value) => Number.isFinite(value) && value > 0);

    return found || DEFAULT_USD_TO_PEN_RATE;
  };

  const normalizeDualCurrencyAmounts = ({
    usdValue,
    solesValue,
    exchangeRateValue,
    preserve,
  }) => {
    // Si el valor que se está cambiando está vacío, limpiar ambos campos
    if (preserve === "usd" && (usdValue === "" || usdValue === null)) {
      return { montoUsd: "", montoSoles: "" };
    }
    if (preserve === "soles" && (solesValue === "" || solesValue === null)) {
      return { montoUsd: "", montoSoles: "" };
    }

    const tc = parsePositiveNumber(exchangeRateValue);
    const usd = parsePositiveNumber(usdValue);
    const soles = parsePositiveNumber(solesValue);

    if (!tc) {
      return {
        montoUsd: usdValue || "",
        montoSoles: solesValue || "",
      };
    }

    if (preserve === "usd" && usd !== null) {
      return {
        montoUsd: usdValue,
        montoSoles: roundToTwoDecimals(usd * tc).toString(),
      };
    }

    if (preserve === "soles" && soles !== null) {
      return {
        montoUsd: roundToTwoDecimals(soles / tc).toString(),
        montoSoles: solesValue,
      };
    }

    if (usd !== null) {
      return {
        montoUsd: usdValue,
        montoSoles: roundToTwoDecimals(usd * tc).toString(),
      };
    }

    if (soles !== null) {
      return {
        montoUsd: roundToTwoDecimals(soles / tc).toString(),
        montoSoles: solesValue,
      };
    }

    return {
      montoUsd: usdValue || "",
      montoSoles: solesValue || "",
    };
  };

  const sanitizeContextoPagoForPersist = (contextoPago) => {
    if (!contextoPago || typeof contextoPago !== "object") {
      return contextoPago;
    }

    const {
      service_data,
      itinerario_servicio_id,
      servicio_asignado,
      ...sanitizedContextoPago
    } = contextoPago;

    return sanitizedContextoPago;
  };

  const buildContextoPagoPayload = ({
    contextoPago,
    exchangeRate,
    montoBaseUsd,
    montoConvertidoSoles,
    saldoId,
    monedaFondo,
  }) => {
    const contextoPagoBase =
      typeof contextoPago === "object" && contextoPago !== null
        ? sanitizeContextoPagoForPersist({ ...contextoPago })
        : contextoPago
          ? { tipo: contextoPago }
          : {};

    const hasBaseContext = Object.keys(contextoPagoBase).length > 0;
    const hasConversion =
      Number.isFinite(exchangeRate) &&
      exchangeRate > 0 &&
      Number.isFinite(montoBaseUsd) &&
      montoBaseUsd > 0;

    if (!hasBaseContext && !hasConversion) {
      return null;
    }

    return {
      ...contextoPagoBase,
      ...(contextoPagoBase.payment_request_id
        ? {
            referencia_payment_request: contextoPagoBase.payment_request_id,
          }
        : {}),
      ...(hasConversion
        ? {
            conversion: {
              ...(Number.isInteger(saldoId) ? { saldo_id: saldoId } : {}),
              moneda_base: "dolares",
              tipo_cambio: exchangeRate,
              moneda_fondo: monedaFondo || "dolares",
              monto_base_usd: montoBaseUsd,
              monto_convertido_soles:
                Number.isFinite(montoConvertidoSoles) &&
                montoConvertidoSoles > 0
                  ? montoConvertidoSoles
                  : roundToTwoDecimals(montoBaseUsd * exchangeRate),
            },
          }
        : {}),
    };
  };

  // Helper para obtener el tipo de contexto_pago (puede ser string u objeto)
  const getContextoPagoTipo = useMemo(() => {
    if (!formData.contexto_pago) return null;
    return typeof formData.contexto_pago === "object"
      ? formData.contexto_pago.tipo
      : formData.contexto_pago;
  }, [formData.contexto_pago]);

  const hasPaymentRequestAssociation = useMemo(() => {
    if (!formData.contexto_pago || typeof formData.contexto_pago !== "object") {
      return false;
    }

    return Boolean(
      formData.contexto_pago.payment_request_id ||
        (Array.isArray(formData.contexto_pago.payment_request_ids) &&
          formData.contexto_pago.payment_request_ids.length > 0),
    );
  }, [formData.contexto_pago]);

  const facturacionActual = useMemo(() => {
    if (
      !hasPaymentRequestAssociation ||
      typeof formData.contexto_pago !== "object"
    ) {
      return "";
    }

    return normalizeFacturacionValue(formData.contexto_pago.facturacion);
  }, [formData.contexto_pago, hasPaymentRequestAssociation]);

  const paymentRequestServiceData = useMemo(() => {
    if (!hasPaymentRequestAssociation) {
      return null;
    }

    return normalizePaymentServiceData(
      paymentRequestPreview.serviceData ||
        initialData?.payment_request_service_data ||
        (typeof formData.contexto_pago === "object"
          ? formData.contexto_pago.service_data
          : null),
    );
  }, [
    formData.contexto_pago,
    hasPaymentRequestAssociation,
    initialData?.payment_request_service_data,
    paymentRequestPreview.serviceData,
  ]);

  const paymentRequestServiceType = useMemo(() => {
    if (!hasPaymentRequestAssociation || !paymentRequestServiceData) {
      return "";
    }

    return inferPaymentServiceType(paymentRequestServiceData) || "";
  }, [hasPaymentRequestAssociation, paymentRequestServiceData]);

  // Calcular si se necesita mostrar campos de conversión dual
  // Se muestra cuando: el fondo está en SOLES (moneda !== 'dolares')
  // En este caso, monto es en DÓLARES y montoSecundario en SOLES
  const showDualCurrency = useMemo(() => {
    // Siempre mostrar dual cuando el fondo seleccionado es en SOLES
    const monedaFondo = formData.moneda?.toLowerCase() || "soles";
    return monedaFondo === "soles";
  }, [formData.moneda]);

  // Calcular el monto convertido (para compatibilidad con lógica existente)
  // El tipo de cambio siempre es "Soles por 1 USD"
  const montoConvertido = useMemo(() => {
    if (!showDualCurrency || !formData.monto || !formData.tipo_cambio)
      return null;
    const monto = parseFloat(formData.monto);
    const tc = parseFloat(formData.tipo_cambio);
    if (isNaN(monto) || isNaN(tc) || tc <= 0) return null;

    // Convertir USD a Soles: monto_usd * tipo_cambio
    return roundToTwoDecimals(monto * tc);
  }, [showDualCurrency, formData.monto, formData.tipo_cambio]);

  // Filtrar saldos por año de la fecha del movimiento y plataforma
  const saldosFiltrados = useMemo(() => {
    const yearMovimiento =
      formData.fecha instanceof Date
        ? formData.fecha.getFullYear()
        : new Date().getFullYear();
    const platformMovimiento =
      formData.platform ||
      initialData?.platform ||
      initialData?.contexto_pago?.platform ||
      currentUser?.platform ||
      "venso";

    // Si platform es 'all', no filtrar por plataforma (admin puede ver todas)
    const shouldFilterByPlatform =
      platformMovimiento && platformMovimiento !== "all";

    // Filtrar por año (y opcionalmente por plataforma)
    const filtered = saldos.filter((s) => {
      const yearMatch = s.year_saldo === yearMovimiento;
      const platformMatch =
        !shouldFilterByPlatform || s.platform === platformMovimiento;
      return yearMatch && platformMatch;
    });

    // Si no hay saldos para este año/plataforma, devolver todos para evitar formulario vacío
    return filtered.length > 0 ? filtered : saldos;
  }, [saldos, formData.fecha, formData.platform, initialData, currentUser]);

  // Mantener showTipoCambio para compatibilidad con código existente
  const showTipoCambio = showDualCurrency;

  // Cargar saldos disponibles al iniciar
  useEffect(() => {
    if (isOpen) {
      loadSaldos();
      loadMovimientos(); // Cargar movimientos para métodos de pago
    }
  }, [isOpen]);

  const loadSaldos = async () => {
    try {
      const response = await contabilidadService.getSaldos();
      if (response.success) {
        const allSaldos = response.data || [];
        setSaldos(allSaldos);

        // DEBUG: Log de todos los saldos recibidos
        console.log(
          " Saldos recibidos del backend:",
          allSaldos.map((s) => ({
            id: s.id,
            tipo: s.tipo,
            moneda: s.moneda,
            year_saldo: s.year_saldo,
            platform: s.platform,
          })),
        );

        // Si hay saldos, seleccionamos uno por defecto basado en fecha y plataforma
        if (allSaldos.length > 0) {
          // Determinar año de la fecha del movimiento
          const fechaMovimiento = initialData?.fecha
            ? new Date(initialData.fecha)
            : new Date();
          const yearMovimiento = fechaMovimiento.getFullYear();

          // DEBUG: Log de la fecha y año
          console.log(" DEBUG fecha:", {
            initialDataFecha: initialData?.fecha,
            fechaMovimiento: fechaMovimiento.toISOString(),
            yearMovimiento,
            typeof_yearMovimiento: typeof yearMovimiento,
          });

          // Determinar plataforma del movimiento
          const platformMovimiento =
            initialData?.platform ||
            initialData?.contexto_pago?.platform ||
            currentUser?.platform ||
            "venso";

          // Si platform es 'all', no filtrar por plataforma (usar 'venso' como default para admins)
          const shouldFilterByPlatform =
            platformMovimiento && platformMovimiento !== "all";
          const defaultPlatformForAdmin = "venso"; // Plataforma por defecto para usuarios con platform='all'

          // Si hay monedaBase (ej: 'dolares' para vouchers de venta), buscar saldo en esa moneda primero
          const monedaPreferida = monedaBase?.toLowerCase() || "dolares";

          console.log(
            ` Buscando saldo para año=${yearMovimiento}, platform=${platformMovimiento}, moneda=${monedaPreferida}, filterByPlatform=${shouldFilterByPlatform}`,
          );

          // DEBUG: Log de saldos del año correcto
          const saldosDelAño = allSaldos.filter(
            (s) => s.year_saldo === yearMovimiento,
          );
          console.log(
            ` Saldos del año ${yearMovimiento}:`,
            saldosDelAño.length,
            saldosDelAño,
          );

          // Helper para verificar plataforma (con soporte para 'all')
          const platformMatches = (s) =>
            !shouldFilterByPlatform ||
            s.platform === platformMovimiento ||
            s.platform === defaultPlatformForAdmin;

          // Buscar saldo de efectivo del año correcto, plataforma y moneda preferida
          const saldoPreferido = allSaldos.find(
            (s) =>
              s.tipo === "efectivo" &&
              s.moneda?.toLowerCase() === monedaPreferida &&
              s.year_saldo === yearMovimiento &&
              platformMatches(s),
          );

          console.log(" saldoPreferido:", saldoPreferido);

          // Fallback 1: Mismo año y plataforma, cualquier tipo de cuenta efectivo
          const saldoFallback1 = !saldoPreferido
            ? allSaldos.find(
                (s) =>
                  s.tipo === "efectivo" &&
                  s.year_saldo === yearMovimiento &&
                  platformMatches(s),
              )
            : null;

          // Fallback 2: Mismo año y plataforma, cualquier tipo
          const saldoFallback2 =
            !saldoPreferido && !saldoFallback1
              ? allSaldos.find(
                  (s) => s.year_saldo === yearMovimiento && platformMatches(s),
                )
              : null;

          // Fallback 3: Buscar en el mismo año sin importar plataforma
          const saldoFallback3 =
            !saldoPreferido && !saldoFallback1 && !saldoFallback2
              ? allSaldos.find(
                  (s) =>
                    s.tipo === "efectivo" && s.year_saldo === yearMovimiento,
                )
              : null;

          // Fallback 4: Si no hay saldo para el año de la fecha, mostrar mensaje y usar el primero disponible
          const saldoDefault =
            saldoPreferido ||
            saldoFallback1 ||
            saldoFallback2 ||
            saldoFallback3;

          if (!saldoDefault) {
            console.warn(
              ` No se encontró saldo para año=${yearMovimiento}. Disponibles:`,
              [...new Set(allSaldos.map((s) => s.year_saldo))].sort(),
            );
            // Crear saldo automáticamente o usar uno existente del año más cercano
            const saldosDelAnoActual = allSaldos.filter(
              (s) => s.year_saldo === yearMovimiento,
            );
            if (saldosDelAnoActual.length === 0) {
              // Usar el saldo del año más cercano al actual
              const añosDisponibles = [
                ...new Set(allSaldos.map((s) => s.year_saldo)),
              ].sort(
                (a, b) =>
                  Math.abs(a - yearMovimiento) - Math.abs(b - yearMovimiento),
              );
              const añoMasCercano = añosDisponibles[0];
              const saldoMasCercano =
                allSaldos.find(
                  (s) =>
                    s.tipo === "efectivo" &&
                    s.year_saldo === añoMasCercano &&
                    platformMatches(s),
                ) || allSaldos.find((s) => s.year_saldo === añoMasCercano);

              if (saldoMasCercano) {
                console.log(
                  ` Usando saldo del año ${saldoMasCercano.year_saldo} como fallback`,
                );
                setFormData((prev) => ({
                  ...prev,
                  saldo_id: saldoMasCercano.id,
                  tipo_cuenta: saldoMasCercano.tipo,
                  moneda: saldoMasCercano.moneda,
                }));
              }
            }
          }

          if (saldoDefault) {
            console.log(
              ` Saldo seleccionado: id=${saldoDefault.id}, year=${saldoDefault.year_saldo}, platform=${saldoDefault.platform}`,
            );
            setFormData((prev) => ({
              ...prev,
              saldo_id: saldoDefault.id,
              tipo_cuenta: saldoDefault.tipo,
              moneda: saldoDefault.moneda,
            }));
          }
        }
      } else {
        toast.error("Error al cargar saldos");
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  // Cargar movimientos para obtener métodos de pago existentes
  const loadMovimientos = async () => {
    try {
      const response = await contabilidadService.getMovimientos({
        tipo: tipoMovimiento,
      });
      if (response.success) {
        setMovimientos(response.data || []);
      }
    } catch (error) {
      console.error("Error cargando movimientos:", error);
    }
  };

  // Resetear formulario cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      // Si hay initialData, usarlo; sino, valores por defecto
      if (initialData) {
        console.log(" MovimientoForm: Cargando datos iniciales", initialData);

        // Extraer contexto_pago del objeto JSONB si existe
        const contextoPagoValue =
          typeof initialData.contexto_pago === "object"
            ? initialData.contexto_pago?.tipo || ""
            : initialData.contexto_pago || "";

        // Asegurar que siempre haya fecha y mes válidos
        const fechaValue = initialData.fecha
          ? new Date(initialData.fecha)
          : new Date();
        const mesValue = initialData.mes || fechaValue.getMonth() + 1;

        // Truncar monto a 2 decimales incluso si viene del DB con más
        const initialConversion = initialData.contexto_pago?.conversion || {};
        const initialExchangeRate =
          initialData.tipo_cambio ||
          initialConversion.tipo_cambio ||
          initialData.contexto_pago?.tipo_cambio ||
          "";
        const montoValue = initialData.monto
          ? parseFloat(parseFloat(initialData.monto).toFixed(2))
          : "";
        const montoUsdValue = initialConversion.monto_base_usd
          ? parseFloat(parseFloat(initialConversion.monto_base_usd).toFixed(2))
          : montoValue;
        const montoSolesValue = initialConversion.monto_convertido_soles
          ? parseFloat(
              parseFloat(initialConversion.monto_convertido_soles).toFixed(2),
            )
          : initialData.moneda === "soles"
            ? montoValue
            : initialExchangeRate && montoUsdValue
              ? roundToTwoDecimals(
                  parseFloat(montoUsdValue) * parseFloat(initialExchangeRate),
                )
              : "";

        setFormData({
          descripcion: initialData.descripcion || "",
          tipo_cuenta: initialData.tipo_cuenta || "efectivo",
          tipo_movimiento: tipoMovimiento,
          mes: mesValue,
          fecha: fechaValue,
          monto: montoUsdValue,
          moneda: initialData.moneda || "soles",
          saldo_id: initialData.saldo_id || "",
          contexto_pago: initialData.contexto_pago || null,
          referencia_voucher: initialData.referencia_voucher || "",
          referencia_voucher_venta: initialData.referencia_voucher_venta || "",
          referencia_voucher_reserva:
            initialData.referencia_voucher_reserva || "",
          voucher_code:
            initialData.voucher_code || initialData.file_nombre || "",
          metodo_pago: initialData.metodo_pago || "",
          referencia_pago: initialData.referencia_pago || "",
          pagado_por: initialData.pagado_por || "",
          recepcionado_por: initialData.recepcionado_por || "",
          // Platform y business_type - pueden venir de payment_request o contexto_pago
          platform:
            initialData.platform || initialData.contexto_pago?.platform || "",
          business_type:
            initialData.business_type ||
            initialData.contexto_pago?.business_type ||
            "",
          tipo_cambio: initialExchangeRate ? String(initialExchangeRate) : "",
          datos_extra: initialData.datos_extra || {},
        });
        setPaymentRequestPreview({
          serviceData: normalizePaymentServiceData(
            initialData.payment_request_service_data ||
              (typeof initialData.contexto_pago === "object"
                ? initialData.contexto_pago.service_data
                : null),
          ),
          itinerarioServicioId:
            initialData.payment_request_itinerario_servicio_id ||
            initialData.contexto_pago?.itinerario_servicio_id ||
            null,
        });
        setMontoSecundario(
          montoSolesValue !== "" && montoSolesValue !== null
            ? String(montoSolesValue)
            : "",
        );

        console.log(" Contexto de pago cargado:", contextoPagoValue);
        console.log(" Mes calculado:", mesValue);

        // Cargar evidencias existentes desde vouchers_pagos en modo edición
        if (isEditMode && initialData.id) {
          loadExistingEvidencias(initialData.id);
        }
      } else {
        setPaymentRequestPreview({
          serviceData: null,
          itinerarioServicioId: null,
        });
        setFormData({
          descripcion: "",
          tipo_cuenta: "efectivo",
          tipo_movimiento: tipoMovimiento,
          mes: new Date().getMonth() + 1,
          fecha: new Date(),
          monto: "",
          moneda: "soles",
          saldo_id: "",
          contexto_pago: null,
          referencia_voucher: "",
          referencia_voucher_venta: "", //
          referencia_voucher_reserva: "", //
          voucher_code: "", // RENAMED from file_nombre
          metodo_pago: "", //
          referencia_pago: "", //
          pagado_por: "", //
          recepcionado_por: "", //
          platform: "", // Platform se selecciona si no hay referencia
          business_type: "", // Business type derivado de platform
          tipo_cambio: "",
        });
        setMontoSecundario("");
      }
      setValidated(false);
    }
  }, [tipoMovimiento, isOpen, initialData]);

  useEffect(() => {
    let active = true;

    const loadDefaultExchangeRate = async () => {
      if (!isOpen || parsePositiveNumber(formData.tipo_cambio)) {
        return;
      }

      const platformToUse =
        formData.platform ||
        initialData?.platform ||
        initialData?.contexto_pago?.platform ||
        currentUser?.platform ||
        "venso";

      try {
        const response =
          await exchangeRateService.getExchangeRates(platformToUse);
        const nextRate = resolveUsdToPenRate(response?.data);

        if (!active) return;

        setAutoExchangeRate(nextRate);
        setFormData((prev) => ({
          ...prev,
          tipo_cambio: prev.tipo_cambio || String(nextRate),
        }));
      } catch (error) {
        if (!active) return;

        setAutoExchangeRate(DEFAULT_USD_TO_PEN_RATE);
        setFormData((prev) => ({
          ...prev,
          tipo_cambio: prev.tipo_cambio || String(DEFAULT_USD_TO_PEN_RATE),
        }));
      }
    };

    loadDefaultExchangeRate();

    return () => {
      active = false;
    };
  }, [
    currentUser?.platform,
    formData.platform,
    formData.tipo_cambio,
    initialData?.contexto_pago?.platform,
    initialData?.platform,
    isOpen,
  ]);

  // Resetear evidencias cuando cambia el payment_request_id
  useEffect(() => {
    const paymentRequestId =
      typeof initialData?.contexto_pago === "object"
        ? initialData.contexto_pago.payment_request_id
        : null;

    if (paymentRequestId && isOpen) {
      console.log(
        " Resetting evidencias for new payment_request:",
        paymentRequestId,
      );
      setEvidencias([]);
    }
  }, [initialData?.contexto_pago?.payment_request_id, isOpen]);

  useEffect(() => {
    let active = true;

    const paymentRequestId =
      formData.contexto_pago && typeof formData.contexto_pago === "object"
        ? formData.contexto_pago.payment_request_id
        : null;

    if (!isOpen || !paymentRequestId) {
      return () => {
        active = false;
      };
    }

    const hydratePaymentRequestContext = async () => {
      const result =
        await paymentRequestService.getPendingEnrichedById(paymentRequestId);

      if (
        !active ||
        !result.success ||
        (!result.data?.service_data && !result.data?.itinerario_servicio_id)
      ) {
        return;
      }

      const normalizedServiceData = normalizePaymentServiceData(
        result.data.service_data,
      );
      setPaymentRequestPreview((prev) => {
        const currentType = inferPaymentServiceType(prev.serviceData);
        const nextType = inferPaymentServiceType(normalizedServiceData);
        const nextItinerarioServicioId =
          result.data.itinerario_servicio_id || prev.itinerarioServicioId;

        if (
          currentType === nextType &&
          prev.itinerarioServicioId === nextItinerarioServicioId
        ) {
          return prev;
        }

        return {
          serviceData: normalizedServiceData,
          itinerarioServicioId: nextItinerarioServicioId || null,
        };
      });
    };

    hydratePaymentRequestContext();

    return () => {
      active = false;
    };
  }, [formData.contexto_pago, isOpen]);

  useEffect(() => {
    if (!isOpen || !hasPaymentRequestAssociation) {
      return;
    }

    if (!formData.contexto_pago || typeof formData.contexto_pago !== "object") {
      return;
    }

    const normalizedCurrent = normalizeFacturacionValue(
      formData.contexto_pago.facturacion,
    );
    const inferredFacturacion = resolveFacturacionFromServiceData(
      paymentRequestServiceData,
    );
    const nextFacturacion = normalizedCurrent || inferredFacturacion;

    if (!nextFacturacion || normalizedCurrent === nextFacturacion) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      contexto_pago:
        prev.contexto_pago && typeof prev.contexto_pago === "object"
          ? {
              ...prev.contexto_pago,
              facturacion: nextFacturacion,
            }
          : prev.contexto_pago,
    }));
  }, [
    formData.contexto_pago,
    hasPaymentRequestAssociation,
    isOpen,
    paymentRequestServiceData,
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Manejo especial para contexto_pago: preservar payment_request_id si existe
    if (name === "contexto_pago") {
      const existingContextoPago =
        formData.contexto_pago && typeof formData.contexto_pago === "object"
          ? formData.contexto_pago
          : null;

      const newContextoPago = existingContextoPago
        ? { ...existingContextoPago, tipo: value }
        : value;

      setFormData({ ...formData, contexto_pago: newContextoPago });
      return;
    }

    // Truncar montos a máximo 2 decimales al escribir
    if (name === "monto") {
      // Permitir escritura libre pero restringir a 2 decimales
      const parts = value.split(".");
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
        const currentPlatform = formData.platform || "venso";
        const currentTipo = formData.tipo_cuenta || "efectivo";
        const currentMoneda = formData.moneda || "soles";

        // Si platform es 'all', buscar sin filtrar por plataforma
        const shouldFilterByPlatform =
          currentPlatform && currentPlatform !== "all";

        // Helper para verificar plataforma
        const platformMatches = (s) =>
          !shouldFilterByPlatform ||
          s.platform === currentPlatform ||
          s.platform === "venso";

        // Buscar saldo del nuevo año con misma configuración
        const saldoNuevoAño = saldos.find(
          (s) =>
            s.year_saldo === newYear &&
            platformMatches(s) &&
            s.tipo === currentTipo &&
            s.moneda === currentMoneda,
        );

        if (saldoNuevoAño) {
          console.log(
            ` Año cambiado de ${oldYear} a ${newYear}. Actualizando saldo_id a ${saldoNuevoAño.id}`,
          );
          setFormData((prev) => ({
            ...prev,
            saldo_id: saldoNuevoAño.id,
          }));
        } else {
          // Buscar cualquier saldo del nuevo año con la misma plataforma
          const saldoAlternativo = saldos.find(
            (s) => s.year_saldo === newYear && platformMatches(s),
          );

          if (saldoAlternativo) {
            console.log(
              ` Usando saldo alternativo para año ${newYear}: ${saldoAlternativo.id}`,
            );
            setFormData((prev) => ({
              ...prev,
              saldo_id: saldoAlternativo.id,
              tipo_cuenta: saldoAlternativo.tipo,
              moneda: saldoAlternativo.moneda,
            }));
          } else {
            // Último recurso: buscar cualquier saldo del año sin importar plataforma
            const saldoUltimoRecurso = saldos.find(
              (s) => s.year_saldo === newYear,
            );
            if (saldoUltimoRecurso) {
              console.log(
                ` Usando saldo sin filtro de plataforma para año ${newYear}: ${saldoUltimoRecurso.id}`,
              );
              setFormData((prev) => ({
                ...prev,
                saldo_id: saldoUltimoRecurso.id,
                tipo_cuenta: saldoUltimoRecurso.tipo,
                moneda: saldoUltimoRecurso.moneda,
              }));
            } else {
              console.warn(` No se encontró saldo para año ${newYear}`);
              toast.warning(
                `No hay saldos configurados para ${newYear}. Usa el botón "Inicializar" en Caja.`,
              );
            }
          }
        }
      }
    }
  };

  // ============================================================================
  // CONVERSIÓN DE MONEDAS REACTIVA (USD Soles)
  // ============================================================================

  // Cuando cambia el monto en USD → calcular Soles automáticamente
  const handleMontoUSDChange = (e) => {
    const montoUSD = e.target.value;
    const normalized = normalizeDualCurrencyAmounts({
      usdValue: montoUSD,
      solesValue: montoSecundario,
      exchangeRateValue: formData.tipo_cambio,
      preserve: "usd",
    });

    setFormData((prev) => ({ ...prev, monto: normalized.montoUsd }));
    setMontoSecundario(normalized.montoSoles);
  };

  // Cuando cambia el monto en Soles → calcular USD automáticamente
  const handleMontoSolesChange = (e) => {
    const montoSoles = e.target.value;
    const normalized = normalizeDualCurrencyAmounts({
      usdValue: formData.monto,
      solesValue: montoSoles,
      exchangeRateValue: formData.tipo_cambio,
      preserve: "soles",
    });

    setMontoSecundario(normalized.montoSoles);
    setFormData((prev) => ({ ...prev, monto: normalized.montoUsd }));
  };

  // Cuando cambia el tipo de cambio → recalcular Soles basado en USD
  const handleTipoCambioChange = (e) => {
    const nuevoTC = e.target.value;
    const preserve = formData.monto ? "usd" : "soles";
    const normalized = normalizeDualCurrencyAmounts({
      usdValue: formData.monto,
      solesValue: montoSecundario,
      exchangeRateValue: nuevoTC,
      preserve,
    });

    setFormData((prev) => ({
      ...prev,
      tipo_cambio: nuevoTC,
      monto: normalized.montoUsd,
    }));
    setMontoSecundario(normalized.montoSoles);
  };

  // Callback para FileDropZone
  const handleFilesAdded = (newFiles) => {
    setEvidencias((prev) => [...prev, ...newFiles]);
    toast.info(
      `${newFiles.length} archivo(s) seleccionado(s). Se subirán al guardar el movimiento.`,
    );
  };

  // Remover archivo del estado. Los archivos ya persistidos quedan protegidos
  // para todos los roles salvo superadmin (role 0).
  const handleRemoveFile = async (index) => {
    const fileToRemove = evidencias[index];
    if (!fileToRemove) return;

    if (!canRemoveMovementEvidence(fileToRemove, currentUserRole)) {
      toast.info(
        "Este archivo ya está registrado y no puede eliminarse. Solo un superadministrador puede quitar evidencias persistidas.",
      );
      return;
    }

    if (!window.confirm("¿Está seguro de eliminar esta evidencia?")) {
      return;
    }

    // Si el archivo ya está persistido, eliminarlo de vouchers_pagos.
    // El backend también valida role=0 como segunda barrera de seguridad.
    const persistedEvidenceId = getPersistedMovementEvidenceId(fileToRemove);
    if (persistedEvidenceId) {
      console.log(
        " Eliminando evidencia de vouchers_pagos:",
        persistedEvidenceId,
      );

      try {
        const deleteResponse = await vouchersPagosService.deleteEvidencia(
          persistedEvidenceId,
        );

        if (deleteResponse.success) {
          console.log(" Evidencia eliminada de BD correctamente");
          toast.success("Evidencia eliminada de la base de datos");
        } else {
          console.error(
            " Error eliminando evidencia de BD:",
            deleteResponse.error,
          );
          toast.error(
            deleteResponse.error || "No se pudo eliminar la evidencia registrada",
          );
          return;
        }
      } catch (error) {
        console.error(" Error al eliminar evidencia de BD:", error);
        toast.error("No se pudo eliminar la evidencia registrada");
        return;
      }
    }
    // Si el archivo es pendiente (sin subir), solo eliminarlo del estado
    else if (fileToRemove?.isPending) {
      console.log(" Eliminando evidencia pendiente (no subida)");
      setEvidencias((prev) => prev.filter((_, i) => i !== index));
      toast.info("Archivo eliminado");
      return;
    }
    // Si ya fue subido a Tigris pero no guardado en BD
    else if (fileToRemove?.tigris_url) {
      try {
        await deleteFile(fileToRemove.tigris_url);
        console.log(" Archivo eliminado de Tigris");
      } catch (error) {
        console.warn(" Error eliminando archivo de Tigris:", error);
        // Continuar de todas formas eliminando de la UI
      }
    }

    // Eliminar de la UI
    setEvidencias((prev) => prev.filter((_, i) => i !== index));
  };

  // Cargar evidencias existentes desde vouchers_pagos (modo edición)
  const loadExistingEvidencias = async (movimientoId) => {
    try {
      console.log(
        " Cargando evidencias existentes para movimiento ID:",
        movimientoId,
      );

      const result = await vouchersPagosService.getByMovimientoId(movimientoId);

      if (result.success && result.data && result.data.length > 0) {
        console.log(" Evidencias existentes cargadas:", result.data);

        // Mapear a formato compatible con el formulario
        const existingFiles = result.data.map((ev) => ({
          filename: ev.filename,
          tigris_url: ev.tigris_url,
          tigris_path: ev.tigris_path,
          proxy_url: ev.proxy_url,
          file_type: ev.file_type,
          file_size: ev.file_size,
          uploaded_at: ev.created_at,
          existingId: ev.id, // Marcar como existente para no duplicar
        }));

        setEvidencias(existingFiles);
        toast.info(
          `${existingFiles.length} evidencia(s) existente(s) cargada(s)`,
        );
      } else {
        console.log(" No hay evidencias existentes para este movimiento");
      }
    } catch (error) {
      console.error(" Error cargando evidencias existentes:", error);
    }
  };

  // Guardar evidencias en la tabla correcta según clasificación
  const saveEvidenciasToCorrectTable = async (
    movimientoId,
    evidenciasArray,
    movimientoData,
  ) => {
    console.log(" DEBUG saveEvidenciasToCorrectTable llamado:", {
      movimientoId,
      evidenciasCount: evidenciasArray?.length || 0,
      evidencias: evidenciasArray,
      movimientoData,
    });

    if (!evidenciasArray || evidenciasArray.length === 0) {
      console.log(" No hay evidencias para guardar");
      return true;
    }

    try {
      // PASO 1: Subir archivos pendientes a Tigris EN PARALELO para optimizar tiempo
      const pendingFiles = evidenciasArray.filter(
        (ev) => ev.isPending && ev.fileObject,
      );
      if (pendingFiles.length > 0) {
        console.log(
          ` Subiendo ${pendingFiles.length} archivo(s) pendiente(s) a Tigris (en paralelo)...`,
        );

        // OPTIMIZACIÓN: Subir todos los archivos en paralelo
        const uploadPromises = pendingFiles.map(async (pendingFile, i) => {
          console.log(
            ` Iniciando subida ${i + 1}/${pendingFiles.length}: ${pendingFile.filename}`,
          );

          try {
            // Subir a Tigris
            const uploadResult = await uploadFile(
              pendingFile.fileObject,
              "evidencias",
            );

            // Extraer tigris_path de la URL
            let tigrisPath = null;
            try {
              const url = new URL(uploadResult.tigrisUrl);
              tigrisPath = url.pathname.substring(1); // Remover el "/" inicial
              console.log(` Archivo subido: ${pendingFile.filename}`);
            } catch (error) {
              console.error(
                ` Error extrayendo path para ${pendingFile.filename}:`,
                error,
              );
            }

            // Retornar datos para actualizar el array
            return {
              pendingId: pendingFile.id,
              uploadedData: {
                tigris_url: uploadResult.tigrisUrl,
                tigris_path: tigrisPath,
                filename: uploadResult.metadata.originalName,
                file_type: uploadResult.metadata.contentType,
                file_size: uploadResult.metadata.sizeBytes,
                uploaded_at:
                  uploadResult.metadata.uploadedAt || new Date().toISOString(),
                isPending: false,
                fileObject: null,
              },
            };
          } catch (uploadError) {
            console.error(
              ` Error subiendo archivo ${pendingFile.filename}:`,
              uploadError,
            );
            toast.error(`Error subiendo ${pendingFile.filename}`);
            return { pendingId: pendingFile.id, error: uploadError };
          }
        });

        // Esperar todas las subidas en paralelo
        const uploadResults = await Promise.all(uploadPromises);

        // Actualizar evidencias con los resultados de subida
        uploadResults.forEach((result) => {
          if (result.uploadedData) {
            const evidenciaIndex = evidenciasArray.findIndex(
              (ev) => ev.id === result.pendingId,
            );
            if (evidenciaIndex !== -1) {
              evidenciasArray[evidenciaIndex] = {
                ...evidenciasArray[evidenciaIndex],
                ...result.uploadedData,
              };
            }
          }
        });

        const successCount = uploadResults.filter((r) => r.uploadedData).length;
        const failedUploads = uploadResults.filter((r) => r.error);
        if (successCount > 0) {
          toast.success(`${successCount} archivo(s) subido(s) a Tigris`);
        }

        // Una evidencia sin URL no puede registrarse ni debe convertirse en un
        // "guardado exitoso" parcial. Se conserva pendiente para reintentar.
        if (failedUploads.length > 0) {
          toast.error(
            `No se subieron ${failedUploads.length} evidencia(s). Corrige el almacenamiento y vuelve a intentarlo.`,
          );
          return false;
        }
      }

      const persistableEvidencias = evidenciasArray.filter(
        (evidencia) => Boolean(evidencia.tigris_url) && !evidencia.isPending,
      );
      if (persistableEvidencias.length !== evidenciasArray.length) {
        toast.error(
          "Hay evidencias pendientes sin una URL válida. No se registrarán documentos incompletos.",
        );
        return false;
      }

      // PASO 2: Guardar evidencias en vouchers_pagos con URLs ya asignadas
      const hasVoucherCode = !!movimientoData.voucher_code;
      const hasVoucherVenta = !!movimientoData.referencia_voucher_venta;
      const hasVoucherReserva = !!movimientoData.referencia_voucher_reserva;

      console.log(" Clasificación de evidencias:", {
        hasVoucherCode,
        hasVoucherVenta,
        hasVoucherReserva,
        voucher_code: movimientoData.voucher_code,
        referencia_voucher_venta: movimientoData.referencia_voucher_venta,
        referencia_voucher_reserva: movimientoData.referencia_voucher_reserva,
      });

      // Extraer payment_request_id de contexto_pago si existe
      const paymentRequestId =
        typeof movimientoData.contexto_pago === "object"
          ? movimientoData.contexto_pago.payment_request_id
          : null;

      // REGLAS CORREGIDAS para vouchers_pagos:
      // 1. voucher_code + referencia_voucher_venta (CON o SIN referencia_voucher_reserva) = vouchers_pagos
      // 2. Solo voucher_code (sin referencias) = vouchers_pagos (otros pagos)
      // 3. Solo referencia_voucher_venta sin voucher_code = movimiento simple (no guardar en vouchers_pagos)

      if (hasVoucherCode && hasVoucherVenta) {
        // Guardar en vouchers_pagos (pago de voucher venta, con/sin reserva)
        console.log(
          " Guardando evidencias en vouchers_pagos (pago de servicios)",
        );

        const dtos = persistableEvidencias.map((evidencia) => ({
          referencia_voucher_venta: movimientoData.referencia_voucher_venta
            ? parseInt(movimientoData.referencia_voucher_venta)
            : null,
          referencia_voucher_reserva:
            movimientoData.referencia_voucher_reserva || null, // String, no convertir
          voucher_code: movimientoData.voucher_code,
          movimiento_id: movimientoId,
          filename: evidencia.filename,
          file_type: evidencia.file_type,
          file_size: evidencia.file_size || null,
          tigris_url: evidencia.tigris_url,
          tigris_path: evidencia.tigris_path || null,
          payment_request_id: paymentRequestId,
        }));

        console.log(" Enviando DTOs a vouchers_pagos (pago servicios):", dtos);
        const result = await vouchersPagosService.createBatch(dtos);
        console.log(" Resultado createBatch (pago servicios):", result);
        if (result.success) {
          toast.success(
            ` ${dtos.length} evidencia(s) de pago de servicios guardada(s)`,
          );
        } else {
          toast.error(` Error al guardar evidencias: ${result.error}`);
          return false;
        }
      } else if (hasVoucherCode && !hasVoucherVenta) {
        // NUEVO: Solo voucher_code sin referencia_voucher_venta = vouchers_pagos (otros pagos)
        console.log(
          " Guardando evidencias en vouchers_pagos (pago con voucher_code pero sin ref_venta)",
        );

        const dtos = persistableEvidencias.map((evidencia) => ({
          referencia_voucher_venta: null,
          referencia_voucher_reserva: null,
          voucher_code: movimientoData.voucher_code,
          movimiento_id: movimientoId,
          filename: evidencia.filename,
          file_type: evidencia.file_type,
          file_size: evidencia.file_size || null,
          tigris_url: evidencia.tigris_url,
          tigris_path: evidencia.tigris_path || null,
          payment_request_id: paymentRequestId,
        }));

        console.log(
          " Enviando DTOs a vouchers_pagos (voucher_code solo):",
          dtos,
        );
        const result = await vouchersPagosService.createBatch(dtos);
        console.log(" Resultado createBatch:", result);
        if (result.success) {
          toast.success(` ${dtos.length} evidencia(s) guardada(s)`);
        } else {
          toast.error(` Error al guardar evidencias: ${result.error}`);
          return false;
        }
      } else {
        // Sin voucher_code el flujo histórico no guarda evidencias en vouchers_pagos.
        // En edición exclusiva de media esto debe considerarse un fallo para no
        // cerrar el modal fingiendo que el archivo quedó registrado.
        console.log(
          " Movimiento sin voucher - evidencias NO se guardan en vouchers_pagos",
        );
        if (isMediaOnlyEdit) {
          toast.error(
            "No se pudo asociar la evidencia al movimiento porque no tiene un voucher de pago vinculado",
          );
          return false;
        }
        toast.info(" Movimiento registrado (sin voucher asociado)");
      }

      return true;
    } catch (error) {
      console.error(" Error guardando evidencias:", error);
      toast.warning(
        " Movimiento creado pero hubo un error al guardar evidencias",
      );
      return false;
    }
  };

  const handleMediaOnlySubmit = async (e) => {
    e.preventDefault();

    if (!isMediaOnlyEdit || !initialData?.id) {
      toast.error("No se pudo identificar el movimiento a actualizar");
      return;
    }

    const newEvidencias = getPendingMovementEvidences(evidencias);
    if (newEvidencias.length === 0) {
      toast.info("No hay archivos nuevos para guardar");
      return;
    }

    setLoading(true);
    try {
      const mediaSaved = await saveEvidenciasToCorrectTable(
        initialData.id,
        newEvidencias,
        formData,
      );
      if (!mediaSaved) return;

      window.dispatchEvent(
        new CustomEvent("movimientoUpdated", {
          detail: {
            movimiento_id: initialData.id,
            referencia_voucher_venta:
              formData.referencia_voucher_venta ||
              initialData.referencia_voucher_venta ||
              null,
            media_updated: true,
          },
        }),
      );

      toast.success("Archivos del movimiento actualizados");
      onSuccess?.({ ...initialData, media_updated: true });
      onClose?.();
    } catch (error) {
      console.error("Error actualizando archivos del movimiento:", error);
      toast.error("No se pudieron actualizar los archivos del movimiento");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    console.log(" handleSubmit iniciado", {
      isEditMode,
      evidencias: evidencias.length,
    });
    e.preventDefault();
    const form = e.currentTarget;

    const normalizedDualCurrency = showDualCurrency
      ? normalizeDualCurrencyAmounts({
          usdValue: formData.monto,
          solesValue: montoSecundario,
          exchangeRateValue:
            parsePositiveNumber(formData.tipo_cambio) || autoExchangeRate,
          preserve: formData.monto ? "usd" : "soles",
        })
      : {
          montoUsd: formData.monto,
          montoSoles: montoSecundario,
        };

    const effectiveExchangeRate =
      parsePositiveNumber(formData.tipo_cambio) ||
      parsePositiveNumber(autoExchangeRate) ||
      DEFAULT_USD_TO_PEN_RATE;
    const normalizedMontoUsd = normalizedDualCurrency.montoUsd;
    const normalizedMontoSoles = showDualCurrency
      ? normalizedDualCurrency.montoSoles
      : normalizedMontoUsd && effectiveExchangeRate
        ? roundToTwoDecimals(
            parseFloat(normalizedMontoUsd) * effectiveExchangeRate,
          ).toString()
        : normalizedDualCurrency.montoSoles;

    // Validación del formulario
    if (form.checkValidity() === false) {
      console.log(" Validación HTML5 falló");
      e.stopPropagation();
      setValidated(true);
      return;
    }

    // Validar evidencia: OBLIGATORIA para pagos con referencias a vouchers (solo en modo creación)
    console.log(" Validación evidencias:", {
      isEditMode,
      hasVoucherReferences,
      evidenciasLength: evidencias.length,
      shouldValidate: !isEditMode && hasVoucherReferences,
    });

    // Evidencias ahora son OPCIONALES - no bloquear el submit
    if (!isEditMode && hasVoucherReferences && evidencias.length === 0) {
      console.log(" Advertencia: No hay evidencias adjuntas, pero es opcional");
      // Ya no retornamos, permitimos continuar sin evidencias
    }

    // Validar tipo de cambio y montos cuando es requerido (fondo en soles)
    if (!isEditMode && showDualCurrency) {
      if (!effectiveExchangeRate || effectiveExchangeRate <= 0) {
        console.log(" Validación tipo_cambio falló");
        toast.error("Debe ingresar un tipo de cambio válido (mayor a 0)");
        return;
      }
      if (!normalizedMontoUsd || parseFloat(normalizedMontoUsd) <= 0) {
        console.log(" Validación monto USD falló");
        toast.error(
          "Debe ingresar el monto en dólares o calcularlo desde soles",
        );
        return;
      }
      if (!normalizedMontoSoles || parseFloat(normalizedMontoSoles) <= 0) {
        console.log(" Validación monto Soles falló");
        toast.error("Debe ingresar el monto en soles");
        return;
      }
    }

    console.log(" Validaciones pasadas, continuando con submit");

    setLoading(true);

    try {
      // LÓGICA DE GUARDADO DE MONTOS:
      // - `monto`: Siempre se guarda en DÓLARES (formData.monto = valor base USD)
      // - `montoSecundario`: Es el valor en SOLES (calculado = monto * tipo_cambio)
      // - Cuando hay fondo en Soles (showDualCurrency):
      // * El monto en movimiento será en Soles (montoSecundario) porque se descuenta del fondo en soles
      // * En contexto_pago guardamos: monto_base_usd, tipo_cambio, monto_convertido_soles
      // - Cuando hay fondo en Dólares (!showDualCurrency):
      // * El monto en movimiento será en Dólares directamente

      // Si el fondo está en SOLES, guardamos el monto en soles (montoSecundario)
      // Si el fondo está en DÓLARES, guardamos el monto en dólares (formData.monto)
      const montoAGuardar =
        showDualCurrency && normalizedMontoSoles
          ? roundToTwoDecimals(parseFloat(normalizedMontoSoles)) // Monto en soles para fondo en soles
          : roundToTwoDecimals(parseFloat(formData.monto)); // Monto en USD para fondo en USD

      const montoBaseUsd = normalizedMontoUsd
        ? roundToTwoDecimals(parseFloat(normalizedMontoUsd))
        : null;
      const montoConvertidoSoles = normalizedMontoSoles
        ? roundToTwoDecimals(parseFloat(normalizedMontoSoles))
        : null;
      const parsedSaldoId = Number.parseInt(formData.saldo_id, 10);
      const contextoPagoPayload = buildContextoPagoPayload({
        contextoPago: formData.contexto_pago,
        exchangeRate: effectiveExchangeRate,
        montoBaseUsd,
        montoConvertidoSoles,
        saldoId: Number.isNaN(parsedSaldoId) ? null : parsedSaldoId,
        monedaFondo: formData.moneda,
      });

      // Preparar datos para envío
      const submitData = {
        descripcion: formData.descripcion,
        monto: montoAGuardar, // Monto a descontar del fondo (en la moneda del fondo)
        tipo_cuenta: formData.tipo_cuenta,
        datos_extra: formData.datos_extra,
        contexto_pago: contextoPagoPayload,
      };

      if (effectiveExchangeRate && montoBaseUsd) {
        submitData.tipo_cambio = effectiveExchangeRate;
        submitData.datos_extra = {
          ...submitData.datos_extra,
          tipo_cambio: effectiveExchangeRate,
          moneda_base: "dolares",
          moneda_fondo: formData.moneda || "dolares",
          monto_base_usd: montoBaseUsd,
          monto_convertido_soles: montoConvertidoSoles,
        };
      }

      // En modo edición, solo enviamos los campos editables
      if (isEditMode) {
        // Agregar ID para la actualización
        submitData.id = initialData.id;
        submitData.fecha = format(formData.fecha, "yyyy-MM-dd");
        submitData.moneda = formData.moneda;
        submitData.metodo_pago = formData.metodo_pago || undefined;
        submitData.referencia_pago = formData.referencia_pago || undefined;
        submitData.pagado_por = formData.pagado_por || undefined;
        submitData.recepcionado_por = formData.recepcionado_por || undefined;
        submitData.referencia_voucher_venta =
          formData.referencia_voucher_venta || undefined;
        submitData.referencia_voucher_reserva =
          formData.referencia_voucher_reserva || undefined;
        submitData.voucher_code = formData.voucher_code || undefined;
        submitData.updated_by = dniuser;

        const response = await contabilidadService.updateMovimiento(
          initialData.id,
          submitData,
        );

        // Verificar si la respuesta indica éxito (o no tiene el campo success pero tampoco error)
        const isSuccess = response.success !== false && !response.error;

        if (isSuccess) {
          // Guardar nuevas evidencias si se agregaron (solo las que no tienen existingId y son pendientes)
          const newEvidencias = getPendingMovementEvidences(evidencias);

          if (newEvidencias.length > 0) {
            console.log(
              " Guardando nuevas evidencias agregadas en edición:",
              newEvidencias,
            );

            try {
              const mediaSaved = await saveEvidenciasToCorrectTable(
                initialData.id,
                newEvidencias,
                formData,
              );
              if (!mediaSaved) {
                toast.warning(
                  "Movimiento actualizado, pero las evidencias siguen pendientes. Vuelve a intentarlo.",
                );
                return;
              }
              console.log(" Nuevas evidencias guardadas correctamente");
            } catch (error) {
              console.error(" Error guardando nuevas evidencias:", error);
              toast.warning(
                "Movimiento actualizado, pero hubo un error al guardar las evidencias nuevas",
              );
            }
          } else {
            console.log(" No hay nuevas evidencias pendientes para guardar");
          }

          toast.success(
            `${tipoMovimiento === "ingreso" ? "Ingreso" : "Egreso"} actualizado correctamente`,
          );

          // Notificar al componente padre con los datos actualizados
          if (onSuccess) {
            onSuccess(
              response.data ||
                response || { ...submitData, id: initialData.id },
            );
          }

          // Cerrar modal
          if (onClose) onClose();
        } else {
          toast.error(
            response.message || `Error al actualizar ${tipoMovimiento}`,
          );
        }
      } else {
        // Modo creación - incluir todos los campos
        submitData.fecha = format(formData.fecha, "yyyy-MM-dd");
        submitData.mes = formData.mes; // Incluir mes
        // La moneda del movimiento debe coincidir con la del saldo/fondo seleccionado
        // La información de conversión se guarda en contexto_pago.conversion
        submitData.moneda = formData.moneda;
        submitData.tipo_movimiento = formData.tipo_movimiento;
        submitData.saldo_id = parseInt(formData.saldo_id);
        submitData.created_by = dniuser; // Incluir created_by con DNI del usuario autenticado

        // Incluir platform y business_type - prioridad:
        // 1. Del contexto_pago (viene de payment_request)
        // 2. Del formData (seleccionado o cargado de voucher)
        // 3. Del usuario actual (fallback)
        const contextoPago =
          typeof formData.contexto_pago === "object"
            ? formData.contexto_pago
            : null;
        submitData.platform =
          contextoPago?.platform ||
          formData.platform ||
          currentUser?.platform ||
          "venso";
        submitData.business_type =
          contextoPago?.business_type ||
          formData.business_type ||
          currentUser?.business_type ||
          "B2C";

        if (contextoPagoPayload) {
          submitData.contexto_pago = contextoPagoPayload;
        }

        // Solo incluir campos opcionales si tienen valor
        if (formData.referencia_voucher) {
          submitData.referencia_voucher = formData.referencia_voucher;
        }
        // Incluir referencias específicas por tipo de voucher (asegurar que son strings)
        if (formData.referencia_voucher_venta) {
          submitData.referencia_voucher_venta = String(
            formData.referencia_voucher_venta,
          );
        }
        if (formData.referencia_voucher_reserva) {
          submitData.referencia_voucher_reserva = String(
            formData.referencia_voucher_reserva,
          );
        }
        if (formData.voucher_code) {
          submitData.voucher_code = String(formData.voucher_code);
        }
        // Incluir nuevos campos de pago si tienen valor
        if (formData.metodo_pago) {
          submitData.metodo_pago = formData.metodo_pago;
        }
        if (formData.referencia_pago) {
          submitData.referencia_pago = formData.referencia_pago;
        }
        if (formData.pagado_por) {
          submitData.pagado_por = formData.pagado_por;
        }
        if (formData.recepcionado_por) {
          submitData.recepcionado_por = formData.recepcionado_por;
        }

        console.log(" Enviando movimiento con payload:", submitData);
        console.log(" Referencias del voucher:", {
          referencia_voucher_venta: submitData.referencia_voucher_venta,
          voucher_code: submitData.voucher_code,
          contexto_pago: submitData.contexto_pago,
        });

        // NO subir archivos aquí, mantener como base64/pendientes
        // Los archivos se subirán DESPUÉS de crear el movimiento exitosamente

        const response = await contabilidadService.createMovimiento(submitData);

        if (response.success) {
          const movimientoId = response.data?.id;

          console.log(" DEBUG después de crear movimiento:", {
            movimientoId,
            evidenciasLength: evidencias.length,
            formData: formData,
          });

          // Guardar evidencias en la tabla correcta según clasificación
          if (evidencias.length > 0 && movimientoId) {
            console.log(
              " Condición cumplida, llamando saveEvidenciasToCorrectTable...",
            );
            const mediaSaved = await saveEvidenciasToCorrectTable(
              movimientoId,
              evidencias,
              formData,
            );
            if (!mediaSaved) {
              toast.warning(
                "Movimiento registrado, pero las evidencias siguen pendientes. Ábrelo nuevamente para reintentarlas.",
              );
              return;
            }
          } else {
            console.log(" NO se llama saveEvidenciasToCorrectTable:", {
              evidenciasLength: evidencias.length,
              movimientoId,
            });
          }

          toast.success(
            `${tipoMovimiento === "ingreso" ? "Ingreso" : "Egreso"} registrado correctamente`,
          );

          // Emitir evento si el movimiento está asociado a un payment_request
          const paymentRequestId =
            typeof submitData.contexto_pago === "object"
              ? submitData.contexto_pago.payment_request_id
              : null;

          if (paymentRequestId) {
            const voucherReservaId = submitData.referencia_voucher_reserva;

            if (voucherReservaId) {
              invalidateVoucherReservaById(voucherReservaId);
            }

            console.log(
              " Emitiendo evento paymentRequestPaid para payment_request_id:",
              paymentRequestId,
            );
            window.dispatchEvent(
              new CustomEvent("paymentRequestPaid", {
                detail: {
                  payment_request_id: paymentRequestId,
                  voucher_code: submitData.voucher_code,
                  voucher_reserva_id: voucherReservaId,
                  voucherReservaId: voucherReservaId,
                  movimiento_id: movimientoId,
                },
              }),
            );

          }

          // Señal amplia para que cualquier vista (vouchers venta, reservas,
          // contabilidad) se refresque tras cualquier movimiento creado.
          window.dispatchEvent(
            new CustomEvent("movimientoCreated", {
              detail: {
                tipo: submitData.tipo_movimiento || "ingreso",
                source: paymentRequestId ? "payment" : "voucher_venta",
                movimiento_id: movimientoId,
                referencia_voucher_venta: submitData.referencia_voucher_venta,
              },
            }),
          );

          // Notificar al componente padre con los datos completos del movimiento creado
          if (onSuccess) {
            onSuccess(response.data || submitData);
          }

          // Cerrar modal
          if (onClose) onClose();
        } else {
          toast.error(
            response.message || `Error al registrar ${tipoMovimiento}`,
          );
        }
      }
    } catch (error) {
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
      label: isEditMode ? "Actualizar" : "Guardar",
      onClick: () =>
        document
          .getElementById("movimiento-form")
          .dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true }),
          ),
      variant: tipoMovimiento === "ingreso" ? "success" : "danger",
      icon: <FaSave />,
      disabled: loading || isUploading,
    },
  ];

  // Add helper function to prevent wheel scrolling
  const preventWheelChange = (e) => {
    e.target.blur();
  };

  // Add helper function to prevent arrow keys from changing values
  const preventArrowChange = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
    }
  };

  const handleFacturacionChange = (facturacion) => {
    const normalizedFacturacion = normalizeFacturacionValue(facturacion);
    if (!normalizedFacturacion) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      contexto_pago:
        prev.contexto_pago && typeof prev.contexto_pago === "object"
          ? {
              ...prev.contexto_pago,
              facturacion: normalizedFacturacion,
            }
          : prev.contexto_pago,
    }));
  };

  const canRemoveEvidence = (file) =>
    canRemoveMovementEvidence(file, currentUserRole);

  if (isMediaOnlyEdit) {
    const mediaOnlyActions = [
      {
        label: "Cancelar",
        onClick: onClose,
        variant: "secondary",
        icon: <FaTimes />,
      },
      {
        label: "Guardar archivos",
        onClick: () => document.getElementById("movimiento-media-form")?.requestSubmit(),
        variant: tipoMovimiento === "ingreso" ? "success" : "danger",
        icon: <FaSave />,
        disabled:
          loading ||
          isUploading ||
          getPendingMovementEvidences(evidencias).length === 0,
      },
    ];

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Actualizar archivos del movimiento #${initialData?.id || ""}`}
        actions={mediaOnlyActions}
        size="small"
        className="movimiento-modal movimiento-media-only"
      >
        <form id="movimiento-media-form" onSubmit={handleMediaOnlySubmit}>
          <div className="movement-media-policy">
            <MdInfo />
            <div>
              <strong>Archivos registrados protegidos</strong>
              <span>
                Puedes agregar nuevas evidencias y retirar archivos nuevos antes de
                guardar. {isSuperAdmin
                  ? "Como superadministrador, también puedes eliminar archivos ya registrados."
                  : "Los archivos ya guardados no se pueden eliminar."}
              </span>
            </div>
          </div>

          <FormSection
            title="Evidencia de Pago"
            icon={<MdCloudUpload />}
            variant="secondary"
            headerAction={<span className="optional-badge">Opcional</span>}
          >
            <FileDropZone
              files={evidencias}
              onFilesAdded={handleFilesAdded}
              onFileRemove={handleRemoveFile}
              canRemoveFile={canRemoveEvidence}
              disabled={isUploading}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              inputId="movement-media-file-upload"
              label="Agregar nuevas evidencias"
              hint="Los archivos guardados quedan protegidos después de registrar la actualización"
            />
          </FormSection>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditMode
          ? `Editar ${tipoMovimiento === "ingreso" ? "Ingreso" : "Egreso"}`
          : `Nuevo ${tipoMovimiento === "ingreso" ? "Ingreso" : "Egreso"}`
      }
      actions={modalActions}
      size="small"
      className={`movimiento-modal ${tipoMovimiento} ${isEditMode ? "edit-mode" : "create-mode"}`}
    >
      <form
        id="movimiento-form"
        className={validated ? "validated" : ""}
        noValidate
        onSubmit={handleSubmit}
      >
        {/* ========== CONTENEDOR 3: CONTEXTO DE PAGO (Movido al inicio por importancia) ========== */}
        <FormSection variant="tertiary">
          {/* Banner simple para contexto cuando viene de initialData */}
          {getContextoPagoTipo && initialData?.contexto_pago ? (
            <div className="context-simple-banner">
              <div className="context-badge-row">
                <span className="context-type-badge">
                  {getContextoPagoTipo}
                </span>
                {formData.voucher_code && (
                  <span className="context-value-badge file">
                    {formData.voucher_code}
                  </span>
                )}
                {formData.referencia_voucher_venta && (
                  <span className="context-value-badge venta">
                    V#{formData.referencia_voucher_venta}
                  </span>
                )}
                {formData.referencia_voucher_reserva && (
                  <span className="context-value-badge reserva">
                    R:{formData.referencia_voucher_reserva}
                  </span>
                )}
              </div>

              {/* LEGACY: Mantener referencia_voucher para compatibilidad */}
              {getContextoPagoTipo === "ServiciosVoucherReserva" &&
                !formData.referencia_voucher_reserva && (
                  <input
                    type="hidden"
                    name="referencia_voucher"
                    value={formData.referencia_voucher}
                  />
                )}
            </div>
          ) : (
            // Selector editable cuando NO viene de initialData
            <div className="form-group form-group-optional">
              <label htmlFor="contexto_pago">
                <MdCategory className="label-icon" />
                Contexto de Pago{" "}
                <span className="optional-text">(Opcional)</span>
              </label>
              <SmartPaymentContextSelect
                id="contexto_pago"
                name="contexto_pago"
                value={
                  typeof formData.contexto_pago === "object" &&
                  formData.contexto_pago?.tipo
                    ? formData.contexto_pago.tipo
                    : formData.contexto_pago || ""
                }
                onChange={handleInputChange}
                existingContexts={getExistingPaymentContexts(movimientos)}
                allContexts={getGroupedPaymentContexts()}
                placeholder="-- Seleccionar contexto --"
                hiddenOptions={
                  // Ocultar opciones reservadas cuando NO hay initialData con contexto
                  !initialData?.contexto_pago
                    ? [
                        "LiquidacionServicioProveedor",
                        "PagoCotizacion",
                        "ServiciosVoucherReserva",
                      ]
                    : []
                }
              />
              <small className="form-text">
                Seleccione o ingrese el contexto de este movimiento
              </small>
            </div>
          )}
        </FormSection>

        {/* ========== CONTENEDOR 1: INFORMACIÓN BÁSICA ========== */}
        <FormSection
          title="Información del Movimiento"
          icon={<MdInfo />}
          variant="primary"
        >
          <div className="form-group">
            <label htmlFor="descripcion">
              <MdInfo className="label-icon" />
              Descripción del Movimiento
              <span className="required-asterisk">*</span>
            </label>
            <input
              type="text"
              id="descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              required
              placeholder={`Ej: ${tipoMovimiento === "ingreso" ? "Pago recibido por servicio de tour a Machu Picchu" : "Pago a proveedor por hospedaje en hotel"}`}
              className={validated && !formData.descripcion ? "invalid" : ""}
              maxLength="250"
            />
            <div className="feedback">Por favor ingrese una descripción.</div>
          </div>

          {/* Comparación comercial vs asignación operativa vinculada al pago */}
          {paymentRequestServiceData && (
            <PaymentServiceComparison
              serviceData={paymentRequestServiceData}
              itinerarioServicioId={paymentRequestPreview?.itinerarioServicioId}
              title="Servicio relacionado"
            />
          )}

          {hasPaymentRequestAssociation && (
            <div className="facturacion-card">
              <div className="facturacion-status-row">
                <span className="facturacion-label">
                  Facturación
                  {paymentRequestServiceType
                    ? ` · ${paymentRequestServiceType}`
                    : ""}
                </span>

                <div className="facturacion-switch">
                  <button
                    type="button"
                    className={`facturacion-option ${facturacionActual === "exportacion" ? "active" : ""}`}
                    onClick={() => handleFacturacionChange("exportacion")}
                  >
                    Exportación
                  </button>
                  <button
                    type="button"
                    className={`facturacion-option ${facturacionActual === "intangible" ? "active" : ""}`}
                    onClick={() => handleFacturacionChange("intangible")}
                  >
                    Intangible
                  </button>
                </div>

                <span
                  className={`facturacion-pill ${facturacionActual || "pending"}`}
                >
                  {facturacionActual === "exportacion"
                    ? "Exportación"
                    : facturacionActual === "intangible"
                      ? "Intangible"
                      : "Pendiente"}
                </span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="saldo_id">
              <MdAccountBalance className="label-icon" />
              Fondos y Moneda
              <span className="required-asterisk">*</span>
              {isEditMode && (
                <span className="edit-only-badge">Solo lectura</span>
              )}
            </label>

            {/* Selector visual de fondos con iconos - usa saldos filtrados por año/plataforma */}
            {/* Para INGRESOS: excluir cuenta_credito ya que los ingresos no deberían ir a crédito */}
            <FundoSelector
              saldos={saldosFiltrados}
              selectedId={formData.saldo_id}
              onChange={handleInputChange}
              disabled={isEditMode}
              validated={validated}
              excludeTypes={
                tipoMovimiento === "ingreso" ? ["cuenta_credito"] : []
              }
            />
            <div className="feedback">Por favor seleccione un fondo.</div>
          </div>

          {/* ============================================================================ */}
          {/* SECCIÓN DE MONTOS - monto USD y TC visibles para cualquier moneda */}
          {/* ============================================================================ */}

          <div className="form-group">
            <label htmlFor="monto">
              <MdAttachMoney className="label-icon" />
              Monto USD <span className="required-asterisk">*</span>
            </label>
            <input
              type="number"
              id="monto"
              name="monto"
              value={formData.monto}
              onChange={handleMontoUSDChange}
              required={!showDualCurrency || !montoSecundario}
              min="0.01"
              step="0.01"
              placeholder={
                showDualCurrency
                  ? "Ingrese USD o complete soles + TC"
                  : "Ingrese el monto en dólares"
              }
              className={
                validated &&
                !formData.monto &&
                (!showDualCurrency || !montoSecundario)
                  ? "invalid"
                  : ""
              }
              onWheel={preventWheelChange}
              onKeyDown={preventArrowChange}
            />
            <div className="feedback">
              {showDualCurrency
                ? "Ingrese el monto en USD o complete soles y tipo de cambio."
                : "Por favor ingrese un monto válido."}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tipo_cambio">
              <MdSwapHoriz className="label-icon" />
              Tipo de Cambio <span className="required-asterisk">*</span>
            </label>
            <input
              type="number"
              id="tipo_cambio"
              name="tipo_cambio"
              value={formData.tipo_cambio}
              onChange={handleTipoCambioChange}
              required
              min="0.01"
              step="0.0001"
              placeholder="Ej: 3.75"
              className={
                validated && !formData.tipo_cambio && !autoExchangeRate
                  ? "invalid"
                  : ""
              }
              onWheel={preventWheelChange}
              onKeyDown={preventArrowChange}
            />
            <div className="feedback">
              Por favor ingrese el tipo de cambio o use el valor autocompletado.
            </div>
          </div>

          {showDualCurrency && (
            <div className="form-group">
              <label htmlFor="monto_soles">
                <MdAccountBalance className="label-icon" />
                Equivalente en Soles{" "}
                <span className="calculated-badge">calculado</span>
              </label>
              <input
                type="number"
                id="monto_soles"
                name="monto_soles"
                value={montoSecundario}
                onChange={handleMontoSolesChange}
                min="0.01"
                step="0.01"
                placeholder="Se calcula automáticamente"
                onWheel={preventWheelChange}
                onKeyDown={preventArrowChange}
              />
              <small className="hint-text">
                Edita este campo para recalcular el monto USD
              </small>
            </div>
          )}

          {/* Selector de Plataforma - Solo visible cuando no hay referencia a voucher */}
          {!formData.referencia_voucher_venta &&
            !formData.contexto_pago?.platform && (
              <div className="form-group">
                <label htmlFor="platform">
                  Plataforma
                  <span className="required-asterisk">*</span>
                </label>
                <div className="platform-selector">
                  <button
                    type="button"
                    className={`platform-btn venso ${formData.platform === "venso" ? "active" : ""}`}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        platform: "venso",
                        business_type: "B2C",
                      }))
                    }
                  >
                    <span className="platform-name">VENSO</span>
                    <span className="platform-type">B2C</span>
                  </button>
                  <button
                    type="button"
                    className={`platform-btn mil ${formData.platform === "mil" ? "active" : ""}`}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        platform: "mil",
                        business_type: "B2B",
                      }))
                    }
                  >
                    <span className="platform-name">MIL</span>
                    <span className="platform-type">B2B</span>
                  </button>
                </div>
                <small className="form-text">
                  Seleccione la plataforma del movimiento
                </small>
              </div>
            )}

          {/* Mostrar plataforma desde referencia (readonly) */}
          {(formData.referencia_voucher_venta ||
            formData.contexto_pago?.platform) &&
            (formData.platform || formData.contexto_pago?.platform) && (
              <div className="form-group">
                <label> Plataforma</label>
                <div className="platform-badge-display">
                  <span
                    className={`platform-badge ${(formData.platform || formData.contexto_pago?.platform || "venso").toLowerCase()}`}
                  >
                    {(
                      formData.platform ||
                      formData.contexto_pago?.platform ||
                      "venso"
                    ).toUpperCase()}
                  </span>
                  <span
                    className={`business-type-badge ${(formData.business_type || formData.contexto_pago?.business_type || "B2C").toLowerCase()}`}
                  >
                    {formData.business_type ||
                      formData.contexto_pago?.business_type ||
                      "B2C"}
                  </span>
                </div>
                <small className="form-text">
                  Heredado del voucher asociado
                </small>
              </div>
            )}

          <div className="form-group">
            <label htmlFor="fecha">
              <MdCalendarToday className="label-icon" />
              Fecha del Movimiento
              <span className="required-asterisk">*</span>
            </label>
            <div className="datepicker-wrapper">
              <DatePicker
                id="fecha"
                selected={formData.fecha}
                onChange={handleFechaChange}
                dateFormat="dd/MM/yyyy"
                locale={es}
                className={
                  validated && !formData.fecha
                    ? "invalid custom-datepicker"
                    : "custom-datepicker"
                }
                placeholderText="Seleccione una fecha"
                required
              />
            </div>
            <div className="feedback">Por favor seleccione una fecha.</div>
          </div>
        </FormSection>
        {/* ========== FIN CONTENEDOR 1 ========== */}

        {/* ========== CONTENEDOR 2: ARCHIVOS Y EVIDENCIA ========== */}
        <FormSection
          title="Evidencia de Pago"
          icon={<MdCloudUpload />}
          variant="secondary"
          headerAction={(() => {
            if (!formData) return null;
            const contextoTipo =
              typeof formData.contexto_pago === "object"
                ? formData.contexto_pago?.tipo
                : formData.contexto_pago;
            // Evidencias ahora son opcionales siempre
            return <span className="optional-badge">Opcional</span>;
          })()}
        >
          <FileDropZone
            files={evidencias}
            onFilesAdded={handleFilesAdded}
            onFileRemove={handleRemoveFile}
            canRemoveFile={canRemoveEvidence}
            disabled={isUploading}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            inputId="file-upload"
          />
        </FormSection>
        {/* ========== FIN CONTENEDOR 2 ========== */}
      </form>
    </Modal>
  );
};

export default MovimientoForm;
