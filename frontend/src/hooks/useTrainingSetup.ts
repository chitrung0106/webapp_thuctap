import { isLearningParameter } from "../config/learningSettings";
import { useEffect, useMemo, useState } from "react";
import { createTrainingForm, getModelCatalog } from "../config/modelCatalog";
import type { DatasetSnapshot, SharedTrainingConfig, TaskType, TrainingPlan } from "../types/training";
import { buildTrainingPlan, inspectTrainingConfig } from "../utils/trainingConfig";

export function useTrainingSetup(snapshot: DatasetSnapshot | null) {
  const [form, setForm] = useState(createTrainingForm);
  const [confirmation, setConfirmation] = useState<{ source: DatasetSnapshot; plan: TrainingPlan } | null>(null);
  const labelTask = snapshot?.labelPreprocessing[0]?.task;
  const requiredTask: TaskType | undefined = labelTask === "classification" || labelTask === "regression" ? labelTask : undefined;
  useEffect(() => {
    if (!requiredTask) return;
    setForm((current) => current.shared.task === requiredTask ? current : createTrainingForm(requiredTask));
    setConfirmation(null);
  }, [requiredTask]);
  const problemTypes = snapshot?.labelPreprocessing.map((label, index) => ({ name: label.name, count: new Set(snapshot.data.outputs.map((row) => row[index])).size, kind: label.problemType })) ?? [];
  const catalog = useMemo(() => getModelCatalog(form.shared.task), [form.shared.task]);
  const inspection = useMemo(() => inspectTrainingConfig(snapshot, form), [snapshot, form]);
  const confirmedPlan = confirmation?.source === snapshot ? confirmation.plan : null;
  function setShared<K extends keyof SharedTrainingConfig>(key: K, value: SharedTrainingConfig[K]) {
    setConfirmation(null);
    setForm((current) => ({ ...current, shared: { ...current.shared, [key]: value } }));
  }
  function setTask(task: TaskType) { if (requiredTask && task !== requiredTask) return; setConfirmation(null); setForm(createTrainingForm(task)); }
  function toggleModel(id: string) {
    setConfirmation(null);
    setForm((current) => ({ ...current, selected: current.selected.includes(id) ? current.selected.filter((value) => value !== id) : [...current.selected, id] }));
  }
  function selectModels(mode: "basic" | "all" | "none") {
    setConfirmation(null);
    setForm((current) => ({ ...current, selected: mode === "none" ? [] : catalog.filter((model) => (mode === "all" || !model.extended) && (current.shared.environment==='server'||model.id!=='catboost')).map((model) => model.id) }));
  }
  function setParameter(modelId: string, key: string, value: string | boolean) {
    setConfirmation(null);
    setForm((current) => ({ ...current, parameters: { ...current.parameters, [modelId]: { ...current.parameters[modelId], [key]: value } } }));
  }
  function resetModel(id: string) {
    const definition = catalog.find((model) => model.id === id);
    if (!definition) return;
    setConfirmation(null);
    setForm((current) => ({ ...current, parameters: { ...current.parameters, [id]: Object.fromEntries(definition.fields.map((field) => [field.key, isLearningParameter(id, field.key) ? current.parameters[id][field.key] : field.defaultValue])) } }));
  }
  function confirm() {
    if (!snapshot || inspection.errors.length) return;
    setConfirmation({ source: snapshot, plan: buildTrainingPlan(snapshot, form) });
  }
  return { requiredTask, problemTypes, form, catalog, inspection, confirmedPlan, setShared, setTask, toggleModel, selectModels, setParameter, resetModel, confirm };
}
