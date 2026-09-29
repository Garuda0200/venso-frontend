import React, { useEffect, useRef, useState, useCallback } from "react";
import { FaTimes, FaArrowLeft } from "react-icons/fa";

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "medium",
  closeOnEscape = true,
  closeOnOverlayClick = true,
}) => {
  const modalContentRef = useRef(null);
  const overlayRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const prevIsOpenRef = useRef(false);

  // Keep onClose ref updated without triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Track whether mousedown started on the overlay itself
  const [mouseDownOnOverlay, setMouseDownOnOverlay] = useState(false);

  // Effect for initial setup and cleanup
  useEffect(() => {
    const handleEscapeKey = (e) => {
      if (closeOnEscape && e.key === "Escape" && isOpen) {
        onCloseRef.current();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      // Prevent scroll of the body when modal is open
      document.body.style.overflow = "hidden";

      // Focus the close button only on initial open, not on re-renders
      if (!prevIsOpenRef.current && closeButtonRef.current) {
        closeButtonRef.current.focus();
      }
      prevIsOpenRef.current = true;

      // Add global mouseup handler to reset mousedown state
      const handleGlobalMouseUp = () => {
        setMouseDownOnOverlay(false);
      };

      document.addEventListener("mouseup", handleGlobalMouseUp);

      return () => {
        document.removeEventListener("keydown", handleEscapeKey);
        document.removeEventListener("mouseup", handleGlobalMouseUp);
        // Restore scroll when component unmounts or modal closes
        document.body.style.overflow = "auto";
      };
    }

    prevIsOpenRef.current = false;
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  // Handle mousedown on overlay - track that mouse down started on overlay
  const handleOverlayMouseDown = (e) => {
    // Only set flag if target is actually the overlay (not bubbled from children)
    if (e.target === e.currentTarget) {
      setMouseDownOnOverlay(true);
    }
  };

  // Handle mouseup on overlay - only close if mousedown also started on overlay
  const handleOverlayMouseUp = (e) => {
    // Only close if:
    // 1. closeOnOverlayClick is enabled
    // 2. Target is actually the overlay itself
    // 3. Mouse down also started on the overlay (not inside the modal)
    if (
      closeOnOverlayClick &&
      e.target === e.currentTarget &&
      mouseDownOnOverlay &&
      !e.isPropagationStopped()
    ) {
      // Add a visual effect before closing
      if (overlayRef.current) {
        overlayRef.current.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
        setTimeout(() => {
          overlayRef.current.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
          onCloseRef.current();
        }, 150);
      } else {
        onCloseRef.current();
      }
    }

    // Reset the flag regardless
    setMouseDownOnOverlay(false);
  };

  // Handle click on overlay (for compatibility with older browsers)
  const handleOverlayClick = (e) => {
    // This is a fallback handler for browsers where mousedown/mouseup tracking might fail
    // We'll only process it if we can verify both down and up were on overlay
    if (
      e.type === "click" &&
      e.target === e.currentTarget &&
      mouseDownOnOverlay
    ) {
      e.preventDefault();
    }
  };

  // Stop propagation for all content interactions
  const handleContentInteractions = (e) => {
    e.stopPropagation();
    // Clear the mousedown flag when interacting with content
    setMouseDownOnOverlay(false);
  };

  // Handle close button clicks - with a preventDefault to be safe
  const handleCloseClick = (e) => {
    if (e) e.preventDefault();
    e.stopPropagation();

    // Trigger modal close animation if desired
    if (modalContentRef.current) {
      modalContentRef.current.classList.add("modal-closing");
      setTimeout(() => onCloseRef.current(), 150);
    } else {
      onCloseRef.current();
    }
  };

  const modalSizeClass =
    {
      small: "modal-content-small",
      medium: "modal-content-medium",
      large: "modal-content-large",
      full: "modal-content-full",
    }[size] || "modal-content-medium";

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalContentRef}
        className={`modal-content ${modalSizeClass}`}
        onClick={handleContentInteractions}
        onMouseDown={handleContentInteractions}
        onMouseUp={handleContentInteractions}
        onMouseMove={handleContentInteractions}
        onDoubleClick={handleContentInteractions}
      >
        <div className="modal-header">
          {/* Left close button */}
          <button
            ref={closeButtonRef}
            type="button"
            className="modal-close-button modal-back-button"
            onClick={handleCloseClick}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <FaArrowLeft />
          </button>

          <h2 id="modal-title">{title}</h2>

          {/* Right close button */}
          <button
            type="button"
            className="modal-close-button"
            onClick={handleCloseClick}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <FaTimes />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
