import { VentasLayout } from "../layouts";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  VouchersVenta,
  Cotizaciones,
  Dashboard,
  Paquetes,
} from "../pages/Ventas";
import { Profile } from "../pages/Home/Profile";
import PdfEditorView from "../components/Ventas/Cotizaciones/EdicionCotizacion/PdfEditor/PdfEditorView";

export function VentasRoutes() {
  return (
    <Routes>
      <Route path="/" element={<VentasLayout><Dashboard /></VentasLayout>} />
      <Route path="/dashboard" element={<VentasLayout><Dashboard /></VentasLayout>} />
      <Route path="/cotizaciones" element={<VentasLayout><Cotizaciones /></VentasLayout>} />
      <Route path="/cotizaciones/viewPDF" element={<VentasLayout><PdfEditorView /></VentasLayout>} />
      <Route path="/vouchers" element={<VentasLayout><VouchersVenta /></VentasLayout>} />
      <Route path="/paquetes" element={<VentasLayout><Paquetes /></VentasLayout>} />
      <Route path="/configuracion" element={<VentasLayout><Profile /></VentasLayout>} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
