import type {CsvDocument} from '../types/dataset';
export function predictionRows(document:CsvDocument,columns:string[]){
  const headers=document.rows[0].values.map(name=>name.trim());
  const indices=columns.map(name=>{if(headers.filter(h=>h===name).length!==1)throw Error(`CSV phải có đúng một cột tên “${name}”.`);return headers.indexOf(name);});
  const rows=document.rows.slice(1).map(row=>indices.map(index=>row.values[index]));
  if(!rows.length)throw Error('CSV chưa có dòng dữ liệu.');
  return rows;
}
