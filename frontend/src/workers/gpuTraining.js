import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
export const gpuDiagnostics=()=>({backend:tf.getBackend(),tensors:tf.memory().numTensors});

export async function gpuCapability() {
  if (!globalThis.navigator?.gpu) return {available:false,reason:'Trình duyệt chưa hỗ trợ WebGPU.'};
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter || adapter.info?.isFallbackAdapter) return {available:false,reason:'Không tìm thấy GPU phần cứng tương thích.'};
  const info=adapter.info;
  return {available:true,name:[info?.vendor,info?.description,info?.architecture].filter(Boolean).join(' · ') || 'GPU WebGPU',backend:'webgpu'};
}

export async function trainGpu(data, cancelled, onEpoch) {
  const capability=await gpuCapability();
  if(!capability.available) throw Error(capability.reason);
  // Prefer a discrete/high-performance GPU; the browser/OS makes the final selection.
  tf.env().set('WEBGPU_USE_LOW_POWER_GPU', false);
  if(!await tf.setBackend('webgpu')) throw Error('Không khởi tạo được backend WebGPU.');
  await tf.ready();
  // Never let an unimplemented WebGPU training kernel silently use tfjs CPU.
  if(tf.getBackend()!=='webgpu') throw Error('Backend huấn luyện thực tế không phải WebGPU.');
  const p=data.parameters, classification=data.task==='classification', binary=data.classCount===2;
  const activation={logistic:'sigmoid',identity:'linear'}[p.activation] || p.activation;
  const units=classification?(binary?1:data.classCount):1;
  const model=tf.sequential();
  let seed=data.seed;
  for(const [i,size] of [...p.hidden_layer_sizes,units].entries()) model.add(tf.layers.dense({
    units:size,...(i===0?{inputShape:[data.trainX[0].length]}:{}),
    activation:i===p.hidden_layer_sizes.length?(classification?(binary?'sigmoid':'softmax'):'linear'):activation,
    kernelInitializer:tf.initializers.glorotUniform({seed:seed+i}),biasInitializer:'zeros',
    kernelRegularizer:p.alpha?tf.regularizers.l2({l2:p.alpha/(2*data.trainX.length)}):undefined,
  }));
  const optimizer=p.solver==='sgd'?tf.train.momentum(p.learning_rate_init,0.9,true):tf.train.adam(p.learning_rate_init);
  model.compile({optimizer,loss:classification?(binary?'binaryCrossentropy':'categoricalCrossentropy'):'meanSquaredError'});
  const owned=[];
  function tensor(rows){const t=tf.tensor2d(rows);owned.push(t);return t;}
  function labels(rows){const t=tf.tidy(()=>classification&&!binary?tf.oneHot(tf.tensor1d(rows,'int32'),data.classCount):tf.tensor2d(rows,[rows.length,1]));owned.push(t);return t;}
  const trainX=tensor(data.trainX),trainY=labels(data.trainY),validationX=tensor(data.validationX),validationY=labels(data.validationY),monitorX=tensor(data.monitorX),monitorY=labels(data.monitorY);
  const history=[];let bestWeights=null,bestLoss=Infinity,patience=0,bestEpoch=0;
  // Seeded shuffle independent of browser Math.random; model comparisons still
  // use the exact same train/validation/test indices prepared in Python.
  function random(){seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;}
  async function measure(x,y){
    const pred=model.predict(x);
    try {
      const values=await pred.data(),truth=await y.data();let loss=0,correct=0;
      for(let i=0;i<x.shape[0];i++){
        if(!classification){loss+=(values[i]-truth[i])**2;continue;}
        if(binary){const v=Math.max(1e-7,Math.min(1-1e-7,values[i]));loss-=truth[i]*Math.log(v)+(1-truth[i])*Math.log(1-v);correct+=(values[i]>=.5)===(truth[i]===1)?1:0;}
        else {let guess=0,actual=0;for(let j=0;j<units;j++){if(values[i*units+j]>values[i*units+guess])guess=j;if(truth[i*units+j]){actual=j;loss-=Math.log(Math.max(1e-7,values[i*units+j]));}}correct+=guess===actual?1:0;}
      }
      return {loss:loss/x.shape[0],accuracy:correct/x.shape[0]};
    } finally{pred.dispose();}
  }
  try {
    for(let epoch=0;epoch<p.max_iter;epoch++){
      if(cancelled())throw Error('TRAINING_CANCELLED');
      const order=Array.from({length:trainX.shape[0]},(_,i)=>i);
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      const [x,y]=tf.tidy(()=>{const index=tf.tensor1d(order,'int32');return [tf.gather(trainX,index),tf.gather(trainY,index)];});
      try{await model.fit(x,y,{epochs:1,batchSize:p.batch_size==='auto'?Math.min(200,order.length):Math.min(p.batch_size,order.length),shuffle:false,verbose:0,callbacks:{onBatchEnd:async()=>{if(cancelled())model.stopTraining=true;}}});}finally{x.dispose();y.dispose();}
      if(cancelled())throw Error('TRAINING_CANCELLED');
      const train=await measure(trainX,trainY),validation=await measure(validationX,validationY);
      if(!Number.isFinite(train.loss)||!Number.isFinite(validation.loss))throw Error('Loss GPU không hữu hạn. Kiểm tra dữ liệu và learning rate.');
      history.push({step:epoch+1,trainLoss:train.loss,validationLoss:validation.loss,...(classification?{trainAccuracy:train.accuracy,validationAccuracy:validation.accuracy}:{})});
      onEpoch(epoch+1,p.max_iter,history);
      if(p.early_stopping){
        const monitor=await measure(monitorX,monitorY);
        if(monitor.loss<bestLoss-0.0001){bestLoss=monitor.loss;patience=0;bestEpoch=epoch+1;bestWeights?.forEach(w=>w.dispose());bestWeights=model.getWeights().map(w=>w.clone());}
        else patience++;
        if(patience>=p.n_iter_no_change)break;
      }
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(bestWeights)model.setWeights(bestWeights);
    const weights=await Promise.all(model.getWeights().map(async t=>({shape:t.shape,values:Array.from(await t.data())})));
    return {weights,history,backend:'webgpu',gpu:capability.name,bestEpoch:bestEpoch||history.length};
  } finally {
    bestWeights?.forEach(w=>w.dispose());owned.forEach(t=>t.dispose());model.dispose();optimizer.dispose();
    // tfjs 4.22 MomentumOptimizer.dispose() omits its SGD base-class scalar.
    if(p.solver==='sgd')tf.SGDOptimizer.prototype.dispose.call(optimizer);
  }
}
