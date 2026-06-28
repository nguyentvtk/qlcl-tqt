"""
Google Sheets manager — đọc/ghi dữ liệu và migrate schema an toàn.
Quy tắc migration: CHỈ thêm cột mới vào CUỐI bảng, không bao giờ chen giữa.
"""
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime
from typing import Any, Optional
import uuid

from config import SPREADSHEET_ID, GOOGLE_CREDENTIALS_FILE
from schema_definitions import SHEET_SCHEMAS

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

_client: Optional[gspread.Client] = None
_spreadsheet: Optional[gspread.Spreadsheet] = None


def get_client() -> gspread.Client:
    global _client
    if _client is None:
        creds = Credentials.from_service_account_file(GOOGLE_CREDENTIALS_FILE, scopes=SCOPES)
        _client = gspread.authorize(creds)
    return _client


def get_spreadsheet() -> gspread.Spreadsheet:
    global _spreadsheet
    if _spreadsheet is None:
        _spreadsheet = get_client().open_by_key(SPREADSHEET_ID)
    return _spreadsheet


def get_or_create_sheet(sheet_name: str) -> gspread.Worksheet:
    ss = get_spreadsheet()
    try:
        return ss.worksheet(sheet_name)
    except gspread.WorksheetNotFound:
        try:
            return ss.add_worksheet(title=sheet_name, rows=1000, cols=50)
        except Exception:
            # Race condition: instance khác đã tạo sheet → thử lấy lại
            return ss.worksheet(sheet_name)


def migrate_schema(sheet_name: str) -> dict[str, int]:
    """
    Đảm bảo sheet có đủ các cột cần thiết.
    - Cột mới chỉ được APPEND vào cuối (không chen giữa)
    - Trả về map: tên_cột -> chỉ_số_cột (0-based)
    """
    expected_cols = SHEET_SCHEMAS.get(sheet_name, [])
    ws = get_or_create_sheet(sheet_name)

    # Đọc header hiện tại (row 1)
    existing_headers = ws.row_values(1) if ws.row_count > 0 else []
    existing_headers = [h.strip() for h in existing_headers]

    # Tìm cột mới cần thêm
    new_cols = [c for c in expected_cols if c not in existing_headers]

    if new_cols:
        start_col = len(existing_headers) + 1
        for i, col_name in enumerate(new_cols):
            col_letter = _col_letter(start_col + i)
            ws.update(f"{col_letter}1", [[col_name]])

    # Đọc lại headers sau khi cập nhật
    final_headers = ws.row_values(1)
    final_headers = [h.strip() for h in final_headers]

    return {h: i for i, h in enumerate(final_headers) if h}


def get_col_map(sheet_name: str) -> dict[str, int]:
    """Đọc map tên cột -> index (0-based) mà không migrate."""
    ws = get_or_create_sheet(sheet_name)
    headers = ws.row_values(1)
    return {h.strip(): i for i, h in enumerate(headers) if h.strip()}


def read_all(sheet_name: str) -> list[dict]:
    """Đọc tất cả records từ sheet, bỏ qua row header.
    Nếu sheet chưa có header (mới tạo, chưa migrate), tự động migrate và trả về [].
    """
    ws = get_or_create_sheet(sheet_name)
    try:
        records = ws.get_all_records(default_blank="")
        return records
    except Exception:
        # Sheet chưa có header row → migrate schema rồi trả về danh sách rỗng
        try:
            migrate_schema(sheet_name)
        except Exception:
            pass
        return []


def read_by_id(sheet_name: str, record_id: str) -> Optional[dict]:
    records = read_all(sheet_name)
    for r in records:
        if str(r.get("id", "")) == str(record_id):
            return r
    return None


def read_where(sheet_name: str, **filters) -> list[dict]:
    """Lọc records theo điều kiện key=value."""
    records = read_all(sheet_name)
    result = []
    for r in records:
        if all(str(r.get(k, "")) == str(v) for k, v in filters.items()):
            result.append(r)
    return result


def insert(sheet_name: str, data: dict) -> dict:
    """
    Thêm record mới vào sheet.
    - Tự tạo id (auto-increment từ số hàng hiện có)
    - Tự set created_at nếu chưa có
    """
    ws = get_or_create_sheet(sheet_name)
    col_map = get_col_map(sheet_name)

    if not col_map:
        col_map = migrate_schema(sheet_name)

    # Auto-assign id
    if "id" not in data or not data["id"]:
        all_records = ws.get_all_values()
        data["id"] = str(len(all_records))  # row count = next id

    # Auto-assign timestamps
    now = datetime.utcnow().isoformat()
    if "created_at" in col_map and "created_at" not in data:
        data["created_at"] = now
    if "updated_at" in col_map and "updated_at" not in data:
        data["updated_at"] = now

    # Build row theo thứ tự cột
    max_col = max(col_map.values()) + 1
    row = [""] * max_col
    for col_name, col_idx in col_map.items():
        row[col_idx] = str(data.get(col_name, ""))

    ws.append_row(row, value_input_option="USER_ENTERED")
    return data


