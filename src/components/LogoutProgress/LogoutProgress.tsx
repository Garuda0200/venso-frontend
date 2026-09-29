import React, { useState, useEffect } from "react";
import "./LogoutProgress.scss";

const LogoutProgress = () => {
  const [percentage, setPercentage] = useState(0);

  // Simulate progress animation
  useEffect(() => {
    let timer;
    const animateProgress = () => {
      setPercentage((prev) => {
        // Gradually increase speed as percentage grows
        const increment = prev < 30 ? 3 : prev < 60 ? 5 : prev < 90 ? 4 : 2;
        const next = Math.min(prev + increment, 100);
        return next;
      });
    };

    timer = setInterval(animateProgress, 120);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="logout-progress-overlay">
      <div className="logout-container">
        <h2>Cerrando sesión</h2>
        <div className="progress-track">
          <div
            className="progress-bar"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <p>Por favor espere mientras se cierra su sesión...</p>
      </div>
    </div>
  );
};

export default LogoutProgress;
