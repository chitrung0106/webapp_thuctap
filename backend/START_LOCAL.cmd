@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  py -3.12 -m venv .venv
  if errorlevel 1 goto failed
)
set "REQUIREMENTS=requirements.txt"
if /I "%~1"=="--all-models" set "REQUIREMENTS=requirements-optional.txt"
.venv\Scripts\python.exe -m pip install -r "%REQUIREMENTS%"
if errorlevel 1 goto failed
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
goto end
:failed
echo Setup failed. Check Python 3.12 and the error above.
pause
:end
endlocal