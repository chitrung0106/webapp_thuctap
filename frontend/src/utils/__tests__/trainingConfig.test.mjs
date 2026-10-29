import test from "node:test";
import assert from "node:assert/strict";
import { createTrainingForm, getModelCatalog } from "../../config/modelCatalog.ts";
import { buildTrainingPlan, inspectTrainingConfig, parseParameter } from "../trainingConfig.ts";
import { parseCsv, createTrainingSnapshot } from "../csv.ts";

function snapshot(targets = 1, task = "classification") {
  const header = targets === 1 ? "x,y" : "x,y,z";
  const csv = [header, ...Array.from({ length: 100 }, (_, index) => targets === 1 ? `${index},${index % 2}` : `${index},${index % 2},${index % 3}`)].join("\n");
  const doc = parseCsv(csv);
  return createTrainingSnapshot(doc, true, targets === 1 ? ["x", "y"] : ["x", "y", "z"], targets === 1 ? ["input", "output"] : ["input", "output", "output"], new Set(), "data.csv", Array.from({ length: doc.columnCount }, () => ({ kind: "number", scaling: "standard", encoding: "onehot", categoryOrder: [] })), Array.from({ length: doc.columnCount }, (_, index) => ({ task: task === "regression" ? "regression" : index === 2 ? "multiclass" : "binary" })));
}

test("basic classification batch contains nine models and shared 70/15/15 split", () => {
  const data = snapshot();
  const form = createTrainingForm();
  const inspected = inspectTrainingConfig(data, form);
  assert.deepEqual(inspected.errors, []);
  assert.deepEqual(inspected.counts, { train: 70, validation: 15, test: 15 });
  const plan = buildTrainingPlan(data, form);
  assert.equal(plan.jobs.length, 9);
  assert.equal(plan.preprocessing.fitOn, "train_only");
  assert.equal(plan.execution.concurrentJobs, 1);
  assert.equal(plan.split.stratify, true);
  assert.equal(plan.jobs.find((job) => job.modelId === "mlp").parameters.max_iter, 200);
  assert.equal(plan.jobs.find((job) => job.modelId === "linear").parameters.class_weight, null);
});

test("all twelve classification model configurations validate", () => {
  const form = createTrainingForm();
  form.selected = getModelCatalog("classification").map((model) => model.id); form.shared.environment = "server";
  assert.equal(buildTrainingPlan(snapshot(), form).jobs.length, 12);
});

test("regression defaults omit Naive Bayes and use Ridge plus numeric labels", () => {
  const form = createTrainingForm("regression");
  const plan = buildTrainingPlan(snapshot(1, "regression"), form);
  assert.equal(plan.jobs.length, 8);
  assert.equal(plan.metric, "rmse");
  assert.equal(plan.jobs[0].modelName, "Ridge Regression");
  assert.equal(plan.split.stratify, false);
  form.selected = getModelCatalog("regression").map((model) => model.id); form.shared.environment = "server";
  assert.equal(buildTrainingPlan(snapshot(1, "regression"), form).jobs.length, 11);
});

test("multiple labels create independent jobs and disable single-label stratification", () => {
  const form = createTrainingForm();
  const plan = buildTrainingPlan(snapshot(2), form);
  assert.equal(plan.jobs.length, 18);
  assert.equal(plan.split.stratify, false);
  assert.deepEqual(plan.jobs.slice(0, 2).map((job) => job.targetIndex), [0, 1]);
});

test("rejects invalid split, blank values, seed, model selection and parameters", () => {
  const data = snapshot();
  for (const mutate of [
    (f) => { f.shared.trainPercent = "80"; },
    (f) => { f.shared.trainPercent = ""; },
    (f) => { f.shared.seed = "-1"; },
    (f) => { f.selected = []; },
    (f) => { f.parameters.knn.n_neighbors = "71"; },
    (f) => { f.parameters.mlp.hidden_layer_sizes = "64,,32"; },
    (f) => { f.parameters.forest.n_estimators = "1.5"; },
    (f) => { f.parameters.linear.C = "0"; },
  ]) {
    const form = createTrainingForm(); mutate(form);
    assert.ok(inspectTrainingConfig(data, form).errors.length);
    assert.throws(() => buildTrainingPlan(data, form));
  }
});

test("regression rejects text label and classification rejects a single class", () => {
  const data = snapshot();
  data.data.outputs = data.data.outputs.map(() => ["normal"]);
  assert.ok(inspectTrainingConfig(data, createTrainingForm("regression")).errors.some((error) => error.includes("phải là số")));
  assert.ok(inspectTrainingConfig(data, createTrainingForm()).errors.some((error) => error.includes("2 lớp")));
});

