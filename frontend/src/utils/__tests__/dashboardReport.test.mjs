import test from "node:test";
import assert from "node:assert/strict";
import { reportStats, comparisonResults } from "../dashboardReport.ts";
import { rankedResults, higherIsBetter, formatMetric } from "../trainingResults.ts";
const result = (id, validation, test, seconds = 1, status = "succeeded") => ({ id, status, metrics: { validation: { accuracy: validation }, test: { accuracy: test } }, durationSeconds: seconds });

test("overview recognizes all validation ties without choosing by test", () => {
  const results = [result("a", .9, .2), result("b", .9, 1), result("c", .8, 1, .1), result("failed", 1, 1, .01, "failed")];
  const stats = reportStats(results, "accuracy");
  assert.deepEqual(stats.leaders.map((r) => r.id), ["a", "b"]);
  assert.equal(stats.bestScore, .9);
  assert.deepEqual(stats.fastest.map((r) => r.id), ["c"]);
  assert.equal(reportStats([result("x", undefined, 1)], "accuracy").leaders.length, 0);
  assert.equal(reportStats([result("x", NaN, 1)], "accuracy").leaders.length, 0);
});

test("overview respects lower regression error and missing time", () => {
  const results = [result("a", undefined, 1, null), result("b", undefined, 1, 0)];
  results[0].metrics.validation.rmse = 5;
  results[1].metrics.validation.rmse = 3;
  assert.equal(reportStats(results, "rmse").leaders[0].id, "b");
  assert.equal(reportStats(results, "rmse").minimumTime, 0);
  assert.equal(reportStats([], "rmse").bestScore, undefined);
});

test("binary comparison uses selected class and validation split, never substitutes test", () => {
  const raw = result("a", .8, .9);
  raw.binaryMetricsBySplit = { validation: [{ positiveClass: "fault", recall: .2, falsePositiveRate: .1 }], test: [{ positiveClass: "fault", recall: .95, falsePositiveRate: .8 }] };
  const viewed = comparisonResults([raw], "fault")[0];
  assert.equal(viewed.metrics.validation.binary_recall, .2);
  assert.equal(viewed.metrics.test.binary_recall, .95);
  assert.equal(viewed.metrics.validation.binary_fpr, .1);
  assert.equal(raw.metrics.validation.binary_recall, undefined);
  assert.equal(higherIsBetter("binary_recall"), true);
  assert.equal(higherIsBetter("binary_fpr"), false);
  assert.equal(formatMetric(.2, "binary_recall"), "20.00%");
  const old = result("old", .8, .9);
  old.classes = ["normal", "fault"]; old.confusionMatrix = [[8, 2], [3, 7]];
  const view = comparisonResults([old], "fault")[0];
  assert.equal(view.metrics.validation.binary_recall, undefined);
  assert.equal(view.metrics.test.binary_recall, .7);
  assert.deepEqual(reportStats([view], "binary_recall").leaders, []);
  assert.equal(rankedResults([view, viewed], "binary_recall")[0].id, "a");
});
