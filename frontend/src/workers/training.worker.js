let py, cancelFlag, active=false;
self.browser_progress = json => self.postMessage({kind:'run',run:JSON.parse(json)});
self.browser_cancelled = () => Boolean(cancelFlag && Atomics.load(cancelFlag,0));
const emit=(state,detail)=>self.postMessage({kind:'runtime',state,detail});
async function initialize(){
 emit('loading','Đang tải Python và các thư viện WebAssembly...');
 const {loadPyodide}=await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs');
 py=await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'});
 await py.loadPackage(['numpy','scipy','pandas','scikit-learn','joblib','pydantic','xgboost','lightgbm']);
 const files=await(await fetch('/browser-python/manifest.json')).json();
 for(const name of files){const response=await fetch('/browser-python/'+name);if(!response.ok)throw Error('Không tải được source '+name);py.FS.mkdirTree('/browser-src/'+name.split('/').slice(0,-1).join('/'));py.FS.writeFile('/browser-src/'+name,await response.text());}
 await py.runPythonAsync("import sys; sys.path.insert(0, '/browser-src'); import browser_engine as engine");
 emit('ready','Sẵn sàng · Train bằng CPU/RAM của thiết bị này');
 return JSON.parse(py.runPython('engine.capabilities()'));
}
let ready;
async function train(key){
 active=true;
 try{while(true){const step=await py.runPythonAsync(`engine.next_job(${JSON.stringify(key)})`);if(!step)break;
  if(step==='gpu'){
   py.globals.set('gpu_key',key);
   try{
    const {trainGpu}=await import('./gpuTraining.js');
    const data=JSON.parse(py.runPython('engine.gpu_data(gpu_key)'));
    const trained=await trainGpu(data,self.browser_cancelled,(epoch,total,history)=>{
     py.globals.set('gpu_progress_json',JSON.stringify({epoch,total,history}));py.runPython('engine.gpu_progress(gpu_key, gpu_progress_json)');
    });
    py.globals.set('trained_json',JSON.stringify(trained));await py.runPythonAsync('engine.gpu_finish(gpu_key, trained_json)');
   }catch(error){py.globals.set('gpu_error',error.message);await py.runPythonAsync('engine.gpu_fail(gpu_key, gpu_error)');}
  }
  await new Promise(resolve=>setTimeout(resolve,15));}}
 catch(error){self.postMessage({kind:'fatal',error:error.message});}
 finally{active=false;}
}
self.onmessage=async({data})=>{const{id,command,args}=data;try{
 if(command==='init'){cancelFlag=new Int32Array(args.cancelBuffer);ready=initialize();}
 const cap=await ready;
 let value;
 if(command==='init'||command==='capabilities')value=cap;
 else if(command==='gpuDiagnostics'){const gpu=await import('./gpuTraining.js');value=gpu.gpuDiagnostics();}
 else if(command==='start'){
  if(active)throw Error('Đang có lượt train trong trình duyệt.');Atomics.store(cancelFlag,0,0);
  py.globals.set('raw_plan',JSON.stringify(args.plan));value=JSON.parse(await py.runPythonAsync('engine.start(raw_plan)'));
  self.postMessage({id,value});setTimeout(()=>train(value.id),0);return;
 }else if(command==='preview'||command==='export'){
  if(active)throw Error('Chờ lượt train kết thúc trước khi export.');
  py.globals.set('run_key',args.id);py.globals.set('raw_options',JSON.stringify(args.options));
  value=JSON.parse(await py.runPythonAsync(`engine.${command}(run_key, raw_options)`));
  if(command==='export'){const bytes=py.FS.readFile('/browser-download');value.bytes=bytes;py.FS.unlink('/browser-download');}
 }else if(command==='run'){py.globals.set('run_key',args.id);value=JSON.parse(py.runPython('import json; json.dumps(engine.get_run(run_key),ensure_ascii=False)'));}
 else throw Error('Unknown command '+command);
 self.postMessage({id,value});
 }catch(error){self.postMessage({id,error:error.message});}};
