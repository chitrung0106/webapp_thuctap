import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, createTrainingSnapshot } from "../csv.ts";
import { getLabelPreprocessingErrors, validateDataset } from "../datasetValidation.ts";
import { createTrainingForm } from "../../config/modelCatalog.ts";
import { buildTrainingPlan } from "../trainingConfig.ts";

const numericInput = [{ kind: "number", scaling: "standard", encoding: "onehot", categoryOrder: [] }];
function targets(task, count = 2) { return Array.from({ length: count }, () => ({ task })); }

test("requires an explicit classification/regression choice for labels", () => {
  assert.equal(getLabelPreprocessingErrors(["x", "y"], ["input", "output"], targets("unset")).length, 1);
  const doc = parseCsv("x,y\n1,ok\n2,error");
  assert.throws(() => createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv", numericInput, targets("unset")));
});

test("categorical labels use class encoding metadata while preserving original names", () => {
  const doc = parseCsv("x,y\n1,normal\n2,error");
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv", numericInput, targets("binary"));
  assert.deepEqual(snapshot.data.outputs, [["normal"], ["error"]]);
  assert.equal(snapshot.labelPreprocessing[0].encoding, "label_encoder");
  assert.equal(snapshot.labelPreprocessing[0].restoreOriginalLabel, true);
});

test("numeric classification IDs are still class names, not regression values", () => {
  const doc = parseCsv("x,y\n1,100\n2,200");
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv", numericInput, targets("binary"));
  assert.equal(snapshot.labelPreprocessing[0].task, "classification");
  assert.equal(snapshot.labelPreprocessing[0].encoding, "label_encoder");
  assert.equal(snapshot.data.outputs[0][0], "100");
});

test("regression labels remain numeric targets and reject nonnumeric included rows", () => {
  const doc = parseCsv("x,y\n1,25.5\n2,broken");
  const roles = ["input", "output"];
  const config = targets("regression");
  assert.equal(validateDataset(doc.rows.slice(1), roles, new Set(), numericInput, config).invalidLabelCount, 1);
  assert.throws(() => createTrainingSnapshot(doc, true, ["x", "y"], roles, new Set(), "data.csv", numericInput, config));
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], roles, new Set([2]), "data.csv", numericInput, config);
  assert.deepEqual(snapshot.data.outputs, [["25.5"]]);
  assert.equal(snapshot.labelPreprocessing[0].encoding, "none");
  assert.equal(snapshot.labelPreprocessing[0].restoreOriginalLabel, false);
});

test("mixed classification and regression labels require separate runs", () => {
  assert.ok(getLabelPreprocessingErrors(["x", "y", "z"], ["input", "output", "output"], [{ task: "unset" }, { task: "binary" }, { task: "regression" }]).some((error) => error.includes("cùng loại bài toán")));
});

test("training task must agree with confirmed label meaning and preserves label metadata", () => {
  const doc = parseCsv(["x,y", ...Array.from({ length: 100 }, (_, index) => `${index},${index % 2}`)].join("\n"));
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv", numericInput, targets("binary"));
  assert.throws(() => buildTrainingPlan(snapshot, createTrainingForm("regression")));
  const plan = buildTrainingPlan(snapshot, createTrainingForm());
  assert.equal(plan.preprocessing.targets[0].encoding, "label_encoder");
  snapshot.labelPreprocessing[0].name = "changed";
  assert.equal(plan.preprocessing.targets[0].name, "y");
});
test("manual Binary and Multiclass choices validate retained classes without changing selection", () => {
  const doc = parseCsv("x,y\n1,A\n2,B\n3,C");
  const columns = ["x", "y"], roles = ["input", "output"];
  const binary = targets("binary");
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", numericInput, binary), /đã chọn Binary/);
  assert.equal(binary[1].task, "binary");
  const multiclass = targets("multiclass");
  const snapshot = createTrainingSnapshot(doc, true, columns, roles, new Set(), "data.csv", numericInput, multiclass);
  assert.equal(snapshot.labelPreprocessing[0].problemType, "multiclass");
  assert.equal(snapshot.labelPreprocessing[0].task, "classification");
  assert.throws(() => createTrainingSnapshot(doc, true, columns, roles, new Set([3]), "data.csv", numericInput, multiclass), /đã chọn Multiclass/);
  assert.equal(multiclass[1].task, "multiclass");
  const two = createTrainingSnapshot(doc, true, columns, roles, new Set([3]), "data.csv", numericInput, binary);
  assert.equal(two.labelPreprocessing[0].problemType, "binary");
});

test("two numeric values do not override a manually selected regression task", () => {
  const doc = parseCsv("x,y\n1,25\n2,30\n3,25\n4,30");
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv", numericInput, targets("regression"));
  assert.equal(snapshot.labelPreprocessing[0].problemType, "regression");
  assert.equal(snapshot.labelPreprocessing[0].task, "regression");
});
