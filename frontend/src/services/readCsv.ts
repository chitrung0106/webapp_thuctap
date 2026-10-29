import type {CsvDocument} from '../types/dataset';
export function readCsv(file:File,onProgress:(percent:number)=>void,signal?:AbortSignal):Promise<CsvDocument>{
  return new Promise((resolve,reject)=>{const worker=new Worker(new URL('../workers/csv.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{worker.terminate();signal?.removeEventListener('abort',abort);};
    const abort=()=>{cleanup();reject(new DOMException('Đã hủy đọc CSV.','AbortError'));};
    if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=event=>{cleanup();reject(Error(event.message||'Không chạy được bộ đọc CSV.'));};
    worker.onmessage=({data})=>{if(data.error){cleanup();reject(Error(data.error));}else if(data.document){cleanup();resolve(data.document);}else onProgress(data.total?Math.round(data.progress*100/data.total):0);};worker.postMessage({file});
  });
}
