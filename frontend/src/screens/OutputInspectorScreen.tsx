import { useEffect, useRef, useState } from "react";
import TrainingSetup from "../components/training/TrainingSetup";
import CsvReadProgress from '../components/data/CsvReadProgress';
import {hasUnsavedBrowserModels} from '../services/trainingApi';
import TrainingDashboard from "../components/results/TrainingDashboard";
import { useTrainingSetup } from "../hooks/useTrainingSetup";
import { useTrainingRun } from "../hooks/useTrainingRun";
import Footer from "../components/layout/Footer";
import DatasetEditor from "../components/data/DatasetEditor";
import DataUploadPanel from "../components/data/DataUploadPanel";
import { useDataset } from "../hooks/useDataset";
import { isRunActive } from "../types/trainingRun";
import type { TrainingPlan } from "../types/training";

export default function OutputInspectorScreen() {
  const dataset = useDataset();
  const training = useTrainingSetup(dataset.confirmedSnapshot);
  const run = useTrainingRun();
  const [step, setStep] = useState<1 | 2 | 3>(() => run.runId ? 3 : 1);
  const activeStep = step === 3 && run.runId ? 3 : step === 2 && dataset.confirmedSnapshot ? 2 : 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(activeStep);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dataset.hasUnsavedDataChanges||dataset.isReading||run.isStarting||(run.runId?.endsWith('-browser')&&(hasUnsavedBrowserModels()||Boolean(run.run&&isRunActive(run.run.status))))){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dataset.hasUnsavedDataChanges,dataset.isReading,run.isStarting,run.run,run.runId]);

  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  async function startRun(plan: TrainingPlan) {
    if (await run.start(plan)) setStep(3);
  }

  return (
    <main className="workspace">
      <section className="intro" id="top">
        <p className="eyebrow">MACHINE LEARNING WORKSPACE / BƯỚC 0{activeStep}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          {activeStep === 1 ? <>Từ dữ liệu đến <span>model.</span></> : activeStep === 2 ? <>Thiết lập <span>huấn luyện.</span></> : <>Kết quả <span>&amp; export.</span></>}
        </h1>
        <p className="intro-copy">{activeStep === 1 ? "Tải dữ liệu, chọn cột input và label, rồi kiểm tra trước khi tiếp tục." : activeStep === 2 ? "Dữ liệu đã được xác nhận. Chọn thông số chung và các model cho lượt huấn luyện." : "Theo dõi từng model, so sánh kết quả và chọn bộ model để sử dụng."}</p>
      </section>
      <ol className="workflow-steps" aria-label="Quy trình huấn luyện model">
        <li className={activeStep === 1 ? "workflow-step is-current" : "workflow-step is-complete"} aria-current={activeStep === 1 ? "step" : undefined}>
          <button className="workflow-step-button" type="button" onClick={() => setStep(1)}><span className="step-number">01</span><span className="workflow-step-copy"><strong>Dữ liệu đầu vào</strong><span>Chọn cột và làm sạch dữ liệu</span></span></button>
        </li>
        <li className={activeStep === 2 ? "workflow-step is-current" : training.confirmedPlan ? "workflow-step is-complete" : "workflow-step"} aria-current={activeStep === 2 ? "step" : undefined}>
          <button className="workflow-step-button" type="button" disabled={!dataset.confirmedSnapshot} onClick={() => setStep(2)}><span className="step-number">02</span><span className="workflow-step-copy"><strong>Thiết lập huấn luyện</strong><span>Cấu hình nhiều model</span></span></button>
        </li>
        <li className={activeStep === 3 ? "workflow-step is-current" : "workflow-step"} aria-current={activeStep === 3 ? "step" : undefined}>
          <button className="workflow-step-button" type="button" disabled={!run.runId} onClick={() => setStep(3)}><span className="step-number">03</span><span className="workflow-step-copy"><strong>Huấn luyện &amp; xuất</strong><span>Theo dõi, so sánh và tải model</span></span></button>
        </li>
      </ol>
      {activeStep === 1 ? (dataset.document ? <DatasetEditor key={dataset.loadId} dataset={dataset} onContinue={() => setStep(2)} /> : <><DataUploadPanel inputFile={null} error={dataset.error} onInputChange={dataset.updateFile} />{dataset.isReading && <CsvReadProgress percent={dataset.readProgress} onCancel={dataset.cancelRead}/>}</>) : activeStep === 2 ? (
        <>
          <div className="wizard-toolbar"><button className="secondary-button" type="button" onClick={() => setStep(1)}>← Quay lại dữ liệu</button><p>Chỉnh sửa dữ liệu không thay đổi lượt train đã chạy; cần xác nhận lại để tạo lượt mới.</p></div>
          <TrainingSetup snapshot={dataset.confirmedSnapshot} setup={training} onRun={(plan) => void startRun(plan)} onCancelStart={run.cancelStart} isStarting={run.isStarting} runBlocked={dataset.isReading || Boolean(run.run && isRunActive(run.run.status))} runError={run.error} />
        </>
      ) : <TrainingDashboard key={run.runId} controller={run} onBack={() => setStep(1)} />}
      <Footer />
    </main>
  );
}
