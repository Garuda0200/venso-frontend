import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MdEdit,
  MdDelete,
  MdContentCopy,
  MdVisibility,
  MdPerson,
  MdChildCare,
  MdPictureAsPdf,
  MdOutlineConfirmationNumber,
  MdOutlineBed,
  MdHistory,
  MdLock,
  MdLockOpen,
  MdHourglassTop,
  MdClose,
  MdReceiptLong,
  MdAttachFile,
} from "react-icons/md";
import ExpandableTitle from "./ExpandableTitle";
import ExpandableActions, {
  ExpandableActionItem,
} from "../../../../components/common/ExpandableActions";
import { buildSummaryContentPerPersonParts } from "../../../../components/Ventas/Cotizaciones/EdicionCotizacion/utils/summaryContentPricingParts";
import { resolveCotizacionPassengerCounts } from "../utils/cotizacionPassengerCounts";
import { resolveCotizacionIgvInfo } from "../utils/cotizacionIgv";
import {
  canCancelRequest,
  canRequestPostSaleEdit,
  formatRemainingApprovalTime,
  getRequestUiState,
} from "../utils/postSaleEditState";
import "./styles/CotizacionTableRow.scss";

const hashPricingPayload = (value) => {
  let serialized = "";
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    serialized = String(value ?? "");
  }

  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const CotizacionTableRow = ({
  cotizacion,
  isSelected,
  isInactive,
  userRole,
  currentSellerDni = "",
  showAuditColumn = false,
  onRowClick,
  onEdit,
  postSaleEditRequest = null,
  onRequestPostSaleEdit,
  onCancelPostSaleRequest,
  onDuplicateModel,
  onSummary,
  onAgencyPayment,
  onVoucherMedia,
  onViewServices,
  onVoucher,
  onDelete,
  onPdfPreview,
  onTriggerN8N,
  onHistory,
  isProcessingN8N,
  formatDate,
  formatCurrency,
  calculateTotalFinal,
  deletePopover,
  onCancelDelete,
  loadSummaryPricingData,
}) => {
  const isAdmin = userRole === 0;
  const quoteOwnerDni = String(
    cotizacion.createdby ||
      cotizacion.created_by ||
      cotizacion.createdBy ||
      cotizacion.vendedor_dniuser ||
      cotizacion.vendedor_dni ||
      "",
  ).trim();
  const normalizedSellerDni = String(currentSellerDni || "").trim();
  const isOwnQuote =
    Boolean(normalizedSellerDni) && quoteOwnerDni === normalizedSellerDni;
  const canManageOwnQuote = [2, 3].includes(Number(userRole)) && isOwnQuote;
  const canEditOpenQuote = isAdmin || canManageOwnQuote;
  const canCreateSalesVoucher = isAdmin || Number(userRole) === 2;
  const [postSaleClock, setPostSaleClock] = useState(Date.now());
  const postSaleUi = useMemo(
    () => getRequestUiState(postSaleEditRequest, postSaleClock),
    [postSaleEditRequest, postSaleClock],
  );
  const canRequestForQuote = canRequestPostSaleEdit({
    role: userRole,
    actorDni: currentSellerDni,
    ownerDni:
      cotizacion.createdby ||
      cotizacion.created_by ||
      cotizacion.createdBy ||
      cotizacion.vendedor_dniuser ||
      cotizacion.vendedor_dni,
  });
  const postSalePermissionPanel =
    cotizacion.tiene_voucher && onRequestPostSaleEdit ? (
      <div
        className={`post-sale-permission-status post-sale-permission-status--${postSaleUi.tone}`}
      >
        <div className="post-sale-permission-status__icon" aria-hidden="true">
          {postSaleUi.key === "PENDING" ? <MdHourglassTop /> : <MdLock />}
        </div>
        <div className="post-sale-permission-status__content">
          <strong>{postSaleUi.label}</strong>
          {postSaleUi.canEdit && (
            <small>
              Vence en {formatRemainingApprovalTime(postSaleEditRequest, postSaleClock)}
            </small>
          )}
          {postSaleEditRequest?.review_reason && postSaleUi.key === "REJECTED" && (
            <small>{postSaleEditRequest.review_reason}</small>
          )}
          {postSaleEditRequest?.revoke_reason && postSaleUi.key === "REVOKED" && (
            <small>{postSaleEditRequest.revoke_reason}</small>
          )}
        </div>
      </div>
    ) : null;

  React.useEffect(() => {
    if (!postSaleEditRequest?.expires_at || !postSaleUi.canEdit) return undefined;
    const timer = window.setInterval(() => setPostSaleClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [postSaleEditRequest?.expires_at, postSaleUi.canEdit]);
  // Ventas y Reservas solo administran sus propias cotizaciones abiertas.
  // Superadmin conserva la administración global.
  const canDelete =
    (isAdmin || canManageOwnQuote) &&
    !cotizacion.tiene_voucher &&
    !cotizacion.has_voucher_reserva;
  const [showPerPersonPricing, setShowPerPersonPricing] = useState(false);
  const pricingRevision = useMemo(() => {
    const revisionValues = [
      cotizacion.current_version ?? cotizacion.currentVersion ?? "",
      cotizacion.updatedat ?? cotizacion.updatedAt ?? "",
      cotizacion.total_final ?? cotizacion.totalFinal ?? 0,
      cotizacion.subtotal_final ?? cotizacion.subtotalFinal ?? 0,
      cotizacion.precio_it_adulto ?? cotizacion.precioItAdulto ?? 0,
      cotizacion.precio_it_ninos ?? cotizacion.precioItNinos ?? 0,
      cotizacion.precio_it_ext_adulto ?? cotizacion.precioItExtAdulto ?? 0,
      cotizacion.precio_it_ext_ninos ?? cotizacion.precioItExtNinos ?? 0,
      hashPricingPayload(cotizacion.hotel_detalle ?? cotizacion.hotelDetalle ?? null),
      hashPricingPayload(cotizacion.additionalcosts ?? cotizacion.additionalCosts ?? null),
    ];
    return revisionValues.join("|");
  }, [cotizacion]);
  const {
    data: pricingContext = null,
    isLoading: isPricingContextLoading,
    isFetching: isPricingContextFetching,
    isError: isPricingContextError,
  } = useQuery({
    queryKey: [
      "cotizaciones",
      "summary-content-pricing",
      String(cotizacion.id),
      pricingRevision,
    ],
    queryFn: () =>
      loadSummaryPricingData(cotizacion, {
        skipCache: true,
      }),
    enabled:
      showPerPersonPricing &&
      Boolean(cotizacion.id) &&
      typeof loadSummaryPricingData === "function",
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
  const pricingParts = useMemo(
    () =>
      showPerPersonPricing && pricingContext
        ? buildSummaryContentPerPersonParts(pricingContext)
        : [],
    [pricingContext, showPerPersonPricing],
  );
  const passengerCounts = useMemo(
    () => resolveCotizacionPassengerCounts(cotizacion),
    [cotizacion],
  );
  const igvInfo = useMemo(
    () => resolveCotizacionIgvInfo(cotizacion),
    [cotizacion],
  );

  const togglePerPersonPricing = useCallback((event) => {
    event.stopPropagation();
    setShowPerPersonPricing((current) => !current);
  }, []);

  const actionItems: ExpandableActionItem[] = [];

  if (isInactive) {
    if (onSummary) {
      actionItems.push({
        key: "summary",
        label: "Ver resumen",
        icon: <MdVisibility />,
        onClick: onSummary,
        tone: "primary",
      });
    }
    if (isAdmin && onDelete) {
      actionItems.push({
        key: "delete",
        label: "Eliminar cotización",
        icon: <MdDelete />,
        onClick: onDelete,
        tone: "danger",
      });
    }
  } else {
    if (
      onEdit &&
      ((canEditOpenQuote && !cotizacion.tiene_voucher) || postSaleUi.canEdit)
    ) {
      actionItems.push({
        key: "edit",
        label: postSaleUi.canEdit
          ? `Editar venta · ${formatRemainingApprovalTime(postSaleEditRequest, postSaleClock)}`
          : "Editar cotización",
        icon: <MdEdit />,
        onClick: onEdit,
        tone: postSaleUi.canEdit ? "primary" : "primary",
      });
    }
    if (onSummary) {
      actionItems.push({
        key: "summary",
        label: "Ver resumen",
        icon: <MdVisibility />,
        onClick: onSummary,
        tone: "neutral",
      });
    }
    if (onAgencyPayment) {
      actionItems.push({
        key: "agency-payment",
        label: "Ver informe de pago",
        icon: <MdReceiptLong />,
        onClick: onAgencyPayment,
        tone: "info",
      });
    }
    if (onVoucherMedia) {
      actionItems.push({
        key: "voucher-media",
        label: "Archivo del voucher",
        icon: <MdAttachFile />,
        onClick: onVoucherMedia,
        tone: "info",
      });
    }
    if (cotizacion.es_procesado && onPdfPreview) {
      actionItems.push({
        key: "pdf",
        label: "Ver PDF",
        icon: <MdPictureAsPdf />,
        onClick: onPdfPreview,
        tone: "info",
      });
    }
    if (canCreateSalesVoucher && onVoucher && !cotizacion.tiene_voucher) {
      actionItems.push({
        key: "voucher",
        label: "Crear voucher",
        icon: <MdOutlineConfirmationNumber />,
        onClick: onVoucher,
        tone: "primary",
      });
    }
    if (onViewServices && cotizacion.tiene_voucher) {
      actionItems.push({
        key: "services",
        label: "Servicios y pagos",
        icon: <MdOutlineConfirmationNumber />,
        onClick: onViewServices,
        tone: "info",
      });
    }
    if (onDuplicateModel) {
      actionItems.push({
        key: "clone",
        label: "Clonar cotización",
        icon: <MdContentCopy />,
        onClick: onDuplicateModel,
        tone: "neutral",
      });
    }
    if (cotizacion.tiene_voucher && onRequestPostSaleEdit) {
      if (postSaleUi.canRequest && canRequestForQuote) {
        actionItems.push({
          key: "post-sale-request",
          label: "Solicitar edición",
          icon: <MdLockOpen />,
          onClick: onRequestPostSaleEdit,
          tone: "warning",
        });
      } else if (postSaleUi.key === "PENDING") {
        actionItems.push({
          key: "post-sale-pending",
          label: "Solicitud pendiente",
          icon: <MdHourglassTop />,
          onClick: () => {},
          tone: "warning",
          disabled: true,
        });
      }
      if (canCancelRequest(postSaleEditRequest) && onCancelPostSaleRequest) {
        actionItems.push({
          key: "post-sale-cancel",
          label: "Cancelar solicitud",
          icon: <MdClose />,
          onClick: () => onCancelPostSaleRequest(postSaleEditRequest),
          tone: "neutral",
        });
      }
    }
    if (onHistory) {
      actionItems.push({
        key: "history",
        label: "Historial de versiones",
        icon: <MdHistory />,
        onClick: onHistory,
        tone: "neutral",
      });
    }
    if (onTriggerN8N && !cotizacion.es_procesado) {
      actionItems.push({
        key: "pdf-canva",
        label: isProcessingN8N ? "Generando PDF…" : "Generar PDF Canva",
        icon: isProcessingN8N ? (
          <span className="spinner-icon">⟳</span>
        ) : (
          <MdPictureAsPdf />
        ),
        onClick: onTriggerN8N,
        tone: "info",
        disabled: isProcessingN8N,
      });
    }
    if (canDelete && onDelete) {
      actionItems.push({
        key: "delete",
        label: "Eliminar cotización",
        icon: <MdDelete />,
        onClick: onDelete,
        tone: "danger",
      });
    }
  }

  return (
    <>
      <tr
        className={`cotizacion-row styled-row ${isSelected ? "selected" : ""} ${isInactive ? "inactive-record" : ""} ${cotizacion.tiene_voucher ? "has-voucher" : ""}`}
        onClick={onRowClick}
        title={
          isInactive
            ? "Esta cotización está inactiva (duplicada)"
            : cotizacion.tiene_voucher
              ? "Tiene voucher vinculado"
              : ""
        }
      >
        {/* Título con Badge de Inactiva */}
        <td className="col-titulo" data-label="Título">
          <div className="titulo-with-badge">
            {isAdmin && (
              <span className="id-badge" title={`ID: ${cotizacion.id}`}>
                #{cotizacion.id}
              </span>
            )}
            <ExpandableTitle title={cotizacion.titulo} maxLength={45} />
            {isInactive && (
              <span className="inactive-badge" title="Duplicada - Inactiva">
                ⊘ INACTIVA
              </span>
            )}
          </div>
          {(cotizacion.voucher_codes?.length > 0 || cotizacion.voucher_code) && (
            <div className="voucher-badges">
              {Array.from(
                new Set(
                  (cotizacion.voucher_codes || [cotizacion.voucher_code]).filter(
                    Boolean,
                  ),
                ),
              ).map((code, idx) => (
                <span
                  key={`voucher-${code}-${idx}`}
                  className="voucher-code-badge"
                  title={`Voucher vinculado: ${code}`}
                >
                  <MdOutlineConfirmationNumber className="voucher-icon" />
                  {code}
                </span>
              ))}
            </div>
          )}
          <div className="quotation-card-meta">
            <span>{cotizacion.agency_name || cotizacion.agency?.name || "Venso Tours"}</span>
            <span>{formatDate(cotizacion.created_at || cotizacion.fecha)}</span>
          </div>
        </td>

        {/* Detalles: Pasajeros + Tipo + Total unified */}
        <td className="col-detalles detalles-column" data-label="Detalles">
          <div className="detalles-display">
            <div className="detalles-row">
              <span className="detalles-pax">
                <MdPerson className="detalles-icon" />
                {passengerCounts.adults}
                {passengerCounts.children > 0 && (
                  <>
                    {" "}
                    + <MdChildCare className="detalles-icon child-icon" />
                    {passengerCounts.children}
                  </>
                )}
              </span>
              <span
                className={`detalles-type ${cotizacion.packagetype || cotizacion.packageType || "compartido"}`}
              >
                {cotizacion.packagetype === "privado" ||
                cotizacion.packageType === "privado"
                  ? "Privado"
                  : "Compartido"}
              </span>
              {igvInfo.hasIgv && (
                <span
                  className="igv-badge"
                  title={
                    igvInfo.serviceCount > 0
                      ? `IGV aplicado en ${igvInfo.serviceCount} servicio${igvInfo.serviceCount === 1 ? "" : "s"} del itinerario`
                      : "IGV aplicado en el itinerario"
                  }
                >
                  +IGV
                </span>
              )}
            </div>
            <div className="detalles-price-actions">
              <span className="detalles-total">
                {formatCurrency(calculateTotalFinal(cotizacion) || 0)}
              </span>
              <button
                type="button"
                className={`per-person-toggle ${showPerPersonPricing ? "active" : ""}`}
                onClick={togglePerPersonPricing}
                aria-expanded={showPerPersonPricing}
              >
                {showPerPersonPricing ? "Ocultar" : "Ver por persona"}
              </button>
            </div>
            {showPerPersonPricing && (
              <div className="detalles-pricing-parts">
                {pricingParts.length > 0 ? (
                  pricingParts.map((part, index) => (
                    <span
                      key={part.key || `${part.label}-${index}`}
                      className={`pricing-part pricing-part--${part.audience || "adult"}`}
                      title={`${part.label}: ${formatCurrency(part.displayValue ?? part.value ?? 0)} por persona`}
                    >
                      {part.audience === "child" ? <MdChildCare /> : <MdOutlineBed />}
                      <span>{part.label || (part.audience === "child" ? "Niños" : "Adulto")}</span>
                      <strong>{formatCurrency(part.displayValue ?? part.value ?? 0)}</strong>
                    </span>
                  ))
                ) : isPricingContextLoading || isPricingContextFetching ? (
                  <span className="pricing-part-empty" title="Cargando el mismo contexto usado por SummaryContent">
                    Calculando con el resumen de la cotización…
                  </span>
                ) : isPricingContextError ? (
                  <span className="pricing-part-empty" title="No se pudo abrir el contexto del resumen">
                    No se pudo calcular el precio por persona
                  </span>
                ) : (
                  <span className="pricing-part-empty">
                    No hay tarifas por habitación para esta cotización
                  </span>
                )}
              </div>
            )}
          </div>
        </td>

        {/* Plataforma / Creado / Modificado (usuarios con permiso de ver todo) */}
        {showAuditColumn && (
          <td
            className="col-audit audit-column"
            data-label="Plataforma / Creado"
          >
            <div className="audit-display">
              <span className="platform-badge platform-badge--venso">
                {cotizacion.agency_name || cotizacion.agency?.name || "Venso Tours"}
              </span>
              <span
                className="creator-name"
                title={`Creado por: ${cotizacion.creator_name || "Desconocido"}`}
              >
                {cotizacion.creator_name || "Desconocido"}
              </span>
              {cotizacion.updater_name && (
                <span
                  className="updater-name"
                  title={`Modificado por: ${cotizacion.updater_name}`}
                >
                  {cotizacion.updater_name}
                </span>
              )}
            </div>
          </td>
        )}

        {/* Acciones */}
        <td className="col-acciones actions-cell" data-label="Acciones">
          <div className="cotizacion-row__action-menu">
            <ExpandableActions
              actions={actionItems}
              label={`Opciones de ${cotizacion.titulo || "la cotización"}`}
              compact
              panelHeader={postSalePermissionPanel}
            />
          </div>

          {deletePopover.isOpen && deletePopover.id === cotizacion.id && (
            <div
              className="menu-backdrop"
              onClick={(event) => {
                event.stopPropagation();
                onCancelDelete();
              }}
            />
          )}
        </td>
      </tr>

    </>
  );
};

export default CotizacionTableRow;
