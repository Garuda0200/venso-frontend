// components/PassengerSelectorModal.jsx
import React, { useMemo, useState, useEffect } from "react";
import { MdClose, MdCheck } from "react-icons/md";
import "./PassengerSelectorModal.scss";

/** Helpers */
const getCandidateId = (p, idx) =>
  p?.id ??
  p?.documentNumber ??
  p?.dni ??
  p?.passport ??
  p?.email ??
  p?.phone ??
  `pax-${idx}`;

const getPassengerName = (p, idx) =>
  p?.fullName ??
  p?.nombreCompleto ??
  p?.name ??
  p?.nombres ??
  `Pasajero ${idx + 1}`;

const calcAge = (birth) => {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

const getChildPriceFromRaw = (raw = {}, childPriceField) => {
  if (childPriceField && raw && raw[childPriceField] != null) {
    const v = parseFloat(raw[childPriceField]);
    return isNaN(v) ? null : v;
  }
  const candidateKeys = [
    "precioNino",
    "precio_nino",
    "tarifaNino",
    "tarifa_nino",
    "childPrice",
    "priceChild",
    "precio",
    "price",
  ];
  for (const key of candidateKeys) {
    if (raw[key] != null) {
      const v = parseFloat(raw[key]);
      if (!isNaN(v)) return v;
    }
  }
  return null;
};

const makeRow = (p, idx, group, childPriceField) => {
  const sourceId = getCandidateId(p, idx);
  const rowId = `${group}:${idx}:${sourceId}`;
  const base = {
    id: rowId,
    sourceId,
    name: getPassengerName(p, idx),
    type: group,
    raw: p,
  };
  if (group === "child") {
    const extracted = getChildPriceFromRaw(p, childPriceField);
    return { ...base, childPrice: extracted };
  }
  return base;
};

const buildInfoRows = (raw = {}) => {
  const docNum =
    raw.documentNumber ??
    raw.dni ??
    raw.passport ??
    raw.numeroDocumento ??
    null;
  const docType = raw.documentType ?? raw.tipoDocumento ?? null;
  const nationality =
    raw.nationality ?? raw.nacionalidad ?? raw.country ?? raw.pais ?? null;
  const email = raw.email ?? null;
  const phone = raw.phone ?? raw.telefono ?? raw.celular ?? null;
  const birthdate = raw.birthdate ?? raw.fechaNacimiento ?? null;
  const age = raw.age ?? raw.edad ?? calcAge(birthdate);
  const gender = raw.gender ?? raw.sexo ?? null;

  const rows = [
    ["Documento", [docType, docNum].filter(Boolean).join(" • ") || null],
    ["Nacionalidad", nationality],
    ["Email", email],
    ["Teléfono", phone],
    ["Nacimiento", birthdate],
    ["Edad", age != null ? `${age}` : null],
    ["Género", gender],
  ];
  return rows.filter(([, v]) => v && String(v).trim() !== "");
};

export default function PassengerSelectorModal({
  isOpen,
  onClose,
  onConfirm,
  peopleDetails = {},
  passengers = [],
  preselectedIds = [],
  title = "Selecciona pasajeros",

  childPriceField = null,
  allowChildPriceInput = false,

  currencySymbol = "USD",
}) {
  /** Normalización: adultos y niños (adults siempre preseleccionados) */
  const { adultsArr, childrenArr, allArr } = useMemo(() => {
    let adults = [];
    let children = [];

    if (peopleDetails?.adults || peopleDetails?.children) {
      const ad = (peopleDetails.adults || []).map((p, i) =>
        makeRow(p, i, "adult", childPriceField),
      );
      const ch = (peopleDetails.children || []).map((p, i) =>
        makeRow(p, i, "child", childPriceField),
      );
      adults = ad;
      children = ch;
    } else {
      const base = (passengers || []).map((p, i) => {
        const group = p?.type === "child" ? "child" : "adult";
        return makeRow(p, i, group, childPriceField);
      });
      adults = base.filter((b) => b.type !== "child");
      children = base.filter((b) => b.type === "child");
    }

    return {
      adultsArr: adults,
      childrenArr: children,
      allArr: [...adults, ...children],
    };
  }, [peopleDetails, passengers, childPriceField]);

  /** RowIds por grupo */
  const adultRowIds = useMemo(
    () => new Set(adultsArr.map((a) => a.id)),
    [adultsArr],
  );
  const childRowIds = useMemo(
    () => new Set(childrenArr.map((c) => c.id)),
    [childrenArr],
  );

  /** Preselección: SIEMPRE incluye a los adultos + preselectedIds (si hay) */
  const preselectedRowIds = useMemo(() => {
    const byRowId = new Map(allArr.map((n) => [n.id, n.id]));
    const bySourceId = new Map(allArr.map((n) => [n.sourceId, n.id]));
    const set = new Set(adultRowIds); // adultos siempre dentro

    (preselectedIds || []).forEach((x) => {
      if (byRowId.has(x)) set.add(byRowId.get(x));
      else if (bySourceId.has(x)) set.add(bySourceId.get(x));
    });

    return set;
  }, [preselectedIds, allArr, adultRowIds]);

  /** Estado de selección (adultos siempre fijos) */
  const [selected, setSelected] = useState(new Set(preselectedRowIds));
  const [childPriceOverrides, setChildPriceOverrides] = useState({});

  useEffect(() => {
    // Reabrir modal → rehydrate: adultos + preselected (niños)
    setSelected(new Set(preselectedRowIds));
  }, [preselectedRowIds, isOpen]);

  if (!isOpen) return null;

  /** Toggle SOLO para niños (adultos no son visibles ni se deseleccionan) */
  const toggleChild = (rowId) => {
    if (!childRowIds.has(rowId)) return; // ignora cualquier ID que no sea de niño
    const next = new Set(selected);
    next.has(rowId) ? next.delete(rowId) : next.add(rowId);

    // Asegura que los adultos permanezcan
    adultRowIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  /** Acciones por sección niños */
  const selectAllChildren = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      childrenArr.forEach((c) => next.add(c.id));
      adultRowIds.forEach((id) => next.add(id));
      return next;
    });

  const clearChildren = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      // Quita sólo niños; mantiene adultos
      childrenArr.forEach((c) => next.delete(c.id));
      adultRowIds.forEach((id) => next.add(id));
      return next;
    });

  const selectedChildrenCount = childrenArr.filter((c) =>
    selected.has(c.id),
  ).length;
  const selectedAdultsCount = adultsArr.length; // siempre seleccionados

  /** Precio niños */
  const handleChildPriceChange = (rowId, val) => {
    setChildPriceOverrides((prev) => ({ ...prev, [rowId]: val }));
  };

  const getEffectiveChildPrice = (row) => {
    if (
      row?.type === "child" &&
      Object.prototype.hasOwnProperty.call(childPriceOverrides, row.id)
    ) {
      const v = parseFloat(childPriceOverrides[row.id]);
      return isNaN(v) ? null : v;
    }
    if (row?.type === "child" && row?.childPrice != null) {
      const v = parseFloat(row.childPrice);
      return isNaN(v) ? null : v;
    }
    return null;
  };

  /** Confirmar: incluye SIEMPRE a adultos + niños seleccionados */
  const handleConfirm = () => {
    const selectedChildren = childrenArr.filter((n) => selected.has(n.id));
    const chosen = [...adultsArr, ...selectedChildren];

    const ids = chosen.map((c) => c.id);
    const idsRaw = chosen.map((c) => c.sourceId);

    const childPriceMap = {};
    let childPriceTotal = 0;
    let hasChildExplicitPrices = false;

    selectedChildren.forEach((c) => {
      const p = getEffectiveChildPrice(c);
      childPriceMap[c.id] = p ?? null;
      if (p != null) {
        hasChildExplicitPrices = true;
        childPriceTotal += Number(p) || 0;
      }
    });

    onConfirm({
      ids,
      chosen,
      idsRaw,
      childPriceMap,
      childPriceTotal,
      hasChildExplicitPrices,
    });
  };

  return (
    <div className="pax-modal-overlay" onClick={onClose}>
      <div className="pax-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pax-modal__header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        {/* SOLO NIÑOS (adultos ocultos y siempre seleccionados) */}
        <section className="pax-section">
          <div className="pax-section__header">
            <h4>Niños</h4>
            <div className="pax-section__actions">
              <button className="btn ghost" onClick={selectAllChildren}>
                Seleccionar todos
              </button>
              <button className="btn ghost" onClick={clearChildren}>
                Limpiar
              </button>
              <div className="pax-section__counter">
                Seleccionados: <strong>{selectedChildrenCount}</strong> /{" "}
                {childrenArr.length}
              </div>
            </div>
          </div>

          <div className="pax-grid">
            {childrenArr.length === 0 ? (
              <div className="pax-empty">No hay niños registrados.</div>
            ) : (
              childrenArr.map((p) => {
                const checked = selected.has(p.id);
                const info = buildInfoRows(p.raw);
                const effectivePrice = getEffectiveChildPrice(p);

                return (
                  <div
                    key={p.id}
                    className={`pax-card ${checked ? "is-selected" : ""}`}
                    onClick={() => toggleChild(p.id)}
                  >
                    <div className="pax-card__check">
                      {checked && <MdCheck />}
                    </div>
                    <div className="pax-card__name">{p.name}</div>
                    <div className="pax-card__tag">Niño(a)</div>

                    {info.length > 0 && (
                      <div className="pax-card__info">
                        {info.map(([label, value]) => (
                          <div className="pax-info-row" key={label}>
                            <span className="pax-info-label">{label}:</span>
                            <span className="pax-info-value">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {allowChildPriceInput ? (
                      <div
                        className="pax-card__child-price"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label
                          htmlFor={`child-price-${p.id}`}
                          className="pax-info-label"
                        >
                          Precio niño ({currencySymbol}):
                        </label>
                        <input
                          id={`child-price-${p.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={
                            effectivePrice != null ? String(effectivePrice) : ""
                          }
                          value={childPriceOverrides[p.id] ?? ""}
                          onChange={(e) =>
                            handleChildPriceChange(p.id, e.target.value)
                          }
                          onWheel={(e) => e.currentTarget.blur()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                              e.preventDefault();
                            }
                          }}
                        />
                        <small className="pax-hint">
                          Déjalo vacío para usar la división/multiplicación
                          normal.
                        </small>
                      </div>
                    ) : (
                      effectivePrice != null && (
                        <div className="pax-card__child-price-readonly">
                          <span className="pax-info-label">Precio niño:</span>{" "}
                          <span className="pax-info-value">
                            {currencySymbol} {Number(effectivePrice).toFixed(2)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <div className="pax-modal__footer">
          <div className="pax-modal__summary">
            {/* Total reales que irán al cálculo: Adultos (auto) + Niños seleccionados */}
            Adultos (auto): <strong>{selectedAdultsCount}</strong> &nbsp;•&nbsp;
            Niños:
            <strong> {selectedChildrenCount}</strong> &nbsp;•&nbsp; Total:
            <strong> {selectedAdultsCount + selectedChildrenCount}</strong>
          </div>
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={selectedAdultsCount + selectedChildrenCount === 0}
          >
            Confirmar ({selectedAdultsCount + selectedChildrenCount})
          </button>
        </div>
      </div>
    </div>
  );
}
