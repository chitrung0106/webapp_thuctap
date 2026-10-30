import{useEffect,useRef,useState}from'react';
import type { TrainingPlan } from '../../types/training';
import type{TrainingRun}from'../../types/trainingRun';
import type{PredictionResult}from'../../types/prediction';
import{predictTrainingModel}from'../../services/trainingApi';
import{readCsv}from'../../services/readCsv';
import{predictionRows}from'../../utils/predictionInput';
import{downloadFile}from'../../utils/downloadFile';

export default function PredictionPanel({run,inputConfig}:{run:TrainingRun;inputConfig?:TrainingPlan["preprocessing"]["columns"]}){
 const [mode,setMode]=useState<'manual'|'csv'>('manual');
 const models=run.results.filter(r=>r.status==='succeeded');const[id,setId]=useState(models[0]?.id||''),[values,setValues]=useState(run.inputColumns.map(()=>'')),[csvRows,setCsvRows]=useState<string[][]|null>(null),[file,setFile]=useState(''),[result,setResult]=useState<PredictionResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);const control=useRef<AbortController|null>(null);
 useEffect(()=>()=>control.current?.abort(),[]);
 function reset(){control.current?.abort();setResult(null);setError('');setCsvRows(null);setFile('');setBusy(false);}
 async function upload(file:File){reset();setProgress(0);setBusy(true);const c=new AbortController();control.current=c;try{if(!/\.csv$/i.test(file.name))throw Error('Chọn tệp CSV UTF-8.');const doc=await readCsv(file,setProgress,c.signal);if(!inputConfig)throw Error("Không còn cấu hình kiểu input của lượt train này. Hãy chạy lại lượt train để kiểm tra CSV trước khi dự đoán.");const rows=predictionRows(doc,run.inputColumns,inputConfig);if(!c.signal.aborted){setCsvRows(rows);setFile(file.name);}}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Không đọc được CSV.');}finally{if(!c.signal.aborted)setBusy(false);}}
 async function predict(){const c=new AbortController();control.current?.abort();control.current=c;setProgress(0);setBusy(true);setError('');setResult(null);try{const answer=await predictTrainingModel(run.id,id,csvRows||[values],c.signal);if(!c.signal.aborted)setResult(answer);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Không dự đoán được.');}finally{if(!c.signal.aborted)setBusy(false);}}
 function save(){if(!result)return;const rows=csvRows||[values],quote=(s:unknown)=>'"'+String(s).replace(/"/g,'""')+'"';const safe=(s:unknown)=>typeof s==='string'&&/^[=+@-]/.test(s)&&!Number.isFinite(Number(s))?"'"+s:s;const text='\ufeff'+[[...run.inputColumns,result.targetName+' (dự đoán)'],...rows.map((r,i)=>[...r,result.predictions[i]])].map(r=>r.map(v=>quote(safe(v))).join(',')).join('\r\n');downloadFile(new Blob([text],{type:'text/csv;charset=utf-8'}),'predictions.csv');}
 return <section className="settings-card prediction-panel" aria-labelledby="prediction-title">
   <header className="prediction-heading">
     <div><p className="eyebrow">THỬ MODEL ĐÃ HUẤN LUYỆN</p><h3 id="prediction-title">Dự đoán với dữ liệu mới</h3><p>Chọn model, nhập dữ liệu và xem kết quả ngay bên dưới.</p></div>
     <span className="prediction-badge">Không huấn luyện lại</span>
   </header>
   <div className="prediction-model">
     <label htmlFor="prediction-model">Model dùng để dự đoán</label>
     <select id="prediction-model" aria-label="Model dự đoán" value={id} disabled={busy} onChange={e=>{setId(e.target.value);setResult(null);setError('');}}>
       {models.map(m=><option key={m.id} value={m.id}>{m.modelName} · {m.targetName}</option>)}
     </select>
   </div>
   <div className="prediction-entry">
     <div className="prediction-entry-heading"><h4>Dữ liệu đầu vào</h4><div className="prediction-modes" role="group" aria-label="Cách nhập dữ liệu">
       <button type="button" aria-pressed={mode==='manual'} onClick={()=>{if(mode!=='manual'){reset();setMode('manual');}}}>Nhập tay</button>
       <button type="button" aria-pressed={mode==='csv'} onClick={()=>{if(mode!=='csv'){reset();setMode('csv');}}}>Tải CSV</button>
     </div></div>
     <p className="prediction-hint">Nhập giá trị gốc như dữ liệu huấn luyện. Model tự áp dụng cách chuẩn hóa và mã hóa đã lưu.</p>
     {mode==='manual' ? <fieldset className="prediction-manual" disabled={busy}><legend className="visually-hidden">Nhập một dòng input</legend><div className="prediction-input-grid">
       {run.inputColumns.map((name,i)=><label key={i}><span>{name}</span><input aria-label={`Input dự đoán: ${name}`} placeholder={`Nhập ${name}`} autoComplete="off" value={values[i]} onChange={e=>{setValues(v=>v.map((x,j)=>i===j?e.target.value:x));setResult(null);setError('');}}/></label>)}
     </div></fieldset> : <div className="prediction-csv">
       <label className="prediction-file-picker"><span className="prediction-file-icon" aria-hidden="true">↑</span><strong>{file || 'Chọn tệp CSV'}</strong><span>{file ? `${csvRows?.length ?? 0} dòng sẵn sàng dự đoán · Bấm để đổi tệp` : 'Tệp chỉ chứa các cột input bên dưới, đúng tên và đúng kiểu dữ liệu'}</span><input className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="CSV dự đoán" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/></label>
       <div className="prediction-required-columns"><span>Cột cần có:</span>{run.inputColumns.map((name,i)=><code key={i}>{name} · {inputConfig?.find(item=>item.name===name)?.config.kind==='number'?'Số':'Phân loại'}</code>)}</div>
     </div>}
     <div className="prediction-actions"><span className="prediction-hint" role="status">{busy ? `Đang xử lý… ${progress>0 ? `${progress}% CSV đã đọc` : ''}` : mode==='manual' ? 'Dự đoán cho 1 dòng dữ liệu' : csvRows ? `${csvRows.length} dòng đã tải` : 'Chọn CSV để dự đoán nhiều dòng cùng lúc'}</span><div>
       {(file||busy)&&<button type="button" className="secondary-button" onClick={reset}>{busy?'Hủy thao tác':'Xóa tệp'}</button>}
       <button type="button" className="primary-button" disabled={busy||!id||(mode==='csv'?!csvRows:values.some(v=>!v.trim()))} onClick={()=>void predict()}>{busy?'Đang xử lý…':'Dự đoán →'}</button>
     </div></div>
     {error&&<p role="alert" className="error-message">{error}</p>}
   </div>
   {result ? <section className="prediction-output" aria-labelledby="prediction-output-title"><div className="prediction-output-heading"><div><p className="eyebrow">KẾT QUẢ</p><h4 id="prediction-output-title">{result.targetName}</h4><p role="status">Đã dự đoán {result.predictions.length} dòng{result.predictions.length>100 ? ' · Hiển thị 100 dòng đầu' : ''}.</p></div><button type="button" className="secondary-button" onClick={save}>↓ Tải kết quả CSV</button></div>
     <div className="result-table-scroll"><table><thead><tr><th>Dòng</th><th>Dự đoán</th>{result.classes.map(c=><th key={c}>Xác suất {c}</th>)}</tr></thead><tbody>{result.predictions.slice(0,100).map((v,i)=><tr key={i}><td>{i+1}</td><td><strong>{v}</strong></td>{result.classes.map((c,j)=><td key={c}>{result.probabilities?`${(result.probabilities[i][j]*100).toFixed(2)}%`:'—'}</td>)}</tr>)}</tbody></table></div>
   </section> : <div className="prediction-empty">Kết quả sẽ xuất hiện ở đây sau khi bạn bấm <strong>Dự đoán</strong>.</div>}
 </section>;
}
