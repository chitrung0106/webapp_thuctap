import type { ModelDefinition } from "../types/training";

export const learningParameterKeys: Record<string, readonly string[]> = {
  mlp: ["max_iter", "batch_size", "learning_rate_init"],
  tree: ["max_depth"],
  forest: ["n_estimators", "max_depth"],
  extra_trees: ["n_estimators", "max_depth"],
  gradient_boosting: ["n_estimators", "learning_rate", "max_depth"],
  xgboost: ["n_estimators", "learning_rate", "max_depth"],
  lightgbm: ["n_estimators", "learning_rate", "max_depth"],
  catboost: ["iterations", "learning_rate", "depth"],
};
export const isLearningParameter = (modelId: string, key: string) => learningParameterKeys[modelId]?.includes(key) ?? false;
export const privateParameterFields = (model: ModelDefinition) => model.fields.filter((field) => !isLearningParameter(model.id, field.key));
