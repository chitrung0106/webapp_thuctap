import type{TrainingRun}from'../types/trainingRun';
import{downloadFile}from'./downloadFile.ts';
import{metricLabel}from'./trainingResults.ts';
export function reportCsv(run:TrainingRun){
  const keys=[...new Set(run.results.flatMap(r=>Object.values(r.metrics).flatMap(m=>Object.keys(m))))];
  const headers=['model','label','status','device','seconds','iterations',...['train','validation','test'].flatMap(split=>keys.map(k=>split+'_'+k)),'error'];
  const rows=run.results.map(r=>[r.modelName,r.targetName,r.status,r.executionDevice||'cpu',r.durationSeconds??'',r.iterations??'',...(['train','validation','test']as const).flatMap(s=>keys.map(k=>r.metrics[s]?.[k]??'')),r.error||'']);
  // Spreadsheet formula injection protection for user-provided label/header names.
  const cell=(v:unknown)=>{let s=String(v);if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n');
}
export function reportText(run:TrainingRun){return `BÁO CÁO HUẤN LUYỆN\nTệp: ${run.fileName}\nLượt chạy: ${run.id}\nBài toán: ${run.task}\nDòng dữ liệu: ${run.rowCount}\nTrain / Validation / Test: ${run.splitCounts?Object.values(run.splitCounts).join(' / '):'Chưa có'}\nTiêu chí: ${metricLabel(run.metric)} (xếp hạng trên Validation, không dùng Test để chọn model)\n\n`+run.results.map(r=>`${r.modelName} — Label: ${r.targetName}\nTrạng thái: ${r.status} · Thiết bị: ${r.executionDevice||'cpu'} · Thời gian: ${r.durationSeconds??'—'} giây · Epoch/vòng: ${r.iterations??'—'}\n`+(['train','validation','test']as const).map(s=>`${s}: `+Object.entries(r.metrics[s]||{}).map(([k,v])=>`${metricLabel(k)} = ${v}`).join('; ')).join('\n')+(r.error?'\nLỗi: '+r.error:'')+(r.warnings.length?'\nThông báo: '+r.warnings.join('; '):'')).join('\n\n');}
export function downloadReport(run:TrainingRun,format:'csv'|'txt'){downloadFile(new Blob([format==='csv'?reportCsv(run):reportText(run)],{type:format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'}),`report-${run.id}.${format}`);}

