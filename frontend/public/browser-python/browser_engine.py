import gc
import copy, importlib.util, json, os, platform, sys, types, uuid, time
from collections import Counter
from pathlib import Path
import numpy as np
import joblib
from js import browser_progress, browser_cancelled
from app.schemas.training import TrainingRequest, ExportRequest
from app.services.training_preprocessing import input_frame, split_indices
from app.services.training_worker import run_model, TrainingCancelled
import browser_gpu
from app.services import training_worker
# Use portable KNN state from the beginning, including evaluation metrics.
_create_estimator=training_worker.create_estimator
def browser_estimator(model_id,task,parameters,seed):
    estimator=_create_estimator(model_id,task,parameters,seed)
    if model_id=='knn':estimator.set_params(algorithm='brute')
    if 'n_jobs' in estimator.get_params():estimator.set_params(n_jobs=1)
    return estimator
training_worker.create_estimator=browser_estimator

ROOT=Path('/browser-runs'); ROOT.mkdir(exist_ok=True)
RUNS={}; REQUESTS={}; CONTEXTS={}
EXECUTIONS={}; GPU_PENDING={}
MAX_WORKING_BYTES=128*1024*1024

def get_run(key):
    if key not in RUNS: raise KeyError('Phiên train trong trình duyệt không còn tồn tại. Hãy chọn dữ liệu và train lại.')
    return copy.deepcopy(RUNS[key])
def run_directory(key):
    if key not in RUNS: raise KeyError('Unknown browser run')
    return ROOT/key
stub=types.ModuleType('app.services.training_runs');stub.get_run=get_run;stub.run_directory=run_directory
sys.modules['app.services.training_runs']=stub
from app.services.training_export import preview_export, export_run

def now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
def emit(run):
    browser_progress(json.dumps(run,ensure_ascii=False,allow_nan=False))
def memory_estimate(request, job=None):
    # A conservative budget, not a measurement of free physical RAM/VRAM.
    rows=request.dataset.data.inputs; n=len(rows); width=0
    for i,spec in enumerate(request.dataset.input_preprocessing):
        if spec.config.kind=='category' and spec.config.encoding=='onehot':
            groups=set()
            for row in rows:
                groups.add(row[i])
                if len(groups)>10000:raise ValueError('Quá 10000 nhóm One-hot. Hãy giảm số nhóm/cột trước khi train.')
            width+=len(groups)
        else:width+=1
    raw=sum(48+sum(len(v)*2+32 for v in row) for row in rows)
    raw+=sum(48+sum(len(v)*2+32 for v in row) for row in request.dataset.data.outputs)
    base=raw*6+n*max(1,width)*8*6+len(request.dataset.csv)*2
    if job is None:return base
    p=job.parameters; model=job.model_id; train=max(1,int(n*request.split.train_percent/100)); extra=0
    if model in ('tree','forest','extra_trees','gradient_boosting','xgboost','lightgbm'):
        trees=int(p.get('n_estimators',100)) if model!='tree' else 1
        depth=p.get('max_depth'); nodes=min(2*train,2**(min(int(depth),30)+1)-1) if depth and int(depth)>0 else 2*train
        extra=trees*nodes*128+train*width*8*2
    elif model=='svm':extra=min(200*1024*1024,train*train*8)+train*width*8*2
    elif model=='knn':extra=train*width*8+min(256,n)*train*8
    elif model=='mlp':
        layers=[width]+list(p.get('hidden_layer_sizes',[64,32]))+[max(1,len(set(r[job.target_index] for r in request.dataset.data.outputs))) if request.task=='classification' else 1]
        weights=sum(a*b+b for a,b in zip(layers,layers[1:]));extra=weights*8*8+n*sum(layers)*8*4
    else:extra=width*width*8*2+train*width*8
    # Artifacts live in the WASM in-memory filesystem until downloaded/retired.
    stored=sum(path.stat().st_size for path in ROOT.glob('*/*.joblib'))
    return base+extra+stored

def guard(request,job=None):
    estimate=memory_estimate(request,job)
    if estimate>MAX_WORKING_BYTES:
        name=job.model_name if job else 'Dữ liệu train'
        raise MemoryError(f'{name}: ước tính cần {estimate/1048576:.1f} MiB, vượt ngân sách an toàn 128 MiB. Hãy giảm dòng/cột hoặc độ phức tạp model. Không tự lấy mẫu và không tự chuyển GPU sang CPU. Dữ liệu chỉnh sửa vẫn nằm trong kho trình duyệt.')
    return estimate

