import {createCsvStreamParser} from '../utils/csvStream';
import {getCellIssue, getPreprocessingErrors, getLabelPreprocessingErrors} from '../utils/datasetValidation';

// IndexedDB is disk-backed browser storage. Never load the complete object store.
const DB_NAME='data-to-model-datasets-v1', BLOCK_ROWS=256, MAX_GROUPS=10000;
let database, cancelled=new Set(), analyses=new Map();
const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
async function db(){if(database)return database;const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{for(const name of ['meta','blocks','edits'])req.result.createObjectStore(name);};database=await request(req);return database;}
async function access(store,mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode);let value;try{const req=action(tx.objectStore(store));req.onsuccess=()=>{value=req.result;};}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error||Error('Giao dịch lưu trữ bị hủy.'));tx.onerror=()=>{};});}
const get=(store,key)=>access(store,'readonly',s=>s.get(key));
const put=(store,key,value)=>access(store,'readwrite',s=>s.put(value,key));
const range=id=>IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]);
async function drop(id){analyses.delete(id);for(const store of ['blocks','edits'])await access(store,'readwrite',s=>s.delete(range(id)));await access('meta','readwrite',s=>s.delete(id));}
function abortCheck(token){if(cancelled.has(token))throw new DOMException('Đã hủy thao tác.','AbortError');}
async function block(id,n){const rows=await get('blocks',[id,n]),edit=await get('edits',[id,n])||{};return {rows,edit};}
function current(row,edit){return edit[row.id]?.values ? {...row,values:edit[row.id].values} : row;}
async function importFile(file,token){
  const quota=await navigator.storage?.estimate?.();if(quota?.quota && quota.quota-(quota.usage||0)<file.size*6)throw Error('Không đủ dung lượng kho trình duyệt để nhập tệp và lưu chỉnh sửa. Hãy giải phóng dung lượng hoặc chọn tệp nhỏ hơn.');
  const id=crypto.randomUUID();let complete=false;
  const meta={id,name:file.name,size:file.size,rowCount:0,columnCount:0,paddedRows:0,delimiter:',',blockCount:0,blockStarts:[],createdAt:Date.now(),ready:false,revision:0,first:[]};
  await put('meta',id,meta);
  try{
    let buffered=[];const decoder=new TextDecoder('utf-8',{fatal:true});
    const parser=createCsvStreamParser(row=>{if(row.values.length>2048)throw Error('CSV vượt 2048 cột; hãy chọn ít cột hơn trước khi mở.');if(!meta.rowCount)meta.first=row.values;meta.rowCount++;buffered.push(row);});
    async function flush(final=false){
      // Bound each disk block by rows AND characters; wide records must not accumulate 256 large strings.
      while(buffered.length){let bytes=0,count=0;for(const row of buffered){bytes+=row.values.reduce((n,v)=>n+v.length*2+32,48);count++;if(count>=BLOCK_ROWS||bytes>=512*1024)break;}if(!final&&count<BLOCK_ROWS&&bytes<512*1024)break;abortCheck(token);meta.blockStarts.push(buffered[0].id);await put('blocks',[id,meta.blockCount++],buffered.splice(0,count));}
    }
    for(let offset=0;offset<file.size;offset+=65536){abortCheck(token);let text;try{text=decoder.decode(await file.slice(offset,offset+65536).arrayBuffer(),{stream:true});}catch{throw Error('CSV phải được lưu bằng UTF-8.');}parser.push(text);await flush();self.postMessage({progress:token,percent:Math.round(Math.min(file.size,offset+65536)*100/file.size)});}
    parser.push(decoder.decode());const parsed=parser.finish();await flush(true);abortCheck(token);
    if(parsed.columnCount<2)throw Error('Cần ít nhất 2 cột để chọn riêng input và label.');
    Object.assign(meta,{columnCount:parsed.columnCount,paddedRows:parsed.paddedRows,delimiter:parsed.delimiter,ready:true});await put('meta',id,meta);complete=true;return meta;
  }finally{cancelled.delete(token);if(!complete)await drop(id);}
}
function matches(filter,row,excluded,issues,roles){if(filter==='all')return true;if(filter==='excluded')return excluded;if(excluded)return false;if(filter==='label')return issues.some((v,i)=>roles[i]==='output'&&v);if(filter==='input')return issues.some((v,i)=>roles[i]==='input'&&v);return issues.some(Boolean);}
async function scan(args,token){
 const {id,config}=args,meta=await get('meta',id);if(!meta?.ready)throw Error('Kho dữ liệu không còn tồn tại.');
 const counts={missingInputCount:0,invalidInputCount:0,missingOutputCount:0,invalidLabelCount:0,invalidIncludedCount:0};
 const samples=config.columns.map(()=>[]),groups=config.columns.map(()=>new Set()),overflow=new Set();let groupBytes=0;let includedCount=0,excludedCount=0,cellCount=0,rowCount=0,rawBytes=0;
 const blocks=[];const inputIndices=config.roles.flatMap((r,i)=>r==='input'?[i]:[]);const outputIndices=config.roles.flatMap((r,i)=>r==='output'?[i]:[]);
 const preprocessingErrors=new Set();
 for(let n=0;n<meta.blockCount;n++){
  abortCheck(token);const {rows,edit}=await block(id,n);const filtered={all:0,excluded:0,label:0,input:0,errors:0};
  for(const original of rows){const row=current(original,edit);const excluded=Boolean(edit[row.id]?.excluded);const issues=row.values.map((value,i)=>getCellIssue(value,config.roles[i],config.preprocessing[i],config.labels[i]));
   if(edit[row.id]?.values){let changed=0;row.values.forEach((v,i)=>{if(v!==original.values[i])changed++;});cellCount+=changed;if(changed)rowCount++;}
   if(config.hasHeader&&row.id===0)continue;
   for(const filter of Object.keys(filtered))if(matches(filter,row,excluded,issues,config.roles))filtered[filter]++;
   if(excluded){excludedCount++;continue;}includedCount++;
   rawBytes+=row.values.reduce((n,v)=>n+v.length*2+32,48);
   if(issues.includes('Thiếu input'))counts.missingInputCount++;
   if(issues.includes('Thiếu label'))counts.missingOutputCount++;
   if(issues.some((v,i)=>config.roles[i]==='input'&&v&&v!=='Thiếu input'))counts.invalidInputCount++;
   if(issues.some((v,i)=>config.roles[i]==='output'&&v&&v!=='Thiếu label'))counts.invalidLabelCount++;
   if(issues.some(Boolean))counts.invalidIncludedCount++;
   row.values.forEach((value,i)=>{if(value.trim()&&samples[i].length<4&&!samples[i].includes(value))samples[i].push(value);if(value.trim()&&(config.roles[i]==='output'&&config.labels[i]?.task!=='regression'||config.roles[i]==='input'&&config.preprocessing[i]?.kind==='category')){if(!groups[i].has(value)){if(groups[i].size<MAX_GROUPS&&groupBytes+value.length*2+64<=16*1024*1024){groups[i].add(value);groupBytes+=value.length*2+64;}else overflow.add(i);}}});
   for(const error of getPreprocessingErrors([row],config.columns,config.roles,new Set(),config.preprocessing))preprocessingErrors.add(error);
  }blocks.push(filtered);
 }
 for(const e of getPreprocessingErrors([],config.columns,config.roles,new Set(),config.preprocessing))preprocessingErrors.add(e);
 for(const e of getLabelPreprocessingErrors(config.columns,config.roles,config.labels))preprocessingErrors.add(e);
 for(const i of outputIndices){const task=config.labels[i]?.task,count=groups[i].size;if(task==='binary'&&count!==2)preprocessingErrors.add(`Label ${config.columns[i]}: đã chọn Binary nhưng có ${count} lớp trong các dòng giữ lại; cần đúng 2 lớp.`);if(task==='multiclass'&&count<3)preprocessingErrors.add(`Label ${config.columns[i]}: đã chọn Multiclass nhưng có ${count} lớp; cần ít nhất 3 lớp.`);}
 for(const i of overflow)preprocessingErrors.add(`${config.roles[i]==='output'?'Label '+config.columns[i]:`Cột ${i+1} (${config.columns[i]})`}: danh sách nhóm vượt giới hạn an toàn (10000 nhóm/cột hoặc 16 MiB tổng tên nhóm); hãy giảm số nhóm hoặc chọn kiểu Số nếu phù hợp.`);
 const featureCount=inputIndices.reduce((sum,i)=>sum+(config.preprocessing[i]?.kind==='category'&&config.preprocessing[i]?.encoding==='onehot'?groups[i].size:1),0);
 const estimatedBytes=rawBytes*8+includedCount*Math.max(1,featureCount)*8*6+includedCount*outputIndices.length*64;
 const summary={...counts,includedCount,excludedCount,cellCount,rowCount,samples,preprocessingErrors:[...preprocessingErrors],featureCount,estimatedBytes,totalRows:meta.rowCount-(config.hasHeader?1:0)};
 const key=JSON.stringify([meta.revision,config]);analyses.set(id,{key,blocks,config,summary});return {...summary,key};
}
async function page({id,key,filter='all',page=1,size=50}){
 const analysis=analyses.get(id);if(!analysis||analysis.key!==key)throw Error('Bảng đang được kiểm tra lại.');const config=analysis.config;let skip=(page-1)*size;const selected=[],excluded=[],changed=[],issues=[];
 const total=analysis.blocks.reduce((sum,b)=>sum+b[filter],0);
 for(let n=0;n<analysis.blocks.length&&selected.length<size;n++){
  if(skip>=analysis.blocks[n][filter]){skip-=analysis.blocks[n][filter];continue;}
  const data=await block(id,n);for(const original of data.rows){const row=current(original,data.edit);if(config.hasHeader&&row.id===0)continue;const isExcluded=Boolean(data.edit[row.id]?.excluded);const rowIssues=row.values.map((v,i)=>getCellIssue(v,config.roles[i],config.preprocessing[i],config.labels[i]));if(!matches(filter,row,isExcluded,rowIssues,config.roles))continue;if(skip){skip--;continue;}
   selected.push(row);if(isExcluded)excluded.push(row.id);issues.push([row.id,rowIssues]);row.values.forEach((v,i)=>{if(v!==original.values[i])changed.push(`${row.id}:${i}`);});if(selected.length===size)break;
  }
 }return {rows:selected,excluded,changed,issues,total};
}
async function editRows({id,rowId,column,value,toggle}){const metaBefore=await get('meta',id);let n;if(metaBefore.blockStarts){let lo=0,hi=metaBefore.blockStarts.length;while(lo<hi){const mid=(lo+hi)>>>1;if(metaBefore.blockStarts[mid]<=rowId)lo=mid+1;else hi=mid;}n=lo-1;}else n=Math.floor(rowId/BLOCK_ROWS);const data=await block(id,n);const original=data.rows.find(r=>r.id===rowId);if(!original)throw Error('Không tìm thấy dòng.');const entry=data.edit[rowId]||{};if(toggle)entry.excluded=!entry.excluded;else {const values=[...(entry.values||original.values)];values[column]=value;entry.values=values.some((v,i)=>v!==original.values[i])?values:undefined;}if(!entry.values&&!entry.excluded)delete data.edit[rowId];else data.edit[rowId]=entry;await put('edits',[id,n],data.edit);const meta=await get('meta',id);if(rowId===0)meta.first=entry.values||original.values;meta.revision++;await put('meta',id,meta);analyses.delete(id);return meta;}
async function materialize({id,key},token){const analysis=analyses.get(id);if(!analysis||analysis.key!==key)throw Error('Dữ liệu đã thay đổi; hãy kiểm tra lại.');
 // Guard BEFORE allocating full CSV/arrays. The current trainers are full-data trainers.
 if(analysis.summary.estimatedBytes>128*1024*1024)throw Error(`Dữ liệu train ước tính cần ${Math.ceil(analysis.summary.estimatedBytes/1048576)} MiB, vượt ngân sách an toàn 128 MiB. Bạn vẫn có thể chỉnh sửa/tải CSV; hãy bỏ bớt dòng/cột trước khi xác nhận. Không tự lấy mẫu dữ liệu.`);
 const meta=await get('meta',id),rows=[],excluded=[];for(let n=0;n<meta.blockCount;n++){abortCheck(token);const data=await block(id,n);for(const original of data.rows){if(data.edit[original.id]?.excluded&&!(analysis.config.hasHeader&&original.id===0))continue;rows.push(current(original,data.edit));}}return {rows,columnCount:meta.columnCount,delimiter:meta.delimiter,paddedRows:meta.paddedRows};}
