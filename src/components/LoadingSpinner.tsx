// src/components/LoadingSpinner.js
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import "./LoadingSpinner.scss";

const LoadingSpinner = ({
  message = "Cargando...",
  title = "Venso Tours",
  showProgress = false,
}) => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-spinner-container">
      <div className="loading-decoration circle1"></div>
      <div className="loading-decoration circle2"></div>
      <div className="loading-decoration circle3"></div>

      <div className="loading-spinner">
        <div className="spinner-logo">
          <div className="spinner-icon"></div>
        </div>

        <h3>{title}</h3>
        <p>{message}</p>

        {showProgress ? (
          <div className="progress-track">
            <div className="progress-bar"></div>
          </div>
        ) : (
          <div className="loading-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        )}
      </div>
    </div>
  );
};

LoadingSpinner.propTypes = {
  message: PropTypes.string,
  title: PropTypes.string,
  showProgress: PropTypes.bool,
};

export default LoadingSpinner;
