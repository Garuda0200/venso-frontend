import React, { useMemo, useState, useEffect } from "react";
import {
  MdEdit,
  MdDelete,
  MdVisibility,
  MdInfoOutline,
  MdWarning,
  MdCheck,
  MdPerson,
  MdCalendarToday,
  MdCheckCircle,
  MdCancel,
  MdPayment, // Icono para gestionar pagos
  MdAttachFile, // Icono para gestionar documentos
  MdReceiptLong,
} from "react-icons/md";
import "./VoucherCard.scss";
import { formatCurrency } from "../../../../../utils/formatters";
import PassengerPortal from "../PassengerPortal/PassengerPortal";
import QuotationVersionHistory from "../../../../Reservas/VouchersReserva/components/QuotationVersionHistory/QuotationVersionHistory";
import pasajeroService from "../../../../../services/pasajeroService"; // Import pasajero service
import { FaRegFilePdf } from "react-icons/fa";
import ExpandableActions, {
  ExpandableActionItem,
} from "../../../../../components/common/ExpandableActions";
import { summarizeVoucherFinancials } from "../../utils/voucherFinancials";
function VoucherCard({
  voucher,
  dataUpdatedAt,
  onEdit,
  onPreview,
  onPreviewPDF, // Callback para vista previa PDF
  onDelete,
  onManagePayments, // Callback para gestionar pagos
  onManageDocuments, // Callback para gestionar documentos
  onVoucherMedia,
  onAgencyPayment,
  userRole = 1,
  allVouchers = [],
}) {
  const [showPassengers, setShowPassengers] = useState(false);
  const [passengers, setPassengers] = useState([]); // Load from API instead of passenger_data
  const [loadingPassengers, setLoadingPassengers] = useState(false);

  // Superadmin y ventas pueden gestionar vouchers desde sus cards.
  const normalizedUserRole = Number(userRole);
  const isSuperAdmin = normalizedUserRole === 0;
  const isVentas = normalizedUserRole === 2;
  const canManageVoucher = isSuperAdmin || isVentas;
  const canDeleteVoucher =
    voucher.can_delete === true || voucher.canDelete === true;

  // Load passengers from API only when user expands the passenger list (lazy load)
  useEffect(() => {
    if (!showPassengers || !voucher?.id) return;
    if (passengers.length > 0) return; // Already loaded

    const loadPassengers = async () => {
      setLoadingPassengers(true);
      try {
        const passengerList = await pasajeroService.getPassengersByVoucherVenta(
          voucher.id,
        );

        // Transform to match expected format with type field
        const transformedPassengers = passengerList.map((p) => ({
          ...p,
          type: p.tipo_pasajero === "adult" ? "adult" : "child",
          firstName: p.nombres,
          lastName: p.apellidos,
          birthDate: p.fecha_nacimiento,
          age: p.edad,
          nationality: p.nacionalidad,
          docType: p.tipo_documento,
          docNumber: p.numero_documento,
          email: p.correo,
          phone: p.telefono,
          notes: p.observaciones,
        }));

        setPassengers(transformedPassengers);
      } catch (error) {
        console.error("Error loading passengers for voucher:", error);
        setPassengers([]);
      } finally {
        setLoadingPassengers(false);
      }
    };

    loadPassengers();
  }, [showPassengers, voucher?.id]);

  // El backend entrega un resumen financiero derivado de cotización + movimientos.
  const paymentData = useMemo(
    () => summarizeVoucherFinancials({ voucher }),
    [voucher, dataUpdatedAt],
  );

  // Ensure ID is a string for display purposes
  const voucherId = String(voucher.id);
  const voucherCode = voucher.voucher_code || `V-${voucherId}`;

  // Format dates
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const createdAt = formatDate(voucher.created_at);

  // Get payment amounts - pull from various possible sources
  const total_final = paymentData.totalFinal;
  const totalPaid = paymentData.totalPaid;
  const paymentPercentage =
    total_final > 0 ? Math.min(100, (totalPaid / total_final) * 100) : 0;

  // Determine payment status
  const getPaymentStatus = () => {
    const status = paymentData.paymentStatus;

    if (status === "completed" || totalPaid >= total_final) {
      return { label: "Completado", icon: <MdCheck />, className: "completed" };
    } else if (status === "partial" || totalPaid > 0) {
      return { label: "Parcial", icon: <MdWarning />, className: "partial" };
    } else {
      return {
        label: "Pendiente",
        icon: <MdInfoOutline />,
        className: "pending",
      };
    }
  };

  const paymentStatus = getPaymentStatus();

  const actionItems = useMemo<ExpandableActionItem[]>(() => {
    const items: ExpandableActionItem[] = [];

    if (onPreview) {
      items.push({
        key: "preview",
        label: "Ver voucher",
        icon: <MdVisibility />,
        onClick: () => onPreview(voucher),
        tone: "primary",
      });
    }
    if (onPreviewPDF) {
      items.push({
        key: "pdf",
        label: "Ver PDF",
        icon: <FaRegFilePdf />,
        onClick: () => onPreviewPDF(voucher),
        tone: "info",
      });
    }
    if (onManagePayments) {
      items.push({
        key: "payments",
        label: "Gestionar pagos",
        icon: <MdPayment />,
        onClick: () => onManagePayments(voucher),
        tone: paymentStatus.className === "completed" ? "primary" : "warning",
      });
    }
    if (onAgencyPayment) {
      items.push({
        key: "agency-payment",
        label: "Ver informe de pago",
        icon: <MdReceiptLong />,
        onClick: () => onAgencyPayment(voucher),
        tone: "info",
      });
    }
    if (onVoucherMedia) {
      items.push({
        key: "voucher-media",
        label: "Archivo del voucher",
        icon: <MdAttachFile />,
        onClick: () => onVoucherMedia(voucher),
        tone: "info",
      });
    }
    if (onManageDocuments) {
      items.push({
        key: "documents",
        label: "Gestionar documentos",
        icon: <MdAttachFile />,
        onClick: () => onManageDocuments(voucher),
        tone: "neutral",
      });
    }
    if (onEdit && (canManageVoucher || voucher.status === "EDITABLE_ONCE")) {
      items.push({
        key: "edit",
        label: "Editar voucher",
        icon: <MdEdit />,
        onClick: () => onEdit(voucher),
        tone: voucher.status === "EDITABLE_ONCE" ? "warning" : "primary",
      });
    }
    if (onDelete && canManageVoucher && canDeleteVoucher) {
      items.push({
        key: "delete",
        label: "Eliminar voucher",
        icon: <MdDelete />,
        onClick: () => onDelete(voucher.id),
        tone: "danger",
      });
    }

    return items;
  }, [
    canDeleteVoucher,
    canManageVoucher,
    onDelete,
    onEdit,
    onAgencyPayment,
    onManageDocuments,
    onVoucherMedia,
    onManagePayments,
    onPreview,
    onPreviewPDF,
    paymentStatus.className,
    voucher,
  ]);

  // Passenger counts from backend summary (instant, no lazy-load needed)
  const paxSummary = voucher.passenger_summary;
  const totalPassengers = paxSummary?.total || 0;
  const adultCount = paxSummary?.adults || 0;
  const childCount = paxSummary?.children || 0;
  const paxCompleteness = paxSummary?.completeness ?? 0;
  const paxCompleteCount = paxSummary?.complete_count ?? 0;

  return (
    <article className={`voucher-sale-row ${voucher.is_active === false ? "is-inactive" : "is-active"}`}>
      <section className="voucher-sale-row__identity">
        <span className="voucher-sale-row__eyebrow">Voucher de venta</span>
        <strong className="voucher-sale-row__code">{voucherCode}</strong>
        <span className="voucher-sale-row__quote">
          Cotización {voucher.cotizacion_id || voucher.cotizacion_data?.id || voucher.cotizacion?.id || "N/A"}
        </span>
        <span
          className={`voucher-sale-row__reservation ${
            voucher.has_voucher_reserva ? "has-reservation" : "no-reservation"
          }`}
        >
          {voucher.has_voucher_reserva ? <MdCheckCircle /> : <MdCancel />}
          {voucher.has_voucher_reserva ? "Con reserva" : "Sin reserva"}
        </span>
      </section>

      <section className="voucher-sale-row__people">
        <button
          type="button"
          className="voucher-sale-row__passenger-button"
          onClick={() => setShowPassengers(true)}
        >
          <MdPerson />
          <span>
            <strong>{totalPassengers}</strong> pasajeros
            <small>{adultCount} adultos · {childCount} niños</small>
          </span>
        </button>
        {totalPassengers > 0 && (
          <div className="voucher-sale-row__completion" title={`${paxCompleteCount} de ${totalPassengers} pasajeros completos`}>
            <span>Datos {paxCompleteness}%</span>
            <div><i style={{ width: `${paxCompleteness}%` }} /></div>
          </div>
        )}
        <div className="voucher-sale-row__audit">
          <span><MdCalendarToday /> {createdAt}</span>
          <span><MdPerson /> {voucher.created_by_name || voucher.created_by || "Desconocido"}</span>
        </div>
      </section>

      <section className="voucher-sale-row__payment">
        <div className="voucher-sale-row__payment-heading">
          <span className={`payment-state ${paymentStatus.className}`}>
            {paymentStatus.icon} {paymentStatus.label}
          </span>
          <strong>{paymentPercentage.toFixed(0)}%</strong>
        </div>
        <div className="voucher-sale-row__payment-bar">
          <i style={{ width: `${paymentPercentage}%` }} />
        </div>
        <div className="voucher-sale-row__amounts">
          <span>Pagado <strong>{formatCurrency(totalPaid)}</strong></span>
          <span>Total <strong>{formatCurrency(total_final)}</strong></span>
        </div>
      </section>

      <nav className="voucher-sale-row__actions" aria-label={`Acciones de ${voucherCode}`}>
        <ExpandableActions
          actions={actionItems}
          label={`Opciones de ${voucherCode}`}
          compact
        />
      </nav>

      <div className="voucher-sale-row__versions">
        <QuotationVersionHistory
          voucher={voucher}
          variant="header"
          label="Versiones de la venta"
        />
      </div>

      {showPassengers && (
        <PassengerPortal
          passengers={passengers}
          onClose={() => setShowPassengers(false)}
          loading={loadingPassengers}
        />
      )}
    </article>
  );
}

export default VoucherCard;
