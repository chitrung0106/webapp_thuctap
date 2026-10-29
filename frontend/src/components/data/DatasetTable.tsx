import type { ColumnRole, DataRow } from "../../types/dataset";

interface DatasetTableProps {
  rows: DataRow[];
  columns: string[];
  roles: ColumnRole[];
  rowIssues: Map<number, string[]>;
  excludedRows: Set<number>;
  changedCells: Set<string>;
  onRoleChange: (index: number, role: ColumnRole) => void;
  onCellChange: (rowId: number, columnIndex: number, value: string) => void;
  onToggleExcluded: (rowId: number) => void;
  onActiveRowChange: (rowId: number | null) => void;
}

export default function DatasetTable({
  rows, columns, roles, rowIssues, excludedRows, changedCells,
  onRoleChange, onCellChange, onToggleExcluded, onActiveRowChange,
}: DatasetTableProps) {
  return (
    <div className="dataset-table-scroll" tabIndex={0} role="region" aria-label="Bảng chỉnh sửa dữ liệu">
      <table className="dataset-table">
        <caption className="visually-hidden">Chọn vai trò từng cột, sửa trực tiếp các ô và tick để bỏ dòng khỏi huấn luyện.</caption>
        <thead>
          <tr>
            <th scope="col" className="dataset-exclude-column">Bỏ dòng</th>
            <th scope="col" className="dataset-line-column">Dòng gốc</th>
            {columns.map((column, index) => (
              <th key={index} scope="col" className={`dataset-role-${roles[index]}`}>
                <span className="dataset-column-name">{column}</span>
                <select aria-label={`Vai trò cột ${index + 1}: ${column}`} value={roles[index]}
                  onChange={(event) => onRoleChange(index, event.target.value as ColumnRole)}>
                  <option value="unused">Không dùng</option>
                  <option value="input">Input</option>
                  <option value="output">Label (output)</option>
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const excluded = excludedRows.has(row.id);
            const issues = rowIssues.get(row.id) ?? [];
            return (
              <tr key={row.id} className={`${excluded ? "dataset-row-excluded" : ""} ${issues.some(Boolean) ? "dataset-row-missing" : ""}`}
                onFocus={() => onActiveRowChange(row.id)}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActiveRowChange(null); }}>
                <td className="dataset-exclude-column">
                  <input type="checkbox" checked={excluded} aria-label={`Bỏ dòng ${row.sourceLine} khỏi huấn luyện`}
                    onChange={() => onToggleExcluded(row.id)} />
                </td>
                <th scope="row" className="dataset-line-column">{row.sourceLine}</th>
                {row.values.map((value, index) => {
                  const issue = issues[index];
                  const edited = changedCells.has(`${row.id}:${index}`);
                  return (
                    <td key={index} className={[issue ? "dataset-cell-missing" : "", edited ? "dataset-cell-edited" : ""].join(" ")}>
                      <textarea value={value} rows={Math.min(4, Math.max(1, value.split(/\r\n|\r|\n/).length))}
                        aria-label={`Dòng ${row.sourceLine}, cột ${index + 1}: ${columns[index]}`}
                        aria-describedby={issue ? `issue-${row.id}-${index}` : undefined}
                        title={issue || (edited ? "Đã sửa so với dữ liệu gốc" : undefined)}
                        aria-invalid={Boolean(issue) && !excluded}
                        placeholder={issue || ""}
                        onChange={(event) => onCellChange(row.id, index, event.target.value)} />
                      {issue && <span id={`issue-${row.id}-${index}`} className="dataset-cell-issue">{issue}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}