test("only active parameters are required and serialized", () => {
  const form = createTrainingForm();
  form.parameters.svm.kernel = "linear";
  form.parameters.svm.degree = "";
  form.parameters.mlp.validation_fraction = "";
  const plan = buildTrainingPlan(snapshot(), form);
  assert.equal("degree" in plan.jobs.find((job) => job.modelId === "svm").parameters, false);
  assert.equal("validation_fraction" in plan.jobs.find((job) => job.modelId === "mlp").parameters, false);
});

test("plan remains detached from subsequent form and dataset modifications", () => {
  const data = snapshot(); const form = createTrainingForm();
  const plan = buildTrainingPlan(data, form);
  data.data.inputs[0][0] = "changed";
  form.parameters.forest.n_estimators = "999";
  assert.equal(plan.dataset.data.inputs[0][0], "0");
  assert.equal(plan.jobs.find((job) => job.modelId === "forest").parameters.n_estimators, 100);
});

test("invalid sparse class stratification is blocked and ordered splitting bypasses it", () => {
  const data = snapshot(); data.data.outputs[0][0] = "rare";
  const form = createTrainingForm();
  assert.ok(inspectTrainingConfig(data, form).errors.some((error) => error.includes("phân tầng")));
  form.shared.split = "ordered";
  assert.equal(buildTrainingPlan(data, form).split.stratify, false);
});

test("special numeric fields serialize none and auto correctly", () => {
  const catalog = getModelCatalog("classification");
  const depth = catalog.find((m) => m.id === "tree").fields.find((f) => f.key === "max_depth");
  assert.equal(parseParameter(depth, "none"), null);
  const batch = catalog.find((m) => m.id === "mlp").fields.find((f) => f.key === "batch_size");
  assert.equal(parseParameter(batch, "auto"), "auto");
  assert.throws(() => parseParameter(batch, "0"));
});
test("learning controls are sent only to MLP and are validated when selected", () => {
  const data = snapshot();
  const form = createTrainingForm();
  form.parameters.mlp.max_iter = "7";
  form.parameters.mlp.batch_size = "8";
  const plan = buildTrainingPlan(data, form);
  assert.equal(plan.jobs.find((job) => job.modelId === "mlp").parameters.max_iter, 7);
  assert.equal(plan.jobs.find((job) => job.modelId === "mlp").parameters.batch_size, 8);
  assert.ok(plan.jobs.filter((job) => job.modelId !== "mlp").every((job) => !("batch_size" in job.parameters)));
  assert.ok(plan.jobs.filter((job) => ["tree", "forest", "gradient_boosting", "knn"].includes(job.modelId)).every((job) => !("max_iter" in job.parameters)));
  form.parameters.mlp.max_iter = "";
  assert.ok(inspectTrainingConfig(data, form).errors.some((error) => error.includes("MLP")));
  form.selected = ["tree"];
  assert.deepEqual(inspectTrainingConfig(data, form).errors, []);
});

test("grouped learning values remain independent and serialize to matching models", () => {
  const data = snapshot();
  const form = createTrainingForm();
  form.selected = ["mlp", "tree", "forest", "extra_trees", "gradient_boosting", "xgboost", "lightgbm", "catboost"]; form.shared.environment="server";
  form.parameters.mlp.learning_rate_init = "0.002";
  form.parameters.tree.max_depth = "4";
  form.parameters.forest.n_estimators = "12";
  form.parameters.extra_trees.max_depth = "none";
  form.parameters.gradient_boosting.learning_rate = "0.2";
  form.parameters.xgboost.n_estimators = "15";
  form.parameters.lightgbm.max_depth = "-1";
  form.parameters.catboost.iterations = "21";
  const jobs = Object.fromEntries(buildTrainingPlan(data, form).jobs.map((job) => [job.modelId, job.parameters]));
  assert.equal(jobs.mlp.learning_rate_init, .002);
  assert.equal(jobs.tree.max_depth, 4);
  assert.equal(jobs.forest.n_estimators, 12);
  assert.equal(jobs.extra_trees.max_depth, null);
  assert.equal(jobs.gradient_boosting.learning_rate, .2);
  assert.equal(jobs.xgboost.n_estimators, 15);
  assert.equal(jobs.lightgbm.max_depth, -1);
  assert.equal(jobs.catboost.iterations, 21);
  assert.equal(jobs.catboost.learning_rate, .1);
  assert.ok(!("learning_rate" in jobs.mlp));
  assert.ok(!("batch_size" in jobs.forest));
});
