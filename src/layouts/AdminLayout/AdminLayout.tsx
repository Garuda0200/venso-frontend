import React from "react";
import "./AdminLayout.scss";
import { Header } from "../../components/common/Header";
import { Footer } from "../../components/common/Footer";

export function AdminLayout({ children }) {
  return (
    <div className="admin-layout venso-navbar-layout">
      <div className="main-content">
        <Header />
        <div className="content">{children}</div>
        <Footer />
      </div>
    </div>
  );
}
