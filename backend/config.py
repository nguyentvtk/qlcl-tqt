import os
import base64
import tempfile
from dotenv import load_dotenv

load_dotenv()

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "1LsaccoqTu3sRaElEWVdCZjXlzRL_2N2DPPP3UiInDEk")
GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials/service_account.json")

# Vercel/cloud: nếu không có file JSON thì đọc từ env var GOOGLE_CREDENTIALS_JSON (base64 hoặc raw JSON)
_creds_env = os.getenv("GOOGLE_CREDENTIALS_JSON", "")
if _creds_env and not os.path.isfile(GOOGLE_CREDENTIALS_FILE):
    try:
        try:
            creds_str = base64.b64decode(_creds_env).decode("utf-8")
        except Exception:
            creds_str = _creds_env
        _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        _tmp.write(creds_str)
        _tmp.close()
        GOOGLE_CREDENTIALS_FILE = _tmp.name
    except Exception:
        pass

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8000").split(",")

# SLA timings
INSPECTION_SLA_HOURS = 24          # Nghiệm thu: 24 giờ
TREASURY_SLA_WORKING_DAYS = 1      # KBNN xử lý: 1-2 ngày làm việc

# Settlement deadlines (months after completion)
SETTLEMENT_DEADLINE_MONTHS = {
    "group_A": 12,   # Dự án nhóm A
    "group_B": 9,    # Dự án nhóm B
    "group_C": 6,    # Dự án nhóm C
}

# Sheet Nhân sự — dùng gid để tìm chính xác tab, không phụ thuộc tên sheet
NHANSU_GID = int(os.getenv("NHANSU_GID", "1028022447"))

# Google Drive folder for uploaded dossier files (share this folder with the service account)
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")

# File upload limits
MAX_FILE_SIZE_MB = 50
ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".png"]
