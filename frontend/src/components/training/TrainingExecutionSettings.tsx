import { useEffect, useState } from "react";
import type { useTrainingSetup } from "../../hooks/useTrainingSetup";

export default function TrainingExecutionSettings({setup,isStarting=false}:{setup:ReturnType<typeof useTrainingSetup>;isStarting?:boolean}) {
  const {form,setShared}=setup;
  const [runtime,setRuntime]=useState("");
  const [runtimeProgress,setRuntimeProgress]=useState<{current:number;total:number}|null>(null);
  const [gpuStatus,setGpuStatus]=useState('');
  const browser=form.shared.environment!=="server";
  useEffect(()=>{if(form.shared.environment==='server'){setShared('environment','browser');setShared('device','cpu');}},[form.shared.environment]);
  useEffect(()=>{let stopped=false;setGpuStatus('');if(browser&&form.shared.device==='gpu'){
    setGpuStatus('Đang kiểm tra WebGPU...');
    void(async()=>{try{const gpu=(navigator as unknown as {gpu?:{requestAdapter:(options:object)=>Promise<{info?:{isFallbackAdapter?:boolean;vendor?:string;architecture?:string;description?:string};requestDevice:()=>Promise<{destroy:()=>void}>}|null>}}).gpu;
      if(!gpu)throw Error('Trình duyệt không có WebGPU. MLP sẽ dùng CPU.');const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter||adapter.info?.isFallbackAdapter)throw Error('Không tìm thấy GPU phần cứng phù hợp. MLP sẽ dùng CPU.');const device=await adapter.requestDevice();device.destroy();if(!stopped)setGpuStatus(`GPU khả dụng: ${[adapter.info?.vendor,adapter.info?.description,adapter.info?.architecture].filter(Boolean).join(' · ')||'WebGPU'}. ${/nvidia/i.test([adapter.info?.vendor,adapter.info?.description].join(' ')) ? 'Đã nhận NVIDIA.' : 'Trình duyệt chưa cung cấp GPU NVIDIA; sẽ dùng GPU được hiển thị.'} Bộ train sẽ kiểm tra lại khi chạy.`);
    }catch(error){if(!stopped)setGpuStatus(error instanceof Error?error.message:'Không kiểm tra được GPU. MLP có thể dùng CPU.');}})();
  }return()=>{stopped=true;};},[browser,form.shared.device]);
  useEffect(()=>{const listener=(event:Event)=>{const data=(event as CustomEvent<{detail:string;progress?:{current:number;total:number}}>).detail;setRuntime(data.detail);setRuntimeProgress(data.progress||null);};window.addEventListener("browser-runtime",listener);return()=>window.removeEventListener("browser-runtime",listener);},[]);
  return <section className="settings-card training-execution" aria-labelledby="execution-title">
    <h4 id="execution-title">Tài nguyên huấn luyện</h4>
    <label htmlFor="training-environment">Nơi huấn luyện</label>
    <select disabled={isStarting} id="training-environment" value={browser?"browser":"server"} onChange={event=>{setShared("environment",event.target.value as "browser"|"server");setShared("device","cpu");setRuntime("");}}>
      <option value="browser">Máy của bạn — chạy trong trình duyệt</option>
      <option value="server" disabled>Máy chủ — tạm vô hiệu hóa</option>
    </select>
    {browser?<>
      <p className="dataset-local-note">Dùng CPU/RAM của thiết bị này. Lần đầu cần tải Python và thư viện; CSV không được gửi lên backend. Hãy tải model trước khi đóng hoặc tải lại trang vì dữ liệu của phiên chỉ nằm trong bộ nhớ.</p>
      <label className="execution-gpu-option"><input type="checkbox" disabled={isStarting} checked={form.shared.device==="gpu"} onChange={event=>setShared("device",event.target.checked?"gpu":"cpu")} /> Sử dụng GPU cho model có hỗ trợ</label>
      <p className="dataset-local-note">Mặc định CPU. Chỉ khi bạn bật tùy chọn này, MLP mới dùng WebGPU nếu khả dụng; các model khác vẫn dùng CPU. Nếu GPU không khả dụng hoặc gặp lỗi, MLP chuyển sang CPU và ghi rõ lý do trong kết quả. Máy chủ đang tạm vô hiệu hóa; CatBoost hiện chưa sử dụng được.</p>
      {form.shared.device==="gpu"&&<><p className="dataset-local-note">Ưu tiên GPU rời hiệu năng cao (NVIDIA nếu trình duyệt cung cấp). Website không thể ép chọn hãng GPU.</p><details className="dataset-local-note"><summary>Máy có NVIDIA nhưng vẫn hiện Intel?</summary><p>Trên Windows: mở Settings → System → Display → Graphics, chọn trình duyệt đang dùng → Options → High performance (NVIDIA) → Save. Sau đó đóng và mở lại trình duyệt, vào web và bật GPU lại. Hãy tải các model cần giữ trước khi đóng trình duyệt.</p></details><p className="dataset-notice">MLP GPU dùng TensorFlow.js; kết quả có thể khác MLP CPU dù cùng thông số. Gói tải về vẫn kèm tiền xử lý, model và code Python dự đoán.</p></>}
      {gpuStatus&&<p role="status" className="dataset-notice">{gpuStatus}</p>}
      {browser&&!crossOriginIsolated&&<p className="error-message">Thiếu header COOP/COEP cho chế độ trình duyệt. Cần cấu hình hosting trước khi huấn luyện.</p>}
      {runtimeProgress&&<progress max={runtimeProgress.total} value={runtimeProgress.current} aria-label="Tiến độ nạp thư viện"/>}
      {runtime&&<p role="status" className="dataset-notice">{runtime}</p>}
    </>:<p className="dataset-local-note">Gửi bộ dữ liệu đã xác nhận tới backend được cấu hình. Chế độ máy chủ hiện chạy CPU.</p>}
  </section>;
}
