import React,{useState} from "react";
import {GestionPagosServicios} from "./GestionPagosServicios";
import {ReporteVuelosVendidos} from "./ReporteVuelosVendidos";
import "./Reportes.scss";
export function Reportes(){
 const [section,setSection]=useState("services");
 return <div className="reportes-container reportes-gestion-only">
  <nav className="accounting-report-tabs" aria-label="Informes de contabilidad">
   <button type="button" aria-pressed={section==="services"} onClick={()=>setSection("services")}>Pagos a proveedores</button>
   <button type="button" aria-pressed={section==="flights"} onClick={()=>setSection("flights")}>Vuelos vendidos</button>
  </nav>
  {section==="services"?<GestionPagosServicios/>:<ReporteVuelosVendidos/>}
 </div>;
}
