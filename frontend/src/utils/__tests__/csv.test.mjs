import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, hasMissingOutput, prepareTrainingData } from "../csv.ts";

test("recognizes CR, LF and CRLF without creating an extra final row", () => {
  for (const newline of ["\r", "\n", "\r\n"]) {
    const parsed = parseCsv(`25,60,0${newline}24,62,1${newline}`);
    assert.deepEqual(parsed.rows.map((row) => row.values), [["25", "60", "0"], ["24", "62", "1"]]);
    assert.deepEqual(parsed.rows.map((row) => row.sourceLine), [1, 2]);
  }
});

test("handles BOM, quoted separators, escaped quotes and multiline fields", () => {
  const parsed = parseCsv('\uFEFFname,target\r\n"a,b",0\r\n"say ""hi""",1\r\n"two\nlines",2');
  assert.deepEqual(parsed.rows[1].values, ["a,b", "0"]);
  assert.deepEqual(parsed.rows[2].values, ['say "hi"', "1"]);
  assert.deepEqual(parsed.rows[3].values, ["two\nlines", "2"]);
});

test("detects semicolon and tab separators", () => {
  for (const separator of [";", "\t"]) {
    const parsed = parseCsv(`x${separator}y\n1${separator}0`);
    assert.equal(parsed.delimiter, separator);
    assert.deepEqual(parsed.rows[1].values, ["1", "0"]);
  }
});

test("rejects malformed quotes, extra columns, empty and binary data", () => {
  for (const source of ['a,b\n"oops,0', 'a,b\n"x"z,0', 'a,b\nx"y,0', 'a,b\n1,2,3', '', 'a,b\n\0,0']) {
    assert.throws(() => parseCsv(source));
  }
});

test("keeps blank and short rows to identify missing output; zero is valid", () => {
  const parsed = parseCsv("x,y\n1\n\n2,\n3,0\n4,   ");
  const roles = ["input", "output"];
  assert.equal(parsed.paddedRows, 2);
  assert.deepEqual(parsed.rows[1].values, ["1", ""]);
  assert.equal(hasMissingOutput(parsed.rows[1], roles), true);
  assert.equal(hasMissingOutput(parsed.rows[2], roles), true);
  assert.equal(hasMissingOutput(parsed.rows[4], roles), false);
  assert.equal(hasMissingOutput(parsed.rows[5], roles), true);
});

test("training selection omits checked rows and keeps column selections and edits", () => {
  const rows = parseCsv("a,b,c\n1,2,\n3,4,0").rows.slice(1);
  const columns = ["a", "b", "c"];
  const roles = ["input", "unused", "output"];
  assert.throws(() => prepareTrainingData(rows, columns, roles, new Set()));
  assert.deepEqual(prepareTrainingData(rows, columns, roles, new Set([1])), {
    inputColumns: ["a"], outputColumns: ["c"], inputs: [["3"]], outputs: [["0"]],
  });
  rows[0].values[2] = "1";
  assert.deepEqual(prepareTrainingData(rows, columns, roles, new Set()).outputs, [["1"], ["0"]]);
  assert.throws(() => prepareTrainingData(rows, columns, roles, new Set([1, 2])));
  assert.throws(() => prepareTrainingData(rows, columns, ["unused", "unused", "output"], new Set()));
});

test("supports multiple outputs and rejects any included blank target", () => {
  const rows = parseCsv("1,0,yes\n2,1,").rows;
  const roles = ["input", "output", "output"];
  assert.equal(hasMissingOutput(rows[0], roles), false);
  assert.equal(hasMissingOutput(rows[1], roles), true);
  assert.throws(() => prepareTrainingData(rows, ["x", "y", "z"], roles, new Set()));
});