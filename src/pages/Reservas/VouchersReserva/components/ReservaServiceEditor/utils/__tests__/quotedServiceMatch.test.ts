import test from "node:test";
import assert from "node:assert/strict";
import { findReservationEditorQuotedMatch } from "../quotedServiceMatch";

const quoted = (id: number, child: number, more = {}) => ({servicioId: id, typeService: "tickets", parent_id: child, child_id: child, ...more});

test("stable service IDs beat row and day order", () => {
  const a = quoted(1, 101), b = quoted(2, 102);
  const itinerary = [{numero: 2, servicios: [b]}, {numero: 1, servicios: [a]}];
  assert.equal(findReservationEditorQuotedMatch({service: {...b}, day: {numero: 2}, quotedItinerary: itinerary}).service, b);
});

test("an explicit quote reference never falls back to a neighboring service", () => {
  const a = quoted(1, 101);
  assert.equal(findReservationEditorQuotedMatch({service: {...a, servicioId: 22, cotizacionServiceRef: {id: 999, serviceIndex: 0}}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a]}]}).service, null);
});

test("version UID resolves cloned operational services with different row IDs", () => {
  const a = quoted(1, 101, {versionUid: "service-version"});
  assert.equal(findReservationEditorQuotedMatch({service: {servicioId: 22, versionUid: "service-version"}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a]}]}).service, a);
});

test("legacy identity only matches within the uniquely identified source day", () => {
  const a = quoted(1, 101), b = quoted(2, 101);
  const itinerary = [{numero: 1, servicios: [a]}, {numero: 2, servicios: [b]}];
  assert.equal(findReservationEditorQuotedMatch({service: {typeService: "tickets", parent_id: 101, child_id: 101}, day: {numero: 2}, quotedItinerary: itinerary}).service, b);
});

test("same supplier/ticket identity with several cohorts requires explicit disambiguation", () => {
  const a = quoted(1, 101), b = quoted(2, 101);
  const result = findReservationEditorQuotedMatch({service: {typeService: "tickets", parent_id: 101, child_id: 101}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a, b]}]});
  assert.equal(result.service, null);
  assert.equal(result.reason, "ambiguous");
});

test("a unique exact cohort distinguishes repeated providers without using position", () => {
  const a = quoted(1, 101, {beneficiariosAdultos: [{id: "adult:1"}]}), b = quoted(2, 101, {beneficiariosAdultos: [{id: "adult:2"}]});
  const result = findReservationEditorQuotedMatch({service: {typeService: "tickets", parent_id: 101, child_id: 101, beneficiariosAdultos: [{id: "adult:2"}]}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a, b]}]});
  assert.equal(result.service, b);
});

test("external services cannot match a main service with the same numeric ID", () => {
  const main = quoted(1, 101), external = quoted(1, 101, {sourceItinerary: "external"});
  assert.equal(findReservationEditorQuotedMatch({service: {...external}, day: {sourceItinerary: "external", numero: 1}, quotedItinerary: [{numero: 1, servicios: [main]}]}).service, null);
  assert.equal(findReservationEditorQuotedMatch({service: {...external}, day: {sourceItinerary: "external", numero: 1}, quotedItinerary: [{numero: 1, servicios: [main]}, {numero: 1, sourceItinerary: "external", servicios: [external]}]}).service, external);
});

test("a manual service and ambiguous days do not inherit a quote row by array index", () => {
  const a = quoted(1, 101);
  assert.equal(findReservationEditorQuotedMatch({service: {isCustomService: true}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a]}]}).reason, "custom");
  assert.equal(findReservationEditorQuotedMatch({service: {typeService: "tickets", parent_id: 101, child_id: 101}, day: {numero: 1}, quotedItinerary: [{numero: 1, servicios: [a]}, {numero: 1, servicios: [quoted(2, 101)]}]}).service, null);
});
