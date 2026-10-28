from fastapi import APIRouter, File, HTTPException, UploadFile

from app.schemas.compare import CompareResponse
from app.services.file_compare import compare_text

router = APIRouter()
MAX_FILE_SIZE = 10 * 1024 * 1024


async def _read_text_file(upload: UploadFile) -> str:
    content = await upload.read(MAX_FILE_SIZE + 1)
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Mỗi file tối đa 10 MB.")

    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(
            status_code=400,
            detail=f"File {upload.filename or 'đã tải lên'} phải dùng mã hóa UTF-8.",
        ) from error


@router.post("/compare", response_model=CompareResponse)
async def compare_files(
    input_file: UploadFile = File(...),
    output_file: UploadFile = File(...),
) -> CompareResponse:
    input_text = await _read_text_file(input_file)
    output_text = await _read_text_file(output_file)
    result = compare_text(input_text, output_text)

    return CompareResponse(
        input_filename=input_file.filename or "input.txt",
        output_filename=output_file.filename or "output.txt",
        **result,
    )