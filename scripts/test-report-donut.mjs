import test from "node:test";
import assert from "node:assert/strict";
import { buildDonutModel, donutColor, formatDonutValue } from "../src/components/reports/donutChartModel.ts";
import { buildFarmAreaChart } from "../supabase/functions/_shared/farmAreaChart.ts";

test("zero total does not produce drawable segments", () => {
  const model = buildDonutModel([{ key: "empty", label: "Sem dados", value: 0 }]);
  assert.equal(model.total, 0);
  assert.equal(model.segments[0].fraction, 0);
});

test("one category occupies the full ring", () => {
  const model = buildDonutModel([{ key: "one", label: "Pessoa Física", value: 2 }]);
  assert.equal(model.total, 2);
  assert.equal(model.segments[0].fraction, 1);
  assert.equal(model.segments[0].displayPercentage, "100%");
});

test("two categories use the represented total for percentages", () => {
  const model = buildDonutModel([
    { key: "a", label: "Ativo", value: 3 },
    { key: "b", label: "Inativo", value: 1 },
  ]);
  assert.equal(model.total, 4);
  assert.deepEqual(model.segments.map((item) => item.displayPercentage), ["75%", "25%"]);
  assert.equal(model.segments[1].startFraction, 0.75);
});

test("five equally sized categories each represent one fifth", () => {
  const model = buildDonutModel(Array.from({ length: 5 }, (_, index) => ({
    key: String(index), label: `Categoria ${index + 1}`, value: 1,
  })));
  assert.equal(model.total, 5);
  assert.deepEqual(model.segments.map((item) => item.displayPercentage), Array(5).fill("20%"));
  assert.equal(model.segments.reduce((sum, item) => sum + item.fraction, 0), 1);
});

test("dominant category still uses the full represented total", () => {
  const model = buildDonutModel([
    { key: "dominant", label: "Dominante", value: 95 },
    { key: "minor", label: "Menor", value: 5 },
  ]);
  assert.equal(model.total, 100);
  assert.deepEqual(model.segments.map((item) => item.displayPercentage), ["95%", "5%"]);
});

test("more than five farms sum the remainder into Outros without losing area", () => {
  const chart = buildFarmAreaChart([60, 50, 40, 30, 20, 10, 5].map((totalArea, index) => ({
    id: `farm-${index}`, name: `Fazenda ${index}`, totalArea,
  })));
  assert.equal(chart.totalArea, 215);
  assert.equal(chart.items.length, 6);
  assert.equal(chart.items.at(-1).label, "Outros");
  assert.equal(chart.items.at(-1).area, 15);
  assert.equal(chart.items.reduce((sum, item) => sum + item.area, 0), chart.totalArea);
  assert.equal(chart.items.at(-1).fraction, 15 / 215);
  const five = buildFarmAreaChart([60, 50, 40, 30, 20].map((totalArea, index) => ({
    id: `farm-${index}`, name: `Fazenda ${index}`, totalArea,
  })));
  assert.equal(five.items.length, 5);
  assert.equal(five.items.some((item) => item.id === "others"), false);
});

test("many categories and non-positive values stay finite", () => {
  const model = buildDonutModel([
    { key: "a", label: "A", value: 5 }, { key: "b", label: "B", value: 4 },
    { key: "c", label: "C", value: 3 }, { key: "d", label: "D", value: 2 },
    { key: "e", label: "E", value: 1 }, { key: "other", label: "Outros", value: 1 },
    { key: "invalid", label: "Inválido", value: Number.NaN },
  ]);
  assert.equal(model.total, 16);
  assert.equal(model.segments.reduce((sum, item) => sum + item.fraction, 0), 1);
  assert.equal(model.segments.at(-1).fraction, 0);
});

test("semantic colors and absolute labels remain consistent", () => {
  assert.equal(donutColor("Ativo", 0), donutColor("Ativa", 5));
  assert.equal(donutColor("Vencido", 0), donutColor("Vencidos", 4));
  assert.equal(donutColor("Outros", 1), donutColor("Outros", 5));
  assert.equal(formatDonutValue(1), "1 registro");
  assert.equal(formatDonutValue(2, undefined, "vínculo"), "2 vínculos");
  assert.equal(formatDonutValue(650, "650 ha"), "650 ha");
});
