import React, { useState } from "react";
import { FaClock } from "react-icons/fa";
import { usePendingPaymentRequests } from "../../hooks/usePendingPaymentRequests";
import PendingPaymentsModal from "./PendingPaymentsModal";
import MovimientoForm from "./MovimientoForm";
import "./PendingPaymentsAccess.scss";

export default function PendingPaymentsAccess({ onPaymentSaved }: { onPaymentSaved?: () => void }) {
  const pending = usePendingPaymentRequests();
  const [isOpen, setIsOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  return (
    <>
      <button type="button" className="accounting-pending-access" onClick={() => setIsOpen(true)}>
        <FaClock aria-hidden="true" /> Pagos pendientes
        <span aria-label={pending.isError ? "Error al consultar pendientes" : "Cantidad de solicitudes pendientes"}>
          {pending.isError ? "!" : pending.isLoading ? "…" : pending.data?.length ?? 0}
        </span>
      </button>
      <PendingPaymentsModal isOpen={isOpen} onClose={() => setIsOpen(false)} onPaymentSelect={(data) => {
        setIsOpen(false);
        setPaymentData(data);
      }} />
      {paymentData && <MovimientoForm tipo="egreso" isOpen initialData={paymentData}
        onClose={() => setPaymentData(null)} onSuccess={() => {
          setPaymentData(null);
          void pending.refetch();
          onPaymentSaved?.();
        }} />}
    </>
  );
}
