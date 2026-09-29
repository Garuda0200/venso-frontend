import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { FaCoins, FaPen, FaPlus, FaTimes } from "react-icons/fa";
import TarifaForm from "./TarifaForm";
import "./TarifaFormPopover.scss";

type Position = {
  top: number;
  left: number;
  arrowLeft: number;
};

const TarifaFormPopover = ({
  tarifa = null,
  serviceId,
  serviceType,
  agencyId,
  existingTarifas,
  onSubmit,
  disabled = false,
  isSubmitting = false,
  triggerClassName = "",
  triggerLabel = "",
  triggerTitle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const isEditMode = Boolean(tarifa);

  const closePopover = useCallback(() => {
    if (isSubmitting) return;
    setIsOpen(false);
    setPosition(null);
  }, [isSubmitting]);

  const updatePosition = useCallback(() => {
    if (!isOpen || !triggerRef.current || !popoverRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const margin = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextPlacement: "bottom" | "top" = "bottom";
    let top = triggerRect.bottom + margin;
    let left = triggerRect.right - popoverRect.width;

    left = Math.max(
      margin,
      Math.min(left, viewportWidth - popoverRect.width - margin),
    );

    const doesNotFitBelow = top + popoverRect.height + margin > viewportHeight;
    const fitsAbove = triggerRect.top - popoverRect.height - margin >= margin;

    if (doesNotFitBelow && fitsAbove) {
      nextPlacement = "top";
      top = triggerRect.top - popoverRect.height - margin;
    } else {
      top = Math.min(
        top,
        Math.max(margin, viewportHeight - popoverRect.height - margin),
      );
    }

    const arrowLeft = Math.max(18, Math.min(
      triggerRect.left + triggerRect.width / 2 - left,
      popoverRect.width - 18,
    ));

    setPlacement(nextPlacement);
    setPosition({ top: Math.max(margin, top), left, arrowLeft });
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || !popoverRef.current) return undefined;

    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() => updatePosition());
    observer.observe(popoverRef.current);
    return () => observer.disconnect();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      closePopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    const handleViewportChange = (event: Event) => {
      const target = event.target as Node | null;
      if (event.type === "scroll" && target && popoverRef.current?.contains(target)) {
        return;
      }
      closePopover();
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [closePopover, isOpen]);

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || isSubmitting) return;
    setIsOpen((current) => !current);
  };

  const handleSubmit = async (formData) => {
    if (!formData) {
      closePopover();
      return;
    }

    try {
      await onSubmit(formData);
      setIsOpen(false);
      setPosition(null);
    } catch {
      // El gestor padre muestra el error y el popover permanece abierto.
    }
  };

  const popoverStyle = position
    ? ({
        position: "fixed" as const,
        top: position.top,
        left: position.left,
        "--tarifa-form-arrow-left": `${position.arrowLeft}px`,
      } as React.CSSProperties)
    : ({ position: "fixed" as const, top: -9999, left: 0 } as React.CSSProperties);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`tarifa-form-popover-trigger ${triggerClassName} ${isOpen ? "active" : ""}`}
        onClick={handleTriggerClick}
        disabled={disabled || isSubmitting}
        title={
          triggerTitle || (isEditMode ? "Editar tarifa" : "Agregar tarifa")
        }
        aria-expanded={isOpen}
      >
        {isEditMode ? <FaPen /> : <FaPlus />}
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>

      {isOpen &&
        ReactDOM.createPortal(
          <div
            ref={popoverRef}
            className={`tarifa-form-popover ${placement}`}
            style={popoverStyle}
            role="dialog"
            aria-modal="false"
            aria-label={isEditMode ? "Editar tarifa" : "Agregar tarifa"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tarifa-form-popover__arrow" />
            <div className="tarifa-form-popover__header">
              <span className="tarifa-form-popover__title">
                <FaCoins />
                <span>
                  <strong>{isEditMode ? "Editar tarifa" : "Agregar tarifa"}</strong>
                  <small>Catálogo activo</small>
                </span>
              </span>
              <button
                type="button"
                className="tarifa-form-popover__close"
                onClick={closePopover}
                disabled={isSubmitting}
                title="Cerrar"
                aria-label="Cerrar formulario"
              >
                <FaTimes />
              </button>
            </div>

            <div className="tarifa-form-popover__body">
              <TarifaForm
                key={tarifa?.id_tarifa || `new-${serviceId}-${agencyId}`}
                tarifa={tarifa}
                idServicio={serviceId}
                tipoServicio={serviceType}
                agencyId={agencyId}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                existingTarifasData={existingTarifas}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default TarifaFormPopover;
