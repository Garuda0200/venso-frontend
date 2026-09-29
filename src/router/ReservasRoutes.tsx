import { ReservasLayout } from "../layouts";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  DashboardReserva,
  VouchersReserva,
  Servicios,
  Calendario,
} from "../pages/Reservas/";
import { Profile } from "../pages/Home/Profile";
import Cotizaciones from "../pages/Ventas/Cotizaciones/Cotizaciones";
import PdfEditorView from "../components/Ventas/Cotizaciones/EdicionCotizacion/PdfEditor/PdfEditorView";

export function ReservasRoutes() {
  const loadLayout = (Layout, Page) => {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  };

  return (
    <Routes>
      <Route path="/" element={loadLayout(ReservasLayout, DashboardReserva)} />
      <Route
        path="/dashboard"
        element={loadLayout(ReservasLayout, DashboardReserva)}
      />
      <Route
        path="/cotizaciones"
        element={loadLayout(ReservasLayout, Cotizaciones)}
      />
      <Route
        path="/cotizaciones/viewPDF"
        element={loadLayout(ReservasLayout, PdfEditorView)}
      />
      <Route
        path="/vouchers"
        element={loadLayout(ReservasLayout, VouchersReserva)}
      />
      <Route
        path="/servicios/*"
        element={loadLayout(ReservasLayout, Servicios)}
      />
      <Route
        path="/calendario/*"
        element={loadLayout(ReservasLayout, Calendario)}
      />
      <Route
        path="/configuracion"
        element={loadLayout(ReservasLayout, Profile)}
      />

      {/* Ruta comodín para capturar cualquier otra ruta en Reservas y redirigir a 404 global */}
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
