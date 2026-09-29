import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MdCheckCircle,
  MdInfoOutline,
  MdNavigateBefore,
  MdWarning,
} from "react-icons/md";
import SecureStorage from "../../../../../../utils/secureStorage";
import * as cotizacionService from "../../../../Cotizaciones/hooks/cotizacionService";
import VoucherSummary from "./VoucherSummary";
import "./ConfirmationStep.scss";

const hasArrayItems = (value) => Array.isArray(value) && value.length > 0;

const ConfirmationStep = ({
  voucherData,
  cotizacionData,
  onComplete,
  onPrevious,
  isEditMode = false,
  hideActions = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [missingCotizacionInfo, setMissingCotizacionInfo] = useState(false);
  const cotizacionId =
    cotizacionData?.id ||
    cotizacionData?.id ||
    voucherData?.cotizacionId ||
    voucherData?.cotizacion_id ||
    voucherData?.cotizacionData?.id ||
    voucherData?.cotizacionData?.id ||
    null;
  const storedCotizacion = voucherData?.cotizacionData || {};
  // Las cotizaciones cerradas pueden traer una copia reducida dentro del voucher.
  // Reutilizamos el detalle normal de la cotización y VoucherSummary aplica la
  // misma normalización/frontend de SummaryContent; no existe endpoint ni
  // cálculo especial de pricing en el backend.
  const shouldHydrateCotizacion = Boolean(cotizacionId);
  const {
    data: freshPricingContext = null,
    isFetching: isFetchingCotizacion,
    isError: hasCotizacionFetchError,
  } = useQuery({
    queryKey: ["cotizaciones", "confirmation-detail", cotizacionId],
    queryFn: ({ signal }) =>
      cotizacionService.getCotizacionById(cotizacionId, { signal }),
    enabled: shouldHydrateCotizacion,
    staleTime: 1000 * 60 * 5,
    refetchOnMount: false,
  });
  const hydratedCotizacionData = useMemo(
    () => ({
      ...storedCotizacion,
      ...(cotizacionData || {}),
      ...(freshPricingContext || {}),
    }),
    [storedCotizacion, cotizacionData, freshPricingContext],
  );

  useEffect(() => {
    if (!isEditMode) {
      setMissingCotizacionInfo(false);
      return;
    }

    const hasItinerario =
      hasArrayItems(hydratedCotizacionData?.itinerario) ||
      hasArrayItems(hydratedCotizacionData?.dias);

    setMissingCotizacionInfo(
      !isFetchingCotizacion && (!hasItinerario || hasCotizacionFetchError),
    );
  }, [
    isEditMode,
    hydratedCotizacionData,
    isFetchingCotizacion,
    hasCotizacionFetchError,
  ]);

  const isCompletable = () => {
    return hasArrayItems(voucherData?.passengerData?.adults);
  };

  const handleComplete = () => {
    setIsSubmitting(true);

    try {
      if (!hasArrayItems(voucherData?.passengerData?.adults)) {
        throw new Error("Se requieren datos de pasajeros para continuar");
      }

      const currentUser = SecureStorage.getItem("dniuser") || "";
      const completeVoucherData = JSON.parse(JSON.stringify(voucherData || {}));

      if (
        completeVoucherData.id &&
        typeof completeVoucherData.id === "number"
      ) {
        completeVoucherData.id = completeVoucherData.id.toString();
      }

      if (!completeVoucherData.created_by) {
        completeVoucherData.created_by = currentUser;
      }

      if (
        !completeVoucherData.cotizacionId &&
        !completeVoucherData.cotizacion_id
      ) {
        if (cotizacionData?.id) {
          completeVoucherData.cotizacionId = cotizacionData.id;
          completeVoucherData.cotizacion_id = cotizacionData.id;
        } else if (voucherData?.cotizacionData?.id) {
          completeVoucherData.cotizacionId = voucherData.cotizacionData.id;
          completeVoucherData.cotizacion_id = voucherData.cotizacionData.id;
        }
      }

      if (
        hydratedCotizacionData &&
        Object.keys(hydratedCotizacionData).length > 0
      ) {
        completeVoucherData.cotizacionData = hydratedCotizacionData;
      } else if (
        !completeVoucherData.cotizacionData &&
        voucherData?.cotizacionData
      ) {
        completeVoucherData.cotizacionData = voucherData.cotizacionData;
      }

      if (!completeVoucherData.voucher_code) {
        completeVoucherData.voucher_code = `V-${new Date().getFullYear()}-${Math.floor(
          Math.random() * 10000,
        )
          .toString()
          .padStart(4, "0")}`;
      }

      if (!completeVoucherData.status) {
        completeVoucherData.status = "active";
      }

      if (
        !completeVoucherData.cotizacionId &&
        !completeVoucherData.cotizacion_id
      ) {
        throw new Error(
          "No se pudo determinar el ID de cotización. Por favor seleccione una cotización.",
        );
      }

      onComplete(completeVoucherData);
    } catch (error) {
      console.error("Error creating/updating voucher:", error);
      setIsSubmitting(false);
      alert(`Error: ${error.message}`);
    }
  };

  const effectiveCotizacionData = hydratedCotizacionData;
  const ready = isCompletable();

  return (
    <div className="confirmation-step">
      <div className="confirmation-header">
        <div className="confirmation-title">
          <h2>
            {isEditMode
              ? "Confirmar actualización de voucher"
              : "Confirmar emisión de voucher"}
          </h2>
          <p className="confirmation-subtitle">
            Revise la información antes de{" "}
            {isEditMode ? "actualizar" : "emitir"} el voucher. Los pagos no
            bloquean la emisión.
          </p>
        </div>

        <div className={`completion-status ${ready ? "ready" : "not-ready"}`}>
          {ready ? (
            <>
              <MdCheckCircle className="status-icon" />
              <span>Listo para {isEditMode ? "actualizar" : "emitir"}</span>
            </>
          ) : (
            <>
              <MdWarning className="status-icon" />
              <span>Faltan pasajeros</span>
            </>
          )}
        </div>
      </div>

      {missingCotizacionInfo && (
        <div className="cotizacion-info-warning">
          <MdInfoOutline className="info-icon" />
          <div>
            <h4>Información de cotización limitada</h4>
            <p>
              Algunos detalles como el itinerario pueden no estar disponibles en
              modo edición.
            </p>
          </div>
        </div>
      )}

      <div className="confirmation-content">
        {isFetchingCotizacion && (
          <div className="cotizacion-info-warning">
            <MdInfoOutline className="info-icon" />
            <div>
              <h4>Reconstruyendo precios</h4>
              <p>Cargando itinerario, habitaciones y pasajeros de la cotización.</p>
            </div>
          </div>
        )}
        <VoucherSummary
          voucherData={voucherData}
          cotizacionData={effectiveCotizacionData}
          isEditMode={isEditMode}
        />
      </div>

      {!hideActions && (
        <>
          <div className="confirmation-actions">
            <button
              onClick={onPrevious}
              className="previous-button"
              disabled={isSubmitting}
            >
              <MdNavigateBefore /> Anterior
            </button>

            <button
              onClick={handleComplete}
              className="confirm-button"
              disabled={!ready || isSubmitting}
            >
              {isSubmitting
                ? "Procesando..."
                : ready
                  ? isEditMode
                    ? "Actualizar voucher"
                    : "Emitir voucher"
                  : "Completar información"}
            </button>
          </div>

          {!ready && (
            <div className="completion-warning">
              <MdWarning className="warning-icon" />
              <p>
                Para {isEditMode ? "actualizar" : "emitir"} el voucher,
                complete al menos un pasajero adulto.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConfirmationStep;
