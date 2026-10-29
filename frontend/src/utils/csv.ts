import { getCellIssue, getLabelPreprocessingErrors, getPreprocessingErrors } from "./datasetValidation.ts";
import type { ColumnPreprocessing, ColumnRole, CsvDocument, DataRow, LabelPreprocessing, TrainingData } from "../types/dataset";

function detectDelimiter(text: string): string {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    }
    if (!quoted) {
      if (char === "\r" || char === "\n") break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

// Parse CSV records, including quoted separators/newlines and CR-only files.
export function parseCsv(source: string): CsvDocument {
  const text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) throw new Error("Tệp CSV trống, vui lòng chọn tệp có dữ liệu.");
  if (text.includes("\0")) throw new Error("Tệp chứa dữ liệu nhị phân, không phải CSV văn bản UTF-8.");
  const delimiter = detectDelimiter(text);
  const rows: DataRow[] = [];
  let values: string[] = [];
  let field = "";
  let state: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  let sourceLine = 1;
  let pending = false;

  function finishField() { values.push(field); field = ""; state = "start"; }
  function finishRow() {
    finishField();
    rows.push({ id: rows.length, sourceLine, values });
    values = [];
    pending = false;
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else state = "closed";
      } else if (char === "\r" || char === "\n") {
        field += "\n";
        if (char === "\r" && text[i + 1] === "\n") i++;
        line++;
      } else field += char;
      pending = true;
      continue;
    }
    if (char === delimiter) { finishField(); pending = true; continue; }
    if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      sourceLine = line;
      continue;
    }
    if (state === "closed") throw new Error(`CSV sai ở dòng ${line}: có ký tự sau dấu nháy đóng.`);
    if (char === '"') {
      if (state !== "start") throw new Error(`CSV sai ở dòng ${line}: dấu nháy phải nằm đầu ô dữ liệu.`);
      state = "quoted";
    } else { field += char; state = "plain"; }
    pending = true;
  }
  if (state === "quoted") throw new Error(`CSV sai: ô bắt đầu ở dòng ${sourceLine} chưa đóng dấu nháy.`);
  if (pending || values.length > 0) finishRow();

  const columnCount = rows[0].values.length;
  let paddedRows = 0;
  for (const row of rows) {
    if (row.values.length > columnCount) {
      throw new Error(`Dòng ${row.sourceLine} có ${row.values.length} cột, trong khi dòng đầu có ${columnCount}. Kiểm tra dấu phân cách hoặc dấu nháy.`);
    }
    if (row.values.length < columnCount) {
      paddedRows++;
      row.values.push(...Array<string>(columnCount - row.values.length).fill(""));
    }
  }
  return { rows, columnCount, delimiter, paddedRows };
}

export function hasMissingOutput(row: DataRow, roles: ColumnRole[]): boolean {
  return roles.some((role, index) => role === "output" && !row.values[index].trim());
}

export function prepareTrainingData(
  rows: DataRow[], columns: string[], roles: ColumnRole[], excludedRows: Set<number>, preprocessing?: ColumnPreprocessing[], labelPreprocessing?: LabelPreprocessing[],
): TrainingData {
  const inputs = roles.flatMap((role, index) => role === "input" ? [index] : []);
  const outputs = roles.flatMap((role, index) => role === "output" ? [index] : []);
  if (!inputs.length || !outputs.length) throw new Error("Chọn ít nhất một cột input và một cột output.");
  const included = rows.filter((row) => !excludedRows.has(row.id));
  if (!included.length) throw new Error("Cần giữ lại ít nhất một dòng để huấn luyện.");
  if (included.some((row) => hasMissingOutput(row, roles))) throw new Error("Còn dòng thiếu output. Hãy sửa hoặc tick bỏ dòng đó.");
  if (preprocessing) {
    const errors = getPreprocessingErrors(rows, columns, roles, excludedRows, preprocessing);
    if (errors.length) throw new Error(errors.join("\n"));
  }
  if (included.some((row) => row.values.some((value, index) => roles[index] === "input" && getCellIssue(value, "input", preprocessing?.[index])))) {
    throw new Error("Còn input thiếu hoặc không đúng loại dữ liệu đã chọn. Hãy sửa hoặc bỏ dòng trước khi huấn luyện.");
  }
  if (labelPreprocessing) {
    const errors = getLabelPreprocessingErrors(columns, roles, labelPreprocessing, included);
    if (errors.length) throw new Error(errors.join("\n"));
    if (included.some((row) => row.values.some((value, index) => roles[index] === "output" && getCellIssue(value, "output", undefined, labelPreprocessing[index])))) throw new Error("Còn label hồi quy không phải số. Hãy sửa hoặc bỏ dòng.");
  }
  return {
    inputColumns: inputs.map((index) => columns[index]),
    outputColumns: outputs.map((index) => columns[index]),
    inputs: included.map((row) => inputs.map((index) => row.values[index])),
    outputs: included.map((row) => outputs.map((index) => row.values[index])),
  };
}
export function serializeProcessedCsv(document: CsvDocument, hasHeader: boolean, excludedRows: Set<number>): string {
  const records = document.rows.filter((row, index) => (hasHeader && index === 0) || !excludedRows.has(row.id));
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return "\uFEFF" + records.map((row) => row.values.map(quote).join(document.delimiter)).join("\r\n");
}

// Call when starting a training job to detach that job's data from later edits.
export function createTrainingSnapshot(
  document: CsvDocument, hasHeader: boolean, columns: string[], roles: ColumnRole[],
  excludedRows: Set<number>, fileName: string, preprocessing?: ColumnPreprocessing[], labelPreprocessing?: LabelPreprocessing[],
) {
  const rows = hasHeader ? document.rows.slice(1) : document.rows;
  return {
    fileName,
    createdAt: new Date().toISOString(),
    csv: serializeProcessedCsv(document, hasHeader, excludedRows),
    hasHeader,
    delimiter: document.delimiter,
    columns: columns.map((name, index) => ({ index, name, role: roles[index] })),
    excludedSourceLines: rows.filter((row) => excludedRows.has(row.id)).map((row) => row.sourceLine),
    inputPreprocessing: roles.flatMap((role, index) => role === "input" && preprocessing?.[index] ? [{
      columnIndex: index, name: columns[index], config: structuredClone(preprocessing[index]),
    }] : []),
    labelPreprocessing: roles.flatMap((role, index) => role === "output" && labelPreprocessing?.[index] ? [{
      columnIndex: index, name: columns[index], task: labelPreprocessing[index].task === "regression" ? "regression" as const : "classification" as const,
      problemType: labelPreprocessing[index].task,
      encoding: (labelPreprocessing[index].task === "binary" || labelPreprocessing[index].task === "multiclass") ? "label_encoder" as const : "none" as const,
      restoreOriginalLabel: (labelPreprocessing[index].task === "binary" || labelPreprocessing[index].task === "multiclass"),
    }] : []),
    data: prepareTrainingData(rows, columns, roles, excludedRows, preprocessing, labelPreprocessing),
  };
}
