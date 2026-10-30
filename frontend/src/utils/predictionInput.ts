import type { ColumnPreprocessing, CsvDocument } from '../types/dataset';

type InputConfig = { name: string; config: ColumnPreprocessing };

export function predictionRows(document: CsvDocument, columns: string[], configs?: InputConfig[]) {
  if (!document.rows.length) throw Error('CSV chưa có dữ liệu.');
  const headers = document.rows[0].values.map(name => name.trim());
  if (headers.length !== columns.length) throw Error(`CSV cần đúng ${columns.length} cột input, nhưng tệp có ${headers.length} cột. Không đưa cột label hoặc cột thừa vào tệp dự đoán.`);
  const indices = columns.map(name => {
    if (headers.filter(header => header === name).length !== 1) throw Error(`CSV phải có đúng một cột tên “${name}”.`);
    return headers.indexOf(name);
  });
  if (configs && columns.some(name => !configs.some(item => item.name === name && item.config.kind !== 'unset'))) throw Error('Thiếu cấu hình kiểu input của lượt train. Hãy chạy lại lượt train trước khi tải CSV dự đoán.');
  const issues: string[] = [];
  let issueCount = 0;
  const rows = document.rows.slice(1).map(row => indices.map((index, column) => {
    const value = row.values[index] ?? '';
    const config = configs?.find(item => item.name === columns[column])?.config;
    let issue = '';
    if (!value.trim()) issue = 'thiếu dữ liệu';
    else if (config?.kind === 'number' && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))) issue = 'cần giá trị số hợp lệ';
    else if (config?.kind === 'category' && config.encoding === 'ordinal' && !config.categoryOrder.includes(value)) issue = 'giá trị chưa có trong danh sách nhóm Ordinal đã cấu hình';
    if (issue) { issueCount++; if (issues.length < 5) issues.push(`Dòng ${row.sourceLine}, cột “${columns[column]}”: ${issue}.`); }
    return value;
  }));
  if (!rows.length) throw Error('CSV chưa có dòng dữ liệu.');
  if (issueCount) throw Error(`CSV có ${issueCount} ô không hợp lệ. ${issues.join(' ')}${issueCount > issues.length ? ' Chỉ hiển thị 5 lỗi đầu.' : ''}`);
  return rows;
}
