import React, { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import "./Modal.scss";

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  actions = [],
  size = "medium",
  className = "",
  showCloseButton = true,
}) => {
  const modalRef = useRef(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className={`modal-container ${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          {showCloseButton && (
            <button className="close-button" onClick={onClose}>
              <MdClose />
            </button>
          )}
        </div>

        <div className="modal-body">{children}</div>

        {actions.length > 0 && (
          <div className="modal-footer">
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                className={`modal-action-btn ${action.variant || "primary"}`}
                disabled={action.disabled}
              >
                {action.icon && (
                  <span className="button-icon">{action.icon}</span>
                )}
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
