import { useEffect, useRef, useState } from "react";
import { cancelTraining, getTrainingRun, startTraining, TrainingApiError, abortBrowserWork, hasUnsavedBrowserModels } from "../services/trainingApi";
import type { TrainingPlan } from "../types/training";
import { isRunActive, type TrainingRun } from "../types/trainingRun";

const STORAGE_KEY = "output-inspector:last-training-run";
function storedRun() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } }

export function useTrainingRun() {
  const [runId, setRunId] = useState<string | null>(storedRun);
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const starting = useRef(false);
  const attempt=useRef(0);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const latest = await getTrainingRun(runId!, controller.signal);
        if (stopped) return;
        setRun(latest); setError("");
        if (isRunActive(latest.status)) timer = setTimeout(poll, 1200);
      } catch (pollError) {
        if (stopped) return;
        setError(pollError instanceof Error ? pollError.message : "Không tải được trạng thái.");
        if (!(pollError instanceof TrainingApiError && pollError.status === 404)) timer = setTimeout(poll, 4000);
      }
    }
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [runId]);

  async function start(plan: TrainingPlan) {
    if (starting.current || (run && isRunActive(run.status))) return false;
    if(hasUnsavedBrowserModels()&&!window.confirm('RUN lượt mới sẽ xóa model tạm của lượt cũ chưa tải về. Tiếp tục?'))return false;
    const version=++attempt.current;
    starting.current = true; setIsStarting(true); setError("");
    try {
      const started = await startTraining(plan);
      if(version!==attempt.current)return false;
      setRun(started); setRunId(started.id);
      try { localStorage.setItem(STORAGE_KEY, started.id); } catch { /* optional persistence */ }
      return true;
    } catch (startError) {
      if(version===attempt.current)setError(startError instanceof Error ? startError.message : "Không tạo được lượt train.");
      return false;
    } finally { if(version===attempt.current){starting.current = false; setIsStarting(false);} }
  }
  function cancelStart(){attempt.current++;abortBrowserWork();starting.current=false;setIsStarting(false);setError('Đã hủy khởi tạo. Bạn có thể RUN lại.');}
  async function forceStop(){if(!runId?.endsWith('-browser'))return;abortBrowserWork();setRun(await getTrainingRun(runId));setIsCancelling(false);}
  async function cancel() {
    if (!runId || isCancelling) return;
    setIsCancelling(true);
    try { setRun(await cancelTraining(runId)); }
    catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : "Không gửi được yêu cầu dừng."); }
    finally { setIsCancelling(false); }
  }
  function forgetRun() {
    if (run && isRunActive(run.status)) return;
    setRunId(null); setRun(null); setError("");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional persistence */ }
  }
  return { runId, run, error, isStarting, isCancelling, start, cancel, forceStop, cancelStart, forgetRun };
}
