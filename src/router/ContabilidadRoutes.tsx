import { ContabilidadLayout } from "../layouts";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  Dashboard,
  Caja,
  Files,
  PagosLote,
  Reportes,
  Estados,
} from "../pages/Contabilidad";
import { Profile } from "../pages/Home/Profile";

export function ContabilidadRoutes() {
  const loadLayout = (Layout, Page) => {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  };

  return (
    <Routes>
      <Route path="/" element={loadLayout(ContabilidadLayout, Dashboard)} />
      <Route
        path="/dashboard"
        element={loadLayout(ContabilidadLayout, Dashboard)}
      />
      <Route path="/caja" element={loadLayout(ContabilidadLayout, Caja)} />
      <Route path="/movimientos" element={loadLayout(ContabilidadLayout, Files)} />
      <Route path="/files" element={<Navigate to="/contabilidad/movimientos" replace />} />
      <Route path="/pagos-lote" element={loadLayout(ContabilidadLayout, PagosLote)} />
      <Route path="/liquidaciones" element={<Navigate to="/contabilidad/pagos-lote" replace />} />
      <Route
        path="/estados"
        element={loadLayout(ContabilidadLayout, Estados)}
      />
      <Route
        path="/reportes"
        element={loadLayout(ContabilidadLayout, Reportes)}
      />
      <Route
        path="/patrimonio"
        element={<Navigate to="/almacen/patrimonio" replace />}
      />
      <Route
        path="/configuracion"
        element={loadLayout(ContabilidadLayout, Profile)}
      />

      {/* Ruta comodín para capturar cualquier otra ruta en Contabilidad y redirigir a 404 global */}
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
