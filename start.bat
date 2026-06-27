@echo off
chcp 65001 > nul
echo ====================================================
echo  WA Quan ly Chat luong - Thanh Quyet toan
echo ====================================================
echo.

cd /d "%~dp0"

:: Kiểm tra Python
python --version > nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Python. Download tai python.org
    pause
    exit /b
)

:: Kiểm tra virtualenv
if not exist ".venv" (
    echo [INFO] Dang tao virtual environment...
    python -m venv .venv
)

:: Activate venv
call .venv\Scripts\activate.bat

:: Cài dependencies
echo [INFO] Dang cai thu vien...
pip install -r backend\requirements.txt -q

:: Kiểm tra credentials
if not exist "credentials\service_account.json" (
    echo.
    echo [CANH BAO] Chua co file credentials\service_account.json
    echo Xem huong dan tai: credentials\README.md
    echo.
    pause
)

:: Copy .env nếu chưa có
if not exist ".env" (
    copy .env.example .env > nul
    echo [INFO] Da tao file .env tu .env.example
    echo       Vui long kiem tra va chinh sua file .env
)

echo.
echo [INFO] Dang khoi dong server...
echo [INFO] Webapp: http://localhost:8000
echo [INFO] API docs: http://localhost:8000/docs
echo.

cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
