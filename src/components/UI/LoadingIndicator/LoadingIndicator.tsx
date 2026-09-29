import React from "react";
import "./LoadingIndicator.scss";

const LoadingIndicator = ({ mensaje = "Cargando...", size = "medium" }) => {
  return (
    <div className={`loading-indicator ${size}`}>
      <div className="spinner"></div>
      <span className="loading-message">{mensaje}</span>
    </div>
  );
};

export default LoadingIndicator;
