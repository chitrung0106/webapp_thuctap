import type {ColumnPreprocessing, ColumnRole, DataRow, LabelPreprocessing, CsvDocument} from '../types/dataset';
export interface DiskConfig {hasHeader:boolean;columns:string[];roles:ColumnRole[];preprocessing:ColumnPreprocessing[];labels:LabelPreprocessing[];}
export interface DiskMeta {id:string;name:string;size:number;rowCount:number;columnCount:number;paddedRows:number;delimiter:string;first:string[];config?:DiskConfig;}
export interface DiskSummary {key:string;totalRows:number;includedCount:number;excludedCount:number;cellCount:number;rowCount:number;samples:string[][];preprocessingErrors:string[];featureCount:number;estimatedBytes:number;missingInputCount:number;invalidInputCount:number;missingOutputCount:number;invalidLabelCount:number;invalidIncludedCount:number;}
export interface DiskPage {rows:DataRow[];excluded:number[];changed:string[];issues:[number,string[]][];total:number;}
let worker:Worker|undefined,sequence=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;progress?:(n:number)=>void;cleanup:()=>void}>();
export function diskRequest<T=any>(command:string,args:Record<string,unknown>={},signal?:AbortSignal,progress?:(n:number)=>void):Promise<T>{
 // One RPC worker owns disk IO; React receives metadata or one small page only.
 if(!worker){worker=new Worker(new URL('../workers/dataset.worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.progress){pending.get(data.progress)?.progress?.(data.percent);return;}const item=pending.get(data.token);if(!item)return;pending.delete(data.token);item.cleanup();data.error?item.reject(data.abort?new DOMException(data.error,'AbortError'):Error(data.error)):item.resolve(data.value);};worker.onerror=()=>{for(const item of pending.values()){item.cleanup();item.reject(Error('Bộ đọc dữ liệu đã dừng. Hãy tải lại trang; dữ liệu đã lưu vẫn nằm trong kho trình duyệt.'));}pending.clear();worker?.terminate();worker=undefined;};}
 return new Promise((resolve,reject)=>{const token=++sequence;const abort=()=>{worker?.postMessage({command:'cancel',token});};if(signal?.aborted){reject(new DOMException('Đã hủy','AbortError'));return;}signal?.addEventListener('abort',abort,{once:true});pending.set(token,{resolve,reject,progress,cleanup:()=>signal?.removeEventListener('abort',abort)});worker!.postMessage({token,command,args});});
}
export const loadDiskPage=(id:string,key:string,filter:string,page:number)=>diskRequest<DiskPage>('page',{id,key,filter,page});
export const materializeDisk=(id:string,key:string)=>diskRequest<CsvDocument>('materialize',{id,key});
