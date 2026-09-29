import React, { useMemo } from "react";

import ChildrenPanel from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/ChildrenPanel";
import { getChildSlotKey } from "../../../../../components/Ventas/Cotizaciones/EdicionCotizacion/components/DaysEditor/components/SortableService/childrenPanelRows";

/**
 * Adaptador del gestor infantil compartido para FlightPaymentModal.
 * La UI vive en ChildrenPanel para mantener el mismo comportamiento visual
 * en DaysEditor, itinerario externo, reservas y pagos de vuelos.
 */
const FpmChildrenPanel = ({
  childPassengerIds = [],
  passengerSelection = {},
  adultUnit = 0,
  getDisplayName,
  onUpdatePricing,
}) => {
  const convertedMap = passengerSelection?.convertedChildToAdultMap || {};
  const childPriceMap =
    passengerSelection?.assignedChildExplicitPriceMap ||
    passengerSelection?.childPriceMap ||
    {};

  const convertedSlots = useMemo(
    () =>
      new Set(
        Object.entries(convertedMap)
          .filter(([, value]) => Boolean(value))
          .map(([childId]) => getChildSlotKey(childId)),
      ),
    [convertedMap],
  );

  const activeChildIds = useMemo(
    () =>
      childPassengerIds.filter(
        (childId) => !convertedSlots.has(getChildSlotKey(childId)),
      ),
    [childPassengerIds, convertedSlots],
  );

  const convertedEntries = useMemo(
    () =>
      childPassengerIds
        .filter((childId) => convertedSlots.has(getChildSlotKey(childId)))
        .map((childId) => ({ childId, revertKey: childId })),
    [childPassengerIds, convertedSlots],
  );

  return (
    <ChildrenPanel
      className="fpm__children assigned-child-panel"
      childIds={activeChildIds}
      convertedEntries={convertedEntries}
      childPriceMap={childPriceMap}
      adultPrice={adultUnit}
      getDisplayName={getDisplayName}
      onApplyUniform={(type, value) => {
        if (type === "zero") {
          onUpdatePricing?.("fixed", null, 0);
          return;
        }
        onUpdatePricing?.(type, null, value ?? null);
      }}
      onConvertChild={(childId) =>
        onUpdatePricing?.("child-adult", childId)
      }
      onRevertChild={(childId) =>
        onUpdatePricing?.("revert-child", childId)
      }
      onApplyIndividual={(childId, type, value) =>
        onUpdatePricing?.(type, childId, value)
      }
    />
  );
};

export default FpmChildrenPanel;
