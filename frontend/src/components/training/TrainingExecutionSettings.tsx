import { useEffect, useState } from "react";
import type { useTrainingSetup } from "../../hooks/useTrainingSetup";

export default function TrainingExecutionSettings({setup}:{setup:ReturnType<typeof useTrainingSetup>}) {
  const {form,setShared}=setup;
  const [runtime,setRuntime]=useState("");
  const browser=form.shared.environment!=="server";
  useEffect(()=>{const listener=(event:Event)=>setRuntime((event as CustomEvent<{detail:string}>).detail.detail);window.addEventListener("browser-runtime",listener);return()=>window.removeEventListener("browser-runtime",listener);},[]);
  return <section className="settings-card training-execution" aria-labelledby="execution-title">
    <h4 id="execution-title">Tài nguyên huấn luyện</h4>
    <label htmlFor="training-environment">Nơi huấn luyện</label>
    <select id="training-environment" value={browser?"browser":"server"} onChange={event=>{setShared("environment",event.target.value as "browser"|"server");setShared("device","cpu");setRuntime("");}}>
      <option value="browser">Máy của bạn — chạy trong trình duyệt</option>
      <option value="server">Máy chủ — chạy bằng backend</option>
    </select>
    {browser?<>
      <p className="dataset-local-note">Dùng CPU/RAM của thiết bị này. Lần đầu cần tải Python và thư viện; CSV không được gửi lên backend. Hãy tải model trước khi đóng hoặc tải lại trang vì dữ liệu của phiên chỉ nằm trong bộ nhớ.</p>
      <label className="execution-gpu-option"><input type="checkbox" checked={form.shared.device==="gpu"} onChange={event=>setShared("device",event.target.checked?"gpu":"cpu")} /> Sử dụng GPU cho model có hỗ trợ</label>
      <p className="dataset-local-note">Mặc định CPU. Chỉ khi bạn bật tùy chọn này, MLP mới dùng WebGPU nếu khả dụng; các model khác vẫn dùng CPU. Nếu GPU không khả dụng hoặc gặp lỗi, MLP chuyển sang CPU và ghi rõ lý do trong kết quả. CatBoost hiện cần chế độ Máy chủ.</p>
      {form.shared.device==="gpu"&&<p className="dataset-notice">MLP GPU dùng TensorFlow.js; kết quả có thể khác MLP CPU dù cùng thông số. Gói tải về vẫn kèm tiền xử lý, model và code Python dự đoán.</p>}
      {runtime&&<p role="status" className="dataset-notice">{runtime}</p>}
    </>:<p className="dataset-local-note">Gửi bộ dữ liệu đã xác nhận tới backend được cấu hình. Chế độ máy chủ hiện chạy CPU.</p>}
  </section>;
}
