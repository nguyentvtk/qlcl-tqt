"""
Module Quản lý hồ sơ xây dựng + Nghiệm thu
- 6 bước quy trình nghiệm thu
- SLA 24 giờ cho bước kiểm tra thực địa
- State machine: PENDING → APPROVED / REJECTED
- Chỉ Admin (PROJECT_MANAGEMENT) được upload file lên Google Drive
"""
from datetime import datetime, timedelta
import mimetypes

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import RedirectResponse
from typing import Optional

from models import Dossier, DossierCreate, DossierAction, Signature, SignatureCreate
from middleware.auth import get_current_user
from services import drive_service
from config import PROJECT_PHASES
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/dossiers", tags=["Hồ sơ & Nghiệm thu"])

_ADMIN_ROLE = "PROJECT_MANAGEMENT"


# ─── Helpers: Cây thư mục Drive theo quy ước ──────────────────────
def _project_folder_name(ma_da: str) -> str:
    """Tên thư mục dự án: 'NămThựcHiện_MãDA_TenDuAnVietLienKhongDau'."""
    nam, ten_da = "", ""
    for r in sm.read_sheet_by_name_raw("Dự án"):
        if str(r.get("Mã DA", "")).strip() == ma_da:
            nam = str(r.get("Năm thực hiện", "")).strip()
            ten_da = str(r.get("Tên dự án", "")).strip()
            break
    if not ten_da:  # Dự án tạo trong app
        for r in sm.read_all("projects"):
            if str(r.get("project_code", "")).strip() == ma_da or str(r.get("id", "")) == ma_da:
                ten_da = str(r.get("name", "")).strip()
                nam = str(r.get("start_date", ""))[:4]
                break
    nam = nam or str(datetime.utcnow().year)
    parts = [nam, ma_da]
    if ten_da:
        parts.append(drive_service.vn_ascii(ten_da))
    return "_".join(parts)


def _bid_package_folder_name(ma_da: str, ma_gt: str) -> str:
    """Tên thư mục gói thầu: 'MãGT_TenGoiThauVietLien' (fallback: Mã GT)."""
    ten_gt = ""
    for r in sm.read_sheet_by_name_raw("Gói thầu"):
        if (str(r.get("Mã DA", "")).strip() == ma_da
                and str(r.get("Mã GT", "")).strip() == ma_gt):
            ten_gt = str(r.get("Tên gói thầu", "")).strip()
            break
    return f"{ma_gt}_{drive_service.vn_ascii(ten_gt)}" if ten_gt else (ma_gt or "GoiThauKhac")


def _resolve_drive_folder(construction_id: str, phase: str, submission_round: str) -> str | None:
    """
    Get-or-create cây thư mục:
      {Năm_MãDA_TenDA}/{phase}/{MãGT_TenGT}/Lan {n}
    Trả về folder id sâu nhất, hoặc None nếu lỗi (fallback thư mục gốc).
    """
    try:
        if "_" in construction_id:  # composite "MãDA_MãGT" từ sheet gốc
            ma_da, ma_gt = construction_id.split("_", 1)
        else:  # gói thầu tạo trong app
            ma_da, ma_gt = "", construction_id
            r = sm.read_by_id("constructions", construction_id)
            if r:
                ma_gt = str(r.get("construction_code") or construction_id)
                pid = str(r.get("project_id", ""))
                p = sm.read_by_id("projects", pid)
                ma_da = str((p or {}).get("project_code") or pid)

        phase = phase if phase in PROJECT_PHASES else PROJECT_PHASES[1]
        try:
            lan = max(1, int(float(str(submission_round).strip() or 1)))
        except (ValueError, TypeError):
            lan = 1

        return drive_service.ensure_folder_path([
            _project_folder_name(ma_da),
            phase,
            _bid_package_folder_name(ma_da, ma_gt),
            f"Lan {lan}",
        ])
    except Exception:
        return None  # fallback: upload vào thư mục gốc


# ─── Dossier Templates (master data) ────────────────────────────
@router.get("/templates")
async def list_templates(_: dict = Depends(get_current_user)):
    templates = sm.read_all("dossier_templates")
    groups = {g["id"]: g for g in sm.read_all("dossier_groups")}
    for t in templates:
        t["group"] = groups.get(t.get("group_id"), {})
    return templates


