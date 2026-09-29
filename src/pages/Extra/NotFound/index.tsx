import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { MdHome, MdArrowBack, MdErrorOutline } from "react-icons/md";
import { useAuth } from "../../../context/AuthContext";
import "./NotFound.scss";

const NotFoundPage = () => {
  const { auth } = useAuth();
  const navigate = useNavigate();

  // Determinar la ruta de regreso basada en el rol
  const getHomeRoute = () => {
    if (!auth.isAuthenticated) return "/";

    switch (Number(auth.role)) {
      case 0: // Super Admin
      case 1: // Admin
        return "/admin";
      case 2: // Ventas
        return "/ventas";
      case 3: // Reservas
        return "/reservas";
      case 4: // Contabilidad
        return "/contabilidad";
      case 5: // Almacen
        return "/almacen";
      default:
        return "/";
    }
  };

  const goBack = () => {
    navigate(-1);
  };

  return (
    <div className="not-found-container">
      <div className="floating-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
        <div className="shape shape-5"></div>
      </div>

      <div className="not-found-content">
        <div className="animated-numbers">
          <span className="number">4</span>
          <span className="number">0</span>
          <span className="number">4</span>
        </div>

        <div className="not-found-message">
          <h1>Página no encontrada</h1>
          <p>
            Lo sentimos, la página que estás buscando no existe o ha sido
            movida.
          </p>
        </div>

        <div className="not-found-illustration">
          <div className="map-pin"></div>
          <div className="compass">
            <div className="compass-circle"></div>
            <div className="compass-needle"></div>
          </div>
          <MdErrorOutline className="error-icon" />
        </div>

        <div className="not-found-actions">
          <button className="btn-back" onClick={goBack}>
            <MdArrowBack /> Volver atrás
          </button>
          <Link to={getHomeRoute()} className="btn-home">
            <MdHome /> Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
