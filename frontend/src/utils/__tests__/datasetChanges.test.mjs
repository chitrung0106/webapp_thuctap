import test from "node:test";
import assert from "node:assert/strict";
import { summarizeChanges } from "../datasetChanges.ts";
import { parseCsv, serializeProcessedCsv, createTrainingSnapshot } from "../csv.ts";

function editedDocument(original, rowId, columnIndex, value) {
  return { ...original, rows: original.rows.map((row) => row.id === rowId
    ? { ...row, values: row.values.map((cell, index) => index === columnIndex ? value : cell) }
    : row) };
}

test("counts changed cells and distinct rows without mutating the original", () => {
  const original = parseCsv("1,2,0\n3,4,1");
  let current = editedDocument(original, 0, 0, "5");
  current = editedDocument(current, 0, 1, "6");
  current = editedDocument(current, 1, 2, "0");
  const changes = summarizeChanges(original.rows, current.rows);
  assert.equal(changes.cellCount, 3);
  assert.equal(changes.rowCount, 2);
  assert.deepEqual([...changes.changedCells], ["0:0", "0:1", "1:2"]);
  assert.deepEqual(original.rows.map((row) => row.values), [["1", "2", "0"], ["3", "4", "1"]]);
});

test("returning cells to their original value removes the change", () => {
  const original = parseCsv("1,2,0");
  let current = editedDocument(original, 0, 2, "1");
  assert.equal(summarizeChanges(original.rows, current.rows).cellCount, 1);
  current = editedDocument(current, 0, 2, "0");
  assert.equal(summarizeChanges(original.rows, current.rows).cellCount, 0);
  assert.equal(summarizeChanges(original.rows, current.rows).rowCount, 0);
});

test("CSV export retains headers and all columns, applies edits and omits checked rows", () => {
  const original = parseCsv("a,b,label\n1,2,0\n3,4,1\n5,6,0");
  const current = editedDocument(original, 1, 0, "changed");
  const exported = parseCsv(serializeProcessedCsv(current, true, new Set([0, 2])));
  assert.deepEqual(exported.rows.map((row) => row.values), [["a", "b", "label"], ["changed", "2", "0"], ["5", "6", "0"]]);
  assert.deepEqual(original.rows[1].values, ["1", "2", "0"]);
});

test("headerless CSV export keeps its first row and round-trips special characters", () => {
  for (const delimiter of [",", ";", "\t"]) {
    const original = parseCsv(`x${delimiter}0\ny${delimiter}1`);
    const current = editedDocument(original, 0, 0, 'a,"b"\nnext\tcolumn');
    const exported = parseCsv(serializeProcessedCsv(current, false, new Set([1])));
    assert.equal(exported.delimiter, delimiter);
    assert.deepEqual(exported.rows[0].values, ['a,"b"\nnext\tcolumn', "0"]);
    assert.equal(exported.rows.length, 1);
  }
});

test("snapshot is detached from subsequent cell edits, exclusions, names and roles", () => {
  const doc = parseCsv("x,y\n1,0\n2,1");
  const names = ["x", "y"];
  const roles = ["input", "output"];
  const excluded = new Set([2]);
  const snapshot = createTrainingSnapshot(doc, true, names, roles, excluded, "data.csv");
  doc.rows[1].values[0] = "changed later";
  names[0] = "new name";
  roles[0] = "unused";
  excluded.clear();
  assert.deepEqual(snapshot.data.inputs, [["1"]]);
  assert.deepEqual(snapshot.data.outputs, [["0"]]);
  assert.equal(snapshot.columns[0].name, "x");
  assert.equal(snapshot.columns[0].role, "input");
  assert.deepEqual(snapshot.excludedSourceLines, [3]);
  assert.deepEqual(parseCsv(snapshot.csv).rows.map((row) => row.values), [["x", "y"], ["1", "0"]]);
});

test("snapshot refuses missing included targets and zero training rows", () => {
  const doc = parseCsv("x,y\n1,\n2,0");
  assert.throws(() => createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set(), "data.csv"));
  assert.throws(() => createTrainingSnapshot(doc, true, ["x", "y"], ["input", "output"], new Set([1, 2]), "data.csv"));
});