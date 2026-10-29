import numpy as np
import pandas as pd

def predict_artifact(artifact, rows):
    columns=artifact['input_columns']
    if not rows or any(len(row)!=len(columns) for row in rows):
        raise ValueError('Mỗi dòng phải đủ input theo đúng thứ tự: '+', '.join(columns))
    predictions=[];probabilities=[]
    for offset in range(0,len(rows),1024):
        frame=pd.DataFrame(rows[offset:offset+1024],columns=[f'x{i}' for i in range(len(columns))])
        for i,spec in enumerate(artifact['input_schema']):
            name=f'x{i}'
            if spec['config']['kind']=='number':
                frame[name]=pd.to_numeric(frame[name],errors='raise')
                if not np.isfinite(frame[name].to_numpy(dtype=float)).all():raise ValueError(f'Input {columns[i]} phải là số hữu hạn.')
            else:
                frame[name]=frame[name].astype(str)
                if frame[name].str.strip().eq('').any():raise ValueError(f'Input {columns[i]} không được để trống.')
        pipeline=artifact['pipeline'];values=pipeline.predict(frame)
        if artifact['label_encoder'] is not None:values=artifact['label_encoder'].inverse_transform(values.astype(int))
        predictions.extend(values.tolist())
        if artifact['task']=='classification' and hasattr(pipeline,'predict_proba'):
            probability=pipeline.predict_proba(frame)
            if not np.isfinite(probability).all():raise ValueError('Xác suất dự đoán không hữu hạn.')
            probabilities.extend(probability.tolist())
    return {'predictions':predictions,'probabilities':probabilities or None,'classes':artifact['label_encoder'].classes_.tolist() if artifact['label_encoder'] is not None else [],'inputColumns':columns,'targetName':artifact['target_name']}

def predict_saved(run, directory, result_id, rows):
    import joblib
    if not any(r['id']==result_id and r['status']=='succeeded' for r in run['results']):raise ValueError('Chọn model đã huấn luyện thành công của lượt chạy này.')
    return predict_artifact(joblib.load(directory/(result_id+'.joblib')),rows)
