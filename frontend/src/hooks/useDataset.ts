import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ColumnPreprocessing, ColumnRole, CsvDocument, LabelPreprocessing } from "../types/dataset";
import { createTrainingSnapshot, parseCsv, prepareTrainingData, serializeProcessedCsv } from "../utils/csv";
import { summarizeChanges } from "../utils/datasetChanges";
import { createColumnPreprocessing, getLabelPreprocessingErrors, getPreprocessingErrors, validateDataset } from "../utils/datasetValidation";
import { downloadFile } from "../utils/downloadFile";

type TrainingSnapshot = ReturnType<typeof createTrainingSnapshot>;

export function useDataset() {
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [document, setDocument] = useState<CsvDocument | null>(null);
  const [originalDocument, setOriginalDocument] = useState<CsvDocument | null>(null);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [hasHeader, updateHasHeader] = useState(false);
  const [roles, setRoles] = useState<ColumnRole[]>([]);
  const [preprocessing, setPreprocessing] = useState<ColumnPreprocessing[]>([]);
  const [labelPreprocessing, setLabelPreprocessing] = useState<LabelPreprocessing[]>([]);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());
  const [loadId, setLoadId] = useState(0);
  const [columnsConfirmed, updateColumnsConfirmed] = useState(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<TrainingSnapshot | null>(null);
  const readVersion = useRef(0);

  function invalidateConfirmation() {
    updateColumnsConfirmed(false);
    setConfirmedSnapshot(null);
  }

  async function updateFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++readVersion.current;
    setError("");
    setIsReading(false);
    if (!/\.csv$/i.test(file.name)) {
      setError("Vui lòng chọn tệp .csv. Tệp chưa được nhận vào dữ liệu huấn luyện.");
      return;
    }
    setIsReading(true);
    try {
      const buffer = await file.arrayBuffer();
      if (version !== readVersion.current) return;
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { throw new Error("Tệp CSV phải dùng mã hóa UTF-8. Hãy lưu lại bằng UTF-8 rồi chọn lại."); }
      const parsed = parseCsv(text);
      if (parsed.columnCount < 2) throw new Error("Cần ít nhất 2 cột để chọn riêng input và label. Hỗ trợ dấu phẩy, chấm phẩy hoặc tab.");
      setLoadId((current) => current + 1);
      setInputFile(file);
      setDocument(parsed);
      setOriginalDocument(parsed);
      updateHasHeader(false);
      setRoles(Array.from({ length: parsed.columnCount }, (_, index): ColumnRole => index === parsed.columnCount - 1 ? "output" : "input"));
      setPreprocessing(createColumnPreprocessing(parsed.columnCount));
      setLabelPreprocessing(Array.from({ length: parsed.columnCount }, () => ({ task: "unset" })));
      setExcludedRows(new Set());
      invalidateConfirmation();
    } catch (readError) {
      if (version === readVersion.current) setError(readError instanceof Error ? readError.message : "Không thể đọc tệp CSV.");
    } finally {
      if (version === readVersion.current) setIsReading(false);
    }
  }

  const columns = useMemo(() => Array.from({ length: document?.columnCount ?? 0 }, (_, index) =>
    hasHeader ? document!.rows[0].values[index].trim() || `Cột ${index + 1}` : `Cột ${index + 1}`,
  ), [document, hasHeader]);
  const rows = useMemo(() => document ? (hasHeader ? document.rows.slice(1) : document.rows) : [], [document, hasHeader]);
  const includedCount = rows.filter((row) => !excludedRows.has(row.id)).length;
  const validation = useMemo(() => validateDataset(rows, roles, excludedRows, preprocessing, labelPreprocessing), [rows, roles, excludedRows, preprocessing, labelPreprocessing]);
  const trainingData = useMemo(() => {
    try { return prepareTrainingData(rows, columns, roles, excludedRows, preprocessing, labelPreprocessing); }
    catch { return null; }
  }, [rows, columns, roles, excludedRows, preprocessing, labelPreprocessing]);
  const changes = useMemo(() => summarizeChanges(originalDocument?.rows ?? [], document?.rows ?? []), [originalDocument, document]);
  const hasDataChanges = changes.cellCount > 0 || rows.some((row) => excludedRows.has(row.id));

  function restoreData() {
    setDocument(originalDocument);
    setExcludedRows(new Set());
    invalidateConfirmation();
  }
  function setHasHeader(value: boolean) {
    if (value === hasHeader) return;
    updateHasHeader(value);
    invalidateConfirmation();
  }
  function downloadProcessedCsv() {
    if (!document || !inputFile || !includedCount || !hasDataChanges) return;
    const csv = serializeProcessedCsv(document, hasHeader, excludedRows);
    downloadFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), inputFile.name.replace(/\.csv$/i, "") + "-processed.csv");
  }
  function confirmDataset() {
    if (!document || !inputFile || !columnsConfirmed || isReading) return false;
    try {
      const snapshot = createTrainingSnapshot(document, hasHeader, columns, roles, excludedRows, inputFile.name, preprocessing, labelPreprocessing);
      setConfirmedSnapshot(snapshot);
      return true;
    } catch (confirmationError) {
      setError(confirmationError instanceof Error ? confirmationError.message : "Chưa thể xác nhận dữ liệu.");
      return false;
    }
  }
  function setColumnsConfirmed(value: boolean) {
    updateColumnsConfirmed(value);
    if (!value) setConfirmedSnapshot(null);
  }
  function snapshotForTraining() {
    if (!confirmedSnapshot || isReading) throw new Error("Hãy xác nhận dữ liệu và cột input/label trước khi huấn luyện.");
    return structuredClone(confirmedSnapshot);
  }
  function updateCell(rowId: number, columnIndex: number, value: string) {
    if (document?.rows.find((row) => row.id === rowId)?.values[columnIndex] === value) return;
    invalidateConfirmation();
    setDocument((current) => current && ({ ...current, rows: current.rows.map((row) =>
      row.id === rowId ? { ...row, values: row.values.map((cell, index) => index === columnIndex ? value : cell) } : row,
    ) }));
  }
  function updateRole(columnIndex: number, role: ColumnRole) {
    if (roles[columnIndex] === role) return;
    invalidateConfirmation();
    setRoles((current) => current.map((value, index) => index === columnIndex ? role : value));
  }
  const preprocessingErrors = useMemo(() => [...getPreprocessingErrors(rows, columns, roles, excludedRows, preprocessing), ...getLabelPreprocessingErrors(columns, roles, labelPreprocessing, rows, excludedRows)], [rows, columns, roles, excludedRows, preprocessing, labelPreprocessing]);
  function updatePreprocessing(index: number, patch: Partial<ColumnPreprocessing>) {
    invalidateConfirmation();
    setPreprocessing((current) => current.map((config, columnIndex) => columnIndex === index ? { ...config, ...patch } : config));
  }

  function updateLabelPreprocessing(index: number, task: LabelPreprocessing["task"]) {
    invalidateConfirmation();
    setLabelPreprocessing((current) => current.map((config, columnIndex) => columnIndex === index ? { task } : config));
  }

  function toggleExcluded(rowId: number) {
    invalidateConfirmation();
    setExcludedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  }

  return {
    loadId, inputFile, document, error, isReading, updateFile,
    hasHeader, setHasHeader, columns, rows, roles, updateRole,
    excludedRows, toggleExcluded, updateCell, includedCount, missingCount: validation.missingOutputCount,
    preprocessing, updatePreprocessing, preprocessingErrors, labelPreprocessing, updateLabelPreprocessing,
    validation, trainingData, changes, hasDataChanges, restoreData, downloadProcessedCsv, snapshotForTraining,
    columnsConfirmed, setColumnsConfirmed, confirmedSnapshot, confirmDataset,
  };
}