import type { ChangeEvent } from "react";
import { formatBytes } from "../../utils/formatBytes";

interface FilePickerProps {
  id: string;
  label: string;
  description: string;
  file: File | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export default function FilePicker({ id, label, description, file, onChange }: FilePickerProps) {
  return (
    <div className={`file-picker${file ? " has-file" : ""}`}>
      <div className="file-picker-top">
        <span className="file-icon" aria-hidden="true">{file ? "✓" : "+"}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <label className="file-picker-label" htmlFor={id}>
        {file ? file.name : "Chọn tệp từ thiết bị"}
      </label>
      <p className="file-description">
        {file ? `${formatBytes(file.size)} · ${description}` : description}
      </p>
      <input
        id={id}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        onChange={onChange}
      />
    </div>
  );
}