def start(raw):
    payload=json.loads(raw)
    payload.setdefault('execution',{'environment':'browser','device':'cpu'})
    payload['execution'].setdefault('environment','browser')
    request=TrainingRequest.model_validate(payload); estimate=guard(request)
    execution=request.execution.model_dump(by_alias=True)
    if execution['environment']!='browser':raise ValueError('Lượt train trình duyệt cần chọn Máy của bạn.')
    # No run history in browser mode. Retire old artifacts before a new run so
    # repeated experiments do not accumulate complete fitted datasets in RAM.
    import shutil
    for old in list(RUNS):
        shutil.rmtree(ROOT/old,ignore_errors=True)
        REQUESTS.pop(old,None);CONTEXTS.pop(old,None);GPU_PENDING.pop(old,None);EXECUTIONS.pop(old,None)
    RUNS.clear()
    key=str(uuid.uuid4())+'-browser'; directory=ROOT/key;directory.mkdir()
    run={'id':key,'status':'queued','createdAt':now(),'startedAt':None,'completedAt':None,'fileName':request.dataset.file_name,'task':request.task,'metric':request.metric,'rowCount':len(request.dataset.data.inputs),'inputColumns':request.dataset.data.input_columns,'outputColumns':request.dataset.data.output_columns,'splitCounts':None,'error':None,'results':[],'execution':'browser','estimatedMatrixBytes':estimate,'pythonVersion':platform.python_version()}
    for i,job in enumerate(request.jobs):
        run['results'].append({'id':f'model-{i}','modelId':job.model_id,'modelName':job.model_name,'targetIndex':job.target_index,'targetName':job.target_name,'parameters':job.parameters,'status':'pending','metrics':{},'history':[],'historyKind':None,'durationSeconds':None,'iterations':None,'warnings':[],'error':None,'progress':None})
    run['targetDistributions']=[{'targetIndex':i,'targetName':name,'classes':[{'label':label,'count':count} for label,count in sorted(Counter(row[i] for row in request.dataset.data.outputs).items())]} for i,name in enumerate(request.dataset.data.output_columns)] if request.task=='classification' else []
    RUNS[key]=run;REQUESTS[key]=request
    EXECUTIONS[key]=execution
    run['executionDevice']=execution.get('device','cpu')
    (directory/'plan.json').write_text(request.model_dump_json(by_alias=True),encoding='utf-8')
    emit(run);return json.dumps(run,ensure_ascii=False)

def next_job(key):
    run=RUNS[key]; request=REQUESTS[key]
    try:
        if browser_cancelled():
            for result in run['results']:
                if result['status'] in ('pending','running'):result['status']='cancelled'
            run.update(status='cancelled',completedAt=now());CONTEXTS.pop(key,None);GPU_PENDING.pop(key,None);emit(run);return False
        if key not in CONTEXTS:
            run.update(status='running',startedAt=now());emit(run)
            frame=input_frame(request.dataset);indices=split_indices(request)
            CONTEXTS[key]=(frame,indices)
            run['splitCounts']=dict(zip(('train','validation','test'),map(len,indices)))
        frame,indices=CONTEXTS[key]
        pending=next((i for i,r in enumerate(run['results']) if r['status']=='pending'),None)
        if pending is None:
            run.update(status='completed',completedAt=now());CONTEXTS.pop(key,None);gc.collect();emit(run);return False
        result=run['results'][pending];job=request.jobs[pending];result['status']='running';emit(run)
        try:guard(request,job)
        except MemoryError as error:
            result.update(status='failed',error=str(error));gc.collect();emit(run);return True
        if job.model_id=='mlp' and EXECUTIONS[key].get('device')=='gpu':
            try:
                context,data=browser_gpu.prepare(request,job,frame,indices)
                GPU_PENDING[key]=(pending,context,data)
                return 'gpu'
            except Exception as error:
                result.update(status='failed',error=str(error));emit(run);return True
        def progress(epoch,maximum,history):
            result.update(progress={'current':epoch,'total':maximum},history=list(history),historyKind='epoch');emit(run)
        try:
            if job.model_id == 'catboost':
                raise ValueError('CatBoost chưa hỗ trợ trong môi trường trình duyệt. Chọn máy chủ để train model này.')
            public,artifact=run_model(request,job,frame,indices,progress,browser_cancelled)
            if browser_cancelled():raise TrainingCancelled()
            public.update(pythonVersion=platform.python_version(),executionDevice='cpu',executionBackend='scikit-learn-wasm');artifact['result']=public
            path=run_directory(key)/(result['id']+'.joblib');joblib.dump(artifact,path,compress=3)
            result.update(public,artifactBytes=path.stat().st_size,status='succeeded')
            del artifact,public
        except MemoryError:
            result.update(status='failed',error='Không đủ bộ nhớ khi cấp phát cho model. Hãy giảm dòng/cột hoặc độ phức tạp model rồi thử lại. Dữ liệu đã chỉnh sửa vẫn được giữ trên ổ đĩa.')
        except TrainingCancelled:
            result['status']='cancelled'
        except Exception as error:
            result.update(status='failed',error=f'{type(error).__name__}: {error}')
        if 'artifact' in locals():del artifact
        gc.collect()
        emit(run);return True
    except Exception as error:
        run.update(status='failed',error=f'{type(error).__name__}: {error}',completedAt=now())
        for result in run['results']:
            if result['status'] in ('pending','running'):result['status']='cancelled'
        CONTEXTS.pop(key,None);emit(run);return False