@router.get("/groups")
async def list_groups(_: dict = Depends(get_current_user)):
    return sm.read_all("dossier_groups")


# ─── Helpers: Nghiệm thu ─────────────────────────────────────────
def _build_hop_dong_lookup() -> dict:
    """Tạo lookup {Mã HĐ → {ma_gt, ten_hd, ma_da}} từ sheet 'Hợp đồng'."""
    lookup = {}
    for r in sm.read_sheet_by_name_raw("Hợp đồng"):
        ma_hd = str(r.get("Mã HĐ", "")).strip()
        if ma_hd:
            lookup[ma_hd] = {
                "ma_gt":  str(r.get("Mã GT", "")).strip(),
                "ten_hd": str(r.get("Tên HĐ", "")).strip(),
                "ma_da":  str(r.get("Mã DA", "")).strip(),
            }
    return lookup


def _build_goi_thau_lookup() -> dict:
    """Tạo lookup {f"{ma_da}_{ma_gt}" → ten_gt} từ sheet 'Gói thầu'."""
    lookup = {}
    for r in sm.read_sheet_by_name_raw("Gói thầu"):
        ma_da = str(r.get("Mã DA", "")).strip()
        ma_gt = str(r.get("Mã GT", "")).strip()
        ten_gt = str(r.get("Tên gói thầu", "")).strip()
        if ma_da and ma_gt:
            lookup[f"{ma_da}_{ma_gt}"] = ten_gt
    return lookup


def _map_nghiem_thu_row(r: dict, hop_dong_lookup: dict, goi_thau_lookup: dict) -> Dossier | None:
    """Chuyển hàng sheet 'Nghiệm thu' sang Dossier model."""
    ma_hsnt = str(r.get("Mã HSNT", "")).strip()
    ma_hd   = str(r.get("Mã HĐ", "")).strip()
    ma_da   = str(r.get("Mã DA", "")).strip()
    ten_da  = str(r.get("Tên DA", "")).strip()
    if not ma_hsnt:
        return None

    # Join với bảng Hợp đồng để lấy Mã GT
    hd_info = hop_dong_lookup.get(ma_hd, {})
    ma_gt   = hd_info.get("ma_gt", "")

    # Join với bảng Gói thầu để lấy Tên gói thầu
    ten_gt = goi_thau_lookup.get(f"{ma_da}_{ma_gt}", "")

    status_map = {
        "Đã thanh toán": "APPROVED",
        "Chờ nghiệm thu": "PENDING",
        "Đang xử lý": "PENDING",
    }
    raw_status = str(r.get("Trạng thái HSNT", "")).strip()
    return Dossier(
        id=ma_hsnt,
        document_number=ma_hsnt,
        document_name=ten_da,          # Tên DA → hiển thị dòng 1
        project_code=ma_da,
        contract_id=ma_hd,
        bid_package_code=ma_gt,        # Mã GT từ bảng Hợp đồng
        construction_id=ma_da,
        template_id="NT",
        acceptance_round=str(r.get("Lần NT", "")),
        request_date=str(r.get("Ngày đề nghị", "")),
        sign_date=str(r.get("Ngày NT", "")),
        payment_amount=str(r.get("Giá trị NT", "")),
        payment_pct=str(r.get("% Giá trị NT", "")),
        project_name=ten_gt,           # Tên gói thầu → hiển thị dòng 2
        contractor_name=str(r.get("Nhà thầu", "")),
        file_path="",
        format_type="SCAN_PDF",
        status=status_map.get(raw_status, raw_status or "PENDING"),
    )


# ─── Sanitize helper ───────────────────────────────────────────────
def _sanitize_dossier(r: dict) -> dict:
    """
    Chuẩn hoá record từ Google Sheets trước khi parse Pydantic v2:
    ô số (id, template_id, construction_id...) trả về dạng int → phải ép str,
    nếu không Pydantic v2 raise ValidationError và record bị bỏ qua lặng lẽ.
    """
    out = dict(r)
    for field, v in out.items():
        if v is None:
            continue
        if not isinstance(v, str):
            out[field] = str(v)
        elif v == "None":
            out[field] = ""
    if not str(out.get("status", "")).strip():
        out["status"] = "PENDING"
    return out


