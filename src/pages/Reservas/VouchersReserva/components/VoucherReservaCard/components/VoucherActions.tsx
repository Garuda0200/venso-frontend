import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MdVisibility,
  MdAssignment,
  MdViewList,
  MdDelete,
  MdClose,
  MdWarningAmber,
  MdPayment,
  MdFolderOpen,
  MdPermMedia,
  MdAssessment,
  MdPictureAsPdf,
  MdPeople,
} from "react-icons/md";
import ExpandableActions, {
  ExpandableActionItem,
} from "../../../../../../components/common/ExpandableActions";
import "./VoucherActions.scss";

const VoucherActions = ({
  voucher,
  servicesAssigned,
  onViewVoucher,
  onVoucherMedia,
  onAgencyPayment,
  onPreviewPDF,
  onAssignServices,
  onViewServicesSummary,
  onUnlinkServices,
  onManagePayments,
  onManageQuotationPayments,
  onEditPassengers,
  onManageDocuments,
  userRole,
  paymentCompleted,
}) => {
  const isSuperAdmin = Number(userRole) === 0;
  const [showDeletePopover, setShowDeletePopover] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletePopoverRef = useRef(null);

  useEffect(() => {
    if (!showDeletePopover) return undefined;

    const handleOutsideClick = (event) => {
      if (
        deletePopoverRef.current &&
        !deletePopoverRef.current.contains(event.target)
      ) {
        setShowDeletePopover(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setShowDeletePopover(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDeletePopover]);

  const handleConfirmDelete = async () => {
    if (!onUnlinkServices || isDeleting) return;

    try {
      setIsDeleting(true);
      const deleted = await onUnlinkServices(voucher);
      if (deleted !== false) setShowDeletePopover(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const actionItems = useMemo<ExpandableActionItem[]>(() => {
    const items: ExpandableActionItem[] = [];

    if (onAssignServices) {
      items.push({
        key: "assign",
        label: servicesAssigned ? "Revisar validaciones" : "Validar servicios",
        icon: <MdAssignment />,
        onClick: () => onAssignServices(voucher),
        tone: "primary",
      });
    }
    if (onViewServicesSummary && servicesAssigned) {
      items.push({
        key: "summary",
        label: "Resumen de servicios",
        icon: <MdViewList />,
        onClick: () => onViewServicesSummary(voucher),
        tone: "neutral",
      });
    }
    if (onManagePayments && servicesAssigned) {
      items.push({
        key: "payments",
        label: paymentCompleted ? "Historial de pagos de servicios" : "Pagos de servicios",
        icon: <MdPayment />,
        onClick: () => onManagePayments(voucher),
        tone: paymentCompleted ? "primary" : "warning",
      });
    }
    if (onManageQuotationPayments) {
      items.push({
        key: "quotation-payments",
        label: "Pagos de la cotización",
        icon: <MdPayment />,
        onClick: () => onManageQuotationPayments(voucher),
        tone: "warning",
      });
    }
    if (onEditPassengers) {
      items.push({
        key: "passengers",
        label: "Información de pasajeros",
        icon: <MdPeople />,
        onClick: () => onEditPassengers(voucher),
        tone: "primary",
      });
    }
    if (onAgencyPayment) {
      items.push({
        key: "agency-payment",
        label: "Ver informe de pago",
        icon: <MdAssessment />,
        onClick: () => onAgencyPayment(voucher),
        tone: "success",
      });
    }
    if (onVoucherMedia) {
      items.push({
        key: "voucher-media",
        label: "Archivo del voucher",
        icon: <MdPermMedia />,
        onClick: () => onVoucherMedia(voucher),
        tone: "info",
      });
    }
    if (onViewVoucher) {
      items.push({
        key: "voucher",
        label: "Ver voucher de venta",
        icon: <MdVisibility />,
        onClick: () => onViewVoucher(voucher),
        tone: "neutral",
      });
    }
    if (onPreviewPDF) {
      items.push({
        key: "pdf",
        label: "Ver PDF",
        icon: <MdPictureAsPdf />,
        onClick: () => onPreviewPDF(voucher),
        tone: "info",
      });
    }
    if (onManageDocuments) {
      items.push({
        key: "documents",
        label: "Gestionar documentos",
        icon: <MdFolderOpen />,
        onClick: () => onManageDocuments(voucher),
        tone: "neutral",
      });
    }
    if (
      onUnlinkServices &&
      voucher.reservationVoucher?.canDelete === true &&
      isSuperAdmin
    ) {
      items.push({
        key: "delete",
        label: "Eliminar reserva",
        icon: <MdDelete />,
        onClick: () => setShowDeletePopover(true),
        tone: "danger",
      });
    }

    return items;
  }, [
    isSuperAdmin,
    onAgencyPayment,
    onAssignServices,
    onManageDocuments,
    onManagePayments,
    onManageQuotationPayments,
    onEditPassengers,
    onPreviewPDF,
    onVoucherMedia,
    onUnlinkServices,
    onViewServicesSummary,
    onViewVoucher,
    paymentCompleted,
    servicesAssigned,
    voucher,
  ]);

  return (
    <div className="voucher-actions" ref={deletePopoverRef}>
      <ExpandableActions
        actions={actionItems}
        label={`Opciones de ${voucher.voucher_code || "la reserva"}`}
        compact
        maxInline={3}
      />

      {showDeletePopover && (
        <div
          className="delete-confirmation-popover"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`delete-voucher-title-${voucher.id}`}
        >
          <div className="delete-confirmation-popover__header">
            <span className="delete-confirmation-popover__icon">
              <MdWarningAmber />
            </span>
            <div>
              <strong id={`delete-voucher-title-${voucher.id}`}>
                Eliminar voucher de reserva
              </strong>
              <span>{voucher.voucher_code || "Voucher seleccionado"}</span>
            </div>
            <button
              type="button"
              className="delete-confirmation-popover__close"
              onClick={() => setShowDeletePopover(false)}
              aria-label="Cerrar confirmación"
              disabled={isDeleting}
            >
              <MdClose />
            </button>
          </div>

          <p>
            Se eliminará el voucher de reserva. Esta acción no se puede
            deshacer.
          </p>
          <small>
            Disponible porque no existen asignaciones, solicitudes ni pagos
            registrados.
          </small>

          <div className="delete-confirmation-popover__actions">
            <button
              type="button"
              className="delete-confirmation-popover__cancel"
              onClick={() => setShowDeletePopover(false)}
              disabled={isDeleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="delete-confirmation-popover__confirm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              <MdDelete />
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoucherActions;