def update(sheet_name: str, record_id: str, data: dict) -> Optional[dict]:
    """Cập nhật record theo id."""
    ws = get_or_create_sheet(sheet_name)
    col_map = get_col_map(sheet_name)
    all_values = ws.get_all_values()

    if not all_values:
        return None

    headers = [h.strip() for h in all_values[0]]
    id_col_idx = headers.index("id") if "id" in headers else None
    if id_col_idx is None:
        return None

    for row_idx, row in enumerate(all_values[1:], start=2):  # row_idx là 1-based trong Sheets API
        if len(row) > id_col_idx and str(row[id_col_idx]) == str(record_id):
            # Cập nhật từng ô
            if "updated_at" in col_map:
                data["updated_at"] = datetime.utcnow().isoformat()

            updates = []
            for col_name, value in data.items():
                if col_name in col_map:
                    col_idx = col_map[col_name]
                    col_letter = _col_letter(col_idx + 1)
                    updates.append({
                        "range": f"{col_letter}{row_idx}",
                        "values": [[str(value)]]
                    })

            if updates:
                ws.batch_update(updates)

            # Đọc lại record
            return read_by_id(sheet_name, record_id)

    return None


def delete(sheet_name: str, record_id: str) -> bool:
    """Xóa record theo id (xóa hàng)."""
    ws = get_or_create_sheet(sheet_name)
    all_values = ws.get_all_values()

    if not all_values:
        return False

    headers = [h.strip() for h in all_values[0]]
    id_col_idx = headers.index("id") if "id" in headers else None
    if id_col_idx is None:
        return False

    for row_idx, row in enumerate(all_values[1:], start=2):
        if len(row) > id_col_idx and str(row[id_col_idx]) == str(record_id):
            ws.delete_rows(row_idx)
            return True

    return False


def get_sheet_by_gid(gid: int) -> Optional[gspread.Worksheet]:
    """Tìm worksheet theo gid số (từ URL #gid=...)."""
    ss = get_spreadsheet()
    for ws in ss.worksheets():
        if ws.id == gid:
            return ws
    return None


def parse_vn_number(s) -> float:
    """Chuyển số định dạng VN ('234.824.000', '99,88%') sang float."""
    try:
        cleaned = str(s).strip().replace('.', '').replace(',', '.').rstrip('%').strip()
        return float(cleaned) if cleaned else 0.0
    except Exception:
        return 0.0


def read_sheet_by_name_raw(sheet_name: str) -> list[dict]:
    """Đọc sheet theo tên (có thể là tiếng Việt), trả về list of dicts với key là tên cột header.
    Trả về [] nếu sheet không tồn tại hoặc lỗi.
    """
    try:
        ws = get_spreadsheet().worksheet(sheet_name)
        return ws.get_all_records(default_blank="")
    except Exception:
        return []


def read_raw_values_by_gid(gid: int) -> list[list[str]]:
    """Đọc tất cả giá trị (list of lists, gồm cả header) từ sheet xác định bằng gid."""
    ws = get_sheet_by_gid(gid)
    if ws is None:
        return []
    return ws.get_all_values()


def ensure_all_schemas() -> dict[str, list[str]]:
    """
    Migrate tất cả schemas. Trả về dict sheet_name -> danh sách cột mới được thêm.
    Gọi lúc startup.
    """
    added = {}
    for sheet_name in SHEET_SCHEMAS:
        ws = get_or_create_sheet(sheet_name)
        existing = ws.row_values(1) if ws.row_count > 0 else []
        existing = [h.strip() for h in existing]
        expected = SHEET_SCHEMAS[sheet_name]
        new_cols = [c for c in expected if c not in existing]
        added[sheet_name] = new_cols

    # Thực sự migrate
    for sheet_name in SHEET_SCHEMAS:
        migrate_schema(sheet_name)

    return added


def _col_letter(col_num: int) -> str:
    """Chuyển số cột (1-based) sang chữ cái (A, B, ..., Z, AA, ...)."""
    result = ""
    while col_num > 0:
        col_num, remainder = divmod(col_num - 1, 26)
        result = chr(65 + remainder) + result
    return result
