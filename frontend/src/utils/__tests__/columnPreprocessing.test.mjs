import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, createTrainingSnapshot, serializeProcessedCsv } from "../csv.ts";
import { createColumnPreprocessing, getPreprocessingErrors, validateDataset } from "../datasetValidation.ts";
import { createTrainingForm } from "../../config/modelCatalog.ts";
import { buildTrainingPlan } from "../trainingConfig.ts";

function mixed() {
  const doc = parseCsv("temperature,device,label\n25,pump,ok\n30,fan,error\n28,pump,error\n20,fan,ok");
  const roles = ["input", "input", "output"];
  const configs = createColumnPreprocessing(3);
  configs[0].kind = "number"; configs[0].scaling = "minmax";
  configs[1].kind = "category"; configs[1].encoding = "onehot";
  return { doc, roles, configs, columns: ["temperature", "device", "label"] };
}

test("requires an explicit choice for every selected input", () => {
  const { doc, columns, roles } = mixed();
  const configs = createColumnPreprocessing(3);
  assert.equal(getPreprocessingErrors(doc.rows.slice(1), columns, roles, new Set(), configs).length, 2);
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs));
});

test("handles mixed numeric/categorical columns without converting original data", () => {
  const { doc, roles, configs, columns } = mixed();
  const before = serializeProcessedCsv(doc, true, new Set());
  const snapshot = createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs);
  assert.deepEqual(snapshot.data.inputs[0], ["25", "pump"]);
  assert.equal(snapshot.inputPreprocessing[0].config.scaling, "minmax");
  assert.equal(snapshot.inputPreprocessing[1].config.encoding, "onehot");
  assert.equal(serializeProcessedCsv(doc, true, new Set()), before);
  configs[0].scaling = "none";
  assert.equal(snapshot.inputPreprocessing[0].config.scaling, "minmax");
});

test("flags text in a numeric column and ignores excluded rows", () => {
  const { doc, roles, configs, columns } = mixed();
  doc.rows[1].values[0] = "broken";
  assert.equal(validateDataset(doc.rows.slice(1), roles, new Set(), configs).invalidInputCount, 1);
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs));
  assert.doesNotThrow(() => createTrainingSnapshot(doc, true, columns, roles, new Set([1]), "data.csv", configs));
});

test("numeric-looking category codes remain valid categorical input", () => {
  const { doc, roles, configs, columns } = mixed();
  doc.rows[1].values[1] = "001";
  assert.equal(validateDataset(doc.rows.slice(1), roles, new Set(), configs).invalidIncludedCount, 0);
  assert.equal(createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs).data.inputs[0][1], "001");
});

test("Ordinal requires a complete, explicit, non-duplicate category order", () => {
  const { doc, roles, configs, columns } = mixed();
  configs[1].encoding = "ordinal";
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs));
  configs[1].categoryOrder = ["pump", "pump"];
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs));
  configs[1].categoryOrder = ["fan", "pump"];
  const snapshot = createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs);
  configs[1].categoryOrder.reverse();
  assert.deepEqual(snapshot.inputPreprocessing[1].config.categoryOrder, ["fan", "pump"]);
});

test("ignored and label columns do not need preprocessing configurations", () => {
  const { doc, roles, configs, columns } = mixed();
  roles[1] = "unused";
  configs[1].kind = "unset";
  const snapshot = createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs);
  assert.equal(snapshot.inputPreprocessing.length, 1);
  assert.equal(snapshot.inputPreprocessing[0].columnIndex, 0);
});

test("training plans inherit per-column preprocessing, detached from later changes", () => {
  const { doc, roles, configs, columns } = mixed();
  const snapshot = createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", configs, Array.from({ length: doc.columnCount }, () => ({ task: "binary" })));
  const form = createTrainingForm();
  form.selected = ["tree"];
  form.shared.stratify = false;
  form.shared.trainPercent = "50"; form.shared.validationPercent = "25"; form.shared.testPercent = "25";
  const plan = buildTrainingPlan(snapshot, form);
  assert.equal(plan.preprocessing.columns[0].config.scaling, "minmax");
  assert.equal(plan.preprocessing.columns[1].config.encoding, "onehot");
  assert.equal(plan.preprocessing.fitOn, "train_only");
  snapshot.inputPreprocessing[0].config.scaling = "none";
  assert.equal(plan.preprocessing.columns[0].config.scaling, "minmax");
});