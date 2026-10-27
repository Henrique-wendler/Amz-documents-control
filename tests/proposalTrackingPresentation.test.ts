import { expect, it } from "vitest";
import {
  trackingCurrency,
  trackingDate,
} from "../src/services/proposalTrackingPresentation";
it.each([
  ["1750000.00", "R$ 1.750.000,00"],
  ["0", "R$ 0,00"],
  ["100.5", "R$ 100,50"],
  ["999999999999999999.99", "R$ 999.999.999.999.999.999,99"],
])("formats exact decimal text %s without losing cents", (value, expected) => {
  expect(trackingCurrency(value).replace(/\s/g, " ")).toBe(expected);
});
it("does not invent missing financial values", () => {
  expect(trackingCurrency(null)).toBe("Não informado");
});
it("keeps civil deadline on the same day in the operational timezone", () => {
  expect(trackingDate("2026-10-26")).toBe("26/10/2026");
});
