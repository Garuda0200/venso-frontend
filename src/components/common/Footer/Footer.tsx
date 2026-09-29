import React from "react";
import "./Footer.scss";
import { FaRegHeart } from "react-icons/fa";

export function Footer() {
  return (
    <footer className="admin-footer">
      <p className="footer-text">
        @Creando experiencias con sabor a Perú{" "}
        <FaRegHeart className="footer-icon" />
      </p>
    </footer>
  );
}
