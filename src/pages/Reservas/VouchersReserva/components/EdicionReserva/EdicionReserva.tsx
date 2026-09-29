import React from "react";
import ServiceAssignmentModal from "../ServiceAssignmentModal/ServiceAssignmentModal";
import "./EdicionReserva.scss";

const EdicionReserva = ({
  voucher,
  onBack,
  onSave,
  isProcessing,
  isEditing = false,
}) => {
  const voucherCode = voucher?.voucherCode || voucher?.voucher_code || voucher?.id;

  return (
    <section className="edicion-reserva" data-testid="edicion-reserva">
      <ServiceAssignmentModal
        asPage
        isOpen={true}
        onClose={onBack}
        voucher={voucher}
        onSave={onSave}
        isProcessing={isProcessing}
        isEditing={isEditing}
        pageTitle={`Reserva ${voucherCode || ""}`.trim()}
      />
    </section>
  );
};

export default EdicionReserva;
