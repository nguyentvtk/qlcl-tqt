"""
Module Quyết toán dự án
Business rules (Nghị định 193/2026/NĐ-CP):
- 3 lần cảnh báo nhà thầu (Mẫu 02-QTDA) trước khi lập quyết toán độc lập
- Deadline quyết toán: 6/9/12 tháng sau khi hoàn thành (nhóm C/B/A)
- Phạt chậm nộp: 0.05%/ngày trên giá trị quyết toán

LƯU Ý ROUTE ORDERING:
  /warnings/*  phải khai báo TRƯỚC /{settlement_id} để tránh FastAPI match nhầm.
"""
from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from models import (
    Settlement, SettlementCreate,
    Warning, WarningCreate,
)
from middleware.auth import get_current_user
from config import SETTLEMENT_DEADLINE_MONTHS
import sheets_manager as sm

router = APIRouter(prefix="/api/v1/settlements", tags=["Quyết toán"])


# ─── Helpers: Quyết toán DAHT ──────────────────────────────────────
def _map_quyet_toan_row(r: dict) -> Settlement | None:
    ma_qt = str(r.get("Mã QT", "")).strip()
    ma_da = str(r.get("Mã DA", "")).strip()
    if not ma_qt and not ma_da:
        return None

    # Giá trị kiểm toán và phê duyệt (nếu có)
    audited = sm.parse_vn_number(r.get("Giá trị kiểm toán", 0))
    approved = sm.parse_vn_number(r.get("Giá trị phê duyệt", 0))

    return Settlement(
        id=ma_qt or ma_da,
        project_id=ma_da,
        project_name=str(r.get("Tên DA", "")).strip(),
        settlement_number=ma_qt,
        contract_group=str(r.get("Nhóm DA", "")).strip() or None,
        proposed_settlement_amount=sm.parse_vn_number(r.get("Giá trị đề nghị quyết toán", 0)),
        audited_amount=audited if audited else None,
        approved_amount=approved if approved else None,
        approver_org_id=str(r.get("Chủ đầu tư", "")).strip() or None,
        verifier_org_id=(
            str(r.get("Cơ quan thẩm tra (Kính gửi)", "")).strip()
            or str(r.get("Cơ quan thẩm tra", "")).strip()
            or None
        ),
        submission_deadline=str(r.get("Ngày lập", "")).strip() or None,
        status=str(r.get("Trạng thái", "")).strip() or "PREPARING",
        approved_decision_number=str(r.get("Số tờ trình", "")).strip() or None,
    )


# ─── Contractor Settlement Warnings ────────────────────────────────
# !! PHẢI khai báo TRƯỚC /{settlement_id} để tránh route conflict !!

