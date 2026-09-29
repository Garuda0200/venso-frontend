import React from "react";
import { MdError, MdWarning, MdInfo, MdCheckCircle } from "react-icons/md";
import "./MessageDisplay.scss";

const MessageDisplay = ({
  type = "info",
  message,
  title,
  onClose,
  className = "",
}) => {
  const getIcon = () => {
    switch (type) {
      case "error":
        return <MdError />;
      case "warning":
        return <MdWarning />;
      case "success":
        return <MdCheckCircle />;
      case "info":
      default:
        return <MdInfo />;
    }
  };

  return (
    <div className={`message-display ${type} ${className}`}>
      <div className="message-icon">{getIcon()}</div>
      <div className="message-content">
        {title && <div className="message-title">{title}</div>}
        <div className="message-text">{message}</div>
      </div>
      {onClose && (
        <button className="message-close" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
};

export default MessageDisplay;
