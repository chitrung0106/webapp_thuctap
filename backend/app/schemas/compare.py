from pydantic import BaseModel


class MissingLine(BaseModel):
    line: str
    count: int


class CompareResponse(BaseModel):
    input_filename: str
    output_filename: str
    input_count: int
    output_count: int
    missing_count: int
    missing_lines: list[MissingLine]