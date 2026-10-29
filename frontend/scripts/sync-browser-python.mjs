import {copyFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// One source for preprocessing, training, metrics and exports: backend/app.
// These Python files are public application code, never backend config/data.
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.BROWSER_BACKEND_SOURCE || path.resolve(frontend,'../backend/app');
const destination=path.join(frontend,'public/browser-python');
const files=['schemas/training.py','services/model_factory.py','services/training_preprocessing.py','services/training_worker.py','services/training_metrics.py','services/training_export.py','services/export_templates.py','services/portable_export.py','services/portable_runtime.py','services/firmware_export.py','services/model_prediction.py'];
for(const relative of files){const target=path.join(destination,'app',relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(source,relative),target);}
await writeFile(path.join(destination,'manifest.json'),JSON.stringify(['browser_engine.py','browser_gpu.py',...files.map(name=>'app/'+name)],null,2)+'\n');
console.log('Browser Python sources synchronized from backend/app.');
