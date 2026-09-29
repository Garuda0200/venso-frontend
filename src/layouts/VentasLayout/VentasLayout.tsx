import React from "react";
import "./VentasLayout.scss";
import { Header } from "../../components/common/Header";
import { Footer } from "../../components/common/Footer";

export function VentasLayout({ children }) {
  return (
    <div className="ventas-layout venso-navbar-layout">
      <div className="main-content">
        <Header />
        <div className="content">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