# ─── Construction Dossiers ────────────────────────────────────────
@router.get("", response_model=list[Dossier])
async def list_dossiers(
    construction_id: Optional[str] = None,
    project_code: Optional[str] = None,
    status: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    # Build lookup một lần duy nhất
    hop_dong_lookup = _build_hop_dong_lookup()
    goi_thau_lookup = _build_goi_thau_lookup()

    # 1. Sheet "Nghiệm thu"
    # Lọc theo construction_id (dạng composite "MãDA_MãGT"):
    # join Mã HĐ → sheet Hợp đồng để lấy Mã GT của từng hàng nghiệm thu.
    result: list[Dossier] = []
    seen_ids: set[str] = set()
    for row in sm.read_sheet_by_name_raw("Nghiệm thu"):
        ma_da = str(row.get("Mã DA", "")).strip()
        if construction_id:
            ma_hd = str(row.get("Mã HĐ", "")).strip()
            ma_gt = hop_dong_lookup.get(ma_hd, {}).get("ma_gt", "")
            if f"{ma_da}_{ma_gt}" != construction_id:
                continue
        if project_code and ma_da != project_code:
            continue
        d = _map_nghiem_thu_row(row, hop_dong_lookup, goi_thau_lookup)
        if d:
            if status and d.status != status:
                continue
            if d.id not in seen_ids:
                result.append(d)
                seen_ids.add(d.id)

    # 2. App-created dossiers
    filters = {}
    if construction_id:
        filters["construction_id"] = construction_id
    if status:
        filters["status"] = status
    for r in (sm.read_where("construction_dossiers", **filters) if filters else sm.read_all("construction_dossiers")):
        try:
            d = Dossier(**_sanitize_dossier(r))
            if d.id not in seen_ids:
                result.append(d)
                seen_ids.add(d.id)
        except Exception:
            pass

    return result


@router.get("/{dossier_id}", response_model=Dossier)
async def get_dossier(dossier_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("construction_dossiers", dossier_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    return Dossier(**_sanitize_dossier(r))


@router.post("", response_model=Dossier, status_code=201)
async def upload_dossier(
    construction_id: str = Form(...),
    template_id: str = Form(...),
    document_name: str = Form(...),
    document_number: Optional[str] = Form(None),
    sign_date: Optional[str] = Form(None),
    format_type: str = Form(...),
    phase: str = Form("02_ThucHienDauTu"),
    submission_round: str = Form("1"),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    # Chỉ Admin (Chủ đầu tư) được phép upload hồ sơ
    if user.get("role") != _ADMIN_ROLE:
        raise HTTPException(403, "Chỉ Ban QLDA (Admin) được phép nộp hồ sơ lên hệ thống")

    content = await file.read()

    # Xác định thư mục đích theo quy ước:
    # {Năm_MãDA_TenDA}/{giai đoạn}/{MãGT_TenGT}/Lan {n} (get-or-create)
    folder_id = _resolve_drive_folder(construction_id, phase, submission_round)

    # Upload lên Google Drive
    mime_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    drive_filename = (f"{timestamp}_{file.filename}" if folder_id
                      else f"{construction_id}_{template_id}_{timestamp}_{file.filename}")

    uploaded = drive_service.upload_file(content, drive_filename, mime_type, folder_id=folder_id)
    drive_url = uploaded.get("webViewLink", "")

    data = {
        "construction_id": construction_id,
        "template_id": template_id,
        "document_name": document_name,
        "document_number": document_number or "",
        "sign_date": sign_date or "",
        "file_path": drive_url,          # Lưu Google Drive URL vào cột file_path
        "format_type": format_type,
        "phase": phase,
        "submission_round": str(submission_round),
        "status": "PENDING",
        "uploaded_by": user.get("sub", ""),
        "uploaded_at": datetime.utcnow().isoformat(),
    }

    record = sm.insert("construction_dossiers", data)
    record = _sanitize_dossier(record)

    # Ghi log SLA cho hồ sơ nghiệm thu
    sla_data = {
        "dossier_id": record["id"],
        "requested_by": user.get("sub", ""),
        "requested_at": datetime.utcnow().isoformat(),
        "deadline_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
        "completed_at": "",
        "is_overdue": "FALSE",
    }
    sm.insert("inspection_sla_logs", sla_data)

    return Dossier(**record)


@router.post("/{dossier_id}/action", response_model=Dossier)
async def dossier_action(
    dossier_id: str,
    body: DossierAction,
    user: dict = Depends(get_current_user)
):
    dossier = sm.read_by_id("construction_dossiers", dossier_id)
    if not dossier:
        raise HTTPException(404, "Không tìm thấy hồ sơ")

    if dossier["status"] == "APPROVED":
        raise HTTPException(400, "Hồ sơ đã được duyệt, không thể thay đổi")

    new_status = "APPROVED" if body.action == "APPROVE" else "REJECTED"

    sm.update("construction_dossiers", dossier_id, {
        "status": new_status,
        "updated_at": datetime.utcnow().isoformat()
    })

    # Ghi approval log
    sm.insert("dossier_approval_logs", {
        "dossier_id": dossier_id,
        "actor_id": user.get("sub", ""),
        "action": body.action,
        "comment": body.comment or "",
        "action_at": datetime.utcnow().isoformat(),
    })

    # Cập nhật SLA log
    sla_logs = sm.read_where("inspection_sla_logs", dossier_id=dossier_id)
    if sla_logs:
        sla = sla_logs[-1]
        completed_at = datetime.utcnow()
        deadline = datetime.fromisoformat(sla["deadline_at"]) if sla.get("deadline_at") else completed_at
        is_overdue = "TRUE" if completed_at > deadline else "FALSE"
        sm.update("inspection_sla_logs", sla["id"], {
            "completed_at": completed_at.isoformat(),
            "is_overdue": is_overdue,
        })

    updated = sm.read_by_id("construction_dossiers", dossier_id)
    return Dossier(**_sanitize_dossier(updated))


@router.get("/{dossier_id}/history")
async def dossier_history(dossier_id: str, _: dict = Depends(get_current_user)):
    logs = sm.read_where("dossier_approval_logs", dossier_id=dossier_id)
    sla_logs = sm.read_where("inspection_sla_logs", dossier_id=dossier_id)
    return {"approval_logs": logs, "sla_logs": sla_logs}


@router.get("/{dossier_id}/file")
async def open_dossier_file(dossier_id: str, _: dict = Depends(get_current_user)):
    """Redirect đến Google Drive link của hồ sơ."""
    dossier = sm.read_by_id("construction_dossiers", dossier_id)
    if not dossier:
        raise HTTPException(404, "Không tìm thấy hồ sơ")
    drive_url = dossier.get("file_path", "")
    if not drive_url:
        raise HTTPException(404, "Hồ sơ chưa có file đính kèm")
    return RedirectResponse(url=drive_url)


# ─── Digital Signatures ────────────────────────────────────────────
@router.post("/{dossier_id}/signatures", response_model=Signature, status_code=201)
async def add_signature(
    dossier_id: str,
    body: SignatureCreate,
    user: dict = Depends(get_current_user)
):
    dossier = sm.read_by_id("construction_dossiers", dossier_id)
    if not dossier:
        raise HTTPException(404, "Không tìm thấy hồ sơ")

    data = {
        "dossier_id": dossier_id,
        "signer_id": user.get("sub", ""),
        "signer_role": body.signer_role,
        "signature_hash": body.signature_hash,
        "signing_time": datetime.utcnow().isoformat(),
        "is_valid_signature": "TRUE",
    }
    record = sm.insert("document_signatures", data)
    return Signature(**{k: v for k, v in record.items() if v != ""})


@router.get("/{dossier_id}/signatures")
async def list_signatures(dossier_id: str, _: dict = Depends(get_current_user)):
    return sm.read_where("document_signatures", dossier_id=dossier_id)
