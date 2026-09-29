// src/components/LogoutModal/LogoutModal.js
import React, { useEffect, useRef, useState } from "react";
import "./LogoutModal.scss";
import { FaSignOutAlt, FaTimes } from "react-icons/fa";
import ReactDOM from "react-dom";

/**
 * Modal dialog that asks for logout confirmation
 *
 * @param {Object} props - Component props
 * @param {boolean} props.show - Whether the modal should be visible
 * @param {Function} props.onClose - Handler for closing the modal
 * @param {Function} props.onConfirm - Handler for confirming the logout
 * @param {Object} props.position - Position data for positioning the modal
 * @param {number} props.position.x - X-coordinate for modal positioning
 * @param {number} props.position.y - Y-coordinate for modal positioning
 * @param {boolean} props.isCollapsed - Whether the sidebar is collapsed
 * @returns {React.ReactNode} The logout confirmation modal
 */
const LogoutModal = ({
  show,
  onClose,
  onConfirm,
  position,
  isCollapsed,
  placement,
}) => {
  const modalRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // Handle animation timing for entrance and exit
  useEffect(() => {
    if (show) {
      // Slight delay to ensure the DOM is ready before animation
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [show]);

  useEffect(() => {
    if (!show) return;

    // Handle click outside to close
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    // Handle escape key to close
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [show, onClose]);

  // Ensure the modal is repositioned correctly when viewport size changes
  useEffect(() => {
    if (!show || !modalRef.current) return;

    const handleResize = () => {
      adjustModalPosition();
    };

    const adjustModalPosition = () => {
      if (!modalRef.current) return;

      const modal = modalRef.current;
      const rect = modal.getBoundingClientRect();

      // Adjust for right overflow
      if (rect.right > window.innerWidth) {
        modal.style.left = `${window.innerWidth - rect.width - 10}px`;
      }

      // Adjust for left overflow
      if (rect.left < 0) {
        modal.style.left = "10px";
      }

      // Adjust for bottom overflow
      if (rect.bottom > window.innerHeight) {
        modal.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
    };

    // Initial position adjustment
    adjustModalPosition();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [show, position, isCollapsed]);

  // Added effect to handle body overflow to prevent scrolling while modal is open
  useEffect(() => {
    if (show) {
      // Prevent scrolling of the body when modal is open
      document.body.style.overflow = "hidden";
    } else {
      // Re-enable scrolling when modal is closed
      document.body.style.overflow = "";
    }

    return () => {
      // Clean up by re-enabling scrolling when component unmounts
      document.body.style.overflow = "";
    };
  }, [show]);

  if (!show) return null;

  // Calculate position based on placement
  const isBottom = placement === "bottom";
  const modalStyle = {
    position: "fixed",
    top: `${position.y}px`,
    left: isBottom
      ? `${position.x - 140}px` // center the 280px modal on the button
      : isCollapsed
        ? `${position.x + 40}px`
        : `${position.x - 150}px`,
    transform: isBottom ? "none" : "translateY(-100%)",
  };

  const arrowClass = isBottom ? "arrow-top" : isCollapsed ? "arrow-left" : "";

  // Use ReactDOM.createPortal to ensure the modal is rendered directly in the document body
  // This prevents any parent components' CSS from affecting its z-index or visibility
  return ReactDOM.createPortal(
    <div className={`logout-modal-backdrop ${isVisible ? "visible" : ""}`}>
      <div
        className={`logout-modal ${isVisible ? "show" : ""} ${isBottom ? "placement-bottom" : ""}`}
        style={modalStyle}
        ref={modalRef}
      >
        <div className={`popover-arrow ${arrowClass}`}></div>

        <button className="close-button" onClick={onClose}>
          <FaTimes />
        </button>

        <div className="modal-content">
          <div className="icon-container">
            <FaSignOutAlt className="logout-icon" />
          </div>
          <h3>¿Cerrar sesión?</h3>
          <p>¿Está seguro que desea cerrar la sesión?</p>

          <div className="button-container">
            <button className="cancel-button" onClick={onClose}>
              Cancelar
            </button>
            <button className="confirm-button" onClick={onConfirm}>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body, // Render directly to the body element
  );
};

export default LogoutModal;
