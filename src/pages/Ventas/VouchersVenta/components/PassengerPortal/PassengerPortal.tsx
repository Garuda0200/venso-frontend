import React from "react";
import ReactDOM from "react-dom";
import { MdPerson, MdChildCare } from "react-icons/md";
import "./PassengerPortal.scss";

const PassengerPortal = ({ passengers, onClose }) => {
  if (!passengers || passengers.length === 0) return null;

  return ReactDOM.createPortal(
    <div className="portal-overlay" onClick={onClose}>
      <div className="portal-content" onClick={(e) => e.stopPropagation()}>
        <h3> Pasajeros</h3>
        <ul className="passenger-list">
          {passengers.map((p, index) => (
            <li key={index} className="passenger-item">
              <span>
                {p.type === "child" ? <MdChildCare /> : <MdPerson />}{" "}
                {p.nombres} {p.apellidos}
              </span>{" "}
              - <em>{p.nacionalidad}</em>
            </li>
          ))}
        </ul>
        <button className="close-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>,
    document.getElementById("portal-root"),
  );
};

export default PassengerPortal;
