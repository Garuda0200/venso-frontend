import React, { memo } from "react";
import {
  MdPerson,
  MdChildCare,
  MdAdd,
  MdRemove,
  MdPublic,
} from "react-icons/md";
import { getCountryNames } from "../../../../../../utils/countries";
import { changeCanonicalPassengerCount } from "../../utils/passengerComposition";
import "./PeopleSelection.scss";

const COUNTRIES = getCountryNames();

const PeopleSelection = ({
  peopleCount,
  setPeopleCount,
  peopleDetails,
  setPeopleDetails,
  clientData,
}) => {
  const adults = peopleDetails?.adults ?? [];
  const children = peopleDetails?.children ?? [];

  const applyPassengerDelta = (type, delta) => {
    const next = changeCanonicalPassengerCount(
      peopleDetails,
      peopleCount,
      type,
      delta,
    );

    // Ambos estados se actualizan en el mismo evento para que el guardado
    // nunca lea un contador distinto al arreglo canónico de pasajeros.
    setPeopleDetails(next.peopleDetails);
    setPeopleCount(next.peopleCount);
  };

  const handleNationalityChange = (type, id, value) => {
    setPeopleDetails((previousDetails) => {
      const currentPassengers = previousDetails?.[type] ?? [];
      const passengerIndex = currentPassengers.findIndex(
        (passenger) => passenger.id === id,
      );

      if (passengerIndex === -1) {
        return previousDetails;
      }

      const updatedPassengers = [...currentPassengers];
      updatedPassengers[passengerIndex] = {
        ...updatedPassengers[passengerIndex],
        nacionalidad: value,
      };

      return {
        ...previousDetails,
        [type]: updatedPassengers,
      };
    });
  };

  const renderNationalityGroup = ({
    type,
    title,
    shortLabel,
    icon,
    passengers,
  }) => (
    <section className={`nationality-group nationality-group--${type}`}>
      <div className="nationality-group__header">
        <span className="nationality-group__icon">{icon}</span>
        <strong>{title}</strong>
        <span className="nationality-group__count">{passengers.length}</span>
      </div>

      {passengers.length > 0 ? (
        <div className="nationality-list">
          {passengers.map((passenger, index) => (
            <label
              key={`${type}-${passenger.id}`}
              className="nationality-row"
            >
              <span className="nationality-row__label">
                {shortLabel}
                {index + 1}
              </span>
              <select
                className="nationality-select"
                value={passenger.nacionalidad || ""}
                aria-label={`Nacionalidad de ${title.toLowerCase()} ${index + 1}`}
                onChange={(event) =>
                  handleNationalityChange(type, passenger.id, event.target.value)
                }
              >
                <option value="">Seleccionar país</option>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <p className="nationality-group__empty">Sin pasajeros en este grupo.</p>
      )}
    </section>
  );

  return (
    <div className="people-selection">
      {clientData && (
        <div className="primary-client">
          <h4>Cliente principal</h4>
          <div className="client-card">
            <div className="client-avatar">
              {clientData.nombres?.charAt(0) || "C"}
              {clientData.apellidos?.charAt(0) || ""}
            </div>
            <div className="client-info">
              <div className="client-name">
                {clientData.nombres} {clientData.apellidos}
              </div>
              {clientData.correo && (
                <div className="client-email">{clientData.correo}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="passenger-compact-editor">
        <div className="pax-counter-grid" aria-label="Cantidad de pasajeros">
          <article className="pax-counter-card pax-counter-card--adults">
            <div className="pax-counter-card__identity">
              <span className="pax-counter-card__icon">
                <MdPerson />
              </span>
              <div>
                <strong>Adultos</strong>
              </div>
            </div>

            <div className="pax-counter-controls">
              <button
                type="button"
                className="pax-counter-button"
                onClick={() => applyPassengerDelta("adults", -1)}
                disabled={peopleCount.adults <= 1}
                aria-label="Quitar un adulto"
              >
                <MdRemove />
              </button>
              <output aria-live="polite">{peopleCount.adults}</output>
              <button
                type="button"
                className="pax-counter-button"
                onClick={() => applyPassengerDelta("adults", 1)}
                aria-label="Agregar un adulto"
              >
                <MdAdd />
              </button>
            </div>
          </article>

          <article className="pax-counter-card pax-counter-card--children">
            <div className="pax-counter-card__identity">
              <span className="pax-counter-card__icon">
                <MdChildCare />
              </span>
              <div>
                <strong>Niños</strong>
              </div>
            </div>

            <div className="pax-counter-controls">
              <button
                type="button"
                className="pax-counter-button"
                onClick={() => applyPassengerDelta("children", -1)}
                disabled={peopleCount.children <= 0}
                aria-label="Quitar un niño"
              >
                <MdRemove />
              </button>
              <output aria-live="polite">{peopleCount.children}</output>
              <button
                type="button"
                className="pax-counter-button"
                onClick={() => applyPassengerDelta("children", 1)}
                aria-label="Agregar un niño"
              >
                <MdAdd />
              </button>
            </div>
          </article>
        </div>

        <div className="nationality-panel">
          <div className="nationality-panel__heading">
            <span className="nationality-panel__icon">
              <MdPublic />
            </span>
            <strong>Nacionalidades</strong>
            <span className="nationality-panel__total">
              {adults.length + children.length} pax
            </span>
          </div>

          <div
            className={`nationality-grid ${children.length === 0 ? "nationality-grid--single" : ""}`}
          >
            {renderNationalityGroup({
              type: "adults",
              title: "Adultos",
              shortLabel: "A",
              icon: <MdPerson />,
              passengers: adults,
            })}

            {children.length > 0 &&
              renderNationalityGroup({
                type: "children",
                title: "Niños",
                shortLabel: "N",
                icon: <MdChildCare />,
                passengers: children,
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(PeopleSelection);