def preview(key,raw):
    return json.dumps(preview_export(key,ExportRequest.model_validate_json(raw)),ensure_ascii=False,allow_nan=False)
def predict(key,raw):
    from app.services.model_prediction import predict_saved
    from app.schemas.training import PredictionRequest
    body=PredictionRequest.model_validate_json(raw)
    return json.dumps(predict_saved(get_run(key),run_directory(key),body.result_id,body.rows),ensure_ascii=False,allow_nan=False)
def export(key,raw):
    content,filename,mime=export_run(key,ExportRequest.model_validate_json(raw))
    Path('/browser-download').write_bytes(content)
    return json.dumps({'fileName':filename,'mediaType':mime})
def capabilities():
    from importlib.metadata import version
    names=['numpy','scipy','pandas','scikit-learn','joblib','pydantic','xgboost','lightgbm']
    versions={name:version(name) for name in names if importlib.util.find_spec(name.replace('-','_') if name!='scikit-learn' else 'sklearn') is not None}
    return json.dumps({'ready':True,'python':platform.python_version(),'platform':sys.platform,'versions':versions,'catboost':importlib.util.find_spec('catboost') is not None,'matrixBudgetMiB':128})

def gpu_data(key):return json.dumps(GPU_PENDING[key][2],allow_nan=False)
def gpu_progress(key,raw):
    i,_,_=GPU_PENDING[key];data=json.loads(raw);RUNS[key]['results'][i].update(history=data['history'],historyKind='epoch',progress={'current':data['epoch'],'total':data['total']},executionDevice='gpu',executionBackend='tensorflowjs-webgpu');emit(RUNS[key])
def gpu_finish(key,raw):
    i,context,_=GPU_PENDING[key];request=REQUESTS[key];result=RUNS[key]['results'][i]
    if browser_cancelled():result['status']='cancelled';GPU_PENDING.pop(key,None);gc.collect();emit(RUNS[key]);return
    public,artifact=browser_gpu.finish(request,request.jobs[i],context,json.loads(raw),CONTEXTS[key][1])
    public['pythonVersion']=platform.python_version();artifact['result']=public
    path=run_directory(key)/(result['id']+'.joblib');joblib.dump(artifact,path,compress=3)
    result.update(public,artifactBytes=path.stat().st_size,status='succeeded');emit(RUNS[key])
    GPU_PENDING.pop(key,None)
def gpu_fail(key,message):
    pending=GPU_PENDING.pop(key,None)
    if pending is None:return
    i=pending[0];result=RUNS[key]['results'][i]
    if browser_cancelled():result.update(status='cancelled')
    else:result.update(status='failed',executionDevice='gpu',executionBackend='tensorflowjs-webgpu',error='Không chạy được GPU: '+message+'. Model đã dừng; không tự chuyển sang CPU. Hãy giảm batch size/độ phức tạp hoặc tự chọn CPU cho lượt mới.')
    del pending
    gc.collect();emit(RUNS[key])
