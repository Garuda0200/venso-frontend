import { Routes, Route } from "react-router-dom";
import { NotFoundPage, UnderConstructionPage } from "../pages/Extra";

export function ExtraRoutes() {
  return (
    <Routes>
      <Route path="/404" element={<NotFoundPage />} />
      <Route path="/under-construction" element={<UnderConstructionPage />} />

      {/* Ruta comodín para capturar cualquier otra ruta en Extra */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
