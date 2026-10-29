"""Prepare train-only transforms; evaluate/export the weights trained by WebGPU."""
import time
import numpy as np
from sklearn.preprocessing import LabelEncoder, LabelBinarizer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report, confusion_matrix
from importlib.metadata import version
from app.services.model_factory import create_estimator
from app.services.training_preprocessing import make_preprocessor
from app.services.training_metrics import evaluate_model, binary_metrics

def prepare(request,job,frame,indices):
    raw=np.asarray(request.dataset.data.outputs)[:,job.target_index]
    encoder=LabelEncoder().fit(raw[indices[0]]) if request.task=='classification' else None
    if encoder is not None:
        if len(encoder.classes_)<2:raise ValueError('Tập train cần ít nhất 2 lớp.')
        try:ys=[encoder.transform(raw[i]) for i in indices]
        except ValueError as error:raise ValueError('Validation/test có lớp chưa xuất hiện trong train.') from error
    else:
        raw=raw.astype(float)
        if not np.isfinite(raw).all():raise ValueError('Label hồi quy phải là số hữu hạn.')
        ys=[raw[i] for i in indices]
    preprocessing=make_preprocessor(request.dataset)
    xs=[preprocessing.fit_transform(frame.iloc[indices[0]])]+[preprocessing.transform(frame.iloc[i]) for i in indices[1:]]
    estimator=create_estimator('mlp',request.task,job.parameters,request.split.seed)
    fit_x,fit_y,monitor_x,monitor_y=xs[0],ys[0],xs[1],ys[1]
    if estimator.early_stopping:
        fit_x,monitor_x,fit_y,monitor_y=train_test_split(xs[0],ys[0],test_size=estimator.validation_fraction,random_state=request.split.seed,stratify=ys[0] if encoder is not None else None)
    context=dict(preprocessing=preprocessing,encoder=encoder,xs=xs,ys=ys,estimator=estimator,started=time.perf_counter())
    data={'task':request.task,'classCount':len(encoder.classes_) if encoder is not None else 0,'parameters':job.parameters,'seed':request.split.seed,'trainX':fit_x.tolist(),'trainY':fit_y.tolist(),'validationX':xs[1].tolist(),'validationY':ys[1].tolist(),'monitorX':monitor_x.tolist(),'monitorY':monitor_y.tolist()}
    return context,data

def finish(request,job,context,trained,indices):
    e=context['estimator'];encoder=context['encoder'];xs=context['xs'];ys=context['ys']
    weights=[np.asarray(w['values'],dtype=np.float32).reshape(w['shape']) for w in trained['weights']]
    e.coefs_=weights[::2];e.intercepts_=weights[1::2]
    e.n_features_in_=xs[0].shape[1];e.n_layers_=len(e.coefs_)+1;e.n_outputs_=e.coefs_[-1].shape[1]
    e.out_activation_='identity' if encoder is None else 'logistic' if len(encoder.classes_)==2 else 'softmax'
    e.n_iter_=len(trained['history']);e.t_=e.n_iter_*len(xs[0]);e.loss_curve_=[p['trainLoss'] for p in trained['history']];e.loss_=e.loss_curve_[-1]
    if encoder is not None:
        e.classes_=np.arange(len(encoder.classes_));e._label_binarizer=LabelBinarizer().fit(e.classes_)
    splits=dict(zip(('train','validation','test'),zip(xs,ys)))
    metrics,samples,matrix=evaluate_model(e,splits,request.task,encoder)
    classes=encoder.classes_.tolist() if encoder is not None else []
    by_split={name:binary_metrics(confusion_matrix(y,e.predict(x),labels=e.classes_).tolist(),classes) for name,(x,y) in splits.items()} if len(classes)==2 else None
    report=classification_report(ys[2],e.predict(xs[2]),labels=e.classes_,target_names=classes,output_dict=True,zero_division=0) if encoder is not None else None
    points=None
    if encoder is None:
        predicted=e.predict(xs[2]);points=[{'actual':float(ys[2][i]),'predicted':float(predicted[i])} for i in np.linspace(0,len(ys[2])-1,min(200,len(ys[2])),dtype=int)]
    public={'versions':{name:version(name) for name in ('scikit-learn','numpy','scipy','pandas','joblib')},'executionDevice':'gpu','executionBackend':'tensorflowjs-webgpu','gpuName':trained['gpu'],'trainerVersion':'4.22.0','bestEpoch':trained['bestEpoch'],'durationSeconds':round(time.perf_counter()-context['started'],3),'metrics':metrics,'history':trained['history'],'historyKind':'epoch','iterations':e.n_iter_,'warnings':['MLP được train bằng TensorFlow.js/WebGPU; thuật toán số khác scikit-learn CPU, kết quả có thể khác dù cùng seed.'],'classes':classes,'confusionMatrix':matrix,'samples':samples,'transformedFeatureCount':int(xs[0].shape[1]),'problemType':'binary' if len(classes)==2 else 'multiclass' if classes else 'regression','binaryMetrics':binary_metrics(matrix,classes) if classes else None,'binaryMetricsBySplit':by_split,'lossName':'log_loss' if classes else 'mse','classificationReport':[{'label':label,**report[label]} for label in classes] if report else None,'regressionPoints':points}
    artifact={'pipeline':Pipeline([('preprocessing',context['preprocessing']),('model',e)]),'label_encoder':encoder,'input_schema':[s.model_dump(by_alias=True) for s in request.dataset.input_preprocessing],'input_columns':request.dataset.data.input_columns,'target_name':job.target_name,'task':request.task,'result':public,'sample_inputs':[request.dataset.data.inputs[int(i)] for i in indices[2][:3]]}
    return public,artifact
