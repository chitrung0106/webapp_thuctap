import { isLearningParameter, privateParameterFields } from "../../config/learningSettings";
import HelpNote from "../common/HelpNote";
import { getParameterHelp } from "../../config/parameterHelp";
import type { ModelDefinition, ParameterValues } from "../../types/training";
import { isParameterActive } from "../../utils/trainingConfig";

interface ModelParameterCardProps {
  model: ModelDefinition;
  selected: boolean;
  values: ParameterValues;
  onToggle: () => void;
  onChange: (key: string, value: string | boolean) => void;
  onReset: () => void;
  unavailable?:boolean;
}

export default function ModelParameterCard({ model, selected, values, onToggle, onChange, onReset, unavailable }: ModelParameterCardProps) {
  const privateFields = privateParameterFields(model);
  return (
    <article className={`model-config-card ${selected ? "is-selected" : ""}`}>
      <label className="model-choice">
        <input type="checkbox" checked={selected} disabled={unavailable&&!selected} onChange={onToggle} />
        <span><strong>{model.name}</strong><span>{model.description}</span></span>
        {model.extended && <span className="model-library-tag">MỞ RỘNG</span>}
      </label>
      {unavailable&&<p className="dataset-local-note">Model này chưa hỗ trợ trong trình duyệt; Máy chủ đang tạm vô hiệu hóa.</p>}
      {selected && (
        <details className="model-parameters">
          <summary>Thông số riêng · {privateFields.filter((field) => isParameterActive(model.id, field, values)).length} mục</summary>
          {model.fields.some((field) => isLearningParameter(model.id, field.key)) && <p className="dataset-local-note">{model.fields.filter((field) => isLearningParameter(model.id, field.key)).map((field) => `${field.label}: ${String(values[field.key])}`).join(" · ")}. <a href="#learning-settings">Chỉnh ở phần Thông số học ↑</a></p>}
          <div className="training-fields">
            {privateFields.filter((field) => isParameterActive(model.id, field, values)).map((field) => {
              const id = `model-${model.id}-${field.key}`;
              const explanation = getParameterHelp(model.id, field.key);
              return (
                <div className="training-field" key={field.key}>
                  {field.kind === "boolean" ? (
                    <label className="training-toggle" htmlFor={id}>
                      <input id={id} type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => onChange(field.key, event.target.checked)} />
                      {field.label}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id}>{field.label}</label>
                      {field.kind === "select" ? (
                        <select id={id} value={String(values[field.key])} onChange={(event) => onChange(field.key, event.target.value)}>
                          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      ) : (
                        <input id={id} type={field.kind === "layers" || field.special ? "text" : "number"}
                          value={String(values[field.key])} step={field.integer ? 1 : "any"} min={field.min} max={field.max}
                          onChange={(event) => onChange(field.key, event.target.value)} />
                      )}
                      <code>{field.key}</code>
                    </>
                  )}
                  {field.help && <small>{field.help}</small>}
                  {explanation && <HelpNote title={field.label}><p>{explanation.meaning}</p><p className="help-example">{explanation.example}</p></HelpNote>}
                </div>
              );
            })}
          </div>
          <button className="training-text-button" type="button" onClick={onReset}>Đặt lại thông số riêng model này</button>
        </details>
      )}
    </article>
  );
}