@router.get("/warnings", response_model=list[Warning])
async def list_warnings(
    contract_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    if contract_id:
        records = sm.read_where("contractor_settlement_warnings", contract_id=contract_id)
    else:
        records = sm.read_all("contractor_settlement_warnings")
    result = []
    for r in records:
        try:
            result.append(Warning(**_sanitize_warning(r)))
        except Exception:
            pass
    return result


@router.post("/warnings", response_model=Warning, status_code=201)
async def create_warning(body: WarningCreate, _: dict = Depends(get_current_user)):
    """
    Gửi cảnh báo nhà thầu (tối đa 3 lần).
    Sau 3 lần mà không có phản hồi → lập quyết toán độc lập.
    """
    existing = sm.read_where("contractor_settlement_warnings", contract_id=body.contract_id)
    current_warnings = [w for w in existing if w.get("warning_number") == str(body.warning_number)]
    if current_warnings:
        raise HTTPException(400, f"Cảnh báo lần {body.warning_number} đã được gửi")

    if len(existing) >= 3:
        raise HTTPException(400, "Đã gửi đủ 3 cảnh báo. Có thể lập quyết toán độc lập.")

    data = body.model_dump()
    data["contractor_response_status"] = "NO_RESPONSE"
    data["is_delivered"] = "FALSE"
    record = sm.insert("contractor_settlement_warnings", data)
    return Warning(**_sanitize_warning(record))


@router.get("/warnings/overdue")
async def overdue_warnings(_: dict = Depends(get_current_user)):
    """Danh sách cảnh báo đã quá hạn phản hồi nhưng không có phản hồi."""
    all_warnings = sm.read_all("contractor_settlement_warnings")
    today = date.today()
    overdue = []
    for w in all_warnings:
        if (w.get("contractor_response_status") == "NO_RESPONSE"
                and w.get("response_deadline")):
            try:
                deadline = date.fromisoformat(w["response_deadline"])
                if today > deadline:
                    w["overdue_days"] = (today - deadline).days
                    overdue.append(w)
            except ValueError:
                pass
    return overdue


@router.put("/warnings/{warning_id}/delivered")
async def mark_warning_delivered(warning_id: str, _: dict = Depends(get_current_user)):
    updated = sm.update("contractor_settlement_warnings", warning_id, {
        "is_delivered": "TRUE"
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


@router.put("/warnings/{warning_id}/response")
async def update_warning_response(
    warning_id: str,
    response_status: str,
    _: dict = Depends(get_current_user)
):
    valid_statuses = ["NO_RESPONSE", "PARTIAL_RESPONSE", "FULL_RESPONSE"]
    if response_status not in valid_statuses:
        raise HTTPException(400, f"Trạng thái phải là: {', '.join(valid_statuses)}")

    updated = sm.update("contractor_settlement_warnings", warning_id, {
        "contractor_response_status": response_status
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy cảnh báo")
    return updated


# ─── Mẫu biểu quyết toán theo Thông tư 73/2026/TT-BTC ──────────────
# (hướng dẫn Nghị định 193/2026/NĐ-CP, hiệu lực từ 01/7/2026)
SETTLEMENT_FORM_TEMPLATES = [
    {"code": "01/QTDA", "name": "Báo cáo tổng hợp quyết toán vốn đầu tư dự án", "required_for_completed": True},
    {"code": "02/QTDA", "name": "Danh mục văn bản (văn bản pháp lý, hợp đồng)", "required_for_completed": True},
    {"code": "03/QTDA", "name": "Bảng đối chiếu số liệu cấp vốn, cho vay, thanh toán", "required_for_completed": True},
    {"code": "04/QTDA", "name": "Chi tiết chi phí đầu tư đề nghị quyết toán", "required_for_completed": True},
    {"code": "05/QTDA", "name": "Chi tiết giá trị tài sản hình thành qua đầu tư", "required_for_completed": True},
    {"code": "06/QTDA", "name": "Chi tiết giá trị vật tư, vật liệu, thiết bị tồn đọng", "required_for_completed": True},
    {"code": "07/QTDA", "name": "Tình hình công nợ của dự án", "required_for_completed": True},
    {"code": "08/QTDA", "name": "Báo cáo QT dùng cho dự án quy hoạch/chuẩn bị đầu tư/dừng thực hiện chưa có khối lượng", "required_for_completed": False},
    {"code": "09/QTDA", "name": "Báo cáo kết quả phê duyệt tổng quyết toán dự án quan trọng quốc gia", "required_for_completed": False},
    {"code": "10/QTDA", "name": "Quyết định phê duyệt quyết toán vốn đầu tư", "required_for_completed": False},
    {"code": "11/QTDA", "name": "Báo cáo tình hình quyết toán dự án sử dụng vốn đầu tư công trong năm", "required_for_completed": False},
    {"code": "12/QTDA", "name": "Phiếu giao nhận hồ sơ quyết toán vốn đầu tư dự án", "required_for_completed": True},
]


# ─── Tổng hợp dữ liệu dự án phục vụ lập & xem biểu mẫu quyết toán ──
def _build_project_summary(project_code: str) -> dict:
    """
    Gom dữ liệu từ các sheet gốc theo Mã DA:
    - "Dự án": thông tin chung, tổng mức đầu tư, số giải ngân
    - "Hợp đồng": danh mục HĐ (Mẫu 02), giá QT/lũy kế thanh toán, công nợ (Mẫu 07)
    - "Gói thầu": số lượng gói thầu
    - "Nghiệm thu": giá trị nghiệm thu (Mẫu 04)
    Số tiền đề xuất: Giá QT HĐ → thiếu thì Lũy kế TT → fallback tổng NT / Số giải ngân.
    """
    pc = str(project_code).strip()

    # 1. Dự án
    project = {}
    for r in sm.read_sheet_by_name_raw("Dự án"):
        if str(r.get("Mã DA", "")).strip() == pc:
            project = {
                "project_code": pc,
                "name": str(r.get("Tên dự án", "")).strip(),
                "project_type": str(r.get("Loại Dự án", "")).strip(),
                "status": str(r.get("Trạng thái dự án", "")).strip(),
                "total_investment": sm.parse_vn_number(r.get("Tổng mức đầu tư (đ)", 0)),
                "disbursed_amount": sm.parse_vn_number(r.get("Số giải ngân", 0)),
                "start_date": str(r.get("Ngày bắt đầu", "")).strip(),
                "end_date": str(r.get("Ngày kết thúc", "")).strip(),
            }
            break

    # 2. Hợp đồng
    contracts = []
    total_contract_value = total_settlement_value = total_paid = 0.0
    proposed_from_contracts = 0.0
    for r in sm.read_sheet_by_name_raw("Hợp đồng"):
        if str(r.get("Mã DA", "")).strip() != pc:
            continue
        gia_hd  = sm.parse_vn_number(r.get("Giá HĐ/Trúng thầu", 0))
        gia_qt  = sm.parse_vn_number(r.get("Giá quyết toán", 0))
        luy_ke  = sm.parse_vn_number(r.get("Lũy kế thanh toán", 0))
        # Ưu tiên Giá QT; HĐ chưa có giá QT → dùng Lũy kế thanh toán
        proposed_from_contracts += gia_qt if gia_qt else luy_ke
        contracts.append({
            "contract_number": str(r.get("Mã HĐ", "")).strip(),
            "contract_name": str(r.get("Tên HĐ", "")).strip(),
            "contractor_name": str(r.get("Nhà thầu", "")).strip(),
            "sign_date": str(r.get("Ngày ký", "")).strip(),
            "contract_value": gia_hd,
            "settlement_value": gia_qt,
            "paid_amount": luy_ke,
            "debt": round((gia_qt or gia_hd) - luy_ke, 2),  # công nợ: còn phải trả (+) / trả thừa (−)
            "status": str(r.get("Trạng thái HĐ", "")).strip(),
        })
        total_contract_value += gia_hd
        total_settlement_value += gia_qt
        total_paid += luy_ke

    # 3. Gói thầu
    bid_packages = [
        {
            "code": str(r.get("Mã GT", "")).strip(),
            "name": str(r.get("Tên gói thầu", "")).strip(),
            "price": sm.parse_vn_number(r.get("Giá gói thầu", 0)),
            "status": str(r.get("Trạng thái GT", "")).strip(),
        }
        for r in sm.read_sheet_by_name_raw("Gói thầu")
        if str(r.get("Mã DA", "")).strip() == pc
    ]

    # 4. Nghiệm thu
    acceptances = []
    total_accepted = 0.0
    for r in sm.read_sheet_by_name_raw("Nghiệm thu"):
        if str(r.get("Mã DA", "")).strip() != pc:
            continue
        gia_nt = sm.parse_vn_number(r.get("Giá trị NT", 0))
        acceptances.append({
            "contract_number": str(r.get("Mã HĐ", "")).strip(),
            "round": str(r.get("Lần NT", "")).strip(),
            "request_date": str(r.get("Ngày đề nghị", "")).strip(),
            "amount": gia_nt,
            "status": str(r.get("Trạng thái HSNT", "")).strip(),
            "contractor_name": str(r.get("Nhà thầu", "")).strip(),
        })
        total_accepted += gia_nt

    # 5. Số tiền đề nghị quyết toán đề xuất
    if proposed_from_contracts > 0:
        suggested, source = proposed_from_contracts, "Tổng Giá quyết toán các HĐ (HĐ thiếu giá QT dùng Lũy kế thanh toán)"
    elif total_accepted > 0:
        suggested, source = total_accepted, "Tổng giá trị nghiệm thu (chưa có số liệu hợp đồng)"
    elif project.get("disbursed_amount"):
        suggested, source = project["disbursed_amount"], "Số giải ngân của dự án (chưa có số liệu HĐ/nghiệm thu)"
    else:
        suggested, source = 0.0, "Không tìm thấy số liệu — vui lòng nhập thủ công"

    return {
        "project": project,
        "contracts": contracts,
        "bid_packages": bid_packages,
        "acceptances": acceptances,
        "totals": {
            "contract_value": round(total_contract_value, 2),
            "settlement_value": round(total_settlement_value, 2),
            "paid_amount": round(total_paid, 2),
            "accepted_amount": round(total_accepted, 2),
            "debt": round((total_settlement_value or total_contract_value) - total_paid, 2),
        },
        "suggested_amount": round(suggested, 2),
        "suggested_source": source,
    }


@router.get("/project-summary")
async def project_summary(project_id: str, _: dict = Depends(get_current_user)):
    """
    Tổng hợp dữ liệu dự án từ các sheet Dự án / Hợp đồng / Gói thầu / Nghiệm thu
    để tự điền số tiền đề nghị quyết toán và điền số liệu vào biểu mẫu QTDA.
    project_id = Mã DA (vd: DA-001).
    """
    summary = _build_project_summary(project_id)
    if not summary["project"] and not summary["contracts"]:
        # Thử tra project app-created để lấy project_code
        r = sm.read_by_id("projects", project_id)
        if r and r.get("project_code"):
            summary = _build_project_summary(str(r["project_code"]))
    return summary


@router.get("/templates")
async def list_settlement_templates(_: dict = Depends(get_current_user)):
    """
    Danh mục 12 mẫu biểu quyết toán vốn đầu tư dự án (TT 73/2026/TT-BTC).
    Dự án hoàn thành / dừng thực hiện đã có khối lượng nghiệm thu: Mẫu 01–07 (+12).
    Dự án quy hoạch / chuẩn bị đầu tư / dừng chưa có khối lượng: Mẫu 03, 07, 08.
    """
    return {
        "circular": "Thông tư 73/2026/TT-BTC ngày 25/6/2026 của Bộ Tài chính",
        "decree": "Nghị định 193/2026/NĐ-CP",
        "templates": SETTLEMENT_FORM_TEMPLATES,
    }


# ─── Sanitize helper ───────────────────────────────────────────────
def _sanitize_record(r: dict) -> dict:
    """
    Chuẩn hoá record đọc từ Google Sheets trước khi parse Pydantic v2:
    - Ô số (id, project_id...) được Sheets trả về dạng int/float
      → phải ép về str vì Pydantic v2 KHÔNG tự coerce int → str.
    - Chuỗi "None"/"" (do ghi nhầm trước đây) → None.
    - Trường tiền tệ: empty → None/0, chuỗi → float.
    """
    out = dict(r)

    # 1. Trường Optional[float]: empty → None
    for field in ("audited_amount", "approved_amount"):
        v = out.get(field)
        if v in ("", None, "None"):
            out[field] = None
        else:
            try:
                out[field] = float(str(v).replace(",", ".").strip())
            except (ValueError, TypeError):
                out[field] = None

    # 2. Trường float mặc định 0: empty → 0
    for field in ("proposed_settlement_amount",):
        v = out.get(field)
        if v in ("", None, "None"):
            out[field] = 0.0
        else:
            try:
                out[field] = float(str(v).replace(",", ".").strip())
            except (ValueError, TypeError):
                out[field] = 0.0

    # 3. Trường chuỗi bắt buộc: int/float từ Sheets → str
    for field in ("id", "project_id"):
        v = out.get(field)
        if v is not None and not isinstance(v, str):
            out[field] = str(v)

    # 4. Trường chuỗi optional: "" / "None" → None, số → str
    for field in ("approver_org_id", "verifier_org_id", "submission_deadline",
                  "approved_decision_number", "approved_decision_date",
                  "settlement_number", "project_name", "contract_group",
                  "attached_forms", "created_at"):
        v = out.get(field)
        if v in ("", "None"):
            out[field] = None
        elif v is not None and not isinstance(v, str):
            out[field] = str(v)

    # 5. Status rỗng (bản ghi cũ ghi thiếu) → PREPARING
    if not str(out.get("status", "")).strip():
        out["status"] = "PREPARING"
    return out


def _sanitize_warning(r: dict) -> dict:
    """Chuẩn hoá record cảnh báo từ Sheets (int → str, empty → default)."""
    out = dict(r)
    for field in ("id", "contract_id", "sent_date", "response_deadline",
                  "mau_02_qtda_url", "created_at"):
        v = out.get(field)
        if v is not None and not isinstance(v, str):
            out[field] = str(v)
    try:
        out["warning_number"] = int(out.get("warning_number") or 1)
    except (ValueError, TypeError):
        out["warning_number"] = 1
    if not str(out.get("contractor_response_status", "")).strip():
        out["contractor_response_status"] = "NO_RESPONSE"
    v = out.get("is_delivered")
    out["is_delivered"] = str(v).strip().upper() in ("TRUE", "1", "YES")
    return out


# ─── Project Settlements ────────────────────────────────────────────

@router.get("", response_model=list[Settlement])
async def list_settlements(
    project_id: Optional[str] = None,
    _: dict = Depends(get_current_user)
):
    # 1. Sheet "Quyết toán DAHT"
    result: list[Settlement] = []
    seen_ids: set[str] = set()
    for row in sm.read_sheet_by_name_raw("Quyết toán DAHT"):
        if project_id and str(row.get("Mã DA", "")).strip() != project_id:
            continue
        s = _map_quyet_toan_row(row)
        if s and s.id not in seen_ids:
            result.append(s)
            seen_ids.add(s.id)

    # 2. App-created settlements — sanitize trước khi parse
    app_records = (
        sm.read_where("project_settlements", project_id=project_id)
        if project_id else sm.read_all("project_settlements")
    )
    for r in app_records:
        try:
            s = Settlement(**_sanitize_record(r))
            if s.id not in seen_ids:
                result.append(s)
                seen_ids.add(s.id)
        except Exception:
            pass

    return result


# Tập trạng thái "đang hoạt động" → block tạo mới
_ACTIVE_STATUSES = {"PREPARING", "AUDITED", "APPROVED"}


@router.post("", response_model=Settlement, status_code=201)
async def create_settlement(body: SettlementCreate, _: dict = Depends(get_current_user)):
    existing = sm.read_where("project_settlements", project_id=body.project_id)
    # Chỉ block khi có bản ghi active thực sự (bỏ qua empty/corrupt status)
    if any(str(s.get("status", "")).strip() in _ACTIVE_STATUSES for s in existing):
        raise HTTPException(400, "Dự án đã có hồ sơ quyết toán đang xử lý")
    data = body.model_dump()
    data["status"] = "PREPARING"  # ghi rõ trạng thái ban đầu vào sheet
    # Đảm bảo cột mới attached_forms tồn tại (trường hợp SKIP_MIGRATION=true)
    if data.get("attached_forms") and "attached_forms" not in sm.get_col_map("project_settlements"):
        try:
            sm.migrate_schema("project_settlements")
        except Exception:
            pass
    record = sm.insert("project_settlements", data)
    return Settlement(**_sanitize_record(record))


@router.get("/{settlement_id}", response_model=Settlement)
async def get_settlement(settlement_id: str, _: dict = Depends(get_current_user)):
    r = sm.read_by_id("project_settlements", settlement_id)
    if not r:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return Settlement(**_sanitize_record(r))


@router.put("/{settlement_id}/audit")
async def audit_settlement(
    settlement_id: str,
    audited_amount: float,
    _: dict = Depends(get_current_user)
):
    """Kiểm toán quyết toán."""
    updated = sm.update("project_settlements", settlement_id, {
        "audited_amount": str(audited_amount),
        "status": "AUDITED",
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return updated


@router.put("/{settlement_id}/approve")
async def approve_settlement(
    settlement_id: str,
    approved_amount: float,
    approved_decision_number: str,
    _: dict = Depends(get_current_user)
):
    """Phê duyệt quyết toán."""
    updated = sm.update("project_settlements", settlement_id, {
        "approved_amount": str(approved_amount),
        "approved_decision_number": approved_decision_number,
        "approved_decision_date": datetime.utcnow().date().isoformat(),
        "status": "APPROVED",
    })
    if not updated:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")
    return updated


@router.get("/{settlement_id}/penalty")
async def calculate_penalty(settlement_id: str, _: dict = Depends(get_current_user)):
    """
    Tính phạt chậm nộp quyết toán (0.05%/ngày trên giá trị quyết toán).
    """
    settlement = sm.read_by_id("project_settlements", settlement_id)
    if not settlement:
        raise HTTPException(404, "Không tìm thấy hồ sơ quyết toán")

    deadline_str = settlement.get("submission_deadline")
    approved_amount = float(settlement.get("approved_amount") or settlement.get("proposed_settlement_amount") or 0)

    if not deadline_str:
        return {"penalty_vnd": 0, "overdue_days": 0, "message": "Chưa có deadline quyết toán"}

    try:
        deadline = date.fromisoformat(deadline_str)
    except ValueError:
        return {"penalty_vnd": 0, "overdue_days": 0, "message": "Định dạng ngày không hợp lệ"}

    today = date.today()
    overdue_days = max(0, (today - deadline).days)
    penalty = approved_amount * 0.0005 * overdue_days  # 0.05%/ngày

    return {
        "settlement_id": settlement_id,
        "deadline": deadline_str,
        "today": today.isoformat(),
        "overdue_days": overdue_days,
        "settlement_amount": approved_amount,
        "penalty_rate": "0.05%/ngày",
        "penalty_vnd": round(penalty, 2),
    }
