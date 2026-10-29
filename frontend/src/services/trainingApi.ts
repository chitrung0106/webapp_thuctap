import * as server from './serverTrainingApi';
import * as browser from './browserTraining';
import type {TrainingPlan} from '../types/training';
import type {ExportOptions} from '../types/export';
import {downloadFile} from '../utils/downloadFile';
export { TrainingApiError } from './trainingErrors';
const local=(id:string)=>id.endsWith('-browser');
export const startTraining=(plan:TrainingPlan)=>plan.execution?.environment==='server'?server.startTraining(plan):browser.start(plan);
export const getTrainingRun=(id:string,signal?:AbortSignal)=>local(id)?browser.get(id):server.getTrainingRun(id,signal);
export const cancelTraining=(id:string)=>local(id)?browser.cancel(id):server.cancelTraining(id);
export const previewTrainingModels=(id:string,options:ExportOptions,signal?:AbortSignal)=>local(id)?browser.preview(id,options,signal):server.previewTrainingModels(id,options,signal);
export async function exportTrainingModels(id:string,resultIds:string[],format:'python_zip'|'joblib',includeData:boolean,extra?:Pick<ExportOptions,'variants'|'includeFirmware'|'firmware'>){
 if(!local(id))return server.exportTrainingModels(id,resultIds,format,includeData,extra);
 const data=await browser.exportBytes(id,{resultIds,format,includeData,variants:extra?.variants??[],includeFirmware:extra?.includeFirmware??false,firmware:extra?.firmware??{board:'esp32',intervalMs:1000}});
 downloadFile(new Blob([data.bytes],{type:data.mediaType}),data.fileName);
}
