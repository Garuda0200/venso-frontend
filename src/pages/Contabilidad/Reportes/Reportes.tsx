import React from "react";
import { GestionPagosServicios } from "./GestionPagosServicios";
import "./Reportes.scss";

export function Reportes() {
  return (
    <div className="reportes-container reportes-gestion-only">
      <GestionPagosServicios />
    </div>
  );
}
