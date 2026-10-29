from fastapi import APIRouter, HTTPException, Response
from app.schemas.training import ExportRequest, TrainingRequest, PredictionRequest
from app.services.training_runs import capabilities, create_run, get_run, cancel_run
from app.services.training_export import export_run, preview_export

router = APIRouter(prefix="/training", tags=["training"])

@router.post('/runs/{run_id}/predict')
def predict_model(run_id: str, body: PredictionRequest):
    from app.services.model_prediction import predict_saved
    from app.services.training_runs import run_directory
    try:
        return predict_saved(get_run(run_id),run_directory(run_id),body.result_id,body.rows)
    except (KeyError,FileNotFoundError) as error:
        raise HTTPException(status_code=404,detail='Model hoặc lượt chạy không còn tồn tại.') from error
    except ValueError as error:
        raise HTTPException(status_code=400,detail=str(error)) from error


@router.get("/capabilities")
def training_capabilities():
    return capabilities()


@router.post("/runs", status_code=202)
def start_training(request: TrainingRequest):
    try:
        return create_run(request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/runs/{run_id}")
def training_status(run_id: str):
    try:
        return get_run(run_id)
    except (KeyError, ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt huấn luyện. Backend có thể đã đổi nơi lưu dữ liệu.") from error


@router.post("/runs/{run_id}/cancel")
def stop_training(run_id: str):
    try:
        return cancel_run(run_id)
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt huấn luyện.") from error


@router.post("/runs/{run_id}/export")
def download_models(run_id: str, options: ExportRequest):
    try:
        content, file_name, media_type = export_run(run_id, options)
    except (KeyError, FileNotFoundError) as error:
        raise HTTPException(status_code=404, detail="Không tìm thấy model hoặc lượt huấn luyện.") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return Response(content, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{file_name}"'})

@router.post("/runs/{run_id}/export/preview")
def preview_models(run_id: str, options: ExportRequest):
    try:
        return preview_export(run_id, options)
    except (KeyError, FileNotFoundError) as error:
        raise HTTPException(status_code=404, detail="Không tìm thấy model hoặc lượt huấn luyện.") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
