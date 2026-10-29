import type { ColumnPreprocessing, ColumnRole, DataRow, LabelPreprocessing } from "../types/dataset";

export function createColumnPreprocessing(count: number): ColumnPreprocessing[] {
  return Array.from({ length: count }, () => ({ kind: "unset", scaling: "none", encoding: "onehot", categoryOrder: [] }));
}

export function getCellIssue(value: string, role: ColumnRole, config?: ColumnPreprocessing, labelConfig?: LabelPreprocessing): string {
  if (role === "unused") return "";
  if (!value.trim()) return role === "output" ? "Thiếu label" : "Thiếu input";
  if (role === "output") {
    if (labelConfig?.task === "regression" && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))) return "Label hồi quy phải là số";
    return "";
  }
  if (config?.kind === "number" && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))) return "Không phải số hợp lệ";
  if (config?.kind === "category" && config.encoding === "ordinal" && !config.categoryOrder.includes(value)) return "Chưa có trong thứ tự nhóm";
  return "";
}

export function getPreprocessingErrors(rows: DataRow[], columns: string[], roles: ColumnRole[], excluded: Set<number>, configs: ColumnPreprocessing[]): string[] {
  const errors: string[] = [];
  roles.forEach((role, index) => {
    if (role !== "input") return;
    const name = `Cột ${index + 1} (${columns[index]})`;
    const config = configs[index];
    if (!config || config.kind === "unset") { errors.push(`${name}: chọn loại dữ liệu Số hoặc Phân loại.`); return; }
    if (config.kind === "number" && !["standard", "minmax", "none"].includes(config.scaling)) errors.push(`${name}: chọn cách chuẩn hóa hợp lệ.`);
    if (config.kind === "category") {
      if (!["onehot", "ordinal"].includes(config.encoding)) errors.push(`${name}: chọn encoding hợp lệ.`);
      if (config.encoding === "ordinal") {
        if (!config.categoryOrder.length) errors.push(`${name}: khai báo thứ tự các nhóm cho Ordinal.`);
        else if (config.categoryOrder.some((value) => !value.trim()) || new Set(config.categoryOrder).size !== config.categoryOrder.length) errors.push(`${name}: danh sách nhóm không được trống hoặc trùng nhau.`);
        else if (rows.some((row) => !excluded.has(row.id) && row.values[index].trim() && !config.categoryOrder.includes(row.values[index]))) errors.push(`${name}: còn giá trị chưa có trong thứ tự nhóm.`);
      }
    }
  });
  return errors;
}

export function validateDataset(rows: DataRow[], roles: ColumnRole[], excluded: Set<number>, configs?: ColumnPreprocessing[], labelConfigs?: LabelPreprocessing[]) {
  const rowIssues = new Map<number, string[]>();
  let missingInputCount = 0;
  let invalidInputCount = 0;
  let missingOutputCount = 0;
  let invalidLabelCount = 0;
  let invalidIncludedCount = 0;
  for (const row of rows) {
    const issues = row.values.map((value, index) => getCellIssue(value, roles[index], configs?.[index], labelConfigs?.[index]));
    rowIssues.set(row.id, issues);
    if (excluded.has(row.id)) continue;
    if (issues.includes("Thiếu input")) missingInputCount++;
    if (issues.some((issue, index) => roles[index] === "input" && issue && issue !== "Thiếu input")) invalidInputCount++;
    if (issues.includes("Thiếu label")) missingOutputCount++;
    if (issues.some((issue, index) => roles[index] === "output" && issue && issue !== "Thiếu label")) invalidLabelCount++;
    if (issues.some(Boolean)) invalidIncludedCount++;
  }
  return { rowIssues, missingInputCount, invalidInputCount, missingOutputCount, invalidLabelCount, invalidIncludedCount };
}
export function getLabelPreprocessingErrors(columns: string[], roles: ColumnRole[], configs: LabelPreprocessing[], rows?: DataRow[], excluded: Set<number> = new Set()): string[] {
  const errors: string[] = [];
  const tasks = new Set<string>();
  roles.forEach((role, index) => {
    if (role !== "output") return;
    const task = configs[index]?.task;
    if (!task || !["binary", "multiclass", "regression"].includes(task)) errors.push(`Label ${columns[index]}: chọn Binary, Multiclass hoặc Hồi quy.`);
    else {
      tasks.add(task === "regression" ? "regression" : "classification");
      if (rows && task !== "regression") {
        const count = new Set(rows.filter((row) => !excluded.has(row.id)).map((row) => row.values[index]).filter((v) => v.trim())).size;
        if (task === "binary" && count !== 2) errors.push(`Label ${columns[index]}: đã chọn Binary nhưng có ${count} lớp trong các dòng giữ lại; cần đúng 2 lớp. Hãy kiểm tra dữ liệu hoặc tự đổi lựa chọn.`);
        if (task === "multiclass" && count < 3) errors.push(`Label ${columns[index]}: đã chọn Multiclass nhưng có ${count} lớp trong các dòng giữ lại; cần ít nhất 3 lớp. Hãy kiểm tra dữ liệu hoặc tự đổi lựa chọn.`);
      }
    }
  });
  if (tasks.size > 1) errors.push("Các label trong cùng lượt chạy cần cùng loại bài toán. Hãy chạy riêng nhóm label phân loại và nhóm label hồi quy.");
  return errors;
}