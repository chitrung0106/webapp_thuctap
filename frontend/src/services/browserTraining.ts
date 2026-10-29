import type { TrainingPlan } from '../types/training';
import type { TrainingRun } from '../types/trainingRun';
import type { ExportOptions, ExportPreview } from '../types/export';
import { TrainingApiError } from './trainingErrors';

export { TrainingApiError as BrowserTrainingError } from './trainingErrors';
const BrowserTrainingError=TrainingApiError;
let worker: Worker | null=null;
let ready: Promise<unknown> | null=null;
let cancelFlag: Int32Array | null=null;
let counter=0, starting=false;
const runs=new Map<string,TrainingRun>();
const downloaded=new Set<string>();
export const hasUnsavedModels=()=>[...runs.values()].some(r=>r.results.some(m=>m.status==='succeeded'&&!downloaded.has(r.id+'/'+m.id)));
export function markModelsDownloaded(id:string,ids:string[]){ids.forEach(m=>downloaded.add(id+'/'+m));}
export async function predict(id:string,resultId:string,rows:string[][],signal?:AbortSignal){await get(id);return rpc('predict',{id,input:{resultId,rows}},signal);}
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function runtime(state:string,detail:string,progress?:{current:number;total:number}){window.dispatchEvent(new CustomEvent('browser-runtime',{detail:{state,detail,progress}}));}
function fail(error:Error){if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}worker=null;ready=null;cancelFlag=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();for(const run of runs.values()){run.status='failed';run.error=error.message;for(const r of run.results){r.status=r.status==='succeeded'?'failed':'cancelled';r.error='Worker đã kết thúc; file model trong bộ nhớ không còn.';}}runtime('failed',error.message);}
function rpc(command:string,args:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
 if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
 return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Quá thời gian chờ môi trường trình duyệt.'));},300000);pending.set(id,{resolve,reject,timer});signal?.addEventListener('abort',()=>{clearTimeout(timer);pending.delete(id);reject(new DOMException('Aborted','AbortError'));},{once:true});worker!.postMessage({id,command,args});});
}
async function initialize(){
 if(ready)return ready;
 if(!window.crossOriginIsolated || typeof SharedArrayBuffer==='undefined')throw new BrowserTrainingError('Train trong trình duyệt cần header COOP/COEP để hỗ trợ hủy tác vụ. Cấu hình hosting hoặc chọn Máy chủ.');
 cancelFlag=new Int32Array(new SharedArrayBuffer(4));
 worker=new Worker(new URL('../workers/training.worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{if(data.kind==='run'){if(cancelFlag&&Atomics.load(cancelFlag,0)&&['queued','running'].includes(data.run.status))data.run.status='cancelling';runs.set(data.run.id,data.run);window.dispatchEvent(new CustomEvent('browser-run',{detail:data.run}));return;}if(data.kind==='runtime'){runtime(data.state,data.detail,data.progress);return;}if(data.kind==='fatal'){fail(new Error(data.error));return;}const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);data.error?item.reject(new BrowserTrainingError(data.error)):item.resolve(data.value);};
 worker.onerror=event=>fail(new Error(event.message || 'Không tải được Web Worker.'));
 ready=rpc('init',{cancelBuffer:cancelFlag.buffer}).catch(error=>{runtime('failed',error.message);worker?.terminate();worker=null;ready=null;throw error;});
 return ready;
}
export async function start(plan:TrainingPlan):Promise<TrainingRun>{
 if(plan.jobs.some(j=>j.modelId==='catboost'))throw new BrowserTrainingError('CatBoost cần chọn Máy chủ trước khi RUN.');
 if(starting||[...runs.values()].some(r=>['running','queued','cancelling'].includes(r.status)))throw new BrowserTrainingError('Đang có lượt train trong trình duyệt.');
 starting=true;try{await initialize();const run=await rpc('start',{plan});runs.clear();downloaded.clear();runs.set(run.id,run);return run;}finally{starting=false;}
}
export async function get(id:string):Promise<TrainingRun>{const run=runs.get(id);if(!run)throw new BrowserTrainingError('Phiên train trong trình duyệt đã kết thúc hoặc trang vừa được tải lại. Hãy quay lại chọn dữ liệu; model chưa tải xuống không được lưu.',404);return structuredClone(run);}
export async function cancel(id:string):Promise<TrainingRun>{const run=await get(id);if(['running','queued','cancelling'].includes(run.status)){Atomics.store(cancelFlag!,0,1);run.status='cancelling';runs.set(id,run);}return run;}
export async function preview(id:string,options:ExportOptions,signal?:AbortSignal):Promise<ExportPreview>{await get(id);await initialize();return rpc('preview',{id,options},signal);}
export async function exportBytes(id:string,options:ExportOptions){await get(id);await initialize();return rpc('export',{id,options});}
export function hardStop(){worker?.terminate();worker=null;ready=null;fail(new Error('Worker bị kết thúc. Tác vụ đã dừng; hãy train lại để tạo model mới.'));}
export const capabilities=async()=>initialize();
if(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_HOOKS==='true') {
 (window as any).__browserLab={start,get,cancel,preview,exportBytes,hardStop,capabilities,gpuDiagnostics:()=>rpc('gpuDiagnostics')};
}
