import React from "react";
import { MdGroups, MdPerson } from "react-icons/md";
import "./PackageTypeSelector.scss";

const PackageTypeSelector = ({ packageType, setPackageType }) => {
  const handleChange = (e) => {
    setPackageType(e.target.value);
  };

  return (
    <div className="package-type-selector-container">
      <label className="pkg-label">Tipo</label>
      <div className="package-type-selector">
        <label
          className={`package-option ${packageType === "compartido" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="packageType"
            value="compartido"
            checked={packageType === "compartido"}
            onChange={handleChange}
          />
          <span className="package-icon">
            <MdGroups />
          </span>
          <span className="package-label">Compartido</span>
        </label>
        <label
          className={`package-option ${packageType === "privado" ? "selected" : ""}`}
        >
          <input
            type="radio"
            name="packageType"
            value="privado"
            checked={packageType === "privado"}
            onChange={handleChange}
          />
          <span className="package-icon">
            <MdPerson />
          </span>
          <span className="package-label">Privado</span>
        </label>
      </div>
    </div>
  );
};

export default PackageTypeSelector;
