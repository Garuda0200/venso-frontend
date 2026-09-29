import React from "react";
import { Header } from "../../components/common/Header";
import { Footer } from "../../components/common/Footer";
import "./ContabilidadLayout.scss";

export function ContabilidadLayout({ children }) {
  return (
    <div className="contabilidad-layout venso-navbar-layout">
      <div className="contabilidad-main-content">
        <Header />
        <div className="contabilidad-content">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