async function exportCsv({id,hasHeader},token){
 if(!navigator.storage?.getDirectory)throw Error('Trình duyệt chưa hỗ trợ xuất CSV lớn xuống ổ đĩa. Hãy dùng Chrome hoặc Edge mới.');
 const root=await navigator.storage.getDirectory(),name='dataset-export-'+crypto.randomUUID()+'.csv',handle=await root.getFileHandle(name,{create:true});let stream;
 try{stream=await handle.createWritable();await stream.write('\uFEFF');const meta=await get('meta',id);for(let n=0;n<meta.blockCount;n++){abortCheck(token);const data=await block(id,n);let text='';for(const original of data.rows){if(data.edit[original.id]?.excluded&&!(hasHeader&&original.id===0))continue;text+=current(original,data.edit).values.map(v=>'"'+v.replace(/"/g,'""')+'"').join(meta.delimiter)+'\r\n';}await stream.write(text);}await stream.close();stream=null;return {file:await handle.getFile(),name};}catch(e){await stream?.abort();await root.removeEntry(name).catch(()=>{});throw e;}
}
let queue=Promise.resolve();
self.onmessage=({data})=>{if(data.command==='cancel'){cancelled.add(data.token);return;}queue=queue.then(async()=>{const {token,command,args}=data;try{let value;if(command==='import')value=await importFile(args.file,token);else if(command==='scan')value=await scan(args,token);else if(command==='page')value=await page(args);else if(command==='edit')value=await editRows(args);else if(command==='materialize')value=await materialize(args,token);else if(command==='restore'){await access('edits','readwrite',s=>s.delete(range(args.id)));const meta=await get('meta',args.id);meta.first=(await get('blocks',[args.id,0]))[0].values;meta.revision++;await put('meta',args.id,meta);analyses.delete(args.id);value=meta;}else if(command==='export')value=await exportCsv(args,token);else if(command==='delete')value=await drop(args.id);else if(command==='cleanupExport'){const root=await navigator.storage.getDirectory();await root.removeEntry(args.name);value=true;}else if(command==='saveConfig'){const meta=await get('meta',args.id);if(meta){meta.config=args.config;await put('meta',args.id,meta);}value=true;}else if(command==='resume'){const metas=await access('meta','readonly',s=>s.getAll());for(const m of metas)if(!m.ready&&Date.now()-m.createdAt>3600000)await drop(m.id);value=metas.filter(m=>m.ready).sort((a,b)=>b.createdAt-a.createdAt)[0]||null;}else throw Error('Lệnh kho dữ liệu không hợp lệ.');self.postMessage({token,value});}catch(e){self.postMessage({token,error:e.name==='QuotaExceededError'?'Kho trình duyệt đã hết dung lượng. Dữ liệu trước đó vẫn được giữ; hãy giải phóng dung lượng và thử lại.':e.message,abort:e.name==='AbortError'});}finally{cancelled.delete(data.token);}});};
