import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "../pages/Home";

export function HomeRoutes() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </div>
  );
}
