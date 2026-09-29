import { AdminLayout } from "../layouts";
import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Users, Logs, Comisiones, PostSaleEdits } from "../pages/Admin";
import { Profile } from "../pages/Home/Profile";

export function AdminRoutes() {
  const loadLayout = (Layout, Page) => {
    return (
      <Layout>
        <Page />
      </Layout>
    );
  };

  return (
    <Routes>
      <Route path="/" element={loadLayout(AdminLayout, Dashboard)} />
      <Route path="/dashboard" element={loadLayout(AdminLayout, Dashboard)} />
      <Route path="/users" element={loadLayout(AdminLayout, Users)} />
      <Route path="/logs" element={loadLayout(AdminLayout, Logs)} />
      <Route path="/comisiones" element={loadLayout(AdminLayout, Comisiones)} />
      <Route path="/post-sale-edits" element={loadLayout(AdminLayout, PostSaleEdits)} />
      <Route path="/configuracion" element={loadLayout(AdminLayout, Profile)} />

      {/* Ruta comodín para capturar cualquier otra ruta en Admin y redirigir a 404 global */}
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
