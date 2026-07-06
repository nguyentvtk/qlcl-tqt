"""
Liên kết dữ liệu với CPM5.0 (https://cpmtanphu.vercel.app).
Hai app dùng chung spreadsheet nên WA đọc TRỰC TIẾP các tab do CPM5.0 quản lý
(Nhiệm vụ, Phụ lục HĐ, Gantt...) thay vì gọi API Apps Script (access=DOMAIN,
không gọi được từ server ngoài).
"""
from fastapi import APIRouter, Depends
from typing import Optional

from middleware.auth import get_current_user
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/cpm", tags=["Liên kết CPM5.0"])

CPM_WEB_URL = "https://cpmtanphu.vercel.app"


def _read_first_existing(*sheet_names: str) -> list[dict]:
    """Thử lần lượt các tên tab (tên có thể khác nhau giữa các phiên bản sheet)."""
    for name in sheet_names:
        rows = sm.read_sheet_by_name_raw(name)
        if rows:
            return rows
    return []


@router.get("/info")
async def cpm_info(_: dict = Depends(get_current_user)):
    """Thông tin liên kết CPM5.0 để frontend build deep-link."""
    return {
        "web_url": CPM_WEB_URL,
        "pages": {
            "projects": f"{CPM_WEB_URL}/?page=projects",
            "tasks": f"{CPM_WEB_URL}/?page=tasks",
            "contracts": f"{CPM_WEB_URL}/?page=contracts",
            "gantt": f"{CPM_WEB_URL}/?page=gantt",
            "contractors": f"{CPM_WEB_URL}/?page=contractors",
            "personnel": f"{CPM_WEB_URL}/?page=nhansu",
            "daily_reports": f"{CPM_WEB_URL}/?page=baocao",
            "settlements": f"{CPM_WEB_URL}/?page=quyettoan",
        },
    }


@router.get("/tasks")
async def cpm_tasks(
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    """Nhiệm vụ nội bộ từ CPM5.0 (tab 'Nhiệm vụ'), lọc theo Mã DA nếu có."""
    rows = _read_first_existing("Nhiệm vụ", "tasks", "Nhiem vu")
    result = []
    for r in rows:
        ma_da = str(r.get("Mã dự án", r.get("Mã DA", ""))).strip()
        ma_nv = str(r.get("Mã nhiệm vụ", r.get("Mã CV", ""))).strip()
        if not ma_nv:
            continue
        if project_id and ma_da != str(project_id).strip():
            continue
        result.append({
            "id": ma_nv,
            "project_id": ma_da,
            "project_name": str(r.get("Tên dự án", "")).strip(),
            "group": str(r.get("Nhóm nhiệm vụ", "")).strip(),
            "name": str(r.get("Tên nhiệm vụ", r.get("Nội dung", ""))).strip(),
            "assignee": str(r.get("Người thực hiện", "")).strip(),
            "status": str(r.get("Trạng thái", "")).strip(),
            "priority": str(r.get("Ưu tiên", "")).strip(),
            "progress": sm.parse_vn_number(r.get("Tiến độ (%)", 0)),
            "done_date": str(r.get("Ngày xong", "")).strip(),
        })
    return result


@router.get("/appendices")
async def cpm_contract_appendices(
    contract_id: Optional[str] = None,
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    """Phụ lục hợp đồng từ CPM5.0 (tab 'Phụ lục HĐ'), lọc theo Mã HĐ / Mã DA."""
    rows = _read_first_existing("Phụ lục HĐ", "Phụ lục Hợp đồng", "appendix", "PLHD")
    result = []
    for r in rows:
        ma_pl = str(r.get("Mã PLHĐ", r.get("Mã PL", ""))).strip()
        ma_hd = str(r.get("Mã HĐ", "")).strip()
        ma_da = str(r.get("Mã DA", "")).strip()
        if not ma_pl and not ma_hd:
            continue
        if contract_id and ma_hd != str(contract_id).strip():
            continue
        if project_id and ma_da != str(project_id).strip():
            continue
        result.append({
            "id": ma_pl,
            "contract_id": ma_hd,
            "project_id": ma_da,
            "content": str(r.get("Nội dung PLHĐ", "")).strip(),
            "sign_date": str(r.get("Ngày ký PLHĐ", "")).strip(),
            "value": sm.parse_vn_number(r.get("Giá trị PLHĐ", 0)),
            "extension_days": str(r.get("Gia hạn thời gian", "")).strip(),
            "file_url": str(r.get("File PLHĐ", "")).strip(),
        })
    return result
