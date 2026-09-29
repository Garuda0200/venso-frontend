import { AlmacenLayout } from "../layouts";
import { Routes, Route, Navigate } from "react-router-dom";
import { Profile } from "../pages/Home/Profile";
import { Inventario, Patrimonio } from "../pages/Almacen";

export function AlmacenRoutes() {
  const loadLayout = (Layout, Page) => {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  };

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/almacen/inventario" replace />} />
      <Route
        path="/dashboard"
        element={<Navigate to="/almacen/inventario" replace />}
      />
      <Route
        path="/inventario"
        element={loadLayout(AlmacenLayout, Inventario)}
      />
      <Route
        path="/patrimonio"
        element={loadLayout(AlmacenLayout, Patrimonio)}
      />
      <Route
        path="/configuracion"
        element={loadLayout(AlmacenLayout, Profile)}
      />

      {/* Ruta comodín para capturar cualquier otra ruta en Almacen y redirigir a 404 global */}
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
