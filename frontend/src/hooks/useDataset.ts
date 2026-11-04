import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react';
import type {ColumnPreprocessing,ColumnRole,CsvDocument,LabelPreprocessing} from '../types/dataset';
import {createTrainingSnapshot} from '../utils/csv';
import {createColumnPreprocessing} from '../utils/datasetValidation';
import {downloadFile} from '../utils/downloadFile';
import {diskRequest,loadDiskPage,materializeDisk,type DiskMeta,type DiskConfig,type DiskSummary,type DiskPage} from '../services/diskDataset';
type Snapshot=ReturnType<typeof createTrainingSnapshot>;
const EMPTY_PAGE:DiskPage={rows:[],excluded:[],changed:[],issues:[],total:0};
export function useDataset(){
 const [meta,setMeta]=useState<DiskMeta|null>(null),[error,setError]=useState(''),[isReading,setIsReading]=useState(false),[isWorking,setIsWorking]=useState(false),[readProgress,setReadProgress]=useState(0);
 const [hasHeader,updateHeader]=useState(false),[roles,setRoles]=useState<ColumnRole[]>([]),[preprocessing,setPreprocessing]=useState<ColumnPreprocessing[]>([]),[labelPreprocessing,setLabels]=useState<LabelPreprocessing[]>([]);
 const [summary,setSummary]=useState<DiskSummary|null>(null),[pageData,setPageData]=useState<DiskPage>(EMPTY_PAGE),[page,setPage]=useState(1),[filter,setFilter]=useState('all'),[isPageLoading,setPageLoading]=useState(false),[isValidating,setValidating]=useState(false),[revision,setRevision]=useState(0);
 const [columnsConfirmed,setColumnsConfirmed]=useState(false),[confirmedSnapshot,setSnapshot]=useState<Snapshot|null>(null),[downloadedVersion,setDownloadedVersion]=useState('');
 const readControl=useRef<AbortController|null>(null),version=useRef(0),mutation=useRef(0),cache=useRef(new Map<string,DiskPage>()),saving=useRef(Promise.resolve());
 const columns=useMemo(()=>Array.from({length:meta?.columnCount||0},(_,i)=>hasHeader?meta!.first[i].trim()||`Cột ${i+1}`:`Cột ${i+1}`),[meta,hasHeader]);
 const config=useMemo<DiskConfig>(()=>({hasHeader,columns,roles,preprocessing,labels:labelPreprocessing}),[hasHeader,columns,roles,preprocessing,labelPreprocessing]);
 function invalidate(){setColumnsConfirmed(false);setSnapshot(null);}
 function applyMeta(next:DiskMeta){setMeta(next);updateHeader(next.config?.hasHeader??false);setRoles(next.config?.roles??Array.from({length:next.columnCount},(_,i)=>i===next.columnCount-1?'output':'input'));setPreprocessing(next.config?.preprocessing??createColumnPreprocessing(next.columnCount));setLabels(next.config?.labels??Array.from({length:next.columnCount},()=>({task:'unset'})));setPage(1);setFilter('all');setSummary(null);setPageData(EMPTY_PAGE);invalidate();}
 useEffect(()=>{let stopped=false;const initial=version.current;void diskRequest<DiskMeta|null>('resume').then(m=>{if(!stopped&&initial===version.current&&m)applyMeta(m);}).catch(e=>{if(!stopped)setError(e.message);});return()=>{stopped=true;};},[]);
 useEffect(()=>()=>readControl.current?.abort(),[]);
 useEffect(()=>{if(!meta)return;let stopped=false;const controller=new AbortController();setValidating(true);setSummary(null);cache.current.clear();const timer=setTimeout(()=>{void saving.current.then(()=>diskRequest<DiskSummary>('scan',{id:meta.id,config},controller.signal)).then(s=>{if(!stopped){setSummary(s);setValidating(false);}}).catch(e=>{if(!stopped){setError(e.message);setValidating(false);}});void diskRequest('saveConfig',{id:meta.id,config}).catch(e=>{if(!stopped)setError(e.message);});},250);return()=>{stopped=true;controller.abort();clearTimeout(timer);};},[meta?.id,config,revision]);
 useEffect(()=>{if(!meta||!summary)return;let stopped=false;setPageLoading(true);const key=`${summary.key}:${filter}:${page}`;const cached=cache.current.get(key);if(cached){setPageData(cached);setPageLoading(false);return;}
 void loadDiskPage(meta.id,summary.key,filter,page).then(data=>{if(stopped)return;if(page>Math.max(1,Math.ceil(data.total/50))){setPage(Math.max(1,Math.ceil(data.total/50)));return;}setPageData(data);setPageLoading(false);cache.current.clear();cache.current.set(key,data);if(data.total>page*50)void loadDiskPage(meta.id,summary.key,filter,page+1).then(next=>{if(!stopped)cache.current.set(`${summary.key}:${filter}:${page+1}`,next);}).catch(()=>{});}).catch(e=>{if(!stopped){setPageLoading(false);setError(e.message);}});return()=>{stopped=true;};},[meta?.id,summary,filter,page]);
 async function updateFile(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value='';if(!file)return;if(meta&&!window.confirm('Đổi tệp sẽ thay dữ liệu và cấu hình hiện tại. Bạn đã tải CSV cần giữ chưa?'))return;
 readControl.current?.abort();const attempt=++version.current;if(!/\.csv$/i.test(file.name)){setError('Vui lòng chọn tệp .csv.');return;}const control=new AbortController();readControl.current=control;setIsReading(true);setReadProgress(0);setError('');
 try{const next=await diskRequest<DiskMeta>('import',{file},control.signal,setReadProgress);if(attempt!==version.current||control.signal.aborted){await diskRequest('delete',{id:next.id});return;}const old=meta;applyMeta(next);if(old)void diskRequest('delete',{id:old.id}).catch(()=>{});}catch(e){if(attempt===version.current&&!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Không đọc được CSV.');}finally{if(attempt===version.current)setIsReading(false);}}
 function cancelRead(){readControl.current?.abort();}
 function queueEdit(args:Record<string,unknown>){if(!meta)return;invalidate();setValidating(true);setSummary(null);mutation.current++;const id=meta.id;
 saving.current=saving.current.then(()=>diskRequest('edit',{id,...args})).then((updated:DiskMeta)=>{setMeta(current=>current?.id===updated.id&&args.rowId===0?{...current,first:updated.first}:current);setRevision(n=>n+1);}).catch(e=>{setError(e.message);setRevision(n=>n+1);});}
 function updateCell(rowId:number,column:number,value:string){setPageData(current=>({...current,rows:current.rows.map(row=>row.id===rowId?{...row,values:row.values.map((v,i)=>i===column?value:v)}:row)}));queueEdit({rowId,column,value});}
 function toggleExcluded(rowId:number){setPageData(current=>({...current,excluded:current.excluded.includes(rowId)?current.excluded.filter(id=>id!==rowId):[...current.excluded,rowId]}));queueEdit({rowId,toggle:true});}
 function updateRole(index:number,role:ColumnRole){invalidate();setRoles(v=>v.map((r,i)=>i===index?role:r));setPage(1);}
 function updatePreprocessing(index:number,patch:Partial<ColumnPreprocessing>){invalidate();setPreprocessing(v=>v.map((c,i)=>i===index?{...c,...patch}:c));}
 function updateLabelPreprocessing(index:number,task:LabelPreprocessing['task']){invalidate();setLabels(v=>v.map((c,i)=>i===index?{task}:c));}
 function setHasHeader(value:boolean){invalidate();updateHeader(value);setPage(1);}
 async function restoreData(){if(!meta)return;setIsWorking(true);invalidate();try{await saving.current;const restored=await diskRequest<DiskMeta>('restore',{id:meta.id});setMeta(restored);mutation.current++;setRevision(n=>n+1);}catch(e){setError((e as Error).message);}finally{setIsWorking(false);}}
 const hasDataChanges=Boolean(summary&&(summary.cellCount>0||summary.excludedCount>0));const dataVersion=meta?`${meta.id}:${mutation.current}`:'';
 async function downloadProcessedCsv(){if(!meta||!hasDataChanges)return;setIsWorking(true);setError('');try{await saving.current;const output=await diskRequest<{file:File;name:string}>('export',{id:meta.id,hasHeader});downloadFile(output.file,meta.name.replace(/\.csv$/i,'')+'-processed.csv');setDownloadedVersion(dataVersion);setTimeout(()=>void diskRequest('cleanupExport',{name:output.name}).catch(()=>{}),60000);}catch(e){setError((e as Error).message);}finally{setIsWorking(false);}}
 const preprocessingErrors=summary?.preprocessingErrors??[];
 const ready=Boolean(summary&&!isValidating&&summary.includedCount&&roles.includes('input')&&roles.includes('output')&&!summary.invalidIncludedCount&&!preprocessingErrors.length);
 async function confirmDataset(){if(!meta||!summary||!columnsConfirmed||!ready)return false;setIsWorking(true);setError('');try{await saving.current;const document=await materializeDisk(meta.id,summary.key);const snapshot=createTrainingSnapshot(document,hasHeader,columns,roles,new Set(),meta.name,preprocessing,labelPreprocessing);setSnapshot(snapshot);return true;}catch(e){setError((e as Error).message);return false;}finally{setIsWorking(false);}}
 const validation={missingInputCount:summary?.missingInputCount||0,invalidInputCount:summary?.invalidInputCount||0,missingOutputCount:summary?.missingOutputCount||0,invalidLabelCount:summary?.invalidLabelCount||0,invalidIncludedCount:summary?.invalidIncludedCount||0,rowIssues:new Map(pageData.issues)};
 const document:CsvDocument|null=meta?{rows:[],columnCount:meta.columnCount,delimiter:meta.delimiter,paddedRows:meta.paddedRows}:null;
 return {loadId:meta?.id||'',inputFile:meta?{name:meta.name,size:meta.size}:null,document,error,isReading,isWorking,isValidating,isPageLoading,readProgress,cancelRead,updateFile,
 hasHeader,setHasHeader,columns,rows:pageData.rows,totalRows:summary?.totalRows??Math.max(0,(meta?.rowCount||0)-(hasHeader?1:0)),roles,updateRole,excludedRows:new Set(pageData.excluded),toggleExcluded,updateCell,includedCount:summary?.includedCount||0,excludedCount:summary?.excludedCount||0,missingCount:validation.missingOutputCount,
 preprocessing,updatePreprocessing,preprocessingErrors,labelPreprocessing,updateLabelPreprocessing,validation,canConfirmData:ready,
 changes:{cellCount:summary?.cellCount||0,rowCount:summary?.rowCount||0,changedCells:new Set(pageData.changed)},hasDataChanges,hasUnsavedDataChanges:hasDataChanges&&downloadedVersion!==dataVersion,restoreData,downloadProcessedCsv,
 columnsConfirmed,setColumnsConfirmed,confirmedSnapshot,confirmDataset,snapshotForTraining:()=>{if(!confirmedSnapshot)throw Error('Hãy xác nhận dữ liệu.');return confirmedSnapshot;},
 page,setPage,filter,setFilter,filteredCount:pageData.total,columnSamples:summary?.samples??[],estimatedBytes:summary?.estimatedBytes||0,
 };
}
