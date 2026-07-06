"""
Biên bản hiện trường — lập trên điện thoại/máy tính bảng khi kiểm tra hiện trường.
- Frontend render biên bản (kèm ảnh + chữ ký cảm ứng) thành PDF và gửi lên
- Backend lưu PDF (+ video) vào Drive: {Năm_MãDA_TênDA}/BienBan/
- Metadata ghi vào sheet "field_reports"
Áp dụng cho MỌI giai đoạn dự án (NĐ 207/2026/NĐ-CP về quản lý chất lượng thi công).
"""
from datetime import datetime
from typing import Optional
import mimetypes

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form

from middleware.auth import get_current_user
from services import drive_service
from routers.dossiers import _project_folder_name
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/field-reports", tags=["Biên bản hiện trường"])

MAX_FILE_MB = 50


def _bienban_folder(project_id: str) -> str | None:
    """Get-or-create thư mục BienBan trong thư mục dự án trên Drive."""
    try:
        ma_da = str(project_id).strip()
        if "_" in ma_da:  # nếu truyền composite MãDA_MãGT thì lấy phần Mã DA
            ma_da = ma_da.split("_", 1)[0]
        return drive_service.ensure_folder_path([
            _project_folder_name(ma_da),
            "BienBan",
        ])
    except Exception as e:
        print(f"⚠️ [Drive] Không tạo được thư mục BienBan cho '{project_id}': {e}")
        return None


@router.get("")
async def list_field_reports(
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    records = (sm.read_where("field_reports", project_id=project_id)
               if project_id else sm.read_all("field_reports"))
    # Mới nhất lên đầu
    return sorted(records, key=lambda r: str(r.get("created_at", "")), reverse=True)


@router.post("", status_code=201)
async def create_field_report(
    project_id: str = Form(...),
    construction_id: str = Form(""),
    phase: str = Form("02_ThucHienDauTu"),
    report_date: str = Form(...),
    location: str = Form(""),
    content: str = Form(...),
    conclusion: str = Form(""),
    participants: str = Form("[]"),   # JSON: [{name, role}] (chữ ký đã nhúng trong PDF)
    pdf: UploadFile = File(...),
    videos: list[UploadFile] = File([]),
    user: dict = Depends(get_current_user)
):
    """Nhận PDF biên bản (đã render kèm ảnh + chữ ký) + video hiện trường → lưu Drive."""
    pdf_bytes = await pdf.read()
    if not pdf_bytes:
        raise HTTPException(400, "File PDF biên bản rỗng")
    if len(pdf_bytes) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"PDF vượt quá {MAX_FILE_MB}MB")

    folder_id = _bienban_folder(project_id)

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    pdf_name = f"BienBan_{project_id}_{timestamp}.pdf"
    try:
        uploaded = drive_service.upload_file(pdf_bytes, pdf_name, "application/pdf", folder_id=folder_id)
    except Exception as e:
        raise HTTPException(503, f"Không upload được biên bản lên Google Drive: {e}")
    pdf_url = uploaded.get("webViewLink", "")

    # Upload video hiện trường (nếu có) vào cùng thư mục
    video_urls = []
    for v in videos or []:
        try:
            v_bytes = await v.read()
            if not v_bytes:
                continue
            if len(v_bytes) > MAX_FILE_MB * 1024 * 1024:
                continue  # bỏ qua video quá lớn, không chặn cả biên bản
            mime = mimetypes.guess_type(v.filename or "")[0] or "video/mp4"
            v_name = f"BienBan_{project_id}_{timestamp}_{v.filename or 'video.mp4'}"
            v_up = drive_service.upload_file(v_bytes, v_name, mime, folder_id=folder_id)
            if v_up.get("webViewLink"):
                video_urls.append(v_up["webViewLink"])
        except Exception as e:
            print(f"⚠️ [Drive] Lỗi upload video biên bản: {e}")

    record = sm.insert("field_reports", {
        "project_id": project_id,
        "construction_id": construction_id or "",
        "phase": phase,
        "report_date": report_date,
        "location": location or "",
        "content": content,
        "conclusion": conclusion or "",
        "participants": participants,
        "pdf_url": pdf_url,
        "video_urls": ",".join(video_urls),
        "created_by": user.get("full_name") or user.get("sub", ""),
        "created_at": datetime.utcnow().isoformat(),
    })
    return record
