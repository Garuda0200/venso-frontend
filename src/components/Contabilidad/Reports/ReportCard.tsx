import React from "react";
import "./ReportCard.scss";

const ReportCard = ({
  title,
  value,
  type,
  currency,
  icon,
  color = "primary",
}) => {
  const formatValue = () => {
    if (type === "currency") {
      const symbol = currency === "soles" ? "S/ " : "US$ ";
      return `${symbol}${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    if (type === "count") {
      return value.toLocaleString("es-PE");
    }

    return value;
  };

  return (
    <div className={`report-card ${color}`}>
      <div className="card-content">
        <div className="card-header">
          <div className="card-icon">{icon}</div>
          <div className="card-title">{title}</div>
        </div>

        <div className="card-value">{formatValue()}</div>

        <div className="card-decoration">
          <div className="decoration-line"></div>
        </div>
      </div>
    </div>
  );
};

export default ReportCard;
