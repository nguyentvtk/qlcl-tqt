"""
Google Drive upload service.
Uploads files to a shared Drive folder, makes them publicly readable,
and returns the shareable view/download links.

Quy ước cây thư mục lưu trữ (thư mục gốc = GOOGLE_DRIVE_FOLDER_ID):
  {NămThựcHiện}_{MãDA}_{TenDuAnVietLienKhongDau}/
    01_ChuanBiDauTu | 02_ThucHienDauTu | 03_NghiemThuHoanCong | 04_QuyetToan/
      {MãGT}_{TenGoiThau}/
        Lan 1, Lan 2, .../
          <file>
Thư mục đã tồn tại thì dùng lại, chưa có thì tạo mới (get-or-create).
"""
import io
import unicodedata
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2.service_account import Credentials

import config

# Cần scope "drive" đầy đủ để tìm/tạo thư mục con trong thư mục gốc
# do người dùng chia sẻ cho service account (drive.file chỉ thấy file app tự tạo).
_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

_FOLDER_MIME = "application/vnd.google-apps.folder"

# Cache folder path → id trong vòng đời instance (giảm gọi API)
_folder_cache: dict[str, str] = {}


def _service():
    creds = Credentials.from_service_account_file(config.GOOGLE_CREDENTIALS_FILE, scopes=_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def vn_ascii(s: str) -> str:
    """Bỏ dấu tiếng Việt và viết liền: 'Cải tạo đường' → 'CaiTaoDuong'."""
    s = str(s or "").strip()
    s = s.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Viết hoa chữ cái đầu mỗi từ rồi bỏ khoảng trắng & ký tự không an toàn
    words = [w for w in s.split() if w]
    out = "".join(w[:1].upper() + w[1:] for w in words)
    return "".join(c for c in out if c.isalnum() or c in "-_")


def _find_folder(name: str, parent_id: str) -> str | None:
    """Tìm thư mục con theo tên trong parent. Trả về folder id hoặc None."""
    safe_name = name.replace("'", "\\'")
    q = (
        f"name = '{safe_name}' and '{parent_id}' in parents "
        f"and mimeType = '{_FOLDER_MIME}' and trashed = false"
    )
    res = _service().files().list(
        q=q, fields="files(id,name)", pageSize=1,
        supportsAllDrives=True, includeItemsFromAllDrives=True,
    ).execute()
    files = res.get("files", [])
    return files[0]["id"] if files else None


def get_or_create_folder(name: str, parent_id: str) -> str:
    """Thư mục đã có thì dùng lại, chưa có thì tạo mới. Trả về folder id."""
    cache_key = f"{parent_id}/{name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    folder_id = _find_folder(name, parent_id)
    if not folder_id:
        created = _service().files().create(
            body={"name": name, "mimeType": _FOLDER_MIME, "parents": [parent_id]},
            fields="id", supportsAllDrives=True,
        ).execute()
        folder_id = created["id"]

    _folder_cache[cache_key] = folder_id
    return folder_id


def ensure_folder_path(names: list[str], root_id: str | None = None) -> str:
    """
    Đảm bảo chuỗi thư mục lồng nhau tồn tại (get-or-create từng cấp).
    Trả về id của thư mục sâu nhất.
    """
    parent = root_id or config.GOOGLE_DRIVE_FOLDER_ID
    if not parent:
        raise RuntimeError("Chưa cấu hình GOOGLE_DRIVE_FOLDER_ID")
    for name in names:
        if name:
            parent = get_or_create_folder(str(name).strip(), parent)
    return parent


def upload_file(file_bytes: bytes, filename: str, mime_type: str,
                folder_id: str | None = None) -> dict:
    """
    Upload file vào thư mục chỉ định (mặc định: thư mục gốc cấu hình).
    Returns dict: { id, webViewLink, webContentLink }
    """
    svc = _service()

    metadata = {"name": filename}
    parent = folder_id or config.GOOGLE_DRIVE_FOLDER_ID
    if parent:
        metadata["parents"] = [parent]

    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type, resumable=True)
    uploaded = svc.files().create(
        body=metadata,
        media_body=media,
        fields="id,webViewLink,webContentLink",
        supportsAllDrives=True,
    ).execute()

    # Public read-only so anyone with the link can view
    try:
        svc.permissions().create(
            fileId=uploaded["id"],
            body={"type": "anyone", "role": "reader"},
            supportsAllDrives=True,
        ).execute()
    except Exception:
        pass  # Không chặn upload nếu set permission lỗi (vd: policy tổ chức)

    return uploaded


def delete_file(file_id: str) -> None:
    """Delete a Drive file by ID (soft cleanup, does not raise on failure)."""
    try:
        _service().files().delete(fileId=file_id, supportsAllDrives=True).execute()
    except Exception:
        pass
