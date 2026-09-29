import React, { useState } from "react";
import { FaExchangeAlt } from "react-icons/fa";
import TransferenciaInternaForm from "./TransferenciaInternaForm";
import "./TransferenciasInternas.scss";

/**
 * Componente que renderiza el botón de transferencia y gestiona el modal
 * El formulario está separado en TransferenciaInternaForm para mejor organización
 */
const TransferenciasInternas = ({
  saldos = [],
  selectedYear,
  selectedPlatform,
  refreshData,
}) => {
  const [showModal, setShowModal] = useState(false);

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSuccess = () => {
    // Refrescar datos después de crear una transferencia exitosa
    if (refreshData) {
      refreshData();
    }
  };

  return (
    <>
      {/* Botón para abrir modal de transferencia */}
      <button
        className="btn-transferencia"
        onClick={handleOpenModal}
        disabled={saldos.length < 2}
        title={
          saldos.length < 2
            ? "Se necesitan al menos 2 saldos para transferir"
            : "Realizar transferencia entre cuentas"
        }
      >
        <FaExchangeAlt /> Transferir
      </button>

      {/* Modal de transferencia (componente separado) */}
      <TransferenciaInternaForm
        isOpen={showModal}
        onClose={handleCloseModal}
        saldos={saldos}
        selectedYear={selectedYear}
        selectedPlatform={selectedPlatform}
        onSuccess={handleSuccess}
      />
    </>
  );
};

export default TransferenciasInternas;
