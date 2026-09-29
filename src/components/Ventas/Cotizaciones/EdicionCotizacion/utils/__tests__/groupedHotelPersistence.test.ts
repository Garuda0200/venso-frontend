import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveSelectedHotelFromDays,
  injectHotelIntoDaysPure,
} from "../hotelServiceHelpers";
import { aggregatePerRoomPricingByStayGroup } from "../financialDisplayHelpers";
import { buildSummaryPricingCore } from "../summaryPricingCore";

const buildFixture = () => {
  const adults = Array.from({ length: 8 }, (_, index) => ({
    id: `adult:${index + 1}`,
    name: `Adulto ${index + 1}`,
  }));
  const peopleDetails = { adults, children: [] };
  const peopleCount = { adults: 8, children: 0 };
  const roomAssignments = Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => [
      `doble:${index + 1}`,
      [`adult:${index * 2 + 1}`, `adult:${index * 2 + 2}`],
    ]),
  );
  const roomTotals = [360, 235, 390, 140, 150];
  const categories = ["4", "3", "5", "4", "4"];
  const dayGroups = roomTotals.map((roomTotal, index) => ({
    id: `group-${index + 1}`,
    dayIndices: [index],
    category: categories[index],
    hotelName:
      categories[index] === "5"
        ? "Hotel 5 estrellas"
        : `Hotel ${categories[index]} estrellas`,
    roomMix: { doble: 4 },
    roomAssignments,
    roomOptions: [
      {
        key: "doble",
        label: "Doble / Matrimonial",
        capacity: 2,
        pricePerRoomNight: roomTotal,
        id_habitacion: 100 + index,
      },
    ],
    priceOverrides: { doble: roomTotal },
  }));
  const selectedHotel = {
    category: "4",
    dayGroups,
    dayGroupsAuthoritative: true,
    groupedHotelSelection: true,
    selectedNightIndices: [0, 1, 2, 3, 4],
    peopleDetails,
  };
  const days = Array.from({ length: 6 }, (_, index) => ({
    numero: index + 1,
    titulo: `Día ${index + 1}`,
    servicios: [],
  }));

  return { days, selectedHotel, peopleCount, peopleDetails };
};

test("mixed hotel groups survive persistence without collapsing to the 5-star day", () => {
  const { days, selectedHotel, peopleCount, peopleDetails } = buildFixture();
  const persistedDays = injectHotelIntoDaysPure(
    days,
    selectedHotel,
    peopleCount,
    peopleDetails,
  );
  const rehydrated = deriveSelectedHotelFromDays(persistedDays, null, null);

  assert.deepEqual(
    rehydrated.dayGroups.map((group) => group.category),
    ["4", "3", "5", "4", "4"],
  );
  assert.deepEqual(rehydrated.selectedNightIndices, [0, 1, 2, 3, 4]);
  assert.equal(rehydrated.luxuryManual, false);
  assert.equal(rehydrated.hotelTotal, 5100);
  assert.equal(rehydrated.perRoomPricing.length, 20);
});

test("full-stay hotel pricing sums every group for the same adults", () => {
  const { days, selectedHotel, peopleCount, peopleDetails } = buildFixture();
  const persistedDays = injectHotelIntoDaysPure(
    days,
    selectedHotel,
    peopleCount,
    peopleDetails,
  );
  const rehydrated = deriveSelectedHotelFromDays(persistedDays, null, null);
  const stayPricing = aggregatePerRoomPricingByStayGroup(
    rehydrated.perRoomPricing,
  );

  assert.equal(stayPricing.length, 1);
  assert.equal(stayPricing[0].adultBeneficiaries, 8);
  assert.equal(stayPricing[0].hotelPerPerson, 637.5);
});

test("summary core aggregates raw hotel-group rows before per-person totals", () => {
  const { days, selectedHotel, peopleCount, peopleDetails } = buildFixture();
  const persistedDays = injectHotelIntoDaysPure(
    days,
    selectedHotel,
    peopleCount,
    peopleDetails,
  );
  const rehydrated = deriveSelectedHotelFromDays(persistedDays, null, null);
  const core = buildSummaryPricingCore({
    selectedHotel: rehydrated,
    perRoomPricing: rehydrated.perRoomPricing,
    peopleDetails,
    peopleCount,
    subtotalIndividual: 237.03,
    additionalCosts: {
      operationalCosts: 0,
      fee: 20,
      feeMode: "percentage",
      extraFee: 0,
    },
  });

  assert.equal(core.perRoomPricing.length, 1);
  assert.equal(core.perRoomPricing[0].hotelPerPerson, 637.5);
  assert.equal(core.perRoomPricing[0].adultBeneficiaries, 8);
  assert.equal(core.parts.length, 1);
  assert.equal(core.parts[0].services, 237.03);
  assert.equal(core.parts[0].hotel, 637.5);
  assert.equal(core.parts[0].additional, 174.91);
  assert.equal(core.parts[0].value, 1049.44);
  assert.equal(core.parts[0].displayValue, 1050);
  assert.equal(core.roundedTotal, 8400);
});
