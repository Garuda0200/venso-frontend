import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { voucherVentaService } from "../../../../services/voucherVentaService";

function useActionButtons(handleRefresh, setSortedCotizaciones) {
  const navigate = useNavigate();

  // Estados para menús desplegables
  const [expandedActionsId, setExpandedActionsId] = useState(null);
  const [expandedPdfId, setExpandedPdfId] = useState(null);
  const [actionTimers, setActionTimers] = useState({});
  const [pdfTimers, setPdfTimers] = useState({});

  // Función para abrir/cerrar menús de acciones
  const toggleActionButtons = (id, e) => {
    if (e) e.stopPropagation();

    // Limpiar cualquier temporizador existente para este ID
    if (actionTimers[id]) {
      clearTimeout(actionTimers[id]);
      setActionTimers((prev) => {
        const newTimers = { ...prev };
        delete newTimers[id];
        return newTimers;
      });
    }

    // Si ya está expandido, ocultarlo
    if (expandedActionsId === id) {
      setExpandedActionsId(null);
      return;
    }

    // Contraer otros botones si están expandidos
    setExpandedPdfId(null);
    if (pdfTimers[expandedPdfId]) {
      clearTimeout(pdfTimers[expandedPdfId]);
      setPdfTimers((prev) => {
        const newTimers = { ...prev };
        delete newTimers[expandedPdfId];
        return newTimers;
      });
    }

    // Expandir este botón
    setExpandedActionsId(id);

    // Configurar un temporizador para contraer automáticamente después de 10 segundos (aumentado para dar más tiempo)
    const timerId = setTimeout(() => {
      setExpandedActionsId((prev) => (prev === id ? null : prev));
    }, 10000);

    // Guardar la referencia del temporizador
    setActionTimers((prev) => ({
      ...prev,
      [id]: timerId,
    }));
  };

  // Función para abrir/cerrar menús de PDF
  const togglePdfButtons = (id, e) => {
    if (e) e.stopPropagation();

    // Limpiar cualquier temporizador existente para este ID
    if (pdfTimers[id]) {
      clearTimeout(pdfTimers[id]);
      setPdfTimers((prev) => {
        const newTimers = { ...prev };
        delete newTimers[id];
        return newTimers;
      });
    }

    // Si ya está expandido, ocultarlo
    if (expandedPdfId === id) {
      setExpandedPdfId(null);
      return;
    }

    // Contraer otros botones si están expandidos
    setExpandedActionsId(null);
    if (actionTimers[expandedActionsId]) {
      clearTimeout(actionTimers[expandedActionsId]);
      setActionTimers((prev) => {
        const newTimers = { ...prev };
        delete newTimers[expandedActionsId];
        return newTimers;
      });
    }

    // Expandir este botón
    setExpandedPdfId(id);

    // Configurar un temporizador para contraer automáticamente después de 10 segundos (aumentado)
    const timerId = setTimeout(() => {
      setExpandedPdfId((prev) => (prev === id ? null : prev));
    }, 10000);

    // Guardar la referencia del temporizador
    setPdfTimers((prev) => ({
      ...prev,
      [id]: timerId,
    }));
  };

  // Función para manejar la acción y luego contraer el botón
  const handleActionClick = (action, id) => {
    if (typeof action === "function") {
      // Esto ayuda con los problemas de propagación de eventos
      setTimeout(() => {
        action();

        // Contraer el botón
        setExpandedActionsId(null);

        // Limpiar el temporizador si existe
        if (actionTimers[id]) {
          clearTimeout(actionTimers[id]);
          setActionTimers((prev) => {
            const newTimers = { ...prev };
            delete newTimers[id];
            return newTimers;
          });
        }
      }, 50);
    }
  };

  // Función para manejar la acción de PDF y luego contraer el botón
  const handlePdfClick = (action, id) => {
    // Ejecutar la acción después de un pequeño retraso
    // Esto ayuda con los problemas de propagación de eventos
    setTimeout(() => {
      action();

      // Contraer el botón
      setExpandedPdfId(null);

      // Limpiar el temporizador si existe
      if (pdfTimers[id]) {
        clearTimeout(pdfTimers[id]);
        setPdfTimers((prev) => {
          const newTimers = { ...prev };
          delete newTimers[id];
          return newTimers;
        });
      }
    }, 50);
  };

  // Handle generating a voucher from cotizacion
  const handleVoucher = async (cotizacion) => {
    try {
      if (!cotizacion || !cotizacion.id) {
        console.error("No valid cotizacion provided for voucher creation");
        return;
      }

      // Check if a voucher already exists for this cotizacion
      try {
        const response = await voucherVentaService.getVouchersByCotizacion(
          cotizacion.id,
        );

        if (response.success && response.data && response.data.length > 0) {
          // Existing voucher found - navigate to edit it
          const existingVoucher = response.data[0];

          navigate("/ventas/vouchers", {
            state: {
              action: "edit",
              voucherId: existingVoucher.id,
              voucherData: existingVoucher,
            },
          });
        } else {
          // No voucher exists - directly open create modal with this cotizacion
          navigate("/ventas/vouchers", {
            state: {
              action: "create",
              cotizacionData: cotizacion,
            },
          });
        }
      } catch (error) {
        console.error("Error checking for existing vouchers:", error);

        // If API call fails, still try to create a new voucher
        navigate("/ventas/vouchers", {
          state: {
            action: "create",
            cotizacionData: cotizacion,
          },
        });
      }
    } catch (error) {
      console.error("Error in handleVoucher:", error);
    }
  };

  // Cerrar menús al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      const actionMenu = document.querySelector(
        ".expanded-buttons:not(.pdf-buttons)",
      );
      const pdfMenu = document.querySelector(".expanded-buttons.pdf-buttons");

      // Si hicimos clic fuera de los menús y hay alguno abierto, cerrarlo
      if (
        expandedActionsId &&
        actionMenu &&
        !actionMenu.contains(event.target) &&
        !event.target.closest(".action-main-btn")
      ) {
        setExpandedActionsId(null);
      }

      if (
        expandedPdfId &&
        pdfMenu &&
        !pdfMenu.contains(event.target) &&
        !event.target.closest(".pdf-btn")
      ) {
        setExpandedPdfId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expandedActionsId, expandedPdfId]);

  // Limpiar temporizadores al desmontar
  useEffect(() => {
    return () => {
      // Limpiar todos los temporizadores activos
      Object.values(actionTimers).forEach((timerId) => clearTimeout(timerId));
      Object.values(pdfTimers).forEach((timerId) => clearTimeout(timerId));
    };
  }, [actionTimers, pdfTimers]);

  return {
    expandedActionsId,
    expandedPdfId,
    actionTimers,
    pdfTimers,
    toggleActionButtons,
    togglePdfButtons,
    handleActionClick,
    handlePdfClick,
    handleVoucher,
    setExpandedActionsId,
    setExpandedPdfId,
  };
}

export { useActionButtons };
export default useActionButtons;
