import test from "node:test";
import assert from "node:assert/strict";
import { getModelCatalog } from "../../config/modelCatalog.ts";
import { learningParameterKeys, privateParameterFields, isLearningParameter } from "../../config/learningSettings.ts";

test("learning controls map to real fields and are removed from private controls", () => {
  for (const task of ["classification", "regression"]) {
    for (const model of getModelCatalog(task)) {
      const promoted = learningParameterKeys[model.id] ?? [];
      for (const key of promoted) assert.ok(model.fields.some((field) => field.key === key), `${model.id}.${key}`);
      const privateFields = privateParameterFields(model);
      assert.ok(privateFields.every((field) => !isLearningParameter(model.id, field.key)));
      assert.equal(privateFields.length + promoted.length, model.fields.length);
    }
  }
  assert.equal(isLearningParameter("linear", "max_iter"), false);
  assert.equal(isLearningParameter("catboost", "iterations"), true);
});
