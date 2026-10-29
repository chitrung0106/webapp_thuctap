import test from "node:test";
import assert from "node:assert/strict";
import { getCellIssue, validateDataset } from "../datasetValidation.ts";
import { parseCsv, prepareTrainingData, createTrainingSnapshot } from "../csv.ts";

test("reports blank selected inputs/labels, accepts zero and ignores unused cells", () => {
  assert.equal(getCellIssue("   ", "input"), "Thiếu input");
  assert.equal(getCellIssue("\t", "output"), "Thiếu label");
  assert.equal(getCellIssue("0", "input"), "");
  assert.equal(getCellIssue("", "unused"), "");
});

test("preserves text and numbers without imposing model-specific types", () => {
  for (const value of ["category", "25.5", "normal", "2,5"]) {
    assert.equal(getCellIssue(value, "input"), "");
    assert.equal(getCellIssue(value, "output"), "");
  }
  const doc = parseCsv("color,value,label\nblue,25,ok");
  const snapshot = createTrainingSnapshot(doc, true, ["color", "value", "label"], ["input", "input", "output"], new Set(), "data.csv");
  assert.deepEqual(snapshot.data.inputs, [["blue", "25"]]);
  assert.equal("inputType" in snapshot.columns[0], false);
});

test("counts rows with missing input/label and excludes checked rows from blocking", () => {
  const rows = parseCsv("a,b,y\n,,\nword,2,ok\n1,3,ok").rows.slice(1);
  const roles = ["input", "input", "output"];
  const validation = validateDataset(rows, roles, new Set());
  assert.equal(validation.missingInputCount, 1);
  assert.equal(validation.missingOutputCount, 1);
  assert.equal(validation.invalidIncludedCount, 1);
  assert.equal(validateDataset(rows, roles, new Set([1])).invalidIncludedCount, 0);
});

test("training still rejects blank included inputs", () => {
  const doc = parseCsv("x,y\n,ok\ntext,ok");
  assert.throws(() => prepareTrainingData(doc.rows.slice(1), ["x", "y"], ["input", "output"], new Set()));
  const snapshot = createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set([1]), "data.csv");
  assert.deepEqual(snapshot.data.inputs, [["text"]]);
});