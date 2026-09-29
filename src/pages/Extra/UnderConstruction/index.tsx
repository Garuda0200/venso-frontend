import React from "react";
import { MdConstruction, MdEngineering } from "react-icons/md";
import "./UnderConstruction.scss";

const UnderConstructionPage = () => {
  return (
    <div className="under-construction-container">
      <div className="floating-particles">
        {[...Array(20)].map((_, i) => (
          <div key={i} className={`particle particle-${i + 1}`}></div>
        ))}
      </div>

      <div className="under-construction-content">
        <div className="construction-header">
          <div className="title-wrapper">
            <MdConstruction className="header-icon" />
            <h1>Página en Desarrollo</h1>
          </div>
          <p>
            Estamos trabajando para implementar esta funcionalidad. ¡Gracias por
            tu paciencia!
          </p>
        </div>

        <div className="construction-animation">
          <div className="construction-site">
            <div className="engineer-figure">
              <MdEngineering className="engineer-icon" />
              <div className="progress-pulse"></div>
            </div>
            <div className="construction-message">
              <h3>Esta sección aún no está disponible</h3>
              <p>
                Nuestro equipo está trabajando arduamente para implementar esta
                funcionalidad.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnderConstructionPage;
