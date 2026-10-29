import{useEffect,useRef,useState}from'react';
import type{TrainingRun}from'../../types/trainingRun';
import type{PredictionResult}from'../../types/prediction';
import{predictTrainingModel}from'../../services/trainingApi';
import{readCsv}from'../../services/readCsv';
import{predictionRows}from'../../utils/predictionInput';
import{downloadFile}from'../../utils/downloadFile';

export default function PredictionPanel({run}:{run:TrainingRun}){
 const models=run.results.filter(r=>r.status==='succeeded');const[id,setId]=useState(models[0]?.id||''),[values,setValues]=useState(run.inputColumns.map(()=>'')),[csvRows,setCsvRows]=useState<string[][]|null>(null),[file,setFile]=useState(''),[result,setResult]=useState<PredictionResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0);const control=useRef<AbortController|null>(null);
 useEffect(()=>()=>control.current?.abort(),[]);
 function reset(){control.current?.abort();setResult(null);setError('');setCsvRows(null);setFile('');setBusy(false);}
 async function upload(file:File){reset();setBusy(true);const c=new AbortController();control.current=c;try{if(!/\.csv$/i.test(file.name))throw Error('Chọn tệp CSV UTF-8.');const doc=await readCsv(file,setProgress,c.signal);const rows=predictionRows(doc,run.inputColumns);if(!c.signal.aborted){setCsvRows(rows);setFile(file.name);}}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Không đọc được CSV.');}finally{if(!c.signal.aborted)setBusy(false);}}
 async function predict(){const c=new AbortController();control.current?.abort();control.current=c;setBusy(true);setError('');setResult(null);try{const answer=await predictTrainingModel(run.id,id,csvRows||[values],c.signal);if(!c.signal.aborted)setResult(answer);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Không dự đoán được.');}finally{if(!c.signal.aborted)setBusy(false);}}
 function save(){if(!result)return;const rows=csvRows||[values],quote=(s:unknown)=>'"'+String(s).replace(/"/g,'""')+'"';const safe=(s:unknown)=>typeof s==='string'&&/^[=+@-]/.test(s)&&!Number.isFinite(Number(s))?"'"+s:s;const text='\ufeff'+[[...run.inputColumns,result.targetName+' (dự đoán)'],...rows.map((r,i)=>[...r,result.predictions[i]])].map(r=>r.map(v=>quote(safe(v))).join(',')).join('\r\n');downloadFile(new Blob([text],{type:'text/csv;charset=utf-8'}),'predictions.csv');}
 return <section className="settings-card prediction-panel"><h3>Thử dự đoán với dữ liệu mới</h3><p>Nhập input hoặc chọn CSV có tên cột trùng input. Dùng giá trị gốc như khi chuẩn bị dữ liệu, không chuẩn hóa/encoding lần nữa. Đây là dữ liệu mới, không dùng để train lại.</p>
 <label>Model dự đoán<select aria-label="Model dự đoán" value={id} disabled={busy} onChange={e=>{setId(e.target.value);setResult(null);}}>{models.map(m=><option key={m.id} value={m.id}>{m.modelName} · {m.targetName}</option>)}</select></label>
 <fieldset disabled={busy||Boolean(csvRows)}><legend>Nhập một dòng input</legend><div className="training-fields">{run.inputColumns.map((name,i)=><label key={i}>{name}<input aria-label={`Input dự đoán: ${name}`} value={values[i]} onChange={e=>{setValues(v=>v.map((x,j)=>i===j?e.target.value:x));setResult(null);}}/></label>)}</div></fieldset>
 <label className="secondary-button">Chọn CSV dự đoán<input type="file" accept=".csv,text/csv" aria-label="CSV dự đoán" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void upload(f);}}/></label>
 {file&&<p>{file} · {csvRows?.length} dòng · Chỉ lấy các cột input theo tên.</p>}{(file||busy)&&<button type="button" className="secondary-button" onClick={reset}>{busy?'Hủy thao tác':'Xóa CSV, nhập tay'}</button>}
 {busy&&<p role="status">Đang xử lý… {progress>0?`${progress}% byte CSV đã đọc`:''}</p>}
 <button type="button" className="primary-button" disabled={busy||!id||(!csvRows&&values.some(v=>!v.trim()))} onClick={()=>void predict()}>Dự đoán</button>
 {error&&<p role="alert" className="error-message">{error}</p>}
 {result&&<><p role="status">Đã dự đoán {result.predictions.length} dòng. Hiển thị tối đa 100 dòng; tải CSV để xem toàn bộ.</p><div className="result-table-scroll"><table><thead><tr><th>Dòng</th><th>{result.targetName} · Dự đoán</th>{result.classes.map(c=><th key={c}>Xác suất {c}</th>)}</tr></thead><tbody>{result.predictions.slice(0,100).map((v,i)=><tr key={i}><td>{i+1}</td><td>{v}</td>{result.classes.map((c,j)=><td key={c}>{result.probabilities?`${(result.probabilities[i][j]*100).toFixed(2)}%`:'—'}</td>)}</tr>)}</tbody></table></div><button type="button" className="secondary-button" onClick={save}>Tải CSV dự đoán</button></>}
 </section>;
}
