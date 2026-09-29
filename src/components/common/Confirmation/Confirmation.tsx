import React from "react";
import styles from "./Confirmation.module.scss"; // Importar los estilos como un objeto

export function Confirmation({ isOpen, onClose, onConfirm, message }) {
  if (!isOpen) return null; // Si el modal no está abierto, no se renderiza

  return (
    <div className={styles["modal-overlay"]}>
      <div className={styles["modal"]}>
        <h3>{message || "¿Estás seguro de continuar?"}</h3>
        <div className={styles["modal-actions"]}>
          <button
            className={`${styles["modal-button"]} ${styles["cancel"]}`}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className={`${styles["modal-button"]} ${styles["confirm"]}`}
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
