import React from "react";
import { Header } from "../../components/common/Header";
import { Footer } from "../../components/common/Footer";
import "./AlmacenLayout.scss";

export function AlmacenLayout({ children }) {
  return (
    <div className="almacen-layout venso-navbar-layout">
      <div className="almacen-main-content">
        <Header />
        <div className="almacen-content">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
