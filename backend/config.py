import os
import base64
import tempfile
from dotenv import load_dotenv

load_dotenv()

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "1LsaccoqTu3sRaElEWVdCZjXlzRL_2N2DPPP3UiInDEk")
GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "credentials/service_account.json")

# Vercel/cloud: nếu không có file JSON thì đọc từ env var GOOGLE_CREDENTIALS_JSON (base64 hoặc raw JSON)
_creds_env = os.getenv("GOOGLE_CREDENTIALS_JSON", "").strip()
if _creds_env and not os.path.isfile(GOOGLE_CREDENTIALS_FILE):
    import json as _json
    try:
        # Thử base64 decode trước
        try:
            _decoded = base64.b64decode(_creds_env).decode("utf-8")
        except Exception:
            _decoded = _creds_env
        # Chỉ ghi file nếu decode ra JSON hợp lệ
        _json.loads(_decoded)   # ← validate trước khi ghi
        _tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        _tmp.write(_decoded)
        _tmp.close()
        GOOGLE_CREDENTIALS_FILE = _tmp.name
    except Exception:
        pass  # JSON không hợp lệ → giữ nguyên GOOGLE_CREDENTIALS_FILE

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))  # mặc định 72h, override qua env

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

# Vercel: tắt startup migration để tránh vượt quota Sheets API (set true sau khi đã setup xong)
SKIP_MIGRATION = os.getenv("SKIP_MIGRATION", "false").lower() in ("true", "1", "yes")

# Sheet Nhân sự — dùng gid để tìm chính xác tab, không phụ thuộc tên sheet
NHANSU_GID = int(os.getenv("NHANSU_GID", "1028022447"))

# Google Drive folder for uploaded dossier files (share this folder with the service account)
GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")

# File upload limits
MAX_FILE_SIZE_MB = 50
ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".png"]
