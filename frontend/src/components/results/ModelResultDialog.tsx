import { useEffect, useRef } from "react";
import type { ModelResult } from "../../types/trainingRun";
import ModelResultDetail from "./ModelResultDetail";

export default function ModelResultDialog({ result, task, onClose }: { result: ModelResult | null; task: "classification" | "regression"; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!result) return;
    const dialog = ref.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, [Boolean(result)]);
  if (!result) return null;
  return <dialog ref={ref} className="model-result-dialog" aria-label={`Chi tiết ${result.modelName}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="model-dialog-body"><div className="model-dialog-toolbar"><strong>Chi tiết model · {result.targetName}</strong><button type="button" className="secondary-button" onClick={onClose} autoFocus aria-label="Đóng chi tiết model">Đóng ×</button></div><ModelResultDetail key={result.id} result={result} task={task} /></div>
  </dialog>;
}
