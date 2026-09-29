import React from "react";
import "./ReservasLayout.scss";
import { Header } from "../../components/common/Header";
import { Footer } from "../../components/common/Footer";

export function ReservasLayout({ children }) {
  return (
    <div className="reservas-layout venso-navbar-layout">
      <div className="main-content">
        <Header />
        <div className="content">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
