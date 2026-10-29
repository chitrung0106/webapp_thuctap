import test from "node:test";
import assert from "node:assert/strict";
import { binaryReportsFromMatrix, rankedResults, formatMetric } from "../trainingResults.ts";

const result = (id, validation, test, status = "succeeded") => ({ id, status, metrics: { validation, test } });
test("ranking uses validation rather than the held-out test result", () => {
  const models = [result("a", { accuracy: .8 }, { accuracy: 1 }), result("b", { accuracy: .9 }, { accuracy: .7 }), result("failed", {}, {}, "failed")];
  assert.deepEqual(rankedResults(models, "accuracy").map((model) => model.id), ["b", "a"]);
});
test("regression errors rank lower first and unavailable metrics sort last", () => {
  const models = [result("a", { rmse: 4 }, {}), result("missing", {}, {}), result("b", { rmse: 2 }, {})];
  assert.deepEqual(rankedResults(models, "rmse").map((model) => model.id), ["b", "a", "missing"]);
  assert.equal(formatMetric(undefined, "accuracy"), "—");
  assert.equal(formatMetric(.9, "accuracy"), "90.00%");
});
test("old binary runs derive class-specific metrics from their saved matrix", () => {
  const reports = binaryReportsFromMatrix({ classes: ["normal", "fault"], confusionMatrix: [[8, 2], [3, 7]] });
  assert.equal(reports[1].recall, 0.7);
  assert.equal(reports[1].specificity, 0.8);
  assert.equal(reports[1].falsePositiveRate, 0.2);
  assert.equal(reports[1].falseNegativeRate, 0.3);
  assert.equal(reports[0].recall, 0.8);
  const empty = binaryReportsFromMatrix({ classes: ["normal", "fault"], confusionMatrix: [[10, 0], [0, 0]] });
  assert.equal(empty[1].recall, null);
  assert.equal(binaryReportsFromMatrix({ classes: ["a", "b", "c"], confusionMatrix: [] }), null);
});